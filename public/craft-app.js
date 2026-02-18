// ============================================
// CRAFT ROOM SYNC + UI LAYER
// Matches video room UI exactly
// ============================================
(function() {
  'use strict';

  var API_BASE = (window.APP_CONFIG && window.APP_CONFIG.API_BASE) || '/api';
  var POLL_INTERVAL = 1500;
  var PUSH_DEBOUNCE = 800;
  var HEARTBEAT_INTERVAL = 12000;
  var MEMBER_REFRESH = 6000;

  var THEMES = [
    { id: 'gold', name: 'Dragon Gold', color: '#d4a824' },
    { id: 'ember', name: 'Ember Red', color: '#ef4444' },
    { id: 'forest', name: 'Forest Green', color: '#22c55e' },
    { id: 'ocean', name: 'Ocean Blue', color: '#3b82f6' },
    { id: 'purple', name: 'Royal Purple', color: '#a855f7' },
    { id: 'sunset', name: 'Sunset Orange', color: '#f97316' },
    { id: 'rose', name: 'Rose Pink', color: '#ec4899' },
    { id: 'cyan', name: 'Cyan', color: '#06b6d4' }
  ];

  function getToken() { return localStorage.getItem('mv_token'); }
  function getGuestId() {
    var id = localStorage.getItem('mv_guest_id');
    if (!id) { id = 'guest_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9); localStorage.setItem('mv_guest_id', id); }
    return id;
  }

  // ═══ API Request with kick detection ═══
  function apiRequest(endpoint, opts) {
    opts = opts || {};
    var h = { 'Content-Type': 'application/json' };
    var token = getToken();
    if (token) h['Authorization'] = 'Bearer ' + token;
    return fetch(API_BASE + endpoint, { method: opts.method || 'GET', headers: h, body: opts.body })
      .then(function(r) {
        return r.json().then(function(d) {
          if (!r.ok) {
            if (r.status === 403 && (d.kicked || (d.error && d.error.indexOf('kicked') >= 0))) {
              handleKicked();
              throw new Error('kicked');
            }
            throw new Error(d.error || 'Request failed');
          }
          return d;
        });
      });
  }

  // Upload an image file to R2 storage, returns the public URL
  function uploadImageToR2(file) {
    if (!roomId) return Promise.reject(new Error('No room'));
    var filename = file.name || ('image_' + Date.now() + '.png');
    return apiRequest('/files/presign', { method: 'POST', body: JSON.stringify({ filename: filename, roomId: roomId }) })
      .then(function(d) {
        return fetch(d.uploadUrl, { method: 'PUT', headers: { 'Content-Type': d.contentType }, body: file })
          .then(function(r) {
            if (!r.ok) throw new Error('Upload failed: ' + r.status);
            return apiRequest('/files/complete', { method: 'POST', body: JSON.stringify({
  fileId: d.fileId,
  fileKey: d.fileKey,
  filename: filename,
  publicUrl: d.publicUrl,
  category: d.category,
  size: file.size,
  roomId: roomId,
  contentType: d.contentType
})});
          })
          .then(function(c) { return c.url; });
      });
  }
  window.craftUploadImage = uploadImageToR2;

  function parseRoomUrl() {
    var m = location.hash.match(/^#\/room\/([a-f0-9-]+)\/([a-f0-9-]+)$/);
    return m ? { hostId: m[1], roomId: m[2] } : null;
  }
  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  var roomId = null, roomInfo = null, currentUser = null;
  var isOwner = false, myRole = 'viewer';
  document.body.classList.add('craft-not-owner');
  document.body.classList.add('craft-no-hidden-access');
  var members = [];
  var localVersion = 0, lastPushedHash = '';
  var syncTimer = null, heartbeatTimer = null, pushTimer = null, memberTimer = null;
  var isPushing = false, isPulling = false;
  var syncStatus = 'connecting', stateDirty = false;
  var kickHandled = false;

  function quickHash(str) { var h = 0; for (var i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h = h & h; } return h.toString(36); }
  function getStateHash() {
    if (!window.craftGetState) return '';
    try {
      var s = window.craftGetState();
      delete s.currentView;
      delete s.viewSettings;
      return quickHash(JSON.stringify(s));
    } catch(e) { return ''; }
  }

  // ═══ KICK HANDLING ═══
  function handleKicked() {
    if (kickHandled) return;
    kickHandled = true;
    clearInterval(syncTimer);
    clearInterval(heartbeatTimer);
    clearInterval(memberTimer);
    clearTimeout(pushTimer);
    // Clear guest ID so they can rejoin with a fresh identity
    localStorage.removeItem('mv_guest_id');
    alert('You have been removed from this room.');
    window.location.href = '/';
  }

  function checkKickedFromMembers() {
    if (!roomId || !currentUser || members.length === 0) return;
    var myId = currentUser.id || currentUser.guestId;
    if (!myId) return;
    var found = false;
    for (var i = 0; i < members.length; i++) {
      if ((members[i].user_id || members[i].guest_id) === myId) { found = true; break; }
    }
    if (!found) handleKicked();
  }

  // ═══ SYNC ENGINE ═══
  function pullState() {
    if (isPulling) return Promise.resolve();
    isPulling = true;
    setSyncStatus('syncing');
    return apiRequest('/craftrooms/' + roomId + '/sync')
      .then(function(d) {
        localVersion = d.version || 0;
        members = d.members || [];
        renderConnectedBar();
        updateMyRole();
        checkKickedFromMembers();
        if (d.state && window.craftSetState) {
          var syncState = Object.assign({}, d.state);
          delete syncState.currentView;
          delete syncState.viewSettings;
          window.craftSetState(syncState);
          lastPushedHash = getStateHash();
        }
        setSyncStatus('synced');
      })
      .catch(function(e) {
        if (e.message !== 'kicked') {
          console.warn('Pull failed:', e.message);
          setSyncStatus('error');
        }
      })
      .finally(function() { isPulling = false; });
  }

  function pollVersion() {
    if (!roomId || isPulling) return;
    apiRequest('/craftrooms/' + roomId + '/version')
      .then(function(d) {
        setSyncStatus('synced');
        if (d.version > localVersion) pullState();
      })
      .catch(function(e) {
        if (e.message !== 'kicked') setSyncStatus('error');
      });
  }

  function pushState() {
    if (!roomId || !window.craftGetState || isPushing || isPulling) return;
    if (myRole === 'viewer') { stateDirty = false; return; }
    var currentHash = getStateHash();
    if (currentHash === lastPushedHash && !stateDirty) return;
    
    // Pull-before-push: check if server has newer data to avoid overwriting
    isPushing = true; stateDirty = false;
    setSyncStatus('syncing');
    apiRequest('/craftrooms/' + roomId + '/version')
      .then(function(vd) {
        if (vd.version > localVersion) {
          // Server is ahead - pull first, then re-push after merge
          isPushing = false;
          return pullState().then(function() {
            // After pull, schedule another push with merged data
            stateDirty = true;
            setTimeout(function() { isPushing = false; pushState(); }, 200);
          });
        }
        // Server is up to date - safe to push
        var state = window.craftGetState();
        delete state.currentView;
        delete state.viewSettings;
        var payload = { state: state };
        if (!getToken()) payload.guestId = getGuestId();
        // IMPORTANT: only advance lastPushedHash after a successful push.
        // If we set it before the PUT and the request fails (permissions/network),
        // the client will think it's synced and never retry, causing data loss on refresh.
        var pendingHash = getStateHash();
        return apiRequest('/craftrooms/' + roomId + '/sync', { method: 'PUT', body: JSON.stringify(payload) })
          .then(function(d) {
            localVersion = d.version || localVersion;
            lastPushedHash = pendingHash;
            setSyncStatus('synced');
          });
      })
      .catch(function(e) {
        if (e.message !== 'kicked') {
          console.warn('Push failed:', e.message);
          setSyncStatus('error');
          // Keep dirty so we retry on next schedule/poll instead of silently dropping changes
          stateDirty = true;
          if (e.message.indexOf('View only') >= 0) myRole = 'viewer';
        }
      })
      .finally(function() { isPushing = false; });
  }

  function schedulePush() {
    stateDirty = true;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(pushState, PUSH_DEBOUNCE);
  }
  window.craftSchedulePush = schedulePush;

  function sendHeartbeat() {
    if (!roomId) return;
    var p = {};
    if (!getToken()) p.guestId = getGuestId();
    // Send current view for presence indicator
    if (window.craftGetState) {
      try { p.activeView = window.craftGetState().currentView || 'board'; } catch(e) {}
    }
    apiRequest('/craftrooms/' + roomId + '/heartbeat', { method: 'POST', body: JSON.stringify(p) })
      .catch(function(e) { if (e.message !== 'kicked') console.warn('Heartbeat failed'); });
  }

  function refreshMembers() {
    if (!roomId) return;
    apiRequest('/craftrooms/' + roomId + '/members')
      .then(function(d) {
        members = d.members || [];
        renderConnectedBar();
        updateMyRole();
        checkKickedFromMembers();
      })
      .catch(function(e) { if (e.message !== 'kicked') console.warn('Member refresh failed'); });
  }

  function updateMyRole() {
    var myId = currentUser ? (currentUser.id || currentUser.guestId) : null;
    if (!myId) return;
    for (var i = 0; i < members.length; i++) {
      var mid = members[i].user_id || members[i].guest_id;
      if (mid === myId) {
        myRole = members[i].is_owner ? 'owner' : (members[i].role || 'viewer');
        isOwner = !!members[i].is_owner;
        window.craftIsOwner = isOwner;
        var canSeeHidden = isOwner || !!members[i].can_view_hidden;
        window.craftCanViewHidden = canSeeHidden;
        document.body.classList.toggle('craft-not-owner', !isOwner);
        document.body.classList.toggle('craft-no-hidden-access', !canSeeHidden);
        return;
      }
    }
  }

  function setupChangeDetection() {
    var area = document.querySelector('.dashboard') || document.body;
    ['mouseup', 'keyup', 'change', 'input'].forEach(function(evt) {
      area.addEventListener(evt, function() { setTimeout(schedulePush, 100); }, true);
    });
    setInterval(function() {
      if (window.craftGetState && getStateHash() !== lastPushedHash) schedulePush();
    }, 2000);
  }

  function setSyncStatus(s) {
    syncStatus = s;
    var el = document.getElementById('craftSyncPill');
    if (!el) return;
    el.className = 'sync-pill ' + s;
    el.textContent = s === 'synced' ? 'Synced' : s === 'syncing' ? 'Syncing...' : 'Offline';
  }

  function setRoomTitle(name) {
    var el = document.getElementById('roomTitle');
    if (el) {
      el.value = name || 'Craft Room';
      // Only owner can edit title
      el.readOnly = !isOwner;
      el.style.cursor = isOwner ? 'text' : 'default';
      el.style.opacity = isOwner ? '1' : '0.85';
    }
  }

  // Save room title on change (owner only)
  var titleEl = document.getElementById('roomTitle');
  if (titleEl) {
    titleEl.addEventListener('change', function() {
      if (!isOwner || !roomId) return;
      var newName = titleEl.value.trim();
      if (!newName) { titleEl.value = roomInfo.name; return; }
      apiRequest('/craftrooms/' + roomId + '/name', { method: 'PUT', body: JSON.stringify({ name: newName }) })
        .then(function() { roomInfo.name = newName; })
        .catch(function(err) { titleEl.value = roomInfo.name; alert('Rename failed: ' + err.message); });
    });
  }

  // ═══ SHARE MODAL (matches video room .modal.share-modal) ═══
  function renderShareBtn() {
    var c = document.getElementById('craftShareBtn');
    if (!c) return;
    c.style.display = '';
    c.innerHTML = '<button class="icon-btn" id="shareOpenBtn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg></button>';
    document.getElementById('shareOpenBtn').addEventListener('click', openShareModal);
  }

  function openShareModal() {
    var old = document.getElementById('craftShareOverlay'); if (old) old.remove();
    var shareUrl = location.origin + '/craft.html' + location.hash;
    var div = document.createElement('div');
    div.id = 'craftShareOverlay'; div.className = 'modal-overlay'; div.style.zIndex = '10000';
    div.innerHTML = '<div class="modal share-modal" onclick="event.stopPropagation()"><button class="modal-close" id="shareCloseBtn">&times;</button><h2>\uD83D\uDD17 Share Room</h2><p>Anyone with this link can join your room</p><div class="share-link-box"><input type="text" value="' + esc(shareUrl) + '" readonly id="shareLinkInput" /><button class="btn primary" id="shareCopyBtn">Copy Link</button></div></div>';
    document.body.appendChild(div);
    div.addEventListener('click', function(e) { if (e.target === div) div.remove(); });
    document.getElementById('shareCloseBtn').addEventListener('click', function() { div.remove(); });
    document.getElementById('shareCopyBtn').addEventListener('click', function() {
      navigator.clipboard.writeText(shareUrl).then(function() {
        var btn = document.getElementById('shareCopyBtn');
        btn.textContent = 'Copied!'; btn.style.background = '#22c55e';
        setTimeout(function() { btn.textContent = 'Copy Link'; btn.style.background = ''; }, 2000);
      });
    });
  }

  // ═══ USER MENU ═══
  var userMenuOpen = false;
  function renderUserMenu() {
    var c = document.getElementById('craftUserMenu'); if (!c || !currentUser) return;
    var isGuest = !currentUser.id;
    var initial = (currentUser.displayName || '?').charAt(0).toUpperCase();
    c.innerHTML = '<div class="craft-user-menu"><button class="craft-user-btn" id="craftUserBtn"><span class="avatar">' + esc(initial) + '</span><span class="user-btn-name">' + esc(currentUser.displayName || 'Guest') + '</span>' + (isGuest ? '<span class="guest-tag">Guest</span>' : '') + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></button><div class="craft-user-dropdown" id="craftUserDropdown" style="display:none"><div class="dd-header"><div class="name">' + esc(currentUser.displayName || 'Guest') + '</div><div class="email">' + (isGuest ? 'Temporary account' : esc(currentUser.email || '')) + '</div></div>' + (isGuest ? '<button class="dd-item primary" data-action="login">\u271A Create Account</button>' : '<button class="dd-item" data-action="home">\uD83C\uDFE0 My Rooms</button><button class="dd-item" data-action="settings">\u2699\uFE0F Settings</button><div class="dd-divider"></div><button class="dd-item danger" data-action="logout">\u21A9 Log out</button>') + '</div></div>';
    var btn = document.getElementById('craftUserBtn'), dd = document.getElementById('craftUserDropdown');
    btn.addEventListener('click', function(e) { e.stopPropagation(); userMenuOpen = !userMenuOpen; dd.style.display = userMenuOpen ? '' : 'none'; });
    document.addEventListener('click', function() { userMenuOpen = false; if (dd) dd.style.display = 'none'; });
    c.querySelectorAll('.dd-item').forEach(function(item) {
      item.addEventListener('click', function() {
        dd.style.display = 'none'; userMenuOpen = false;
        var a = item.dataset.action;
        if (a === 'home') window.location.href = '/';
        else if (a === 'settings') openUserSettings();
        else if (a === 'logout') { apiRequest('/auth/logout', { method: 'POST' }).catch(function(){}); localStorage.removeItem('mv_token'); window.location.href = '/'; }
        else if (a === 'login') window.location.href = '/';
      });
    });
  }

  // ═══ USER SETTINGS MODAL (matches video room exactly) ═══
  // Tabs: Profile, Email, Password, Theme, Account
  function openUserSettings() {
    if (!currentUser || !currentUser.id) return;
    var old = document.getElementById('craftUserSettingsOverlay'); if (old) old.remove();
    var overlay = document.createElement('div');
    overlay.id = 'craftUserSettingsOverlay'; overlay.className = 'modal-overlay'; overlay.style.zIndex = '10000';
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
    overlay.innerHTML = '<div class="modal settings-modal" onclick="event.stopPropagation()"><button class="modal-close" id="userSettingsClose">&times;</button><h2>Settings</h2><div class="settings-tabs" id="userSettingsTabs"></div><div id="userSettingsMsg"></div><div class="settings-content" id="userSettingsBody"></div></div>';
    document.body.appendChild(overlay);
    document.getElementById('userSettingsClose').addEventListener('click', function() { overlay.remove(); });

    var tabs = ['Profile', 'Email', 'Password', 'Theme', 'Account'];
    var tabsEl = document.getElementById('userSettingsTabs');
    tabs.forEach(function(t) {
      var b = document.createElement('button');
      b.className = 'settings-tab' + (t === 'Profile' ? ' active' : '');
      b.dataset.tab = t.toLowerCase();
      b.textContent = t;
      b.addEventListener('click', function() {
        tabsEl.querySelectorAll('.settings-tab').forEach(function(x) { x.classList.remove('active'); });
        b.classList.add('active');
        clearMsg();
        renderUserTab(t.toLowerCase());
      });
      // Tabs: Profile, Email, Password, Theme, Account
    tabsEl.appendChild(b);
    });

    renderUserTab('profile');
  }

  function clearMsg() { var m = document.getElementById('userSettingsMsg'); if (m) { m.innerHTML = ''; m.className = ''; } }
  function showMsg(text, type) {
    var m = document.getElementById('userSettingsMsg'); if (!m) return;
    m.className = type === 'error' ? 'error-message' : 'success-message';
    m.textContent = text;
    setTimeout(function() { if (m) { m.textContent = ''; m.className = ''; } }, 3500);
  }

  function renderUserTab(tab) {
    var body = document.getElementById('userSettingsBody'); if (!body) return;

    if (tab === 'profile') {
      body.innerHTML = '<div class="settings-section"><div class="modal-input-group"><label>Display Name</label><input type="text" id="usDispName" value="' + esc(currentUser.displayName || '') + '" /></div><div class="modal-input-group"><label>Email</label><input type="email" value="' + esc(currentUser.email || '') + '" disabled /></div><button class="btn primary" id="usSave">Save Changes</button></div>';
      document.getElementById('usSave').addEventListener('click', function() {
        var n = document.getElementById('usDispName').value.trim(); if (!n) return;
        this.textContent = 'Saving...'; this.disabled = true; var btn = this;
        apiRequest('/auth/profile', { method: 'PUT', body: JSON.stringify({ displayName: n }) })
          .then(function() { currentUser.displayName = n; renderUserMenu(); showMsg('Profile saved!', 'success'); btn.textContent = 'Save Changes'; btn.disabled = false; })
          .catch(function(err) { showMsg(err.message, 'error'); btn.textContent = 'Save Changes'; btn.disabled = false; });
      });
    } else if (tab === 'email') {
      body.innerHTML = '<div class="settings-section"><div class="modal-input-group"><label>Current Email</label><input type="email" value="' + esc(currentUser.email || '') + '" disabled /></div><div class="modal-input-group"><label>New Email</label><input type="email" id="usNewEmail" placeholder="Enter new email" /></div><div class="modal-input-group"><label>Current Password</label><input type="password" id="usEmailPw" placeholder="Confirm with password" /></div><button class="btn primary" id="usEmailSave">Update Email</button></div>';
      document.getElementById('usEmailSave').addEventListener('click', function() {
        var e = document.getElementById('usNewEmail').value.trim(), p = document.getElementById('usEmailPw').value;
        if (!e || !p) return showMsg('Please fill in all fields', 'error');
        this.textContent = 'Updating...'; this.disabled = true; var btn = this;
        apiRequest('/auth/email', { method: 'PUT', body: JSON.stringify({ newEmail: e, password: p }) })
          .then(function() { currentUser.email = e; showMsg('Email updated!', 'success'); btn.textContent = 'Update Email'; btn.disabled = false; })
          .catch(function(err) { showMsg(err.message, 'error'); btn.textContent = 'Update Email'; btn.disabled = false; });
      });
    } else if (tab === 'password') {
      body.innerHTML = '<div class="settings-section"><div class="modal-input-group"><label>Current Password</label><input type="password" id="usCurPw" placeholder="Enter current password" /></div><div class="modal-input-group"><label>New Password</label><input type="password" id="usNewPw" placeholder="Enter new password" /></div><div class="modal-input-group"><label>Confirm New Password</label><input type="password" id="usConfPw" placeholder="Confirm new password" /></div><button class="btn primary" id="usPwSave">Change Password</button></div>';
      document.getElementById('usPwSave').addEventListener('click', function() {
        var c = document.getElementById('usCurPw').value, n = document.getElementById('usNewPw').value, cf = document.getElementById('usConfPw').value;
        if (!c || !n || !cf) return showMsg('Please fill in all fields', 'error');
        if (n !== cf) return showMsg('New passwords do not match', 'error');
        if (n.length < 6) return showMsg('Password must be at least 6 characters', 'error');
        this.textContent = 'Changing...'; this.disabled = true; var btn = this;
        apiRequest('/auth/password', { method: 'PUT', body: JSON.stringify({ currentPassword: c, newPassword: n }) })
          .then(function() { showMsg('Password changed!', 'success'); btn.textContent = 'Change Password'; btn.disabled = false; })
          .catch(function(err) { showMsg(err.message, 'error'); btn.textContent = 'Change Password'; btn.disabled = false; });
      });
    } else if (tab === 'theme') {
      var themeKey = 'theme_' + currentUser.id;
      var cur = localStorage.getItem(themeKey) || 'gold';
      body.innerHTML = '<div class="settings-section"><p class="section-description">Choose your preferred color theme</p><div class="theme-grid">' + THEMES.map(function(t) {
        return '<div class="theme-option' + (t.id === cur ? ' active' : '') + '" data-tid="' + t.id + '"><div class="theme-swatch" style="background-color:' + t.color + '"></div><span class="theme-name">' + t.name + '</span></div>';
      }).join('') + '</div></div>';
      body.querySelectorAll('.theme-option').forEach(function(opt) {
        opt.addEventListener('click', function() {
          var id = opt.dataset.tid;
          localStorage.setItem(themeKey, id);
          document.documentElement.setAttribute('data-theme', id);
          body.querySelectorAll('.theme-option').forEach(function(o) { o.classList.remove('active'); });
          opt.classList.add('active');
          showMsg('Theme updated!', 'success');
        });
      });
    } else if (tab === 'account') {
      body.innerHTML = '<div class="settings-section"><div class="danger-zone"><h3>\u26A0\uFE0F Danger Zone</h3><p>Deleting your account will permanently remove all your data including rooms and playlists.</p><button class="btn danger" id="usDelete">Delete My Account</button></div></div>';
      document.getElementById('usDelete').addEventListener('click', function() {
        if (!confirm('Delete your account? This cannot be undone.')) return;
        this.textContent = 'Deleting...'; this.disabled = true;
        apiRequest('/auth/account', { method: 'DELETE' })
          .then(function() { localStorage.removeItem('mv_token'); window.location.href = '/'; })
          .catch(function(err) { showMsg(err.message, 'error'); });
      });
    }
  }

  // ═══ COGWHEEL OVERRIDE (Permissions + view settings sync) ═══
  function overrideCogwheel() {
    var origClose = window.closeSettingsModal;
    var origToggle = window.toggleViewSetting;

    // Push state when view settings change so all users see updates
    if (origToggle) {
      window.toggleViewSetting = function(key, checked) {
        origToggle(key, checked);
        setTimeout(schedulePush, 200);
      };
    }
    if (origClose) {
      window.closeSettingsModal = function() {
        origClose();
        setTimeout(schedulePush, 200);
      };
    }

    // Add permissions section to cogwheel modal (visible to all, editable by owner only)
    var origOpen = window.openSettingsModal;
    window.openSettingsModal = function() {
      if (origOpen) origOpen();
      var modalBody = document.querySelector('#settingsModal .popup-body');
      if (!modalBody) return;
      var old = document.getElementById('cogwheelPerms'); if (old) old.remove();
      var div = document.createElement('div'); div.id = 'cogwheelPerms';
      div.style.cssText = 'margin-top:18px;border-top:1px solid var(--border-color,#252015);padding-top:16px';
      
      // Refresh members list first
      refreshMembers();
      
      var nonOwners = members.filter(function(m) { return !m.is_owner; });
      div.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px"><h4 style="font-family:Cinzel,serif;font-size:12px;color:var(--gold,#d4a824);margin:0;letter-spacing:0.06em;text-transform:uppercase">User Permissions</h4><span style="font-size:10px;color:var(--text-muted,#605545)">' + members.length + ' member' + (members.length !== 1 ? 's' : '') + '</span></div>';
      if (nonOwners.length === 0) {
        div.innerHTML += '<p style="font-size:11px;color:var(--text-muted,#605545);text-align:center;padding:12px 0;margin:0">No other members yet</p>';
      } else {
        var list = document.createElement('div');
        list.style.cssText = 'display:flex;flex-direction:column;gap:6px';
        nonOwners.forEach(function(m) {
          var uid = m.user_id || '', gid = m.guest_id || '', role = m.role || 'viewer', canHidden = m.can_view_hidden || false;
          var online = m.status === 'online';
          var row = document.createElement('div');
          row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(255,255,255,0.02);border:1px solid var(--border-color,#252015);border-radius:8px';
          
          var dotColor = online ? '#22c55e' : 'var(--text-muted,#605545)';
          var nameHtml = '<div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:6px"><span style="width:6px;height:6px;border-radius:50%;background:' + dotColor + ';flex-shrink:0"></span><span style="font-size:12px;color:var(--text-primary,#f5ede0);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(m.display_name) + '</span>' + (m.guest_id ? '<span style="font-size:9px;color:var(--text-muted);opacity:0.6">guest</span>' : '') + '</div></div>';
          
          if (isOwner) {
            row.innerHTML = nameHtml + '<select class="perm-select" data-uid="' + uid + '" data-gid="' + gid + '" style="padding:3px 6px;font-size:10px;background:var(--bg-dark,#0a0a0a);border:1px solid var(--border-color,#252015);border-radius:4px;color:var(--text-secondary,#a89880);cursor:pointer"><option value="viewer"' + (role === 'viewer' ? ' selected' : '') + '>View Only</option><option value="editor"' + (role === 'editor' ? ' selected' : '') + '>Can Edit</option></select><label style="display:flex;align-items:center;gap:3px;font-size:10px;color:var(--text-muted,#605545);cursor:pointer;white-space:nowrap"><input type="checkbox" class="perm-hidden-cb" data-uid="' + uid + '" data-gid="' + gid + '"' + (canHidden ? ' checked' : '') + ' style="accent-color:var(--gold)" /><span>Hidden</span></label><button class="perm-kick" data-uid="' + uid + '" data-gid="' + gid + '" data-name="' + esc(m.display_name) + '" style="background:none;border:none;color:rgba(239,68,68,0.6);cursor:pointer;font-size:14px;padding:2px 4px;line-height:1">&times;</button>';
          } else {
            var roleLabel = role === 'editor' ? 'Can Edit' : 'View Only';
            row.innerHTML = nameHtml + '<span style="font-size:10px;color:var(--text-muted,#605545);padding:3px 8px;border:1px solid var(--border-color,#252015);border-radius:4px">' + roleLabel + '</span>';
          }
          list.appendChild(row);
        });
        div.appendChild(list);
        
        // Show my own role for non-owners
        if (!isOwner) {
          var myMember = members.find(function(m) { var mid = m.user_id || m.guest_id; return mid === (currentUser ? (currentUser.id || currentUser.guestId) : null); });
          if (myMember) {
            var myDiv = document.createElement('div');
            myDiv.style.cssText = 'margin-top:10px;padding:6px 10px;background:rgba(212,168,36,0.06);border:1px solid rgba(212,168,36,0.15);border-radius:6px;font-size:11px;color:var(--text-secondary,#a89880);text-align:center';
            myDiv.textContent = 'Your role: ' + (myMember.role === 'editor' ? 'Can Edit' : 'View Only');
            div.appendChild(myDiv);
          }
        }
        
        // Wire up owner controls
        if (isOwner) {
          div.querySelectorAll('.perm-select').forEach(function(sel) {
            sel.addEventListener('change', function() {
              apiRequest('/craftrooms/' + roomId + '/permissions', { method: 'PUT', body: JSON.stringify({ targetUserId: sel.dataset.uid || undefined, targetGuestId: sel.dataset.gid || undefined, role: sel.value }) })
                .then(function() { refreshMembers(); })
                .catch(function(err) { alert('Error: ' + err.message); });
            });
          });
          div.querySelectorAll('.perm-hidden-cb').forEach(function(cb) {
            cb.addEventListener('change', function() {
              apiRequest('/craftrooms/' + roomId + '/permissions', { method: 'PUT', body: JSON.stringify({ targetUserId: cb.dataset.uid || undefined, targetGuestId: cb.dataset.gid || undefined, canViewHidden: cb.checked }) })
                .catch(function(err) { alert('Error: ' + err.message); });
            });
          });
          div.querySelectorAll('.perm-kick').forEach(function(btn) {
            btn.addEventListener('click', function() {
              if (confirm('Kick ' + btn.dataset.name + '?')) {
                apiRequest('/craftrooms/' + roomId + '/kick', { method: 'POST', body: JSON.stringify({ userId: btn.dataset.uid ? btn.dataset.uid : undefined, guestId: btn.dataset.gid ? btn.dataset.gid : undefined }) })
                  .then(function() { refreshMembers(); window.openSettingsModal(); })
                  .catch(function(err) { alert('Failed: ' + err.message); });
              }
            });
          });
        }
      }
      modalBody.appendChild(div);
    };
    // Expose isOwner for craft-script.js to check
    window.craftIsOwner = isOwner;
  }

  // ═══ CONNECTED BAR (matches video room, inline online/offline, right-click kick) ═══
  var activeCtx = null;
  var BADGE_COLORS = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c', '#3498db', '#9b59b6', '#e91e63', '#607d8b', '#795548', '#00bcd4', '#8bc34a'];
  function closeCtx() { if (activeCtx) { activeCtx.remove(); activeCtx = null; } }
  document.addEventListener('click', closeCtx);

  function canEditMember(m) {
    var uid = m.user_id || m.guest_id;
    var myId = currentUser ? (currentUser.id || currentUser.guestId) : null;
    if (uid === myId) return true;
    if (isOwner) return true;
    if (myRole === 'editor') return true;
    return false;
  }

  function updateMember(m, data) {
    var payload = { targetUserId: m.user_id || undefined, targetGuestId: m.guest_id || undefined };
    if (currentUser && currentUser.guestId) payload.myGuestId = currentUser.guestId;
    Object.assign(payload, data);
    apiRequest('/craftrooms/' + roomId + '/member', { method: 'PUT', body: JSON.stringify(payload) })
      .then(function() { refreshMembers(); })
      .catch(function(err) { alert('Failed: ' + err.message); });
  }

  function showRenameModal(m) {
    closeCtx();
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '10001';
    overlay.innerHTML = '<div class="modal settings-modal" onclick="event.stopPropagation()"><button class="modal-close" id="renameClose">&times;</button><h2>Change Display Name</h2><div class="settings-content"><div class="modal-input-group"><label>Display Name</label><input type="text" id="renameInput" value="' + esc(m.display_name) + '" placeholder="Enter display name" autofocus /></div><button class="btn primary" id="renameSubmit" style="width:100%">Save</button></div></div>';
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    var inp = document.getElementById('renameInput');
    inp.focus(); inp.select();
    document.getElementById('renameClose').addEventListener('click', function() { overlay.remove(); });
    function doRename() { var n = inp.value.trim(); if (n) { updateMember(m, { displayName: n }); } overlay.remove(); }
    document.getElementById('renameSubmit').addEventListener('click', doRename);
    inp.addEventListener('keydown', function(e) { if (e.key === 'Enter') doRename(); });
  }

  function showColorModal(m) {
    closeCtx();
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '10001';
    var grid = BADGE_COLORS.map(function(c) {
      return '<button class="color-option' + (m.color === c ? ' selected' : '') + '" style="background-color:' + c + '" data-color="' + c + '"></button>';
    }).join('');
    overlay.innerHTML = '<div class="modal settings-modal" onclick="event.stopPropagation()"><button class="modal-close" id="colorClose">&times;</button><h2>Choose Color</h2><div class="color-picker-grid">' + grid + '</div></div>';
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    document.getElementById('colorClose').addEventListener('click', function() { overlay.remove(); });
    overlay.querySelectorAll('.color-option').forEach(function(btn) {
      btn.addEventListener('click', function() { updateMember(m, { color: btn.dataset.color }); overlay.remove(); });
    });
  }

  function renderConnectedBar() {
    var bar = document.getElementById('craftConnectedBar'); if (!bar || !roomId) return;
    bar.style.display = '';
    var myId = currentUser ? (currentUser.id || currentUser.guestId) : null;
    updateMyRole();

    var onlineMembers = members.filter(function(m) { return m.status === 'online'; });
    var offlineMembers = members.filter(function(m) { return m.status !== 'online'; });

    // Sort: owner first, then alphabetical
    function sortM(list) {
      return list.slice().sort(function(a, b) {
        if (a.is_owner && !b.is_owner) return -1;
        if (!a.is_owner && b.is_owner) return 1;
        return (a.display_name || '').localeCompare(b.display_name || '');
      });
    }
    var sortedOnline = sortM(onlineMembers);
    var sortedOffline = sortM(offlineMembers);

    bar.innerHTML = '<div class="connected-header"><h4><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg> Connected</h4><span class="online-count"><span class="count">' + sortedOnline.length + '</span> online</span><span class="sync-pill ' + syncStatus + '" id="craftSyncPill">' + (syncStatus === 'synced' ? 'Synced' : syncStatus === 'syncing' ? 'Syncing...' : 'Offline') + '</span></div><div class="users-list" id="barUsersList"></div>';

    var container = document.getElementById('barUsersList');

    function renderBadge(m) {
      var uid = m.user_id || m.guest_id;
      var isYou = uid === myId;
      var online = m.status === 'online';
      var isGuest = !!m.guest_id;

      var chip = document.createElement('div');
      var cls = 'user-badge ' + (online ? 'online' : 'offline');
      if (isYou) cls += ' is-you';
      if (m.is_owner) cls += ' is-owner';
      chip.className = cls;
      if (m.color) chip.style.background = m.color;

      // View label for online users
      var viewLabel = '';
      if (online && m.active_view) {
        var viewMap = { board: 'Board', write: 'Write', map: 'Map', timeline: 'Timeline', combat: 'Combat', factions: 'Factions', mindmap: 'Mind Map', soundboard: 'Sound' };
        viewLabel = '<span class="view-tag">' + (viewMap[m.active_view] || m.active_view) + '</span>';
      }

      chip.innerHTML =
        (m.is_owner ? '<span class="owner-crown">\uD83D\uDC51</span>' : '') +
        '<span class="status-indicator ' + (online ? 'online' : 'offline') + '"></span>' +
        '<span class="badge-name">' + esc(m.display_name) + '</span>' +
        (isYou ? '<span class="you-tag">(you)</span>' : '') +
        (isGuest && !isYou ? '<span class="guest-tag-badge">(guest)</span>' : '') +
        (m.role && !m.is_owner ? '<span class="role-chip">' + (m.role === 'editor' ? '\u270F\uFE0F' : '\uD83D\uDC41') + '</span>' : '') +
        viewLabel;

      // Right-click context menu
      if (canEditMember(m) || (isOwner && !isYou)) {
        chip.addEventListener('contextmenu', function(e) {
          e.preventDefault(); e.stopPropagation(); closeCtx();
          var menu = document.createElement('div');
          menu.className = 'context-menu';
          menu.style.cssText = 'position:fixed;left:' + Math.min(e.clientX, window.innerWidth - 170) + 'px;top:0px;z-index:10000;visibility:hidden';
          var items = '';
          if (canEditMember(m)) {
            items += '<button class="context-menu-item" data-act="rename">Rename</button>';
            items += '<button class="context-menu-item" data-act="color">Change Color</button>';
          }
          if (isOwner && !isYou) {
            if (items) items += '<div class="context-menu-divider"></div>';
            items += '<button class="context-menu-item danger" data-act="kick">\u2715 Kick ' + esc(m.display_name) + '</button>';
          }
          menu.innerHTML = items;
          document.body.appendChild(menu);
          // Position to stay on screen
          var mh = menu.offsetHeight || 80;
          var topPos = e.clientY;
          if (topPos + mh > window.innerHeight - 8) topPos = e.clientY - mh - 4;
          menu.style.top = Math.max(4, topPos) + 'px';
          menu.style.visibility = 'visible';
          activeCtx = menu;

          menu.querySelectorAll('.context-menu-item').forEach(function(btn) {
            btn.addEventListener('click', function(ev) {
              ev.stopPropagation();
              var act = btn.dataset.act;
              if (act === 'rename') showRenameModal(m);
              else if (act === 'color') showColorModal(m);
              else if (act === 'kick') {
                if (confirm('Kick ' + m.display_name + ' from this room?')) {
                  apiRequest('/craftrooms/' + roomId + '/kick', { method: 'POST', body: JSON.stringify({ userId: m.user_id ? m.user_id : undefined, guestId: m.guest_id ? m.guest_id : undefined }) })
                    .then(function() { refreshMembers(); })
                    .catch(function(err) { alert('Failed: ' + err.message); });
                }
                closeCtx();
              }
            });
          });
        });
      }
      return chip;
    }

    if (sortedOnline.length === 0 && sortedOffline.length === 0) {
      container.innerHTML = '<div class="no-users">No one here yet</div>';
    } else {
      // Inline: online then offline, no divider
      sortedOnline.forEach(function(m) { container.appendChild(renderBadge(m)); });
      sortedOffline.forEach(function(m) { container.appendChild(renderBadge(m)); });
    }
  }

  // ═══ GUEST JOIN MODAL (with returning guest support like video room) ═══
  function showGuestJoinModal() {
    var c = document.getElementById('craftGuestModal'); if (!c) return;
    var dash = document.querySelector('.dashboard'); if (dash) dash.style.display = 'none';
    var isReturning = false;
    function render() {
      c.innerHTML = '<div class="modal-overlay" style="z-index:10000"><div class="modal guest-modal" onclick="event.stopPropagation()"><div class="guest-modal-icon">\uD83D\uDC09</div><h2>Join Craft Room</h2><p>' + (isReturning ? 'Enter your previous guest name to continue' : 'Enter a display name or join anonymously') + '</p><div class="modal-input-group"><input type="text" id="guestNameInput" placeholder="' + (isReturning ? 'Your previous guest name' : 'Your name (optional)') + '" style="text-align:center;font-size:16px" /></div><button class="btn primary" id="guestJoinBtn" style="width:100%;margin-bottom:8px">' + (isReturning ? 'Continue' : 'Join as Guest') + '</button><div class="guest-modal-divider"><span>or</span></div><button class="btn" id="guestToggleBtn" style="width:100%;background:var(--bg-hover);color:var(--text-secondary)">' + (isReturning ? 'Join as new guest' : 'I was here before') + '</button><div class="guest-modal-divider"><span>or</span></div><button class="btn" id="guestLoginBtn" style="width:100%;background:var(--bg-hover);color:var(--text-secondary)">Sign in / Create Account</button></div></div>';
      var input = document.getElementById('guestNameInput'), btn = document.getElementById('guestJoinBtn');
      input.focus();
      input.addEventListener('input', function() {
        var n = input.value.trim();
        if (isReturning) btn.textContent = n ? 'Continue as ' + n : 'Continue';
        else btn.textContent = n ? 'Join as ' + n : 'Join as Guest';
      });
      function doJoin() {
        var name = input.value.trim() || ('Guest ' + Math.floor(Math.random() * 9000 + 1000));
        btn.textContent = 'Joining...'; btn.disabled = true; var gid = getGuestId();
        if (isReturning && name) {
          localStorage.setItem('craft_returning_guest_' + roomId, name);
        }
        apiRequest('/craftrooms/' + roomId + '/join', { method: 'POST', body: JSON.stringify({ displayName: name, guestId: gid, returning: isReturning }) })
          .then(function() { c.innerHTML = ''; if (dash) dash.style.display = ''; currentUser = { id: null, displayName: name, guestId: gid }; isOwner = false; myRole = 'viewer'; document.body.classList.add('craft-not-owner'); document.body.classList.add('craft-no-hidden-access'); return apiRequest('/craftrooms/' + roomId); })
          .then(function(d) { roomInfo = d.room; setRoomTitle(roomInfo.name); renderShareBtn(); renderUserMenu(); startSync(); })
          .catch(function(err) { btn.textContent = isReturning ? 'Continue' : 'Join as Guest'; btn.disabled = false; alert('Failed: ' + err.message); });
      }
      btn.addEventListener('click', doJoin);
      input.addEventListener('keydown', function(e) { if (e.key === 'Enter') doJoin(); });
      document.getElementById('guestToggleBtn').addEventListener('click', function() { isReturning = !isReturning; render(); });
      document.getElementById('guestLoginBtn').addEventListener('click', function() { window.location.href = '/'; });
    }
    render();
  }

  // ═══ INIT ═══
  function startAuthenticated() {
    apiRequest('/auth/me').then(function(d) {
      currentUser = d.user;
      var theme = localStorage.getItem('theme_' + currentUser.id) || 'gold';
      document.documentElement.setAttribute('data-theme', theme);
      return apiRequest('/craftrooms/' + roomId);
    }).then(function(d) {
      roomInfo = d.room;
      isOwner = (roomInfo.owner_id === currentUser.id);
      window.craftIsOwner = isOwner;
      document.body.classList.toggle('craft-not-owner', !isOwner);
      document.body.classList.toggle('craft-no-hidden-access', !isOwner);
      myRole = isOwner ? 'owner' : 'viewer';
      setRoomTitle(roomInfo.name);
      renderShareBtn();
      renderUserMenu();
      overrideCogwheel();
      return apiRequest('/craftrooms/' + roomId + '/join', { method: 'POST', body: JSON.stringify({ displayName: currentUser.displayName || currentUser.username || 'User' }) });
    }).then(function() {
      startSync();
    }).catch(function(err) {
      if (err.message === 'kicked' || err.message.indexOf('kicked') >= 0) return;
      document.body.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#060606;color:#d4a824;font-family:Inter,sans-serif"><div style="font-size:48px">\u2694\uFE0F</div><p style="margin:16px 0;color:#aaa;font-size:14px">' + esc(err.message) + '</p><a href="/" style="color:#d4a824;text-decoration:underline">\u2190 Go to Home</a></div>';
    });
  }

  function startSync() {
    function onReady() {
      pullState().then(function() {
        // Only set up change detection AFTER first pull (so myRole is correct)
        setupChangeDetection();
      });
      syncTimer = setInterval(pollVersion, POLL_INTERVAL);
      sendHeartbeat();
      heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
      refreshMembers();
      memberTimer = setInterval(refreshMembers, MEMBER_REFRESH);
    }
    if (window.craftReady) onReady(); else window.onCraftReady = onReady;
  }

  function init() {
    var u = parseRoomUrl();
    if (!u) {
      document.body.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#060606;color:#d4a824;font-family:Inter,sans-serif"><div style="font-size:48px">\u2694\uFE0F</div><p style="margin:16px 0;color:#aaa">No craft room specified</p><a href="/" style="color:#d4a824;text-decoration:underline">\u2190 Go to Home</a></div>';
      return;
    }
    roomId = u.roomId;
    if (!getToken()) { showGuestJoinModal(); return; }
    startAuthenticated();
  }

  window.addEventListener('beforeunload', function() {
    if (stateDirty && roomId && window.craftGetState && myRole !== 'viewer') {
      var state = window.craftGetState();
      delete state.currentView;
      delete state.viewSettings;
      var p = JSON.stringify({ state: state, guestId: getToken() ? undefined : getGuestId() });
      navigator.sendBeacon(API_BASE + '/craftrooms/' + roomId + '/sync', new Blob([p], { type: 'application/json' }));
    }
    if (roomId) {
      var lp = {}; if (!getToken()) lp.guestId = getGuestId();
      navigator.sendBeacon(API_BASE + '/craftrooms/' + roomId + '/leave', new Blob([JSON.stringify(lp)], { type: 'application/json' }));
    }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

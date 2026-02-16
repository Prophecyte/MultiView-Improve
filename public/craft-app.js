// ============================================
// CRAFT ROOM SYNC LAYER
// Matches video room UI exactly
// ============================================
(function() {
  'use strict';

  var API_BASE = (window.APP_CONFIG && window.APP_CONFIG.API_BASE) || '/api';
  var SYNC_INTERVAL = window.CRAFT_SYNC_INTERVAL || 500;
  var HEARTBEAT_INTERVAL = 15000;
  var PUSH_DEBOUNCE = 800;

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

  // ─── Auth ───
  function getToken() { return localStorage.getItem('mv_token'); }
  function getGuestId() {
    var id = localStorage.getItem('mv_guest_id');
    if (!id) { id = 'guest_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9); localStorage.setItem('mv_guest_id', id); }
    return id;
  }
  function apiRequest(endpoint, options) {
    options = options || {};
    var token = getToken();
    var h = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = 'Bearer ' + token;
    return fetch(API_BASE + endpoint, { method: options.method || 'GET', headers: h, body: options.body })
      .then(function(r) { return r.json().then(function(d) { if (!r.ok) throw new Error(d.error || 'Request failed'); return d; }); });
  }
  function parseRoomUrl() {
    var m = location.hash.match(/^#\/room\/([a-f0-9-]+)\/([a-f0-9-]+)$/);
    return m ? { hostId: m[1], roomId: m[2] } : null;
  }

  // ─── State ───
  var localVersion = 0, lastStateHash = '', syncInterval = null, heartbeatInterval = null, pushTimeout = null;
  var roomId = null, isOwner = false, currentUser = null, roomInfo = null, members = [];
  var isPushing = false, isPulling = false, syncStatus = 'connecting';
  var userMenuOpen = false, myRole = 'viewer';

  function simpleHash(s) { var h = 0; for (var i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h = h & h; } return h.toString(); }
  function getCurrentStateHash() {
    if (!window.craftGetState) return '';
    try { return simpleHash(JSON.stringify(window.craftGetState())); } catch(e) { return ''; }
  }

  // ─── Sync engine ───
  function pollVersion() {
    if (!roomId || isPulling) return;
    apiRequest('/craftrooms/' + roomId + '/version')
      .then(function(d) { updateSyncStatus('synced'); if (d.version > localVersion) pullState(); })
      .catch(function() { updateSyncStatus('error'); });
  }
  function pullState() {
    if (isPulling) return; isPulling = true; updateSyncStatus('syncing');
    apiRequest('/craftrooms/' + roomId + '/sync')
      .then(function(d) {
        localVersion = d.version;
        members = d.members || [];
        renderConnectedBar();
        if (d.state && window.craftSetState) { window.craftSetState(d.state); lastStateHash = getCurrentStateHash(); }
        updateSyncStatus('synced');
      })
      .catch(function() { updateSyncStatus('error'); })
      .finally(function() { isPulling = false; });
  }
  function pushState() {
    if (!roomId || !window.craftGetState || isPushing) return;
    if (myRole === 'viewer') return; // viewers can't push
    var hash = getCurrentStateHash();
    if (hash === lastStateHash) return;
    isPushing = true; lastStateHash = hash; updateSyncStatus('syncing');
    var state = window.craftGetState();
    var body = { state: state, activeView: state.currentView };
    if (!getToken()) body.guestId = getGuestId();
    apiRequest('/craftrooms/' + roomId + '/sync', { method: 'PUT', body: JSON.stringify(body) })
      .then(function(d) { localVersion = d.version; updateSyncStatus('synced'); })
      .catch(function(err) { console.warn('Push failed:', err.message); updateSyncStatus('error'); })
      .finally(function() { isPushing = false; });
  }
  function schedulePush() { if (pushTimeout) clearTimeout(pushTimeout); pushTimeout = setTimeout(pushState, PUSH_DEBOUNCE); }
  function sendHeartbeat() {
    if (!roomId) return;
    var body = {};
    if (!getToken()) body.guestId = getGuestId();
    apiRequest('/craftrooms/' + roomId + '/heartbeat', { method: 'POST', body: JSON.stringify(body) }).catch(function() {});
  }
  function startChangeDetection() {
    setInterval(function() { if (window.craftGetState && getCurrentStateHash() !== lastStateHash) schedulePush(); }, SYNC_INTERVAL);
  }

  // ─── UI helpers ───
  function setRoomTitle(name) { var el = document.getElementById('roomTitle'); if (el) el.value = name || 'Craft Room'; }
  function updateSyncStatus(s) {
    syncStatus = s;
    var el = document.getElementById('craftSyncPill');
    if (!el) return;
    el.className = 'sync-pill ' + s;
    el.textContent = s === 'synced' ? 'Synced' : s === 'syncing' ? 'Syncing...' : 'Offline';
  }
  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  // ═══════════════════════════════════════════
  // SHARE MODAL (matching video room popup)
  // ═══════════════════════════════════════════
  function renderShareBtn() {
    var c = document.getElementById('craftShareBtn');
    if (!c) return;
    c.style.display = '';
    c.innerHTML = '<button class="craft-share-btn" title="Share Room">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>' +
      ' Share</button>';
    c.querySelector('.craft-share-btn').addEventListener('click', openShareModal);
  }

  function openShareModal() {
    var existing = document.getElementById('craftShareOverlay');
    if (existing) existing.remove();
    var shareUrl = location.origin + '/craft.html' + location.hash;
    var div = document.createElement('div');
    div.id = 'craftShareOverlay';
    div.className = 'craft-modal-overlay';
    div.innerHTML = '<div class="craft-modal share-modal" onclick="event.stopPropagation()">' +
      '<button class="craft-modal-close" id="shareClose">&times;</button>' +
      '<h2>🔗 Share Room</h2>' +
      '<p style="color:#999;font-size:13px;margin:0 0 16px">Anyone with this link can join your room</p>' +
      '<div class="share-link-box">' +
        '<input type="text" value="' + esc(shareUrl) + '" readonly id="shareLinkInput" />' +
        '<button class="craft-btn primary" id="shareCopyBtn">Copy Link</button>' +
      '</div>' +
    '</div>';
    document.body.appendChild(div);
    div.addEventListener('click', function(e) { if (e.target === div) div.remove(); });
    document.getElementById('shareClose').addEventListener('click', function() { div.remove(); });
    document.getElementById('shareCopyBtn').addEventListener('click', function() {
      var input = document.getElementById('shareLinkInput');
      input.select();
      navigator.clipboard.writeText(shareUrl).then(function() {
        var btn = document.getElementById('shareCopyBtn');
        btn.textContent = 'Copied!'; btn.style.background = '#22c55e';
        setTimeout(function() { btn.textContent = 'Copy Link'; btn.style.background = ''; }, 2000);
      });
    });
  }

  // ═══════════════════════════════════════════
  // USER MENU (matching video room dropdown)
  // ═══════════════════════════════════════════
  function renderUserMenu() {
    var c = document.getElementById('craftUserMenu');
    if (!c || !currentUser) return;
    var isGuest = !currentUser.id;
    var initial = (currentUser.displayName || '?').charAt(0).toUpperCase();
    c.innerHTML = '<div class="craft-user-menu">' +
      '<button class="craft-user-btn" id="craftUserBtn">' +
        '<span class="avatar">' + esc(initial) + '</span>' +
        '<span>' + esc(currentUser.displayName || 'Guest') + '</span>' +
        (isGuest ? '<span class="guest-tag">Guest</span>' : '') +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>' +
      '</button>' +
      '<div class="craft-user-dropdown" id="craftUserDropdown" style="display:none">' +
        '<div class="dd-header"><div class="name">' + esc(currentUser.displayName || 'Guest') + '</div>' +
        '<div class="email">' + (isGuest ? 'Temporary account' : esc(currentUser.email || '')) + '</div></div>' +
        (isGuest
          ? '<button class="dd-item primary" data-action="login">✚ Create Account</button><div class="dd-hint">Save your display name and access room history</div>'
          : '<button class="dd-item" data-action="home">🏠 My Rooms</button>' +
            '<button class="dd-item" data-action="settings">⚙️ Settings</button>' +
            '<div class="dd-divider"></div>' +
            '<button class="dd-item danger" data-action="logout">↩ Log out</button>'
        ) +
      '</div></div>';
    var btn = document.getElementById('craftUserBtn');
    var dd = document.getElementById('craftUserDropdown');
    btn.addEventListener('click', function(e) { e.stopPropagation(); userMenuOpen = !userMenuOpen; dd.style.display = userMenuOpen ? '' : 'none'; });
    document.addEventListener('click', function() { userMenuOpen = false; if (dd) dd.style.display = 'none'; });
    c.querySelectorAll('.dd-item').forEach(function(item) {
      item.addEventListener('click', function() {
        dd.style.display = 'none'; userMenuOpen = false;
        var a = item.dataset.action;
        if (a === 'home') window.location.href = '/';
        else if (a === 'settings') openSettings();
        else if (a === 'logout') { apiRequest('/auth/logout', { method: 'POST' }).catch(function(){}); localStorage.removeItem('mv_token'); window.location.href = '/'; }
        else if (a === 'login') window.location.href = '/';
      });
    });
  }

  // ═══════════════════════════════════════════
  // SETTINGS MODAL (matching video room exactly)
  // ═══════════════════════════════════════════
  function openSettings() {
    if (!currentUser || !currentUser.id) return;
    var existing = document.getElementById('craftSettingsOverlay');
    if (existing) existing.remove();
    var div = document.createElement('div');
    div.id = 'craftSettingsOverlay';
    div.className = 'craft-modal-overlay';
    var tabs = ['Profile', 'Email', 'Password', 'Theme'];
    if (isOwner) tabs.push('Permissions');
    tabs.push('Account');
    div.innerHTML = '<div class="craft-modal settings-modal-wide" onclick="event.stopPropagation()">' +
      '<button class="craft-modal-close" id="settingsClose">&times;</button>' +
      '<h2 style="font-family:Cinzel,serif;color:#eee;margin:0 0 12px">⚙️ Settings</h2>' +
      '<div class="settings-tabs" id="settingsTabs">' + tabs.map(function(t, i) {
        return '<button class="settings-tab' + (i === 0 ? ' active' : '') + '" data-tab="' + t.toLowerCase() + '">' + t + '</button>';
      }).join('') +
      '<button class="settings-tab logout" id="settingsLogout">Logout</button></div>' +
      '<div id="settingsMsg"></div>' +
      '<div id="settingsBody" class="settings-body"></div>' +
    '</div>';
    document.body.appendChild(div);
    div.addEventListener('click', function(e) { if (e.target === div) div.remove(); });
    document.getElementById('settingsClose').addEventListener('click', function() { div.remove(); });
    document.getElementById('settingsLogout').addEventListener('click', function() {
      apiRequest('/auth/logout', { method: 'POST' }).catch(function(){});
      localStorage.removeItem('mv_token'); window.location.href = '/';
    });
    div.querySelectorAll('.settings-tab:not(.logout)').forEach(function(tab) {
      tab.addEventListener('click', function() {
        div.querySelectorAll('.settings-tab').forEach(function(t) { t.classList.remove('active'); });
        tab.classList.add('active');
        clearMsg();
        renderSettingsTab(tab.dataset.tab);
      });
    });
    renderSettingsTab('profile');
  }

  function clearMsg() { var m = document.getElementById('settingsMsg'); if (m) { m.textContent = ''; m.className = ''; } }
  function showMsg(text, type) {
    var m = document.getElementById('settingsMsg');
    if (!m) return;
    m.className = 'settings-msg ' + type; m.textContent = text;
    setTimeout(function() { if (m) { m.textContent = ''; m.className = ''; } }, 3500);
  }

  function renderSettingsTab(tab) {
    var body = document.getElementById('settingsBody');
    if (!body) return;

    if (tab === 'profile') {
      body.innerHTML = '<div class="form-group"><label>Display Name</label>' +
        '<input type="text" id="sDispName" value="' + esc(currentUser.displayName || '') + '" /></div>' +
        '<div class="form-group"><label>Email</label><input type="email" value="' + esc(currentUser.email || '') + '" disabled /></div>' +
        '<button class="craft-btn primary" id="sSaveProfile">Save Changes</button>';
      document.getElementById('sSaveProfile').addEventListener('click', function() {
        var n = document.getElementById('sDispName').value.trim();
        if (!n) return;
        this.textContent = 'Saving...'; this.disabled = true;
        var btn = this;
        apiRequest('/auth/profile', { method: 'PUT', body: JSON.stringify({ displayName: n }) })
          .then(function() { currentUser.displayName = n; renderUserMenu(); showMsg('Profile saved!', 'success'); btn.textContent = 'Save Changes'; btn.disabled = false; })
          .catch(function(err) { showMsg(err.message, 'error'); btn.textContent = 'Save Changes'; btn.disabled = false; });
      });
    }

    else if (tab === 'email') {
      body.innerHTML = '<div class="form-group"><label>Current Email</label><input type="email" value="' + esc(currentUser.email || '') + '" disabled /></div>' +
        '<div class="form-group"><label>New Email</label><input type="email" id="sNewEmail" placeholder="Enter new email" /></div>' +
        '<div class="form-group"><label>Current Password</label><input type="password" id="sEmailPw" placeholder="Confirm with password" /></div>' +
        '<button class="craft-btn primary" id="sSaveEmail">Update Email</button>';
      document.getElementById('sSaveEmail').addEventListener('click', function() {
        var e = document.getElementById('sNewEmail').value.trim(), p = document.getElementById('sEmailPw').value;
        if (!e || !p) return showMsg('Please fill in all fields', 'error');
        this.textContent = 'Updating...'; this.disabled = true; var btn = this;
        apiRequest('/auth/email', { method: 'PUT', body: JSON.stringify({ newEmail: e, password: p }) })
          .then(function() { currentUser.email = e; showMsg('Email updated!', 'success'); btn.textContent = 'Update Email'; btn.disabled = false; })
          .catch(function(err) { showMsg(err.message, 'error'); btn.textContent = 'Update Email'; btn.disabled = false; });
      });
    }

    else if (tab === 'password') {
      body.innerHTML = '<div class="form-group"><label>Current Password</label><input type="password" id="sCurPw" placeholder="Enter current password" /></div>' +
        '<div class="form-group"><label>New Password</label><input type="password" id="sNewPw" placeholder="Enter new password" /></div>' +
        '<div class="form-group"><label>Confirm New Password</label><input type="password" id="sConfPw" placeholder="Confirm new password" /></div>' +
        '<button class="craft-btn primary" id="sSavePw">Change Password</button>';
      document.getElementById('sSavePw').addEventListener('click', function() {
        var c = document.getElementById('sCurPw').value, n = document.getElementById('sNewPw').value, cf = document.getElementById('sConfPw').value;
        if (!c || !n || !cf) return showMsg('Please fill in all fields', 'error');
        if (n !== cf) return showMsg('New passwords do not match', 'error');
        if (n.length < 6) return showMsg('Password must be at least 6 characters', 'error');
        this.textContent = 'Changing...'; this.disabled = true; var btn = this;
        apiRequest('/auth/password', { method: 'PUT', body: JSON.stringify({ currentPassword: c, newPassword: n }) })
          .then(function() { showMsg('Password changed!', 'success'); btn.textContent = 'Change Password'; btn.disabled = false; document.getElementById('sCurPw').value = ''; document.getElementById('sNewPw').value = ''; document.getElementById('sConfPw').value = ''; })
          .catch(function(err) { showMsg(err.message, 'error'); btn.textContent = 'Change Password'; btn.disabled = false; });
      });
    }

    else if (tab === 'theme') {
      var themeKey = 'theme_' + currentUser.id;
      var cur = localStorage.getItem(themeKey) || 'gold';
      body.innerHTML = '<p style="color:#999;font-size:13px;margin:0 0 16px">Choose your preferred color theme</p>' +
        '<div class="theme-grid">' + THEMES.map(function(t) {
          return '<div class="theme-option' + (t.id === cur ? ' active' : '') + '" data-theme="' + t.id + '">' +
            '<div class="theme-swatch" style="background:' + t.color + '"></div>' +
            '<span class="theme-name">' + t.name + '</span></div>';
        }).join('') + '</div>';
      body.querySelectorAll('.theme-option').forEach(function(opt) {
        opt.addEventListener('click', function() {
          var id = opt.dataset.theme;
          localStorage.setItem(themeKey, id);
          document.documentElement.setAttribute('data-theme', id);
          body.querySelectorAll('.theme-option').forEach(function(o) { o.classList.remove('active'); });
          opt.classList.add('active');
          showMsg('Theme updated!', 'success');
        });
      });
    }

    else if (tab === 'permissions') {
      renderPermissionsTab(body);
    }

    else if (tab === 'account') {
      body.innerHTML = '<div class="danger-zone">' +
        '<h4 style="color:#ef4444;margin:0 0 8px">⚠️ Danger Zone</h4>' +
        '<p style="color:#888;font-size:13px;margin:0 0 16px">Deleting your account will permanently remove all your data including rooms and playlists.</p>' +
        '<button class="craft-btn danger" id="sDeleteAcct">Delete My Account</button>' +
      '</div>';
      document.getElementById('sDeleteAcct').addEventListener('click', function() {
        if (!confirm('Delete your account? This cannot be undone.')) return;
        this.textContent = 'Deleting...'; this.disabled = true;
        apiRequest('/auth/account', { method: 'DELETE' })
          .then(function() { localStorage.removeItem('mv_token'); window.location.href = '/'; })
          .catch(function(err) { showMsg(err.message, 'error'); });
      });
    }
  }

  // ─── Permissions tab (owner only) ───
  function renderPermissionsTab(body) {
    var nonOwners = members.filter(function(m) { return !m.is_owner; });
    if (nonOwners.length === 0) {
      body.innerHTML = '<p style="color:#888;font-size:13px">No other members have joined this room yet. Share the room link to invite others.</p>';
      return;
    }
    body.innerHTML = '<p style="color:#999;font-size:13px;margin:0 0 16px">Manage what members can do in your room</p>' +
      '<div class="perms-list">' + nonOwners.map(function(m) {
        var uid = m.user_id || m.guest_id;
        var role = m.role || 'viewer';
        var canHidden = m.can_view_hidden || false;
        var isGuest = !!m.guest_id;
        return '<div class="perm-row" data-uid="' + (m.user_id || '') + '" data-gid="' + (m.guest_id || '') + '">' +
          '<div class="perm-user">' +
            '<span class="perm-name">' + esc(m.display_name) + (isGuest ? ' <span style="opacity:0.5">(guest)</span>' : '') + '</span>' +
            '<span class="perm-status ' + (m.status || 'offline') + '">' + (m.status === 'online' ? '● Online' : '○ Offline') + '</span>' +
          '</div>' +
          '<div class="perm-controls">' +
            '<select class="perm-role-select" data-uid="' + (m.user_id || '') + '" data-gid="' + (m.guest_id || '') + '">' +
              '<option value="viewer"' + (role === 'viewer' ? ' selected' : '') + '>👁 View Only</option>' +
              '<option value="editor"' + (role === 'editor' ? ' selected' : '') + '>✏️ Can Edit</option>' +
            '</select>' +
            '<label class="perm-toggle"><input type="checkbox" class="perm-hidden-cb" data-uid="' + (m.user_id || '') + '" data-gid="' + (m.guest_id || '') + '"' + (canHidden ? ' checked' : '') + ' />' +
            '<span class="perm-toggle-label">See hidden</span></label>' +
          '</div>' +
        '</div>';
      }).join('') + '</div>';

    body.querySelectorAll('.perm-role-select').forEach(function(sel) {
      sel.addEventListener('change', function() {
        var uid = sel.dataset.uid || null, gid = sel.dataset.gid || null;
        apiRequest('/craftrooms/' + roomId + '/permissions', {
          method: 'PUT',
          body: JSON.stringify({ targetUserId: uid || undefined, targetGuestId: gid || undefined, role: sel.value })
        }).then(function() { showMsg('Permission updated', 'success'); }).catch(function(err) { showMsg(err.message, 'error'); });
      });
    });

    body.querySelectorAll('.perm-hidden-cb').forEach(function(cb) {
      cb.addEventListener('change', function() {
        var uid = cb.dataset.uid || null, gid = cb.dataset.gid || null;
        apiRequest('/craftrooms/' + roomId + '/permissions', {
          method: 'PUT',
          body: JSON.stringify({ targetUserId: uid || undefined, targetGuestId: gid || undefined, canViewHidden: cb.checked })
        }).then(function() { showMsg('Permission updated', 'success'); }).catch(function(err) { showMsg(err.message, 'error'); });
      });
    });
  }

  // ═══════════════════════════════════════════
  // CONNECTED BAR (bottom) + context menu
  // ═══════════════════════════════════════════
  var activeContextMenu = null;
  function closeContextMenu() { if (activeContextMenu) { activeContextMenu.remove(); activeContextMenu = null; } }
  document.addEventListener('click', closeContextMenu);

  function renderConnectedBar() {
    var bar = document.getElementById('craftConnectedBar');
    if (!bar) return;
    var online = members.filter(function(m) { return m.status === 'online'; });
    if (online.length === 0 && !roomId) { bar.style.display = 'none'; return; }
    bar.style.display = '';
    var myId = currentUser ? (currentUser.id || currentUser.guestId) : null;

    // Determine my role from members list
    for (var i = 0; i < members.length; i++) {
      var mid = members[i].user_id || members[i].guest_id;
      if (mid === myId) { myRole = members[i].is_owner ? 'owner' : (members[i].role || 'viewer'); break; }
    }

    bar.innerHTML = '<span class="bar-label"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg> Connected</span>' +
      '<span class="bar-users" id="barUsers"></span>' +
      '<span class="bar-count">' + online.length + ' online</span>' +
      '<span class="sync-pill ' + syncStatus + '" id="craftSyncPill">' + (syncStatus === 'synced' ? 'Synced' : syncStatus === 'syncing' ? 'Syncing...' : 'Offline') + '</span>';

    var container = document.getElementById('barUsers');
    online.forEach(function(m) {
      var uid = m.user_id || m.guest_id;
      var isYou = uid === myId;
      var span = document.createElement('span');
      span.className = 'bar-user' + (isYou ? ' is-you' : '') + (m.is_owner ? ' is-owner' : '');
      span.innerHTML = (m.is_owner ? '<span class="owner-crown">👑</span>' : '') +
        '<span class="bar-dot"></span>' + esc(m.display_name) +
        (isYou ? ' <span style="opacity:0.5">(you)</span>' : '') +
        (m.role && !m.is_owner ? ' <span class="role-tag">' + (m.role === 'editor' ? '✏️' : '👁') + '</span>' : '');

      // Right-click for owner to kick
      if (isOwner && !isYou) {
        span.style.cursor = 'context-menu';
        span.addEventListener('contextmenu', function(e) {
          e.preventDefault();
          closeContextMenu();
          var menu = document.createElement('div');
          menu.className = 'craft-context-menu';
          menu.style.position = 'fixed';
          menu.style.left = Math.min(e.clientX, window.innerWidth - 160) + 'px';
          menu.style.bottom = (window.innerHeight - e.clientY + 4) + 'px';
          menu.innerHTML = '<button class="ctx-item danger">✕ Kick ' + esc(m.display_name) + '</button>';
          menu.querySelector('.ctx-item').addEventListener('click', function() {
            if (confirm('Kick ' + m.display_name + ' from this room?')) {
              apiRequest('/craftrooms/' + roomId + '/kick', {
                method: 'POST',
                body: JSON.stringify({ userId: m.user_id || undefined, guestId: m.guest_id || undefined })
              }).then(function() {
                members = members.filter(function(x) { return (x.user_id || x.guest_id) !== uid; });
                renderConnectedBar();
              }).catch(function(err) { alert('Failed: ' + err.message); });
            }
            closeContextMenu();
          });
          document.body.appendChild(menu);
          activeContextMenu = menu;
          e.stopPropagation();
        });
      }
      container.appendChild(span);
    });
  }

  // ═══════════════════════════════════════════
  // GUEST JOIN MODAL (matching video room)
  // ═══════════════════════════════════════════
  function showGuestJoinModal() {
    var c = document.getElementById('craftGuestModal');
    if (!c) return;
    var dash = document.querySelector('.dashboard');
    if (dash) dash.style.display = 'none';
    c.innerHTML = '<div class="craft-modal-overlay">' +
      '<div class="craft-modal guest-modal">' +
        '<div class="modal-icon">🐉</div>' +
        '<h2>Join Craft Room</h2>' +
        '<p style="color:#999;font-size:13px;margin:0 0 20px">Enter a display name or join anonymously</p>' +
        '<input type="text" id="guestNameInput" class="craft-input" placeholder="Your name (optional)" />' +
        '<button class="craft-btn primary full" id="guestJoinBtn">Join as Guest</button>' +
        '<div class="modal-divider"><span>or</span></div>' +
        '<button class="craft-btn secondary full" id="guestLoginBtn">Sign in / Create Account</button>' +
      '</div></div>';
    var input = document.getElementById('guestNameInput');
    var btn = document.getElementById('guestJoinBtn');
    input.focus();
    input.addEventListener('input', function() { var n = input.value.trim(); btn.textContent = n ? 'Join as ' + n : 'Join as Guest'; });
    function doJoin() {
      var name = input.value.trim() || ('Guest ' + Math.floor(Math.random() * 9000 + 1000));
      btn.textContent = 'Joining...'; btn.disabled = true;
      var gid = getGuestId();
      apiRequest('/craftrooms/' + roomId + '/join', { method: 'POST', body: JSON.stringify({ displayName: name, guestId: gid }) })
        .then(function() { c.innerHTML = ''; if (dash) dash.style.display = ''; currentUser = { id: null, displayName: name, guestId: gid }; return apiRequest('/craftrooms/' + roomId); })
        .then(function(d) { roomInfo = d.room; isOwner = false; myRole = 'viewer'; setRoomTitle(roomInfo.name); renderShareBtn(); renderUserMenu(); startSync(); })
        .catch(function(err) { btn.textContent = 'Join as Guest'; btn.disabled = false; alert('Failed: ' + err.message); });
    }
    btn.addEventListener('click', doJoin);
    input.addEventListener('keydown', function(e) { if (e.key === 'Enter') doJoin(); });
    document.getElementById('guestLoginBtn').addEventListener('click', function() { window.location.href = '/'; });
  }

  // ─── Start flows ───
  function startAuthenticated() {
    apiRequest('/auth/me')
      .then(function(d) {
        currentUser = d.user;
        var theme = localStorage.getItem('theme_' + currentUser.id) || 'gold';
        document.documentElement.setAttribute('data-theme', theme);
        return apiRequest('/craftrooms/' + roomId);
      })
      .then(function(d) {
        roomInfo = d.room; isOwner = roomInfo.owner_id === currentUser.id;
        myRole = isOwner ? 'owner' : 'viewer';
        setRoomTitle(roomInfo.name); renderShareBtn(); renderUserMenu();
        return apiRequest('/craftrooms/' + roomId + '/join', { method: 'POST', body: JSON.stringify({ displayName: currentUser.displayName }) });
      })
      .then(function() { startSync(); })
      .catch(function(err) {
        console.error('Init error:', err);
        document.body.innerHTML = '<div class="craft-auth-needed"><div style="font-size:48px">⚔️</div><p>Error: ' + err.message + '</p><a href="/">← Go to Home</a></div>';
      });
  }

  function startSync() {
    renderConnectedBar();
    function onReady() {
      pullState();
      syncInterval = setInterval(pollVersion, SYNC_INTERVAL);
      sendHeartbeat();
      heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
      startChangeDetection();
      setInterval(function() {
        apiRequest('/craftrooms/' + roomId + '/members')
          .then(function(d) { members = d.members || []; renderConnectedBar(); })
          .catch(function() {});
      }, 10000);
    }
    if (window.craftReady) onReady(); else window.onCraftReady = onReady;
  }

  function init() {
    var u = parseRoomUrl();
    if (!u) { document.body.innerHTML = '<div class="craft-auth-needed"><div style="font-size:48px">⚔️</div><p>No craft room specified</p><a href="/">← Go to Home</a></div>'; return; }
    roomId = u.roomId;
    if (!getToken()) { showGuestJoinModal(); return; }
    startAuthenticated();
  }

  window.addEventListener('beforeunload', function() {
    if (roomId) {
      var b = {};
      if (!getToken()) b.guestId = getGuestId();
      navigator.sendBeacon(API_BASE + '/craftrooms/' + roomId + '/leave', JSON.stringify(b));
    }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

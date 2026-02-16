// ============================================
// CRAFT ROOM SYNC LAYER
// Matches video room UI: header, guest modal,
// settings, connected bar, share
// ============================================

(function() {
  'use strict';

  var API_BASE = window.APP_CONFIG?.API_BASE || '/api';
  var SYNC_INTERVAL = window.CRAFT_SYNC_INTERVAL || 500;
  var HEARTBEAT_INTERVAL = 15000;
  var PUSH_DEBOUNCE = 800;

  var THEMES = [
    { id: 'gold', label: 'Gold', color: '#d4a824' },
    { id: 'ember', label: 'Ember', color: '#dc6b2f' },
    { id: 'forest', label: 'Forest', color: '#2d8a4e' },
    { id: 'ocean', label: 'Ocean', color: '#2e7bbf' },
    { id: 'purple', label: 'Purple', color: '#8b5cf6' },
    { id: 'sunset', label: 'Sunset', color: '#e84393' },
    { id: 'rose', label: 'Rose', color: '#e74c3c' },
    { id: 'cyan', label: 'Cyan', color: '#00bcd4' }
  ];

  // ─── Auth helpers ───
  function getToken() { return localStorage.getItem('mv_token'); }
  function getGuestId() {
    var id = localStorage.getItem('mv_guest_id');
    if (!id) { id = 'guest_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9); localStorage.setItem('mv_guest_id', id); }
    return id;
  }

  function apiRequest(endpoint, options) {
    options = options || {};
    var token = getToken();
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return fetch(API_BASE + endpoint, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body
    }).then(function(r) {
      return r.json().then(function(data) {
        if (!r.ok) throw new Error(data.error || 'Request failed');
        return data;
      });
    });
  }

  function parseRoomUrl() {
    var hash = location.hash;
    var m = hash.match(/^#\/room\/([a-f0-9-]+)\/([a-f0-9-]+)$/);
    if (!m) return null;
    return { hostId: m[1], roomId: m[2] };
  }

  // ─── State ───
  var localVersion = 0;
  var lastStateHash = '';
  var syncInterval = null;
  var heartbeatInterval = null;
  var pushTimeout = null;
  var roomId = null;
  var isOwner = false;
  var currentUser = null;
  var roomInfo = null;
  var members = [];
  var isPushing = false;
  var isPulling = false;
  var syncStatus = 'connecting';
  var userMenuOpen = false;

  function simpleHash(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return hash.toString();
  }

  function getCurrentStateHash() {
    if (!window.craftGetState) return '';
    try { return simpleHash(JSON.stringify(window.craftGetState())); }
    catch(e) { return ''; }
  }

  // ─── Sync engine ───
  function pollVersion() {
    if (!roomId || isPulling) return;
    apiRequest('/craftrooms/' + roomId + '/version')
      .then(function(data) {
        updateSyncStatus('synced');
        if (data.version > localVersion) pullState();
      })
      .catch(function() { updateSyncStatus('error'); });
  }

  function pullState() {
    if (isPulling) return;
    isPulling = true;
    updateSyncStatus('syncing');
    apiRequest('/craftrooms/' + roomId + '/sync')
      .then(function(data) {
        localVersion = data.version;
        members = data.members || [];
        renderConnectedBar();
        if (data.state && window.craftSetState) {
          window.craftSetState(data.state);
          lastStateHash = getCurrentStateHash();
        }
        updateSyncStatus('synced');
      })
      .catch(function() { updateSyncStatus('error'); })
      .finally(function() { isPulling = false; });
  }

  function pushState() {
    if (!roomId || !window.craftGetState || isPushing) return;
    var currentHash = getCurrentStateHash();
    if (currentHash === lastStateHash) return;
    isPushing = true;
    lastStateHash = currentHash;
    updateSyncStatus('syncing');
    var state = window.craftGetState();
    apiRequest('/craftrooms/' + roomId + '/sync', {
      method: 'PUT',
      body: JSON.stringify({ state: state, activeView: state.currentView })
    })
      .then(function(data) { localVersion = data.version; updateSyncStatus('synced'); })
      .catch(function() { updateSyncStatus('error'); })
      .finally(function() { isPushing = false; });
  }

  function schedulePush() {
    if (pushTimeout) clearTimeout(pushTimeout);
    pushTimeout = setTimeout(pushState, PUSH_DEBOUNCE);
  }

  function sendHeartbeat() {
    if (!roomId) return;
    var body = {};
    if (!getToken()) body.guestId = getGuestId();
    apiRequest('/craftrooms/' + roomId + '/heartbeat', {
      method: 'POST', body: JSON.stringify(body)
    }).catch(function() {});
  }

  function startChangeDetection() {
    setInterval(function() {
      if (!window.craftGetState) return;
      if (getCurrentStateHash() !== lastStateHash) schedulePush();
    }, SYNC_INTERVAL);
  }

  // ─── UI: Room title ───
  function setRoomTitle(name) {
    var input = document.getElementById('roomTitle');
    if (input) input.value = name || 'Craft Room';
  }

  // ─── UI: Sync status (in bottom bar) ───
  function updateSyncStatus(status) {
    syncStatus = status;
    var el = document.getElementById('craftSyncPill');
    if (!el) return;
    el.className = 'sync-pill ' + status;
    el.textContent = status === 'synced' ? 'Synced' : status === 'syncing' ? 'Syncing...' : 'Offline';
  }

  // ─── UI: Share button ───
  function renderShareBtn() {
    var container = document.getElementById('craftShareBtn');
    if (!container) return;
    container.style.display = '';
    var shareUrl = location.origin + '/craft.html' + location.hash;
    container.innerHTML = '<button class="craft-share-btn" title="Copy share link">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>' +
      ' Share</button>';
    container.querySelector('.craft-share-btn').addEventListener('click', function() {
      navigator.clipboard.writeText(shareUrl).then(function() {
        var btn = container.querySelector('.craft-share-btn');
        var orig = btn.innerHTML;
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Copied!';
        setTimeout(function() { btn.innerHTML = orig; }, 2000);
      });
    });
  }

  // ─── UI: User menu ───
  function renderUserMenu() {
    var container = document.getElementById('craftUserMenu');
    if (!container || !currentUser) return;

    var isGuest = !currentUser.id;
    var initial = (currentUser.displayName || '?').charAt(0).toUpperCase();

    container.innerHTML = '<div class="craft-user-menu">' +
      '<button class="craft-user-btn" id="craftUserBtn">' +
        '<span class="avatar">' + initial + '</span>' +
        '<span>' + (currentUser.displayName || 'Guest') + '</span>' +
        (isGuest ? '<span class="guest-tag">Guest</span>' : '') +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>' +
      '</button>' +
      '<div class="craft-user-dropdown" id="craftUserDropdown" style="display:none">' +
        '<div class="dd-header">' +
          '<div class="name">' + (currentUser.displayName || 'Guest') + '</div>' +
          '<div class="email">' + (isGuest ? 'Temporary account' : (currentUser.email || '')) + '</div>' +
        '</div>' +
        (isGuest
          ? '<button class="dd-item primary" data-action="login"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Create Account</button>' +
            '<div class="dd-hint">Save your display name and access room history</div>'
          : '<button class="dd-item" data-action="home"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/></svg> My Rooms</button>' +
            '<button class="dd-item" data-action="settings"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9"/></svg> Settings</button>' +
            '<div class="dd-divider"></div>' +
            '<button class="dd-item danger" data-action="logout"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg> Log out</button>'
        ) +
      '</div>' +
    '</div>';

    var btn = document.getElementById('craftUserBtn');
    var dropdown = document.getElementById('craftUserDropdown');

    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      userMenuOpen = !userMenuOpen;
      dropdown.style.display = userMenuOpen ? '' : 'none';
    });

    document.addEventListener('click', function() {
      userMenuOpen = false;
      if (dropdown) dropdown.style.display = 'none';
    });

    container.querySelectorAll('.dd-item').forEach(function(item) {
      item.addEventListener('click', function() {
        var action = item.dataset.action;
        dropdown.style.display = 'none';
        userMenuOpen = false;
        if (action === 'home') window.location.href = '/';
        else if (action === 'settings') openSettings();
        else if (action === 'logout') {
          apiRequest('/auth/logout', { method: 'POST' }).catch(function() {});
          localStorage.removeItem('mv_token');
          window.location.href = '/';
        }
        else if (action === 'login') window.location.href = '/';
      });
    });
  }

  // ─── UI: Settings modal ───
  function openSettings() {
    if (!currentUser || !currentUser.id) return;
    var container = document.getElementById('craftSettingsModal');
    if (!container) return;

    container.innerHTML = '<div class="craft-settings-overlay" id="craftSettingsOverlay">' +
      '<div class="craft-settings-modal">' +
        '<div class="modal-header"><h2>Settings</h2><button class="modal-close" id="craftSettingsClose">&times;</button></div>' +
        '<div class="settings-tabs">' +
          '<button class="settings-tab active" data-tab="profile">Profile</button>' +
          '<button class="settings-tab" data-tab="theme">Theme</button>' +
          '<button class="settings-tab" data-tab="security">Security</button>' +
        '</div>' +
        '<div class="settings-body" id="craftSettingsBody"></div>' +
      '</div></div>';

    document.getElementById('craftSettingsClose').addEventListener('click', function() { container.innerHTML = ''; });
    document.getElementById('craftSettingsOverlay').addEventListener('click', function(e) {
      if (e.target === this) container.innerHTML = '';
    });

    container.querySelectorAll('.settings-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        container.querySelectorAll('.settings-tab').forEach(function(t) { t.classList.remove('active'); });
        tab.classList.add('active');
        renderSettingsTab(tab.dataset.tab);
      });
    });

    renderSettingsTab('profile');
  }

  function renderSettingsTab(tab) {
    var body = document.getElementById('craftSettingsBody');
    if (!body) return;

    if (tab === 'profile') {
      body.innerHTML = '<div id="settingsMsg"></div>' +
        '<div class="form-group"><label>Display Name</label>' +
        '<input type="text" id="settingsDisplayName" value="' + (currentUser.displayName || '').replace(/"/g, '&quot;') + '" /></div>' +
        '<button class="save-btn" id="settingsSaveProfile">Save</button>';
      document.getElementById('settingsSaveProfile').addEventListener('click', function() {
        var name = document.getElementById('settingsDisplayName').value.trim();
        if (!name) return;
        apiRequest('/auth/profile', { method: 'PUT', body: JSON.stringify({ displayName: name }) })
          .then(function() { currentUser.displayName = name; renderUserMenu(); showMsg('Profile updated!', 'success'); })
          .catch(function(err) { showMsg(err.message, 'error'); });
      });
    }
    else if (tab === 'theme') {
      var themeKey = 'theme_' + currentUser.id;
      var cur = localStorage.getItem(themeKey) || 'gold';
      body.innerHTML = '<div class="theme-grid">' + THEMES.map(function(t) {
        return '<div class="theme-swatch' + (t.id === cur ? ' active' : '') + '" data-theme="' + t.id + '" style="background:' + t.color + '" title="' + t.label + '"></div>';
      }).join('') + '</div>';
      body.querySelectorAll('.theme-swatch').forEach(function(sw) {
        sw.addEventListener('click', function() {
          localStorage.setItem(themeKey, sw.dataset.theme);
          document.documentElement.setAttribute('data-theme', sw.dataset.theme);
          body.querySelectorAll('.theme-swatch').forEach(function(s) { s.classList.remove('active'); });
          sw.classList.add('active');
        });
      });
    }
    else if (tab === 'security') {
      body.innerHTML = '<div id="settingsMsg"></div>' +
        '<div class="form-group"><label>New Email</label><input type="email" id="sNewEmail" placeholder="new@email.com" /></div>' +
        '<div class="form-group"><label>Current Password</label><input type="password" id="sEmailPw" /></div>' +
        '<button class="save-btn" id="sSaveEmail" style="margin-bottom:20px">Update Email</button>' +
        '<hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin:16px 0">' +
        '<div class="form-group"><label>Current Password</label><input type="password" id="sCurPw" /></div>' +
        '<div class="form-group"><label>New Password</label><input type="password" id="sNewPw" /></div>' +
        '<div class="form-group"><label>Confirm Password</label><input type="password" id="sConfPw" /></div>' +
        '<button class="save-btn" id="sSavePw">Update Password</button>';
      document.getElementById('sSaveEmail').addEventListener('click', function() {
        var e = document.getElementById('sNewEmail').value.trim(), p = document.getElementById('sEmailPw').value;
        if (!e || !p) return showMsg('Fill in all fields', 'error');
        apiRequest('/auth/email', { method: 'PUT', body: JSON.stringify({ newEmail: e, password: p }) })
          .then(function() { showMsg('Email updated!', 'success'); }).catch(function(err) { showMsg(err.message, 'error'); });
      });
      document.getElementById('sSavePw').addEventListener('click', function() {
        var c = document.getElementById('sCurPw').value, n = document.getElementById('sNewPw').value, cf = document.getElementById('sConfPw').value;
        if (!c || !n) return showMsg('Fill in all fields', 'error');
        if (n !== cf) return showMsg('Passwords do not match', 'error');
        apiRequest('/auth/password', { method: 'PUT', body: JSON.stringify({ currentPassword: c, newPassword: n }) })
          .then(function() { showMsg('Password updated!', 'success'); }).catch(function(err) { showMsg(err.message, 'error'); });
      });
    }
  }

  function showMsg(text, type) {
    var el = document.getElementById('settingsMsg');
    if (!el) return;
    el.className = 'msg ' + type; el.textContent = text;
    setTimeout(function() { if (el) { el.textContent = ''; el.className = ''; } }, 3000);
  }

  // ─── UI: Connected users bar (bottom) ───
  function renderConnectedBar() {
    var bar = document.getElementById('craftConnectedBar');
    if (!bar) return;

    var online = members.filter(function(m) { return m.status === 'online'; });
    if (online.length === 0 && !roomId) { bar.style.display = 'none'; return; }
    bar.style.display = '';

    var myId = currentUser ? (currentUser.id || currentUser.guestId) : null;

    var usersHtml = online.map(function(m) {
      var uid = m.user_id || m.guest_id;
      var isYou = uid === myId;
      return '<span class="bar-user' + (isYou ? ' is-you' : '') + (m.is_owner ? ' is-owner' : '') + '">' +
        (m.is_owner ? '<span class="owner-crown">👑</span>' : '') +
        '<span class="bar-dot"></span>' +
        m.display_name +
        (isYou ? ' <span style="opacity:0.5">(you)</span>' : '') +
      '</span>';
    }).join('');

    bar.innerHTML = '<span class="bar-label">' +
      '<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>' +
      ' Connected</span>' +
      '<span class="bar-users">' + usersHtml + '</span>' +
      '<span class="bar-count">' + online.length + ' online</span>' +
      '<span class="sync-pill ' + syncStatus + '" id="craftSyncPill">' +
        (syncStatus === 'synced' ? 'Synced' : syncStatus === 'syncing' ? 'Syncing...' : 'Offline') +
      '</span>';
  }

  // ─── UI: Guest join modal (matching video room) ───
  function showGuestJoinModal() {
    var container = document.getElementById('craftGuestModal');
    if (!container) return;

    var dashboard = document.querySelector('.dashboard');
    if (dashboard) dashboard.style.display = 'none';

    container.innerHTML = '<div class="craft-guest-overlay">' +
      '<div class="craft-guest-modal">' +
        '<div class="modal-icon">🐉</div>' +
        '<h2>Join Craft Room</h2>' +
        '<p>Enter a display name or join anonymously</p>' +
        '<input type="text" id="guestNameInput" placeholder="Your name (optional)" />' +
        '<button class="btn primary" id="guestJoinBtn">Join as Guest</button>' +
        '<div class="divider">or</div>' +
        '<button class="btn secondary" id="guestLoginBtn">Sign in / Create Account</button>' +
      '</div></div>';

    var input = document.getElementById('guestNameInput');
    var joinBtn = document.getElementById('guestJoinBtn');

    input.focus();
    input.addEventListener('input', function() {
      var n = input.value.trim();
      joinBtn.textContent = n ? 'Join as ' + n : 'Join as Guest';
    });

    function doJoin() {
      var name = input.value.trim() || ('Guest ' + Math.floor(Math.random() * 9000 + 1000));
      joinBtn.textContent = 'Joining...'; joinBtn.disabled = true;
      var guestId = getGuestId();
      apiRequest('/craftrooms/' + roomId + '/join', {
        method: 'POST', body: JSON.stringify({ displayName: name, guestId: guestId })
      }).then(function() {
        container.innerHTML = '';
        if (dashboard) dashboard.style.display = '';
        currentUser = { id: null, displayName: name, guestId: guestId };
        return apiRequest('/craftrooms/' + roomId);
      }).then(function(data) {
        roomInfo = data.room; isOwner = false;
        setRoomTitle(roomInfo.name);
        renderShareBtn(); renderUserMenu(); startSync();
      }).catch(function(err) {
        joinBtn.textContent = 'Join as Guest'; joinBtn.disabled = false;
        alert('Failed to join: ' + err.message);
      });
    }

    joinBtn.addEventListener('click', doJoin);
    input.addEventListener('keydown', function(e) { if (e.key === 'Enter') doJoin(); });
    document.getElementById('guestLoginBtn').addEventListener('click', function() { window.location.href = '/'; });
  }

  // ─── Start flows ───
  function startAuthenticated() {
    apiRequest('/auth/me')
      .then(function(data) {
        currentUser = data.user;
        var theme = localStorage.getItem('theme_' + currentUser.id) || 'gold';
        document.documentElement.setAttribute('data-theme', theme);
        return apiRequest('/craftrooms/' + roomId);
      })
      .then(function(data) {
        roomInfo = data.room;
        isOwner = roomInfo.owner_id === currentUser.id;
        setRoomTitle(roomInfo.name);
        renderShareBtn(); renderUserMenu();
        return apiRequest('/craftrooms/' + roomId + '/join', {
          method: 'POST', body: JSON.stringify({ displayName: currentUser.displayName })
        });
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
          .then(function(data) { members = data.members || []; renderConnectedBar(); })
          .catch(function() {});
      }, 10000);
    }
    if (window.craftReady) onReady();
    else window.onCraftReady = onReady;
  }

  // ─── Init ───
  function init() {
    var roomUrl = parseRoomUrl();
    if (!roomUrl) {
      document.body.innerHTML = '<div class="craft-auth-needed"><div style="font-size:48px">⚔️</div><p>No craft room specified</p><a href="/">← Go to Home</a></div>';
      return;
    }
    roomId = roomUrl.roomId;
    if (!getToken()) { showGuestJoinModal(); return; }
    startAuthenticated();
  }

  // ─── Cleanup ───
  window.addEventListener('beforeunload', function() {
    if (roomId) {
      var body = {};
      if (!getToken()) body.guestId = getGuestId();
      navigator.sendBeacon(API_BASE + '/craftrooms/' + roomId + '/leave', JSON.stringify(body));
    }
    if (syncInterval) clearInterval(syncInterval);
    if (heartbeatInterval) clearInterval(heartbeatInterval);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();

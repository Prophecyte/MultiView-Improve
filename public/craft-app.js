// ============================================
// CRAFT ROOM SYNC LAYER
// Connects the craft room to the server
// ============================================

(function() {
  'use strict';

  var API_BASE = window.APP_CONFIG?.API_BASE || '/api';
  var SYNC_INTERVAL = window.CRAFT_SYNC_INTERVAL || 500;
  var HEARTBEAT_INTERVAL = 15000;
  var PUSH_DEBOUNCE = 800;

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

  // ─── Parse room URL ───
  // Format: #/room/{hostId}/{roomId}
  function parseRoomUrl() {
    var hash = location.hash;
    var m = hash.match(/^#\/room\/([a-f0-9-]+)\/([a-f0-9-]+)$/);
    if (!m) return null;
    return { hostId: m[1], roomId: m[2] };
  }

  // ─── Sync State ───
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

  function simpleHash(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      var char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString();
  }

  function getCurrentStateHash() {
    if (!window.craftGetState) return '';
    try {
      var state = window.craftGetState();
      return simpleHash(JSON.stringify(state));
    } catch(e) { return ''; }
  }

  // ─── Poll for version changes ───
  function pollVersion() {
    if (!roomId || isPulling) return;

    apiRequest('/craftrooms/' + roomId + '/version')
      .then(function(data) {
        updateSyncStatus('synced');
        if (data.version > localVersion) {
          pullState();
        }
      })
      .catch(function(err) {
        updateSyncStatus('error');
        console.warn('Version poll error:', err);
      });
  }

  // ─── Pull full state from server ───
  function pullState() {
    if (isPulling) return;
    isPulling = true;
    updateSyncStatus('syncing');

    apiRequest('/craftrooms/' + roomId + '/sync')
      .then(function(data) {
        localVersion = data.version;
        members = data.members || [];
        renderMembers();

        // Apply state to craft room
        if (data.state && window.craftSetState) {
          window.craftSetState(data.state);
          lastStateHash = getCurrentStateHash();
        }
        updateSyncStatus('synced');
      })
      .catch(function(err) {
        updateSyncStatus('error');
        console.warn('Pull error:', err);
      })
      .finally(function() { isPulling = false; });
  }

  // ─── Push local state to server ───
  function pushState() {
    if (!roomId || !window.craftGetState || isPushing) return;

    var currentHash = getCurrentStateHash();
    if (currentHash === lastStateHash) return; // No changes

    isPushing = true;
    lastStateHash = currentHash;
    updateSyncStatus('syncing');

    var state = window.craftGetState();
    apiRequest('/craftrooms/' + roomId + '/sync', {
      method: 'PUT',
      body: JSON.stringify({ state: state, activeView: state.currentView })
    })
      .then(function(data) {
        localVersion = data.version;
        updateSyncStatus('synced');
      })
      .catch(function(err) {
        updateSyncStatus('error');
        console.warn('Push error:', err);
      })
      .finally(function() { isPushing = false; });
  }

  // ─── Debounced push: checks for changes every PUSH_DEBOUNCE ms ───
  function schedulePush() {
    if (pushTimeout) clearTimeout(pushTimeout);
    pushTimeout = setTimeout(function() {
      pushState();
    }, PUSH_DEBOUNCE);
  }

  // ─── Heartbeat ───
  function sendHeartbeat() {
    if (!roomId) return;
    var body = {};
    if (!getToken()) body.guestId = getGuestId();
    apiRequest('/craftrooms/' + roomId + '/heartbeat', {
      method: 'POST',
      body: JSON.stringify(body)
    }).catch(function() {});
  }

  // ─── UI: Header ───
  function renderHeader() {
    var header = document.getElementById('craftHeader');
    if (!header) return;

    var nameHtml = roomInfo
      ? '<span class="room-name"><span>' + (roomInfo.name || 'Craft Room') + '</span></span>'
      : '<span class="room-name">Loading...</span>';

    header.innerHTML = '<div class="craft-room-header">' +
      '<button class="back-btn" onclick="window.location.href=\'/\'">← Home</button>' +
      nameHtml +
      '<div class="members-indicator" id="craftMembers"></div>' +
      '<span class="sync-status" id="craftSyncStatus">Connecting...</span>' +
      '</div>';

    renderMembers();
  }

  function renderMembers() {
    var el = document.getElementById('craftMembers');
    if (!el) return;
    var online = members.filter(function(m) { return m.status === 'online'; });
    if (online.length === 0) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = '<span class="dot"></span>' +
      online.map(function(m) { return m.display_name; }).join(', ') +
      ' (' + online.length + ')';
  }

  function updateSyncStatus(status) {
    var el = document.getElementById('craftSyncStatus');
    if (!el) return;
    el.className = 'sync-status ' + status;
    if (status === 'synced') el.textContent = 'Synced';
    else if (status === 'syncing') el.textContent = 'Syncing...';
    else if (status === 'error') el.textContent = 'Offline';
  }

  // ─── Change detection: monitor state changes periodically ───
  function startChangeDetection() {
    setInterval(function() {
      if (!window.craftGetState) return;
      var currentHash = getCurrentStateHash();
      if (currentHash !== lastStateHash) {
        schedulePush();
      }
    }, SYNC_INTERVAL);
  }

  // ─── Initialize ───
  function init() {
    var roomUrl = parseRoomUrl();
    if (!roomUrl) {
      // No room in URL, show error
      document.body.innerHTML = '<div class="craft-auth-needed">' +
        '<div style="font-size:48px">⚔️</div>' +
        '<p>No craft room specified</p>' +
        '<a href="/">← Go to Home</a>' +
        '</div>';
      return;
    }

    roomId = roomUrl.roomId;
    renderHeader();

    // Check auth
    var token = getToken();
    if (!token) {
      document.body.innerHTML = '<div class="craft-auth-needed">' +
        '<div style="font-size:48px">⚔️</div>' +
        '<p>Please log in to access craft rooms</p>' +
        '<a href="/">← Log in</a>' +
        '</div>';
      return;
    }

    // Get current user
    apiRequest('/auth/me')
      .then(function(data) {
        currentUser = data.user;

        // Apply user's theme
        var userTheme = localStorage.getItem('theme_' + currentUser.id) || 'gold';
        document.documentElement.setAttribute('data-theme', userTheme);

        // Get room info
        return apiRequest('/craftrooms/' + roomId);
      })
      .then(function(data) {
        roomInfo = data.room;
        isOwner = roomInfo.owner_id === currentUser.id;
        renderHeader();

        // Join room
        return apiRequest('/craftrooms/' + roomId + '/join', {
          method: 'POST',
          body: JSON.stringify({ displayName: currentUser.display_name })
        });
      })
      .then(function() {
        // Initial state pull - wait for craft room to be ready
        function onReady() {
          pullState();

          // Start sync polling
          syncInterval = setInterval(pollVersion, SYNC_INTERVAL);

          // Start heartbeat
          sendHeartbeat();
          heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

          // Start change detection for pushing local changes
          startChangeDetection();

          // Refresh members periodically
          setInterval(function() {
            apiRequest('/craftrooms/' + roomId + '/members')
              .then(function(data) { members = data.members || []; renderMembers(); })
              .catch(function() {});
          }, 10000);
        }

        if (window.craftReady) {
          onReady();
        } else {
          window.onCraftReady = onReady;
        }
      })
      .catch(function(err) {
        console.error('Init error:', err);
        document.body.innerHTML = '<div class="craft-auth-needed">' +
          '<div style="font-size:48px">⚔️</div>' +
          '<p>Error: ' + err.message + '</p>' +
          '<a href="/">← Go to Home</a>' +
          '</div>';
      });
  }

  // Clean up on leave
  window.addEventListener('beforeunload', function() {
    if (roomId) {
      var body = {};
      if (!getToken()) body.guestId = getGuestId();
      navigator.sendBeacon(API_BASE + '/craftrooms/' + roomId + '/leave',
        JSON.stringify(body));
    }
    if (syncInterval) clearInterval(syncInterval);
    if (heartbeatInterval) clearInterval(heartbeatInterval);
  });

  // Start on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

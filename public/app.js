// ============================================
// MULTIVIEW.VIDEO - Synchronized Playback
// Uses YouTube IFrame API for play/pause sync
// ============================================

var useState = React.useState;
var useEffect = React.useEffect;
var useRef = React.useRef;
var useCallback = React.useCallback;

var GOOGLE_CLIENT_ID = window.APP_CONFIG?.GOOGLE_CLIENT_ID || '';
var API_BASE = '/api';
var SYNC_INTERVAL = 500; // Fast sync for near-instant playback control

// ============================================
// API Client
// ============================================
var api = {
  getToken: function() { return localStorage.getItem('mv_token'); },
  setToken: function(token) { localStorage.setItem('mv_token', token); },
  clearToken: function() { localStorage.removeItem('mv_token'); },
  
  getGuestId: function() {
    var guestId = localStorage.getItem('mv_guest_id');
    if (!guestId) {
      guestId = 'guest_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('mv_guest_id', guestId);
    }
    return guestId;
  },

  request: function(endpoint, options) {
    options = options || {};
    var token = this.getToken();
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    return fetch(API_BASE + endpoint, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body
    }).then(function(response) {
      return response.json().then(function(data) {
        if (!response.ok) throw new Error(data.error || 'Request failed');
        return data;
      });
    });
  }
};

api.auth = {
  register: function(email, username, password, displayName) {
    return api.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: email, username: username, password: password, displayName: displayName })
    }).then(function(data) {
      api.setToken(data.token);
      return data.user;
    });
  },
  login: function(identifier, password) {
    return api.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: identifier, password: password })
    }).then(function(data) {
      api.setToken(data.token);
      return data.user;
    });
  },
  googleLogin: function(credential) {
    return api.request('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential: credential })
    }).then(function(data) {
      api.setToken(data.token);
      return data.user;
    });
  },
  logout: function() {
    return api.request('/auth/logout', { method: 'POST' }).catch(function() {}).then(function() {
      api.clearToken();
    });
  },
  getCurrentUser: function() {
    if (!api.getToken()) return Promise.resolve(null);
    return api.request('/auth/me').then(function(data) {
      return data.user;
    }).catch(function() {
      api.clearToken();
      return null;
    });
  },
  updateProfile: function(displayName) {
    return api.request('/auth/profile', { 
      method: 'PUT', 
      body: JSON.stringify({ displayName: displayName }) 
    });
  },
  updateEmail: function(newEmail, password) {
    return api.request('/auth/email', { 
      method: 'PUT', 
      body: JSON.stringify({ newEmail: newEmail, password: password }) 
    });
  },
  updatePassword: function(currentPassword, newPassword) {
    return api.request('/auth/password', { 
      method: 'PUT', 
      body: JSON.stringify({ currentPassword: currentPassword, newPassword: newPassword }) 
    });
  },
  deleteAccount: function() {
    return api.request('/auth/account', { method: 'DELETE' }).then(function() {
      api.clearToken();
    });
  }
};

api.rooms = {
  list: function() { return api.request('/rooms').then(function(d) { return d.rooms || []; }); },
  getVisited: function() { return api.request('/rooms/visited').then(function(d) { return d.rooms || []; }); },
  removeVisited: function(roomId) { return api.request('/rooms/visited/' + roomId, { method: 'DELETE' }); },
  get: function(roomId) { return api.request('/rooms/' + roomId).then(function(d) { return d.room; }); },
  create: function(name) { return api.request('/rooms', { method: 'POST', body: JSON.stringify({ name: name }) }).then(function(d) { return d.room; }); },
  update: function(roomId, updates) { return api.request('/rooms/' + roomId, { method: 'PUT', body: JSON.stringify(updates) }).then(function(d) { return d.room; }); },
  delete: function(roomId) { return api.request('/rooms/' + roomId, { method: 'DELETE' }); },
  join: function(roomId, displayName, returningGuestName) {
    var guestId = api.getToken() ? null : api.getGuestId();
    return api.request('/rooms/' + roomId + '/join', { 
      method: 'POST', 
      body: JSON.stringify({ 
        displayName: displayName, 
        guestId: guestId,
        returningGuestName: returningGuestName || null
      }) 
    }).then(function(result) {
      // If server returned a different guestId (returning guest), update local storage
      if (result.guestId && result.guestId !== guestId) {
        localStorage.setItem('multiview_guest_id', result.guestId);
      }
      return result;
    });
  },
  kick: function(roomId, visitorId, guestId) {
    return api.request('/rooms/' + roomId + '/kick', { method: 'POST', body: JSON.stringify({ visitorId: visitorId, guestId: guestId }) });
  },
  getSync: function(roomId) {
    return api.request('/rooms/' + roomId + '/sync');
  },
  updateSync: function(roomId, state) {
    return api.request('/rooms/' + roomId + '/sync', { method: 'PUT', body: JSON.stringify(state) });
  },
  updateOptions: function(roomId, options) {
    return api.request('/rooms/' + roomId + '/options', { method: 'PUT', body: JSON.stringify(options) });
  }
};

api.playlists = {
  list: function(roomId, includeHidden) { 
    var url = '/playlists?roomId=' + roomId;
    if (includeHidden) url += '&includeHidden=true';
    return api.request(url).then(function(d) { return { playlists: d.playlists || [], isOwner: d.isOwner }; }); 
  },
  create: function(roomId, name) { return api.request('/playlists', { method: 'POST', body: JSON.stringify({ roomId: roomId, name: name }) }).then(function(d) { return d.playlist; }); },
  update: function(playlistId, updates) { return api.request('/playlists/' + playlistId, { method: 'PUT', body: JSON.stringify(updates) }).then(function(d) { return d.playlist; }); },
  delete: function(playlistId) { return api.request('/playlists/' + playlistId, { method: 'DELETE' }); },
  addVideo: function(playlistId, video) { return api.request('/playlists/' + playlistId + '/videos', { method: 'POST', body: JSON.stringify(video) }).then(function(d) { return d.video; }); },
  removeVideo: function(playlistId, videoId) { return api.request('/playlists/' + playlistId + '/videos/' + videoId, { method: 'DELETE' }); },
  updateVideo: function(playlistId, videoId, updates) { return api.request('/playlists/' + playlistId + '/videos/' + videoId, { method: 'PUT', body: JSON.stringify(updates) }); },
  reorderVideos: function(playlistId, videoIds) { return api.request('/playlists/' + playlistId + '/reorder', { method: 'PUT', body: JSON.stringify({ videoIds: videoIds }) }); },
  reorder: function(roomId, playlistIds) { return api.request('/playlists/reorder', { method: 'PUT', body: JSON.stringify({ roomId: roomId, playlistIds: playlistIds }) }); },
  setHidden: function(playlistId, hidden) { return api.request('/playlists/' + playlistId + '/hide', { method: 'PUT', body: JSON.stringify({ hidden: hidden }) }); },
  importPlaylist: function(targetRoomId, playlist) { return api.request('/playlists/import', { method: 'POST', body: JSON.stringify({ targetRoomId: targetRoomId, playlist: playlist }) }); },
  importFromPlaylist: function(sourcePlaylistId, targetRoomId) { return api.request('/playlists/import-from-playlist', { method: 'POST', body: JSON.stringify({ sourcePlaylistId: sourcePlaylistId, targetRoomId: targetRoomId }) }); },
  copyVideo: function(playlistId, video) { return api.request('/playlists/' + playlistId + '/copy-video', { method: 'POST', body: JSON.stringify({ video: video }) }); }
};

api.rooms.getMyPlaylists = function() { return api.request('/rooms/my-playlists'); };

// ============================================
// Craft Room API
// ============================================
api.craftRooms = {
  list: function() { return api.request('/craftrooms').then(function(d) { return d.rooms || []; }); },
  get: function(roomId) { return api.request('/craftrooms/' + roomId).then(function(d) { return d.room; }); },
  create: function(name) { return api.request('/craftrooms', { method: 'POST', body: JSON.stringify({ name: name }) }).then(function(d) { return d.room; }); },
  delete: function(roomId) { return api.request('/craftrooms/' + roomId, { method: 'DELETE' }); },
  rename: function(roomId, name) { return api.request('/craftrooms/' + roomId + '/name', { method: 'PUT', body: JSON.stringify({ name: name }) }); },
  getVersion: function(roomId) { return api.request('/craftrooms/' + roomId + '/version'); },
  getSync: function(roomId) { return api.request('/craftrooms/' + roomId + '/sync'); },
  updateSync: function(roomId, state, activeView) { return api.request('/craftrooms/' + roomId + '/sync', { method: 'PUT', body: JSON.stringify({ state: state, activeView: activeView }) }); },
  join: function(roomId, displayName) {
    var guestId = api.getToken() ? null : api.getGuestId();
    return api.request('/craftrooms/' + roomId + '/join', { method: 'POST', body: JSON.stringify({ displayName: displayName, guestId: guestId }) });
  },
  leave: function(roomId) {
    var guestId = api.getToken() ? null : api.getGuestId();
    return api.request('/craftrooms/' + roomId + '/leave', { method: 'POST', body: JSON.stringify({ guestId: guestId }) });
  },
  heartbeat: function(roomId) {
    var guestId = api.getToken() ? null : api.getGuestId();
    return api.request('/craftrooms/' + roomId + '/heartbeat', { method: 'POST', body: JSON.stringify({ guestId: guestId }) });
  },
  getMembers: function(roomId) { return api.request('/craftrooms/' + roomId + '/members').then(function(d) { return d.members || []; }); },
  kick: function(roomId, userId, guestId) { return api.request('/craftrooms/' + roomId + '/kick', { method: 'POST', body: JSON.stringify({ userId: userId, guestId: guestId }) }); }
};

api.presence = {
  heartbeat: function(roomId, status) {
    var guestId = api.getToken() ? null : api.getGuestId();
    return api.request('/presence/heartbeat', { method: 'POST', body: JSON.stringify({ roomId: roomId, guestId: guestId, status: status || 'online' }) });
  },
  getMembers: function(roomId) { return api.request('/presence/' + roomId).then(function(d) { return d.members || []; }); },
  leave: function(roomId) {
    var guestId = api.getToken() ? null : api.getGuestId();
    return api.request('/presence/leave', { method: 'POST', body: JSON.stringify({ roomId: roomId, guestId: guestId }) });
  },
  updateMember: function(roomId, visitorId, guestId, updates) {
    return api.request('/presence/member', { method: 'PUT', body: JSON.stringify(Object.assign({ roomId: roomId, visitorId: visitorId, guestId: guestId }, updates)) });
  }
};

// File upload API (uploads directly to Cloudflare R2)
api.files = {
  upload: function(file, roomId) {
    return new Promise(function(resolve, reject) {
      var token = api.getToken();
      var headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = 'Bearer ' + token;
      
      // Step 1: Get presigned URL from our server
      fetch('/.netlify/functions/files/presign', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ filename: file.name, roomId: roomId })
      })
      .then(function(res) {
        return res.json().then(function(data) {
          if (!res.ok) throw new Error(data.error || 'Failed to get upload URL');
          return data;
        });
      })
      .then(function(presignData) {
        console.log('Got presigned URL, uploading to R2...');
        
        // Step 2: Upload directly to R2
        return fetch(presignData.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': presignData.contentType },
          body: file
        }).then(function(uploadRes) {
          if (!uploadRes.ok) {
            throw new Error('Failed to upload to storage: ' + uploadRes.status);
          }
          console.log('Uploaded to R2 successfully');
          return presignData;
        });
      })
      .then(function(presignData) {
        // Step 3: Register file in our database
        return fetch('/.netlify/functions/files/complete', {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({
            fileId: presignData.fileId,
            fileKey: presignData.fileKey,
            filename: file.name,
            publicUrl: presignData.publicUrl,
            category: presignData.category,
            size: file.size,
            roomId: roomId
          })
        }).then(function(res) {
          return res.json().then(function(data) {
            if (!res.ok) throw new Error(data.error || 'Failed to register file');
            return data;
          });
        });
      })
      .then(resolve)
      .catch(reject);
    });
  },
  getUrl: function(fileId) {
    return '/.netlify/functions/files/' + fileId;
  }
};

// ============================================
// Utilities
// ============================================
function parseVideoUrl(url) {
  if (!url) return null;
  
  // Blob URLs (local file uploads)
  if (url.startsWith('blob:')) {
    return { type: 'direct', id: url, url: url };
  }
  
  // Uploaded files (stored in R2 or database)
  if (url.includes('/api/files/') || url.includes('/.netlify/functions/files/') || 
      url.includes('.r2.dev/') || url.includes('r2.cloudflarestorage.com')) {
    var isAudio = url.match(/[?&]type=audio/i) || url.match(/\.(mp3|wav|m4a|flac|aac|ogg)(\?|$)/i);
    return { type: 'uploaded', id: url, url: url, isAudio: !!isAudio };
  }
  
  // YouTube
  var ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) return { type: 'youtube', id: ytMatch[1], url: url };
  
  // Vimeo
  var vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return { type: 'vimeo', id: vimeoMatch[1], url: url };
  
  // Direct video/audio files
  if (url.match(/\.(mp4|webm|ogg|ogv|avi|mov|mkv|m4v|mp3|wav|m4a|flac|aac)(\?|$)/i)) {
    return { type: 'direct', id: url, url: url };
  }
  
  // Twitch
  var twitchMatch = url.match(/twitch\.tv\/(?:videos\/)?(\w+)/);
  if (twitchMatch) return { type: 'twitch', id: twitchMatch[1], url: url };
  
  // Dailymotion
  var dmMatch = url.match(/dailymotion\.com\/video\/([a-zA-Z0-9]+)/);
  if (dmMatch) return { type: 'dailymotion', id: dmMatch[1], url: url };
  
  // Any URL - treat as potential video
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return { type: 'direct', id: url, url: url };
  }
  
  return null;
}

function getVideoThumbnail(url) {
  if (!url) return null;
  var parsed = parseVideoUrl(url);
  if (!parsed) return null;
  
  if (parsed.type === 'youtube') {
    return 'https://img.youtube.com/vi/' + parsed.id + '/default.jpg';
  }
  if (parsed.type === 'vimeo') {
    // Vimeo requires API call, use placeholder
    return null;
  }
  if (parsed.type === 'dailymotion') {
    return 'https://www.dailymotion.com/thumbnail/video/' + parsed.id;
  }
  
  return null;
}

function getVideoTypeIcon(type) {
  var icons = { youtube: '▶️', vimeo: '🎬', uploaded: '📁', direct: '📹' };
  return icons[type] || '📹';
}

function parseRoomUrl() {
  var hash = window.location.hash;
  var match = hash.match(/#\/room\/([^\/]+)\/([^\/]+)/);
  return match ? { hostId: match[1], roomId: match[2] } : null;
}

// ============================================
// Icon Component
// ============================================
function Icon(props) {
  var name = props.name;
  var size = props.size;
  var s = { sm: 14, md: 18, lg: 24 }[size || 'md'] || 18;
  var paths = {
    play: React.createElement('polygon', { points: '5,3 19,12 5,21' }),
    pause: React.createElement(React.Fragment, null, React.createElement('rect', { x: '6', y: '4', width: '4', height: '16' }), React.createElement('rect', { x: '14', y: '4', width: '4', height: '16' })),
    prev: React.createElement(React.Fragment, null, React.createElement('polygon', { points: '11,12 22,4 22,20' }), React.createElement('line', { x1: '2', y1: '4', x2: '2', y2: '20' })),
    next: React.createElement(React.Fragment, null, React.createElement('polygon', { points: '13,12 2,4 2,20' }), React.createElement('line', { x1: '22', y1: '4', x2: '22', y2: '20' })),
    plus: React.createElement(React.Fragment, null, React.createElement('line', { x1: '12', y1: '5', x2: '12', y2: '19' }), React.createElement('line', { x1: '5', y1: '12', x2: '19', y2: '12' })),
    trash: React.createElement(React.Fragment, null, React.createElement('polyline', { points: '3,6 5,6 21,6' }), React.createElement('path', { d: 'M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2v2' })),
    edit: React.createElement(React.Fragment, null, React.createElement('path', { d: 'M11,4H4a2,2,0,0,0-2,2v14a2,2,0,0,0,2,2h14a2,2,0,0,0,2-2v-7' }), React.createElement('path', { d: 'M18.5,2.5a2.121,2.121,0,0,1,3,3L12,15l-4,1,1-4Z' })),
    menu: React.createElement(React.Fragment, null, React.createElement('line', { x1: '3', y1: '6', x2: '21', y2: '6' }), React.createElement('line', { x1: '3', y1: '12', x2: '21', y2: '12' }), React.createElement('line', { x1: '3', y1: '18', x2: '21', y2: '18' })),
    x: React.createElement(React.Fragment, null, React.createElement('line', { x1: '18', y1: '6', x2: '6', y2: '18' }), React.createElement('line', { x1: '6', y1: '6', x2: '18', y2: '18' })),
    settings: React.createElement(React.Fragment, null, React.createElement('circle', { cx: '12', cy: '12', r: '3' }), React.createElement('path', { d: 'M19.4,15a1.65,1.65,0,0,0,.33,1.82l.06.06a2,2,0,0,1-2.83,2.83l-.06-.06a1.65,1.65,0,0,0-1.82-.33,1.65,1.65,0,0,0-1,1.51V21a2,2,0,0,1-4,0v-.09A1.65,1.65,0,0,0,9,19.4a1.65,1.65,0,0,0-1.82.33l-.06.06a2,2,0,0,1-2.83-2.83l.06-.06a1.65,1.65,0,0,0,.33-1.82,1.65,1.65,0,0,0-1.51-1H3a2,2,0,0,1,0-4h.09A1.65,1.65,0,0,0,4.6,9a1.65,1.65,0,0,0-.33-1.82l-.06-.06A2,2,0,0,1,7.04,4.29l.06.06a1.65,1.65,0,0,0,1.82.33H9a1.65,1.65,0,0,0,1-1.51V3a2,2,0,0,1,4,0v.09a1.65,1.65,0,0,0,1,1.51,1.65,1.65,0,0,0,1.82-.33l.06-.06a2,2,0,0,1,2.83,2.83l-.06.06a1.65,1.65,0,0,0-.33,1.82V9a1.65,1.65,0,0,0,1.51,1H21a2,2,0,0,1,0,4h-.09A1.65,1.65,0,0,0,19.4,15Z' })),
    logout: React.createElement(React.Fragment, null, React.createElement('path', { d: 'M9,21H5a2,2,0,0,1-2-2V5a2,2,0,0,1,2-2h4' }), React.createElement('polyline', { points: '16,17 21,12 16,7' }), React.createElement('line', { x1: '21', y1: '12', x2: '9', y2: '12' })),
    upload: React.createElement(React.Fragment, null, React.createElement('path', { d: 'M21,15v4a2,2,0,0,1-2,2H5a2,2,0,0,1-2-2v-4' }), React.createElement('polyline', { points: '17,8 12,3 7,8' }), React.createElement('line', { x1: '12', y1: '3', x2: '12', y2: '15' })),
    share: React.createElement(React.Fragment, null, React.createElement('circle', { cx: '18', cy: '5', r: '3' }), React.createElement('circle', { cx: '6', cy: '12', r: '3' }), React.createElement('circle', { cx: '18', cy: '19', r: '3' }), React.createElement('line', { x1: '8.59', y1: '13.51', x2: '15.42', y2: '17.49' }), React.createElement('line', { x1: '15.41', y1: '6.51', x2: '8.59', y2: '10.49' })),
    users: React.createElement(React.Fragment, null, React.createElement('path', { d: 'M17,21v-2a4,4,0,0,0-4-4H5a4,4,0,0,0-4,4v2' }), React.createElement('circle', { cx: '9', cy: '7', r: '4' }), React.createElement('path', { d: 'M23,21v-2a4,4,0,0,0-3-3.87' }), React.createElement('path', { d: 'M16,3.13a4,4,0,0,1,0,7.75' })),
    home: React.createElement(React.Fragment, null, React.createElement('path', { d: 'M3,9l9-7,9,7v11a2,2,0,0,1-2,2H5a2,2,0,0,1-2-2Z' }), React.createElement('polyline', { points: '9,22 9,12 15,12 15,22' })),
    enter: React.createElement(React.Fragment, null, React.createElement('path', { d: 'M15,3h4a2,2,0,0,1,2,2v14a2,2,0,0,1-2,2h-4' }), React.createElement('polyline', { points: '10,17 15,12 10,7' }), React.createElement('line', { x1: '15', y1: '12', x2: '3', y2: '12' })),
    chevronDown: React.createElement('polyline', { points: '6,9 12,15 18,9' }),
    grip: React.createElement(React.Fragment, null, React.createElement('circle', { cx: '9', cy: '5', r: '1.5' }), React.createElement('circle', { cx: '9', cy: '12', r: '1.5' }), React.createElement('circle', { cx: '9', cy: '19', r: '1.5' }), React.createElement('circle', { cx: '15', cy: '5', r: '1.5' }), React.createElement('circle', { cx: '15', cy: '12', r: '1.5' }), React.createElement('circle', { cx: '15', cy: '19', r: '1.5' })),
    shuffle: React.createElement(React.Fragment, null, React.createElement('polyline', { points: '16,3 21,3 21,8' }), React.createElement('line', { x1: '4', y1: '20', x2: '21', y2: '3' }), React.createElement('polyline', { points: '21,16 21,21 16,21' }), React.createElement('line', { x1: '15', y1: '15', x2: '21', y2: '21' }), React.createElement('line', { x1: '4', y1: '4', x2: '9', y2: '9' })),
    loop: React.createElement(React.Fragment, null, React.createElement('polyline', { points: '17,1 21,5 17,9' }), React.createElement('path', { d: 'M3,11V9a4,4,0,0,1,4-4h14' }), React.createElement('polyline', { points: '7,23 3,19 7,15' }), React.createElement('path', { d: 'M21,13v2a4,4,0,0,1-4,4H3' })),
    autoplay: React.createElement(React.Fragment, null, React.createElement('polygon', { points: '5,3 19,12 5,21' }), React.createElement('line', { x1: '19', y1: '5', x2: '19', y2: '19' })),
    eye: React.createElement(React.Fragment, null, React.createElement('path', { d: 'M1,12S5,5,12,5s11,7,11,7-4,7-11,7S1,12,1,12Z' }), React.createElement('circle', { cx: '12', cy: '12', r: '3' })),
    eyeOff: React.createElement(React.Fragment, null, React.createElement('path', { d: 'M17.94,17.94A10.07,10.07,0,0,1,12,20c-7,0-11-8-11-8a18.45,18.45,0,0,1,5.06-5.94' }), React.createElement('path', { d: 'M9.9,4.24A9.12,9.12,0,0,1,12,4c7,0,11,8,11,8a18.5,18.5,0,0,1-2.16,3.19' }), React.createElement('path', { d: 'M14.12,14.12a3,3,0,1,1-4.24-4.24' }), React.createElement('line', { x1: '1', y1: '1', x2: '23', y2: '23' })),
    copy: React.createElement(React.Fragment, null, React.createElement('rect', { x: '9', y: '9', width: '13', height: '13', rx: '2', ry: '2' }), React.createElement('path', { d: 'M5,15H4a2,2,0,0,1-2-2V4A2,2,0,0,1,4,2h9a2,2,0,0,1,2,2V5' })),
    clipboard: React.createElement(React.Fragment, null, React.createElement('path', { d: 'M16,4h2a2,2,0,0,1,2,2V20a2,2,0,0,1-2,2H6a2,2,0,0,1-2-2V6A2,2,0,0,1,6,4H8' }), React.createElement('rect', { x: '8', y: '2', width: '8', height: '4', rx: '1', ry: '1' })),
    download: React.createElement(React.Fragment, null, React.createElement('path', { d: 'M21,15v4a2,2,0,0,1-2,2H5a2,2,0,0,1-2-2V15' }), React.createElement('polyline', { points: '7,10 12,15 17,10' }), React.createElement('line', { x1: '12', y1: '15', x2: '12', y2: '3' })),
    list: React.createElement(React.Fragment, null, React.createElement('line', { x1: '8', y1: '6', x2: '21', y2: '6' }), React.createElement('line', { x1: '8', y1: '12', x2: '21', y2: '12' }), React.createElement('line', { x1: '8', y1: '18', x2: '21', y2: '18' }), React.createElement('line', { x1: '3', y1: '6', x2: '3.01', y2: '6' }), React.createElement('line', { x1: '3', y1: '12', x2: '3.01', y2: '12' }), React.createElement('line', { x1: '3', y1: '18', x2: '3.01', y2: '18' })),
    'volume-2': React.createElement(React.Fragment, null, React.createElement('polygon', { points: '11,5 6,9 2,9 2,15 6,15 11,19' }), React.createElement('path', { d: 'M19.07,4.93a10,10,0,0,1,0,14.14' }), React.createElement('path', { d: 'M15.54,8.46a5,5,0,0,1,0,7.07' })),
    'volume-1': React.createElement(React.Fragment, null, React.createElement('polygon', { points: '11,5 6,9 2,9 2,15 6,15 11,19' }), React.createElement('path', { d: 'M15.54,8.46a5,5,0,0,1,0,7.07' })),
    'volume-x': React.createElement(React.Fragment, null, React.createElement('polygon', { points: '11,5 6,9 2,9 2,15 6,15 11,19' }), React.createElement('line', { x1: '23', y1: '9', x2: '17', y2: '15' }), React.createElement('line', { x1: '17', y1: '9', x2: '23', y2: '15' })),
    sort: React.createElement(React.Fragment, null, React.createElement('line', { x1: '4', y1: '6', x2: '13', y2: '6' }), React.createElement('line', { x1: '4', y1: '12', x2: '17', y2: '12' }), React.createElement('line', { x1: '4', y1: '18', x2: '20', y2: '18' })),
    'sort-alpha': React.createElement(React.Fragment, null, React.createElement('path', { d: 'M4,6h7' }), React.createElement('path', { d: 'M4,12h5' }), React.createElement('path', { d: 'M4,18h3' }), React.createElement('path', { d: 'M15,6l3,6h-6l3-6z' }), React.createElement('path', { d: 'M21,18h-6l6-6v6z' })),
    fileText: React.createElement(React.Fragment, null, React.createElement('path', { d: 'M14,2H6a2,2,0,0,0-2,2V20a2,2,0,0,0,2,2H18a2,2,0,0,0,2-2V8Z' }), React.createElement('polyline', { points: '14,2 14,8 20,8' }), React.createElement('line', { x1: '16', y1: '13', x2: '8', y2: '13' }), React.createElement('line', { x1: '16', y1: '17', x2: '8', y2: '17' }), React.createElement('polyline', { points: '10,9 9,9 8,9' })),
    'chevron-right': React.createElement('polyline', { points: '9,18 15,12 9,6' }),
    'chevron-left': React.createElement('polyline', { points: '15,18 9,12 15,6' })
  };
  return React.createElement('svg', { width: s, height: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }, paths[name] || null);
}

// ============================================
// Dragon Fire (Embers)
// ============================================
function DragonFire() {
  var embers = [];
  for (var i = 0; i < 20; i++) {
    embers.push(React.createElement('div', { key: i, className: 'ember', style: { left: (Math.random() * 100) + '%', animationDuration: (2 + Math.random() * 3) + 's', animationDelay: (Math.random() * 2) + 's', opacity: 0.3 + Math.random() * 0.5 } }));
  }
  return React.createElement('div', { className: 'dragon-fire-container' }, embers);
}

// ============================================
// YouTube Player Component with Sync
// ============================================
// Background-safe video end timer using Web Worker
// Workers run independently and are not throttled in background tabs
// Video playback tracker - tracks when video should end and catches up on tab focus
var videoPlaybackTracker = {
  expectedEndTime: null,
  callback: null,
  isPlaying: false,
  checkInterval: null,
  videoDuration: 0,
  
  start: function(durationSeconds, onEnded) {
    this.stop(); // Clear any existing
    this.expectedEndTime = Date.now() + (durationSeconds * 1000);
    this.callback = onEnded;
    this.isPlaying = true;
    this.videoDuration = durationSeconds;
    console.log('PlaybackTracker: Video will end in', durationSeconds.toFixed(1), 'seconds');
    
    // Also set up a regular check (will be throttled in background but works when active)
    var self = this;
    this.checkInterval = setInterval(function() {
      self.checkEnded();
    }, 500);
  },
  
  stop: function() {
    this.isPlaying = false;
    this.expectedEndTime = null;
    this.callback = null;
    this.videoDuration = 0;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  },
  
  pause: function() {
    this.isPlaying = false;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  },
  
  resume: function(remainingSeconds, onEnded) {
    this.expectedEndTime = Date.now() + (remainingSeconds * 1000);
    this.callback = onEnded;
    this.isPlaying = true;
    
    var self = this;
    if (!this.checkInterval) {
      this.checkInterval = setInterval(function() {
        self.checkEnded();
      }, 500);
    }
  },
  
  updateTime: function(currentTime, duration) {
    if (duration > 0 && currentTime >= 0 && this.isPlaying) {
      var remaining = duration - currentTime;
      this.expectedEndTime = Date.now() + (remaining * 1000);
      this.videoDuration = duration;
    }
  },
  
  checkEnded: function() {
    if (this.expectedEndTime && this.isPlaying && Date.now() >= this.expectedEndTime) {
      console.log('PlaybackTracker: Video ended (interval check)');
      var cb = this.callback;
      this.stop();
      if (cb) cb();
    }
  },
  
  // Called when tab becomes visible - this is the key for background tab support
  onVisible: function() {
    console.log('PlaybackTracker: Tab visible, checking...', {
      expectedEnd: this.expectedEndTime,
      now: Date.now(),
      isPlaying: this.isPlaying,
      hasCallback: !!this.callback
    });
    
    if (this.expectedEndTime && this.isPlaying && Date.now() >= this.expectedEndTime) {
      // Verify with actual player state before triggering - mobile browsers suspend video too
      if (globalYTPlayer.player && globalYTPlayer.isReady) {
        try {
          var playerState = globalYTPlayer.player.getPlayerState();
          var currentTime = globalYTPlayer.player.getCurrentTime();
          var duration = globalYTPlayer.player.getDuration();
          
          // Only trigger if video truly ended (state 0 and at end)
          if (playerState !== 0 || (duration > 0 && currentTime < duration - 1)) {
            console.log('PlaybackTracker: Timer expired but video still playing (state:', playerState, ', time:', currentTime, '/', duration, ')');
            // Update expected end time based on actual position
            if (duration > 0 && currentTime >= 0) {
              var remaining = duration - currentTime;
              this.expectedEndTime = Date.now() + (remaining * 1000);
              console.log('PlaybackTracker: Recalculated end time, remaining:', remaining.toFixed(1), 's');
            }
            return false;
          }
        } catch (e) {
          console.log('PlaybackTracker: Could not verify player state:', e);
        }
      }
      
      console.log('PlaybackTracker: Video ended while in background, triggering callback!');
      var cb = this.callback;
      this.stop();
      if (cb) {
        // Use setTimeout with small delay to ensure browser has fully restored the tab
        setTimeout(function() {
          console.log('PlaybackTracker: Executing delayed callback now');
          cb();
        }, 100);
      }
      return true;
    }
    return false;
  }
};

// Set up visibility change listener for catch-up
document.addEventListener('visibilitychange', function() {
  console.log('Visibility changed to:', document.visibilityState);
  if (document.visibilityState === 'visible') {
    videoPlaybackTracker.onVisible();
  }
});

// Also check on window focus (some browsers use this instead)
window.addEventListener('focus', function() {
  videoPlaybackTracker.onVisible();
});

// Global reference to YouTube player for direct control (bypasses React state throttling in background tabs)
// Global playlist manager - handles playback without React state (for background tab support)
// YouTube iframe events fire even in background tabs, but React state updates are throttled
var globalPlaylist = {
  videos: [],
  currentIndex: -1,
  autoplay: false,
  shuffle: false,
  loop: false,
  onVideoChange: null, // Callback to sync React state when tab becomes active
  pendingVideo: null,  // Video that changed in background, waiting for tab visibility
  pendingIndex: null,  // Index of pending video
  
  setPlaylist: function(videos, index) {
    // Only update and log if values actually changed
    if (this.videos === videos && this.currentIndex === index) return;
    this.videos = videos || [];
    this.currentIndex = index >= 0 ? index : -1;
    console.log('GlobalPlaylist: Set', this.videos.length, 'videos, index:', this.currentIndex);
  },
  
  setIndex: function(index) {
    this.currentIndex = index;
  },
  
  setOptions: function(autoplay, shuffle, loop) {
    this.autoplay = autoplay;
    this.shuffle = shuffle;
    this.loop = loop;
  },
  
  getNextVideo: function() {
    console.log('GlobalPlaylist.getNextVideo: videos=' + this.videos.length + ', index=' + this.currentIndex + ', autoplay=' + this.autoplay + ', shuffle=' + this.shuffle + ', loop=' + this.loop);
    
    if (this.videos.length === 0) {
      console.log('GlobalPlaylist: No videos in playlist');
      return null;
    }
    
    // Loop: replay current video
    if (this.loop && this.currentIndex >= 0 && this.currentIndex < this.videos.length) {
      console.log('GlobalPlaylist: Loop mode - replaying current video');
      return { video: this.videos[this.currentIndex], index: this.currentIndex, isLoop: true };
    }
    
    // Shuffle: random video
    if (this.shuffle) {
      var availableIndices = [];
      for (var i = 0; i < this.videos.length; i++) {
        if (i !== this.currentIndex) availableIndices.push(i);
      }
      
      if (availableIndices.length > 0) {
        var randomIdx = availableIndices[Math.floor(Math.random() * availableIndices.length)];
        this.currentIndex = randomIdx;
        console.log('GlobalPlaylist: Shuffle mode - playing random video at index', randomIdx);
        return { video: this.videos[randomIdx], index: randomIdx };
      } else if (this.videos.length === 1) {
        console.log('GlobalPlaylist: Shuffle mode with 1 video - replaying');
        return { video: this.videos[0], index: 0, isLoop: true };
      }
      console.log('GlobalPlaylist: Shuffle mode but no available videos');
      return null;
    }
    
    // Autoplay: next video
    if (this.autoplay && this.currentIndex < this.videos.length - 1) {
      this.currentIndex++;
      console.log('GlobalPlaylist: Autoplay mode - playing next video at index', this.currentIndex);
      return { video: this.videos[this.currentIndex], index: this.currentIndex };
    }
    
    console.log('GlobalPlaylist: No next video (autoplay=' + this.autoplay + ', index=' + this.currentIndex + '/' + this.videos.length + ')');
    return null;
  }
};

var globalYTPlayer = {
  player: null,
  isReady: false,
  lastLoadedId: null,
  onVideoEndCallback: null,
  
  // Directly load and play next video (bypasses React state)
  playNextVideo: function() {
    var next = globalPlaylist.getNextVideo();
    if (!next) {
      console.log('GlobalYT: No next video to play');
      return false;
    }
    
    var parsed = parseVideoUrl(next.video.url);
    if (!parsed || parsed.type !== 'youtube') {
      console.log('GlobalYT: Next video is not YouTube:', next.video.url);
      // Still notify React to handle non-YouTube videos
      if (this.onVideoEndCallback) {
        this.onVideoEndCallback();
      }
      return false;
    }
    
    console.log('GlobalYT: Playing next video directly:', parsed.id, 'index:', next.index);
    
    if (next.isLoop) {
      // For loop, seek to beginning
      if (this.player && this.isReady) {
        this.player.seekTo(0, true);
        this.player.playVideo();
      }
    } else {
      // Load new video
      this.loadVideo(parsed.id);
    }
    
    // Notify React to sync UI (will be processed when tab is active)
    if (globalPlaylist.onVideoChange) {
      globalPlaylist.onVideoChange(next.video, next.index);
    }
    
    return true;
  },
  
  loadVideo: function(videoId) {
    if (this.player && this.isReady) {
      console.log('GlobalYT: Loading video:', videoId);
      this.lastLoadedId = videoId;
      this.player.loadVideoById(videoId, 0);
      
      // Ensure video plays - loadVideoById should autoplay but may not in background
      var self = this;
      setTimeout(function() {
        if (self.player && self.isReady) {
          try {
            var state = self.player.getPlayerState();
            console.log('GlobalYT: Post-load state check:', state);
            if (state !== 1 && state !== 3) { // Not playing or buffering
              console.log('GlobalYT: Forcing playVideo()');
              self.player.playVideo();
            }
          } catch (e) {
            console.log('GlobalYT: Post-load check error:', e);
          }
        }
      }, 500);
      
      return true;
    }
    return false;
  }
};

function YouTubePlayer(props) {
  var videoId = props.videoId;
  var playbackState = props.playbackState;
  var playbackTime = props.playbackTime;
  var onStateChange = props.onStateChange;
  var onSeek = props.onSeek;
  var onEnded = props.onEnded;
  
  var containerRef = useRef(null);
  var playerRef = useRef(null);
  var isReady = useRef(false);
  var lastCommandTime = useRef(0);
  var lastKnownTime = useRef(0);
  var seekCheckInterval = useRef(null);
  var backgroundCheckTimer = useRef(null);
  var workerRef = useRef(null);
  var lastReportedSeek = useRef(0);
  var handledEnded = useRef(false); // Track if we've handled the ended event for current video
  
  // Use refs to track latest props for use in callbacks
  var latestStateRef = useRef(playbackState);
  var latestTimeRef = useRef(playbackTime);
  var onEndedRef = useRef(onEnded);
  var onStateChangeRef = useRef(onStateChange);
  var onSeekRef = useRef(onSeek);
  
  // Keep refs updated
  useEffect(function() {
    latestStateRef.current = playbackState;
  }, [playbackState]);
  
  useEffect(function() {
    latestTimeRef.current = playbackTime;
  }, [playbackTime]);
  
  useEffect(function() {
    onEndedRef.current = onEnded;
  }, [onEnded]);
  
  useEffect(function() {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);
  
  useEffect(function() {
    onSeekRef.current = onSeek;
  }, [onSeek]);

  // Load YouTube API once
  useEffect(function() {
    if (window.YT && window.YT.Player) return;
    
    if (!document.getElementById('youtube-api')) {
      var tag = document.createElement('script');
      tag.id = 'youtube-api';
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
  }, []);

  // Create player when API is ready
  useEffect(function() {
    // Reset ended flag for new video
    handledEnded.current = false;
    
    // Set up Web Worker for reliable background tab timing
    // Workers are NOT throttled in background tabs
    var workerCode = 'setInterval(function(){postMessage("tick")},500)';
    var blob = new Blob([workerCode], { type: 'application/javascript' });
    var workerUrl = URL.createObjectURL(blob);
    var worker = new Worker(workerUrl);
    workerRef.current = worker;
    
    worker.onmessage = function() {
      if (!playerRef.current || !isReady.current) return;
      try {
        var ps = playerRef.current.getPlayerState();
        var ct = playerRef.current.getCurrentTime();
        var dur = playerRef.current.getDuration();
        var atEnd = dur > 0 && ct > 0 && ct >= (dur - 0.5);
        var ended = ps === 0 || ((ps === 2 || ps === -1) && atEnd);
        
        if (ended && onEndedRef.current && !handledEnded.current) {
          console.log('YT: Video ended (worker) state:', ps, 'time:', ct, '/', dur);
          handledEnded.current = true;
          onEndedRef.current();
        }
        
        // Reset flag when video is playing and not near end
        if (ps === 1 && dur > 0 && (dur - ct) > 3) {
          handledEnded.current = false;
        }
      } catch (e) {}
    };
    
    // Also set up setTimeout-based check
    function checkPlayerState() {
      if (!playerRef.current || !isReady.current) {
        seekCheckInterval.current = setTimeout(checkPlayerState, 200);
        return;
      }
      
      try {
        var currentTime = playerRef.current.getCurrentTime();
        var duration = playerRef.current.getDuration();
        var playerState = playerRef.current.getPlayerState();
        
        var isStateEnded = playerState === 0;
        var isAtEnd = duration > 0 && currentTime > 0 && currentTime >= (duration - 0.5);
        var isPausedAtEnd = (playerState === 2 || playerState === -1) && isAtEnd;
        
        if ((isStateEnded || isPausedAtEnd) && onEndedRef.current && !handledEnded.current) {
          console.log('YT: Video ended (check) state:', playerState, 'time:', currentTime.toFixed(1));
          handledEnded.current = true;
          onEndedRef.current();
          return;
        }
        
        if (playerState === 1 && duration > 0 && (duration - currentTime) > 3) {
          handledEnded.current = false;
        }
      } catch (e) {}
      
      seekCheckInterval.current = setTimeout(checkPlayerState, 200);
    }
    seekCheckInterval.current = setTimeout(checkPlayerState, 200);
    
    // If player already exists, just load the new video (unless already loaded directly)
    if (playerRef.current && isReady.current) {
      // Skip if this video was already loaded directly via globalYTPlayer
      if (globalYTPlayer.lastLoadedId === videoId) {
        console.log('Skipping load - already loaded directly:', videoId);
        globalYTPlayer.lastLoadedId = null; // Clear for next time
        return;
      }
      
      console.log('Loading new video:', videoId);
      var currentState = latestStateRef.current;
      lastKnownTime.current = 0;
      lastReportedSeek.current = 0;
      
      if (currentState === 'playing') {
        playerRef.current.loadVideoById(videoId, 0);
      } else {
        playerRef.current.cueVideoById(videoId, 0);
      }
      return;
    }
    
    function initPlayer() {
      if (!containerRef.current || playerRef.current) return;
      
      // Use refs to get latest values (props might be stale in closure)
      var currentState = latestStateRef.current;
      var currentTime = latestTimeRef.current || 0;
      
      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId: videoId,
        playerVars: {
          autoplay: currentState === 'playing' ? 1 : 0,
          rel: 0,
          modestbranding: 1,
          start: Math.floor(currentTime),
          playsinline: 1,
          enablejsapi: 1
        },
        events: {
          onReady: function() {
            // Use refs for latest values at time of ready
            var latestState = latestStateRef.current;
            var latestTime = latestTimeRef.current || 0;
            
            console.log('YT Player ready, time:', latestTime.toFixed(1), 'state:', latestState);
            isReady.current = true;
            
            // Set global reference for direct control in background tabs
            globalYTPlayer.player = playerRef.current;
            globalYTPlayer.isReady = true;
            
            // Apply saved volume from localStorage
            var savedVolume = parseInt(localStorage.getItem('multiview_volume') || '100', 10);
            try {
              playerRef.current.setVolume(savedVolume);
            } catch (e) {}
            
            lastKnownTime.current = latestTime;
            
            // Seek to the exact time (start param only handles whole seconds)
            if (latestTime > 1) {
              console.log('>>> Initial seek to:', latestTime.toFixed(1));
              playerRef.current.seekTo(latestTime, true);
            }
            
            // Apply correct playback state with retry
            function applyInitialState() {
              if (latestState === 'playing') {
                console.log('>>> Starting playback');
                lastCommandTime.current = Date.now();
                playerRef.current.playVideo();
              } else {
                // Explicitly pause to avoid stuck buffering
                console.log('>>> Pausing video');
                lastCommandTime.current = Date.now();
                playerRef.current.pauseVideo();
              }
            }
            
            applyInitialState();
            
            // Multiple retries to handle buffering states
            // Videos can get stuck in buffering (state 3) or unstarted (state -1)
            var retryCount = 0;
            var maxRetries = 10;
            
            function retryPlayback() {
              retryCount++;
              if (retryCount > maxRetries || !playerRef.current || !isReady.current) return;
              
              var state = playerRef.current.getPlayerState();
              console.log('>>> Playback check #' + retryCount + ' (state:', state, ', target:', latestState, ')');
              
              if (latestState === 'playing') {
                // States: -1=unstarted, 0=ended, 1=playing, 2=paused, 3=buffering, 5=cued
                if (state !== 1) {
                  console.log('>>> Retry PLAY command');
                  lastCommandTime.current = Date.now();
                  playerRef.current.playVideo();
                  // Continue retrying until we're playing or max retries
                  setTimeout(retryPlayback, 800);
                }
              } else {
                if (state !== 2 && state !== -1) {
                  console.log('>>> Retry PAUSE command');
                  lastCommandTime.current = Date.now();
                  playerRef.current.pauseVideo();
                  setTimeout(retryPlayback, 800);
                }
              }
            }
            
            // Start retry loop after initial delay
            setTimeout(retryPlayback, 500);
            
            // Monitor for seeks and video end
            // Using setTimeout chain for better background tab support
            function checkPlayerState() {
              if (!playerRef.current || !isReady.current) {
                seekCheckInterval.current = setTimeout(checkPlayerState, 200);
                return;
              }
              if (Date.now() - lastCommandTime.current < 300) {
                seekCheckInterval.current = setTimeout(checkPlayerState, 200);
                return;
              }
              
              try {
                var currentTime = playerRef.current.getCurrentTime();
                var duration = playerRef.current.getDuration();
                var expectedTime = lastKnownTime.current;
                var playerState = playerRef.current.getPlayerState();
                
                // Check for video ended - multiple detection methods
                var isStateEnded = playerState === 0;
                var isAtEnd = duration > 0 && currentTime > 0 && currentTime >= (duration - 0.5);
                var isPausedAtEnd = (playerState === 2 || playerState === -1) && isAtEnd;
                
                if ((isStateEnded || isPausedAtEnd) && onEndedRef.current && !handledEnded.current) {
                  console.log('YT: Video ended (check - state:', playerState, 'time:', currentTime.toFixed(1), '/', duration.toFixed(1), ')');
                  handledEnded.current = true;
                  onEndedRef.current();
                  return;
                }
                
                // Reset handledEnded flag when video is playing and not near end
                if (playerState === 1 && duration > 0 && (duration - currentTime) > 3) {
                  handledEnded.current = false;
                }
                
                if (playerState === 1) {
                  expectedTime += 0.25;
                }
                
                var timeDiff = Math.abs(currentTime - expectedTime);
                
                if (timeDiff > 1 && Math.abs(currentTime - lastReportedSeek.current) > 1) {
                  console.log('YT: User seeked to', currentTime.toFixed(1));
                  lastReportedSeek.current = currentTime;
                  // Update timer with new position
                  videoPlaybackTracker.updateTime(currentTime, duration);
                  if (onSeekRef.current) {
                    onSeekRef.current(currentTime);
                  }
                }
                lastKnownTime.current = currentTime;
              } catch (e) {}
              
              seekCheckInterval.current = setTimeout(checkPlayerState, 200);
            }
            
            seekCheckInterval.current = setTimeout(checkPlayerState, 200);
            
          },
          onStateChange: function(event) {
            // YT states: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering
            
            // ALWAYS handle ended event - even if it seems like it came from our command
            if (event.data === 0) {
              console.log('YT: ===== VIDEO ENDED (state=0) =====');
              videoPlaybackTracker.stop();
              handledEnded.current = true;
              
              // DIRECTLY play next video - bypasses React state which is throttled in background tabs
              console.log('YT: Calling globalYTPlayer.playNextVideo()');
              var played = globalYTPlayer.playNextVideo();
              console.log('YT: playNextVideo returned:', played);
              
              if (!played) {
                // No next video or not YouTube, call the regular callback
                console.log('YT: Falling back to onEndedRef.current');
                if (onEndedRef.current) {
                  onEndedRef.current();
                }
              }
              return; // Always return after handling ended
            }
            
            // Handle buffering state - when buffering ends, ensure playback continues
            if (event.data === 3) {
              console.log('YT: Buffering...');
              return; // Just log buffering state
            }
            
            // Ignore other events triggered by our commands
            if (Date.now() - lastCommandTime.current < 300) return;
            
            if (event.data === 1 && onStateChangeRef.current) {
              var time = playerRef.current.getCurrentTime();
              var duration = playerRef.current.getDuration();
              console.log('YT: Playing at', time.toFixed(1), 'duration:', duration.toFixed(1));
              lastKnownTime.current = time;
              handledEnded.current = false;
              
              // Start background-safe timer for video end
              if (duration > 0) {
                var remaining = duration - time;
                videoPlaybackTracker.start(remaining, function() {
                  console.log('PlaybackTracker: Callback fired! handledEnded:', handledEnded.current);
                  if (!handledEnded.current) {
                    handledEnded.current = true;
                    // Directly play next video
                    if (!globalYTPlayer.playNextVideo()) {
                      if (onEndedRef.current) {
                        onEndedRef.current();
                      } else if (globalYTPlayer.onVideoEndCallback) {
                        globalYTPlayer.onVideoEndCallback();
                      }
                    }
                  }
                });
              }
              
              onStateChangeRef.current('playing', time);
            } else if (event.data === 2 && onStateChangeRef.current) {
              var time = playerRef.current.getCurrentTime();
              console.log('YT: User paused at', time.toFixed(1));
              lastKnownTime.current = time;
              videoPlaybackTracker.stop(); // Stop timer when paused
              onStateChangeRef.current('paused', time);
            }
          }
        }
      });
    }

    // Wait for YT API
    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      window.onYouTubeIframeAPIReady = initPlayer;
    }

    return function() {
      // Only clear timers here - do not destroy player on videoId change
      // Player will be reused with loadVideoById
      videoPlaybackTracker.stop();
      if (seekCheckInterval.current) {
        clearTimeout(seekCheckInterval.current);
        seekCheckInterval.current = null;
      }
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, [videoId]);
  
  // Cleanup player only on unmount
  useEffect(function() {
    return function() {
      videoPlaybackTracker.stop();
      if (playerRef.current && playerRef.current.destroy) {
        playerRef.current.destroy();
        playerRef.current = null;
        isReady.current = false;
        globalYTPlayer.player = null;
        globalYTPlayer.isReady = false;
      }
    };
  }, []);

  // Check for video end when tab becomes visible again (backup for background throttling)
  useEffect(function() {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible' && playerRef.current && isReady.current) {
        console.log('YT Visibility: Tab became visible, checking player state...');
        
        // If there's a pending video change, the video already changed in background
        // Just ensure it's playing
        if (globalPlaylist.pendingVideo) {
          console.log('YT Visibility: Pending video change detected, ensuring playback');
          try {
            var state = playerRef.current.getPlayerState();
            if (state !== 1 && state !== 3) { // Not playing or buffering
              console.log('YT Visibility: Resuming playback...');
              playerRef.current.playVideo();
            }
          } catch (e) {
            console.error('YT Visibility resume error:', e);
          }
          return;
        }
        
        try {
          var playerState = playerRef.current.getPlayerState();
          var currentTime = playerRef.current.getCurrentTime();
          var duration = playerRef.current.getDuration();
          
          console.log('YT Visibility: state=' + playerState + ', time=' + currentTime.toFixed(1) + '/' + duration.toFixed(1) + ', handledEnded=' + handledEnded.current);
          
          // Only handle truly ended state (0) - don't trigger on paused state
          // Mobile browsers may report paused state when tab was suspended
          var isStateEnded = playerState === 0;
          var isAtEnd = duration > 0 && currentTime > 0 && currentTime >= (duration - 0.5);
          
          // Only play next if video truly ended AND is at the end
          if (isStateEnded && isAtEnd && !handledEnded.current) {
            console.log('YT Visibility: Video ended while in background! Playing next...');
            handledEnded.current = true;
            videoPlaybackTracker.stop();
            
            // Directly play next video
            if (!globalYTPlayer.playNextVideo()) {
              // Fallback to regular callback
              if (onEndedRef.current) {
                onEndedRef.current();
              }
            }
          }
        } catch (e) {
          console.error('YT Visibility check error:', e);
        }
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return function() {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Apply playback state changes from sync
  useEffect(function() {
    if (!isReady.current || !playerRef.current) return;
    
    var retryCount = 0;
    var maxRetries = 10;
    
    function applyState() {
      try {
        var currentState = playerRef.current.getPlayerState();
        // 1 = playing, 2 = paused, 3 = buffering, -1 = unstarted, 0 = ended
        
        if (playbackState === 'playing' && currentState !== 1) {
          // Safeguard: Don't auto-play if video is at or near the end (state 0 = ended)
          // This prevents stale 'playing' state from triggering playback on finished videos
          if (currentState === 0) {
            var duration = playerRef.current.getDuration();
            var currentTime = playerRef.current.getCurrentTime();
            if (duration > 0 && currentTime >= duration - 2) {
              console.log('>>> Ignoring PLAY - video is at end');
              return;
            }
          }
          
          // If buffering, let it continue - it will auto-play when ready
          if (currentState === 3) {
            console.log('>>> Video buffering, will auto-play when ready');
            // Schedule a check to ensure it plays after buffering
            scheduleRetry();
            return;
          }
          
          console.log('>>> Sending PLAY command (current state:', currentState, ')');
          lastCommandTime.current = Date.now();
          playerRef.current.playVideo();
          
          // Schedule retry if still not playing
          scheduleRetry();
        } else if (playbackState === 'paused' && currentState !== 2 && currentState !== 0) {
          // Pause if not already paused (handles buffering state 3 as well)
          // Don't try to pause ended videos (state 0)
          // But don't pause if buffering and we want to play
          if (currentState === 3) {
            console.log('>>> Video buffering, sending pause');
          }
          console.log('>>> Sending PAUSE command (current state:', currentState, ')');
          lastCommandTime.current = Date.now();
          playerRef.current.pauseVideo();
          
          // Schedule retry if still not paused
          scheduleRetry();
        }
      } catch (e) {
        console.error('YT command error:', e);
      }
    }
    
    function scheduleRetry() {
      if (retryCount >= maxRetries) return;
      
      setTimeout(function() {
        retryCount++;
        if (!playerRef.current || !isReady.current) return;
        
        var state = playerRef.current.getPlayerState();
        
        if (playbackState === 'playing' && state !== 1) {
          // Don't retry if video is at end
          if (state === 0) {
            var dur = playerRef.current.getDuration();
            var time = playerRef.current.getCurrentTime();
            if (dur > 0 && time >= dur - 2) {
              console.log('>>> Skipping retry - video at end');
              return;
            }
          }
          
          // If still buffering, just schedule another check
          if (state === 3) {
            console.log('>>> Retry #' + retryCount + ' - still buffering, waiting...');
            scheduleRetry();
            return;
          }
          
          console.log('>>> Retry #' + retryCount + ' PLAY (state was:', state, ')');
          lastCommandTime.current = Date.now();
          playerRef.current.playVideo();
          scheduleRetry();
        } else if (playbackState === 'paused' && state !== 2 && state !== 0 && state !== 3) {
          console.log('>>> Retry #' + retryCount + ' PAUSE (state was:', state, ')');
          lastCommandTime.current = Date.now();
          playerRef.current.pauseVideo();
          scheduleRetry();
        }
      }, 800);
    }
    
    applyState();
  }, [playbackState]);

  // Apply time sync from server - instant sync
  useEffect(function() {
    if (!isReady.current || !playerRef.current) return;
    if (playbackTime === undefined || playbackTime === null) return;
    
    try {
      var currentTime = playerRef.current.getCurrentTime();
      var timeDiff = Math.abs(currentTime - playbackTime);
      
      // Sync if difference is more than 1.5 seconds
      if (timeDiff > 1) {
        console.log('>>> Seeking to synced time:', playbackTime.toFixed(1), '(was at', currentTime.toFixed(1), ')');
        lastCommandTime.current = Date.now();
        lastKnownTime.current = playbackTime;
        lastReportedSeek.current = playbackTime;
        playerRef.current.seekTo(playbackTime, true);
      }
    } catch (e) {
      console.error('YT seek error:', e);
    }
  }, [playbackTime]);

  return React.createElement('div', {
    ref: containerRef,
    style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }
  });
}

// ============================================
// Flame Audio Visualizer (reacts to audio)
// ============================================
function FlameVisualizer(props) {
  var audioRef = props.audioRef;
  var isPlaying = props.isPlaying;
  
  var canvasRef = useRef(null);
  var animationRef = useRef(null);
  var analyserRef = useRef(null);
  var audioContextRef = useRef(null);
  var sourceRef = useRef(null);
  var connectedRef = useRef(false);
  
  // Number of bars
  var barCount = 64;
  
  useEffect(function() {
    var canvas = canvasRef.current;
    if (!canvas) return;
    
    var ctx = canvas.getContext('2d');
    var width = canvas.width;
    var height = canvas.height;
    
    // Create gradient for flame effect
    var gradient = ctx.createLinearGradient(0, height, 0, 0);
    gradient.addColorStop(0, '#ff6b35');      // Orange at bottom
    gradient.addColorStop(0.3, '#ff8c42');    // Lighter orange
    gradient.addColorStop(0.5, '#ffd700');    // Gold
    gradient.addColorStop(0.7, '#ffec8b');    // Light gold
    gradient.addColorStop(1, '#fff8dc');      // Almost white at top
    
    // Fallback animation when no audio context
    var fallbackBars = Array.from({ length: barCount }, function() { return Math.random() * 0.5; });
    
    function drawFallback() {
      ctx.clearRect(0, 0, width, height);
      
      var barWidth = width / barCount;
      var gap = 2;
      
      for (var i = 0; i < barCount; i++) {
        // Gentle wave animation
        if (isPlaying) {
          fallbackBars[i] += (Math.random() - 0.5) * 0.1;
          fallbackBars[i] = Math.max(0.1, Math.min(0.8, fallbackBars[i]));
        } else {
          fallbackBars[i] *= 0.95; // Decay when paused
        }
        
        var barHeight = fallbackBars[i] * height;
        var x = i * barWidth;
        
        // Draw flame bar with glow
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#ff6b35';
        ctx.fillStyle = gradient;
        
        // Rounded top
        var radius = (barWidth - gap) / 2;
        ctx.beginPath();
        ctx.moveTo(x + gap/2, height);
        ctx.lineTo(x + gap/2, height - barHeight + radius);
        ctx.quadraticCurveTo(x + gap/2, height - barHeight, x + barWidth/2, height - barHeight);
        ctx.quadraticCurveTo(x + barWidth - gap/2, height - barHeight, x + barWidth - gap/2, height - barHeight + radius);
        ctx.lineTo(x + barWidth - gap/2, height);
        ctx.fill();
      }
      
      animationRef.current = requestAnimationFrame(drawFallback);
    }
    
    function draw() {
      if (!analyserRef.current) {
        drawFallback();
        return;
      }
      
      var analyser = analyserRef.current;
      var bufferLength = analyser.frequencyBinCount;
      var dataArray = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(dataArray);
      
      ctx.clearRect(0, 0, width, height);
      
      var barWidth = width / barCount;
      var gap = 2;
      
      for (var i = 0; i < barCount; i++) {
        // Map frequency data to bar (use lower frequencies more)
        var dataIndex = Math.floor(i * bufferLength / barCount * 0.5);
        var value = dataArray[dataIndex] / 255;
        
        // Add some randomness for flame flicker
        var flicker = 1 + (Math.random() - 0.5) * 0.2;
        var barHeight = Math.max(5, value * height * flicker);
        
        var x = i * barWidth;
        
        // Draw flame bar with glow
        ctx.shadowBlur = 20;
        ctx.shadowColor = value > 0.5 ? '#ffd700' : '#ff6b35';
        ctx.fillStyle = gradient;
        
        // Rounded/pointed top for flame look
        var radius = (barWidth - gap) / 2;
        ctx.beginPath();
        ctx.moveTo(x + gap/2, height);
        ctx.lineTo(x + gap/2, height - barHeight + radius);
        ctx.quadraticCurveTo(x + gap/2, height - barHeight - 5, x + barWidth/2, height - barHeight - 10);
        ctx.quadraticCurveTo(x + barWidth - gap/2, height - barHeight - 5, x + barWidth - gap/2, height - barHeight + radius);
        ctx.lineTo(x + barWidth - gap/2, height);
        ctx.fill();
        
        // Add inner glow/highlight
        if (value > 0.3) {
          ctx.shadowBlur = 0;
          ctx.fillStyle = 'rgba(255, 255, 200, ' + (value * 0.3) + ')';
          ctx.beginPath();
          ctx.ellipse(x + barWidth/2, height - barHeight/2, (barWidth - gap)/4, barHeight/3, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      
      animationRef.current = requestAnimationFrame(draw);
    }
    
    // Try to connect to audio element
    function connectAudio() {
      if (connectedRef.current || !audioRef || !audioRef.current) return;
      
      try {
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        var audioContext = audioContextRef.current;
        
        if (audioContext.state === 'suspended') {
          audioContext.resume();
        }
        
        if (!sourceRef.current) {
          sourceRef.current = audioContext.createMediaElementSource(audioRef.current);
          analyserRef.current = audioContext.createAnalyser();
          analyserRef.current.fftSize = 128;
          analyserRef.current.smoothingTimeConstant = 0.8;
          
          sourceRef.current.connect(analyserRef.current);
          analyserRef.current.connect(audioContext.destination);
          connectedRef.current = true;
        }
      } catch (e) {
        console.log('Audio visualizer: Using fallback animation', e.message);
      }
    }
    
    // Try connecting when playing
    if (isPlaying && audioRef && audioRef.current) {
      connectAudio();
    }
    
    draw();
    
    return function() {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, audioRef]);
  
  return React.createElement('canvas', {
    ref: canvasRef,
    className: 'flame-visualizer-canvas',
    width: 800,
    height: 200
  });
}

// ============================================
// Video Player
// ============================================
function VideoPlayer(props) {
  var video = props.video;
  var playbackState = props.playbackState;
  var playbackTime = props.playbackTime;
  var onStateChange = props.onStateChange;
  var onSeek = props.onSeek;
  var onEnded = props.onEnded;
  var isLocalChange = props.isLocalChange;
  
  var videoRef = useRef(null);
  var ignoreNextEvent = useRef(false);

  // Direct video element handlers
  useEffect(function() {
    if (!videoRef.current) return;
    
    function handlePlay() {
      if (ignoreNextEvent.current) { ignoreNextEvent.current = false; return; }
      console.log('Direct video: play at', videoRef.current.currentTime);
      onStateChange('playing', videoRef.current.currentTime);
    }
    
    function handlePause() {
      if (ignoreNextEvent.current) { ignoreNextEvent.current = false; return; }
      console.log('Direct video: pause at', videoRef.current.currentTime);
      onStateChange('paused', videoRef.current.currentTime);
    }
    
    function handleSeeked() {
      if (ignoreNextEvent.current) { ignoreNextEvent.current = false; return; }
      var state = videoRef.current.paused ? 'paused' : 'playing';
      console.log('Direct video: seeked to', videoRef.current.currentTime);
      onStateChange(state, videoRef.current.currentTime);
    }
    
    function handleEnded() {
      console.log('Direct video: ended');
      if (onEnded) onEnded();
    }
    
    videoRef.current.addEventListener('play', handlePlay);
    videoRef.current.addEventListener('pause', handlePause);
    videoRef.current.addEventListener('seeked', handleSeeked);
    videoRef.current.addEventListener('ended', handleEnded);
    
    return function() {
      if (videoRef.current) {
        videoRef.current.removeEventListener('play', handlePlay);
        videoRef.current.removeEventListener('pause', handlePause);
        videoRef.current.removeEventListener('seeked', handleSeeked);
        videoRef.current.removeEventListener('ended', handleEnded);
      }
    };
  }, [video]);

  // Apply remote state to direct video
  useEffect(function() {
    if (!videoRef.current || isLocalChange) return;
    
    var timeDiff = Math.abs(videoRef.current.currentTime - playbackTime);
    
    if (timeDiff > 1) {
      ignoreNextEvent.current = true;
      videoRef.current.currentTime = playbackTime;
    }
    
    if (playbackState === 'playing' && videoRef.current.paused) {
      ignoreNextEvent.current = true;
      videoRef.current.play().catch(function() {});
    } else if (playbackState === 'paused' && !videoRef.current.paused) {
      ignoreNextEvent.current = true;
      videoRef.current.pause();
    }
  }, [playbackState, playbackTime, isLocalChange]);

  if (!video) {
    return React.createElement('div', { className: 'video-placeholder' },
      React.createElement('div', { className: 'dragon-logo' }, '🐉'),
      React.createElement('h2', null, 'Multiview'),
      React.createElement('p', null, 'Select a video to play')
    );
  }

  var parsed = parseVideoUrl(video.url);
  // console.log('VideoPlayer rendering:', video.url, 'parsed:', parsed);
  
  if (!parsed) return React.createElement('div', { className: 'video-error' }, 'Invalid video URL');

  if (parsed.type === 'youtube') {
    // console.log('Rendering YouTube player for ID:', parsed.id);
    return React.createElement('div', { className: 'video-frame' },
      React.createElement(YouTubePlayer, {
        videoId: parsed.id,
        playbackState: playbackState,
        playbackTime: playbackTime,
        onStateChange: onStateChange,
        onSeek: onSeek,
        onEnded: onEnded
      })
    );
  }
  
  if (parsed.type === 'vimeo') {
    return React.createElement('iframe', { 
      key: video.url, 
      src: 'https://player.vimeo.com/video/' + parsed.id + '?autoplay=1', 
      allow: 'autoplay; fullscreen', 
      allowFullScreen: true, 
      className: 'video-frame' 
    });
  }
  
  // Uploaded files (from database)
  if (parsed.type === 'uploaded') {
    var isAudioFile = parsed.isAudio || 
                      video.isAudio ||
                      video.url.match(/[?&]type=audio/i) ||
                      (video.title && video.title.match(/\.(mp3|wav|m4a|flac|aac|ogg)$/i));
    
    // Get file extension for display
    var fileExt = video.title ? video.title.split('.').pop().toUpperCase() : 'AUDIO';
    
    if (isAudioFile) {
      return React.createElement('div', { className: 'uploaded-player audio-player' },
        // Full-width flame visualizer at top
        React.createElement('div', { className: 'flame-visualizer-container' },
          React.createElement(FlameVisualizer, {
            audioRef: videoRef,
            isPlaying: playbackState === 'playing'
          })
        ),
        // Audio controls in the middle
        React.createElement('div', { className: 'audio-controls-wrapper' },
          React.createElement('audio', { 
            ref: videoRef,
            key: video.url, 
            src: video.url, 
            controls: true, 
            crossOrigin: 'anonymous',
            autoPlay: playbackState === 'playing',
            onPlay: function() { if (onStateChange) onStateChange('playing'); },
            onPause: function() { if (onStateChange) onStateChange('paused'); },
            onEnded: function() { if (onEnded) onEnded(); },
            className: 'custom-audio-player'
          })
        ),
        // Track info at bottom
        React.createElement('div', { className: 'audio-track-info' },
          React.createElement('span', { className: 'track-title' }, video.title || 'Uploaded Audio'),
          React.createElement('span', { className: 'track-format' }, fileExt)
        )
      );
    }
    
    // Uploaded video file
    return React.createElement('div', { className: 'uploaded-player video-player-wrapper' },
      React.createElement('video', { 
        ref: videoRef,
        key: video.url, 
        src: video.url, 
        controls: true, 
        autoPlay: playbackState === 'playing',
        onPlay: function() { if (onStateChange) onStateChange('playing'); },
        onPause: function() { if (onStateChange) onStateChange('paused'); },
        onEnded: function() { if (onEnded) onEnded(); },
        className: 'uploaded-video' 
      }),
      React.createElement('div', { className: 'video-overlay-info' },
        React.createElement('span', { className: 'file-badge small' },
          React.createElement('span', { className: 'file-icon' }, '📁'),
          React.createElement('span', { className: 'file-type' }, 'UPLOADED')
        )
      )
    );
  }
  
  if (parsed.type === 'direct') {
    // Check if it is an audio file - use isAudio flag, URL extension, or title extension
    var isAudio = video.isAudio || 
                  video.url.match(/\.(mp3|wav|m4a|flac|aac|ogg)$/i) || 
                  (video.title && video.title.match(/\.(mp3|wav|m4a|flac|aac|ogg)$/i));
    
    if (isAudio) {
      return React.createElement('div', { className: 'video-placeholder' },
        React.createElement('div', { style: { fontSize: '48px' } }, '🎵'),
        React.createElement('p', null, video.title),
        React.createElement('audio', { 
          ref: videoRef,
          key: video.url, 
          src: video.url, 
          controls: true, 
          autoPlay: playbackState === 'playing', 
          style: { width: '80%', maxWidth: '400px' } 
        })
      );
    }
    
    // Video file (including blob URLs)
    return React.createElement('video', { 
      ref: videoRef,
      key: video.url, 
      src: video.url, 
      controls: true, 
      autoPlay: playbackState === 'playing', 
      className: 'video-frame' 
    });
  }
  
  // For Twitch, Dailymotion, or other embedded content
  if (parsed.type === 'twitch') {
    return React.createElement('iframe', { 
      key: video.url, 
      src: 'https://player.twitch.tv/?channel=' + parsed.id + '&parent=' + window.location.hostname, 
      allow: 'autoplay; fullscreen', 
      allowFullScreen: true, 
      className: 'video-frame' 
    });
  }
  
  if (parsed.type === 'dailymotion') {
    return React.createElement('iframe', { 
      key: video.url, 
      src: 'https://www.dailymotion.com/embed/video/' + parsed.id + '?autoplay=1', 
      allow: 'autoplay; fullscreen', 
      allowFullScreen: true, 
      className: 'video-frame' 
    });
  }
  
  return React.createElement('div', { className: 'video-error' }, 'Unsupported format');
}

// ============================================
// Connected Users
// ============================================
function ConnectedUsers(props) {
  var users = props.users;
  var isHost = props.isHost;
  var currentUserId = props.currentUserId;
  var roomId = props.roomId;
  var onKick = props.onKick;
  var onRename = props.onRename;
  var onColorChange = props.onColorChange;
  
  var _contextMenu = useState(null);
  var contextMenu = _contextMenu[0];
  var setContextMenu = _contextMenu[1];
  
  var _renameModal = useState(null);
  var renameModal = _renameModal[0];
  var setRenameModal = _renameModal[1];
  
  var _colorModal = useState(null);
  var colorModal = _colorModal[0];
  var setColorModal = _colorModal[1];
  
  var _renameValue = useState('');
  var renameValue = _renameValue[0];
  var setRenameValue = _renameValue[1];

  var colors = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c', '#3498db', '#9b59b6', '#e91e63', '#607d8b', '#795548', '#00bcd4', '#8bc34a'];

  function handleRightClick(e, user) {
    e.preventDefault();
    var x = Math.min(e.clientX, window.innerWidth - 180);
    var y = Math.min(e.clientY, window.innerHeight - 150);
    setContextMenu({ x: x, y: y, user: user });
  }

  useEffect(function() {
    function close() { setContextMenu(null); }
    document.addEventListener('click', close);
    return function() { document.removeEventListener('click', close); };
  }, []);

  function openRenameModal(user) {
    setRenameValue(user.displayName || '');
    setRenameModal(user);
    setContextMenu(null);
  }

  function openColorModal(user) {
    setColorModal(user);
    setContextMenu(null);
  }

  function submitRename() {
    if (renameValue.trim() && renameModal) {
      var isGuest = renameModal.guestId || (renameModal.visitorId && renameModal.visitorId.startsWith('guest_'));
      onRename(isGuest ? null : renameModal.visitorId, isGuest ? (renameModal.guestId || renameModal.visitorId) : null, renameValue.trim());
    }
    setRenameModal(null);
    setRenameValue('');
  }

  function selectColor(color) {
    if (colorModal) {
      var isGuest = colorModal.guestId || (colorModal.visitorId && colorModal.visitorId.startsWith('guest_'));
      onColorChange(isGuest ? null : colorModal.visitorId, isGuest ? (colorModal.guestId || colorModal.visitorId) : null, color);
    }
    setColorModal(null);
  }

  function canEditUser(user) {
    var visId = user.visitorId || user.guestId;
    var isYou = visId === currentUserId;
    return isYou || isHost;
  }

  var onlineUsers = users.filter(function(u) { return u.status === 'online'; });
  var offlineUsers = users.filter(function(u) { return u.status !== 'online'; });
  
  function sortUsers(list) {
    return list.slice().sort(function(a, b) {
      if (a.isOwner && !b.isOwner) return -1;
      if (!a.isOwner && b.isOwner) return 1;
      return (a.displayName || '').localeCompare(b.displayName || '');
    });
  }
  
  var sortedOnline = sortUsers(onlineUsers);
  var sortedOffline = sortUsers(offlineUsers);

  function renderUser(user) {
    var visId = user.visitorId || user.guestId;
    var isYou = visId === currentUserId;
    var isGuest = user.guestId || (visId && visId.startsWith && visId.startsWith('guest_'));
    var statusClass = user.status || 'offline';
    var badgeStyle = user.color ? { background: user.color } : {};
    
    return React.createElement('div', {
      key: visId,
      className: 'user-badge ' + statusClass + (isYou ? ' is-you' : '') + (user.isOwner ? ' is-owner' : ''),
      style: badgeStyle,
      onContextMenu: function(e) { handleRightClick(e, user); }
    },
      user.isOwner && React.createElement('span', { className: 'owner-crown' }, '👑'),
      React.createElement('span', { className: 'status-indicator ' + statusClass }),
      React.createElement('span', { className: 'badge-name' }, user.displayName || 'Guest'),
      isYou && React.createElement('span', { className: 'you-tag' }, '(you)'),
      isGuest && !isYou && React.createElement('span', { className: 'guest-tag-badge' }, '(guest)')
    );
  }

  return React.createElement('div', { className: 'connected-users-section' },
    React.createElement('div', { className: 'connected-header' },
      React.createElement('h4', null, React.createElement(Icon, { name: 'users', size: 'sm' }), ' Connected'),
      React.createElement('span', { className: 'online-count' }, React.createElement('span', { className: 'count' }, sortedOnline.length), ' online')
    ),
    React.createElement('div', { className: 'users-list' },
      sortedOnline.length === 0 && sortedOffline.length === 0 
        ? React.createElement('div', { className: 'no-users' }, 'No one here yet')
        : React.createElement(React.Fragment, null,
            sortedOnline.map(renderUser),
            sortedOffline.length > 0 && React.createElement('div', { className: 'offline-divider' }, 'Offline'),
            sortedOffline.map(renderUser)
          )
    ),
    
    // Context menu
    contextMenu && React.createElement('div', { 
      className: 'context-menu', 
      style: { position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 10000 },
      onClick: function(e) { e.stopPropagation(); }
    },
      canEditUser(contextMenu.user) && React.createElement('button', { className: 'context-menu-item', onClick: function() { openRenameModal(contextMenu.user); } }, 
        React.createElement(Icon, { name: 'edit', size: 'sm' }), ' Rename'
      ),
      canEditUser(contextMenu.user) && React.createElement('button', { className: 'context-menu-item', onClick: function() { openColorModal(contextMenu.user); } }, 
        '🎨 Change Color'
      ),
      isHost && contextMenu.user.visitorId !== currentUserId && React.createElement('button', { className: 'context-menu-item danger', onClick: function() {
        if (confirm('Kick ' + contextMenu.user.displayName + '?')) {
          var isGuest = contextMenu.user.guestId || (contextMenu.user.visitorId && contextMenu.user.visitorId.startsWith('guest_'));
          onKick(isGuest ? null : contextMenu.user.visitorId, isGuest ? (contextMenu.user.guestId || contextMenu.user.visitorId) : null);
        }
        setContextMenu(null);
      } }, React.createElement(Icon, { name: 'x', size: 'sm' }), ' Kick')
    ),
    
    // Rename Modal
    renameModal && React.createElement('div', { className: 'modal-overlay', onClick: function() { setRenameModal(null); } },
      React.createElement('div', { className: 'modal settings-modal', onClick: function(e) { e.stopPropagation(); } },
        React.createElement('button', { className: 'modal-close', onClick: function() { setRenameModal(null); } }, '×'),
        React.createElement('h2', null, 'Change Display Name'),
        React.createElement('div', { className: 'settings-content' },
          React.createElement('div', { className: 'modal-input-group' },
            React.createElement('label', null, 'Display Name'),
            React.createElement('input', { 
              type: 'text', 
              value: renameValue, 
              onChange: function(e) { setRenameValue(e.target.value); },
              onKeyDown: function(e) { if (e.key === 'Enter') submitRename(); },
              autoFocus: true,
              placeholder: 'Enter display name'
            })
          ),
          React.createElement('button', { className: 'btn primary', onClick: submitRename }, 'Save')
        )
      )
    ),
    
    // Color Picker Modal
    colorModal && React.createElement('div', { className: 'modal-overlay', onClick: function() { setColorModal(null); } },
      React.createElement('div', { className: 'modal settings-modal', onClick: function(e) { e.stopPropagation(); } },
        React.createElement('button', { className: 'modal-close', onClick: function() { setColorModal(null); } }, '×'),
        React.createElement('h2', null, 'Choose Color'),
        React.createElement('div', { className: 'color-picker-grid' },
          colors.map(function(color) {
            return React.createElement('button', {
              key: color,
              className: 'color-option' + (colorModal.color === color ? ' selected' : ''),
              style: { backgroundColor: color },
              onClick: function() { selectColor(color); }
            });
          }),
          React.createElement('button', {
            key: 'clear',
            className: 'color-option color-clear' + (!colorModal.color ? ' selected' : ''),
            onClick: function() { selectColor(null); },
            title: 'Clear color'
          }, '✕')
        )
      )
    )
  );
}

// ============================================
// Video Notes Editor Component
// ============================================
function VideoNotesEditor(props) {
  var video = props.video;
  var onSave = props.onSave;
  var isOwner = props.isOwner;
  var displayName = props.displayName || 'Guest';
  
  var _notes = useState(video ? (video.notes || '') : '');
  var notes = _notes[0];
  var setNotes = _notes[1];
  
  var _hasChanges = useState(false);
  var hasChanges = _hasChanges[0];
  var setHasChanges = _hasChanges[1];
  
  var _saving = useState(false);
  var saving = _saving[0];
  var setSaving = _saving[1];
  
  // Track the last video ID to detect when we switch videos
  var lastVideoId = useRef(video ? video.id : null);
  
  // Check if notes can be saved (needs valid database UUID)
  var canSave = video && video.id && video.id.length > 30; // UUIDs are 36 chars
  
  // Normalize notes for comparison (null, undefined, '' all become '')
  var videoNotes = (video && video.notes) ? video.notes : '';
  var videoNotesUpdatedBy = (video && video.notesUpdatedBy) ? video.notesUpdatedBy : '';
  
  // Update notes when video changes OR when video.notes is updated from sync
  useEffect(function() {
    if (!video) return;
    
    var currentVideoId = video.id || video.url;
    var currentNotes = (video.notes || '');
    
    // If video changed entirely, reset everything
    if (currentVideoId !== lastVideoId.current) {
      console.log('>>> VideoNotesEditor: Video changed, resetting notes');
      setNotes(currentNotes);
      lastVideoId.current = currentVideoId;
      setHasChanges(false);
      return;
    }
    
    // Video is the same - check if notes changed externally (from sync)
    // Only update if user is NOT currently editing (hasChanges)
    if (!hasChanges && notes !== currentNotes) {
      console.log('>>> VideoNotesEditor: Notes synced from server');
      setNotes(currentNotes);
    }
  }, [video ? (video.id || video.url) : null, videoNotes, videoNotesUpdatedBy]);
  
  function handleChange(e) {
    setNotes(e.target.value);
    setHasChanges(e.target.value !== (video.notes || ''));
  }
  
  function handleSave() {
    if (!video || !hasChanges || !canSave) return;
    setSaving(true);
    onSave(video.id, notes, displayName);
    setTimeout(function() {
      setSaving(false);
      setHasChanges(false);
    }, 500);
  }
  
  function handleKeyDown(e) {
    // Ctrl/Cmd + S to save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
  }
  
  function formatDate(dateStr) {
    if (!dateStr) return '';
    var date = new Date(dateStr);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  
  if (!video) {
    return React.createElement('div', { className: 'notes-empty' }, 'Select a video to view notes');
  }
  
  // Check if notes are hidden from this user (non-owner viewing hidden notes)
  if (video.notesHidden && !isOwner) {
    return React.createElement('div', { className: 'notes-empty' }, 
      React.createElement('p', null, '🔒 Notes are hidden'),
      React.createElement('p', { className: 'notes-hint' }, 'The room owner has hidden notes for this video')
    );
  }
  
  // Check if video is not in playlist (can't save notes)
  if (!canSave) {
    return React.createElement('div', { className: 'video-notes-editor' },
      React.createElement('div', { className: 'notes-video-info' },
        React.createElement('span', { className: 'notes-video-title' }, video.title || video.url)
      ),
      React.createElement('div', { className: 'notes-empty' },
        React.createElement('p', null, '📝 Notes unavailable'),
        React.createElement('p', { className: 'notes-hint' }, 'This video is not in a playlist. Add it to a playlist to enable notes.')
      )
    );
  }
  
  var lastEditInfo = video.notesUpdatedBy 
    ? 'Last edited by ' + video.notesUpdatedBy + (video.notesUpdatedAt ? ' on ' + formatDate(video.notesUpdatedAt) : '')
    : null;
  
  return React.createElement('div', { className: 'video-notes-editor' },
    React.createElement('div', { className: 'notes-video-info' },
      React.createElement('span', { className: 'notes-video-title' }, video.title || video.url),
      lastEditInfo && React.createElement('span', { className: 'notes-last-edit' }, lastEditInfo)
    ),
    React.createElement(React.Fragment, null,
      React.createElement('textarea', {
        className: 'notes-textarea',
        value: notes,
        onChange: handleChange,
        onKeyDown: handleKeyDown,
        placeholder: 'Add notes for this video...\n\nTips:\n• Use notes for timestamps, lyrics, or discussion points\n• Ctrl/Cmd + S to save quickly'
      }),
      React.createElement('div', { className: 'notes-actions' },
        React.createElement('span', { className: 'notes-hint' }, hasChanges ? 'Unsaved changes' : (notes ? 'All changes saved' : '')),
        React.createElement('button', { 
          className: 'btn sm primary', 
          onClick: handleSave,
          disabled: !hasChanges || saving || !canSave
        }, saving ? 'Saving...' : 'Save Notes')
      )
    )
  );
}

// ============================================
// Draggable Video List with Rename and Copy
// ============================================
function DraggableVideoList(props) {
  var videos = props.videos || [];
  var currentVideo = props.currentVideo;
  var onPlay = props.onPlay;
  var onRemove = props.onRemove;
  var onRename = props.onRename;
  var onReorder = props.onReorder;
  var onCopy = props.onCopy;
  var sortMode = props.sortMode; // If set, dragging is disabled
  
  var _dragItem = useState(null);
  var dragItem = _dragItem[0];
  var setDragItem = _dragItem[1];
  
  var _dragOver = useState(null);
  var dragOver = _dragOver[0];
  var setDragOver = _dragOver[1];
  
  var _editingId = useState(null);
  var editingId = _editingId[0];
  var setEditingId = _editingId[1];
  
  var _editTitle = useState('');
  var editTitle = _editTitle[0];
  var setEditTitle = _editTitle[1];
  
  var _contextMenu = useState(null);
  var contextMenu = _contextMenu[0];
  var setContextMenu = _contextMenu[1];

  useEffect(function() {
    function closeMenu() { setContextMenu(null); }
    document.addEventListener('click', closeMenu);
    return function() { document.removeEventListener('click', closeMenu); };
  }, []);

  function handleDragStart(e, index, video) {
    setDragItem(index);
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData('text/plain', JSON.stringify(video));
    e.dataTransfer.setData('application/x-video-item', JSON.stringify(video));
  }

  function handleDragOver(e, index) {
    e.preventDefault();
    if (dragItem === null) return;
    setDragOver(index);
  }

  function handleDrop(e, index) {
    e.preventDefault();
    if (dragItem === null || dragItem === index) {
      setDragItem(null);
      setDragOver(null);
      return;
    }
    
    var newVideos = videos.slice();
    var item = newVideos.splice(dragItem, 1)[0];
    newVideos.splice(index, 0, item);
    
    onReorder(newVideos.map(function(v) { return v.id; }));
    setDragItem(null);
    setDragOver(null);
  }

  function handleDragEnd() {
    setDragItem(null);
    setDragOver(null);
  }

  function startRename(video) {
    setEditingId(video.id);
    setEditTitle(video.title || video.url);
  }

  function saveRename(videoId) {
    if (editTitle.trim()) {
      onRename(videoId, editTitle.trim());
    }
    setEditingId(null);
    setEditTitle('');
  }

  function handleContextMenu(e, video) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, video: video });
  }

  if (videos.length === 0) {
    return React.createElement('div', { className: 'empty-queue' }, React.createElement('p', null, 'No videos in playlist'));
  }

  return React.createElement('div', { className: 'video-list' },
    videos.map(function(v, i) {
      var isPlaying = currentVideo && (currentVideo.id === v.id || currentVideo.url === v.url);
      var isDragging = dragItem === i;
      var isDragOver = dragOver === i;
      var isEditing = editingId === v.id;
      var parsed = parseVideoUrl(v.url);
      var thumbnail = getVideoThumbnail(v.url);
      
      return React.createElement('div', { 
        key: v.id, 
        className: 'video-item' + (isPlaying ? ' playing' : '') + (isDragging ? ' dragging' : '') + (isDragOver ? ' drag-over' : '') + (sortMode ? ' sorted' : ''),
        draggable: !isEditing && !sortMode,
        onDragStart: function(e) { if (!sortMode) handleDragStart(e, i, v); },
        onDragOver: function(e) { if (!sortMode) handleDragOver(e, i); },
        onDrop: function(e) { if (!sortMode) handleDrop(e, i); },
        onDragEnd: handleDragEnd,
        onContextMenu: function(e) { handleContextMenu(e, v); }
      },
        React.createElement('div', { className: 'video-item-top' },
          !sortMode && React.createElement('div', { className: 'drag-handle' }, React.createElement(Icon, { name: 'grip', size: 'sm' })),
          thumbnail 
            ? React.createElement('img', { className: 'video-thumbnail', src: thumbnail, alt: '', onClick: function() { onPlay(v, i); } })
            : React.createElement('div', { className: 'video-thumbnail placeholder', onClick: function() { onPlay(v, i); } }, React.createElement(Icon, { name: 'play', size: 'sm' })),
          isEditing 
            ? React.createElement('input', {
                className: 'video-edit-input',
                value: editTitle,
                onChange: function(e) { setEditTitle(e.target.value); },
                onBlur: function() { saveRename(v.id); },
                onKeyDown: function(e) { 
                  if (e.key === 'Enter') saveRename(v.id);
                  if (e.key === 'Escape') { setEditingId(null); setEditTitle(''); }
                },
                autoFocus: true,
                onClick: function(e) { e.stopPropagation(); }
              })
            : React.createElement('span', { className: 'video-title', onClick: function() { onPlay(v, i); } }, v.title || v.url)
        ),
        React.createElement('div', { className: 'video-actions' },
          React.createElement('button', { className: 'icon-btn sm primary', onClick: function(e) { e.stopPropagation(); onPlay(v, i); }, title: 'Play' }, React.createElement(Icon, { name: 'play', size: 'sm' })),
          React.createElement('button', { className: 'icon-btn sm', onClick: function(e) { e.stopPropagation(); startRename(v); }, title: 'Rename' }, React.createElement(Icon, { name: 'edit', size: 'sm' })),
          onCopy && React.createElement('button', { className: 'icon-btn sm', onClick: function(e) { e.stopPropagation(); onCopy(v); }, title: 'Copy to clipboard' }, React.createElement(Icon, { name: 'copy', size: 'sm' })),
          React.createElement('button', { className: 'icon-btn sm danger', onClick: function(e) { e.stopPropagation(); onRemove(v.id); }, title: 'Remove' }, React.createElement(Icon, { name: 'trash', size: 'sm' }))
        )
      );
    }),
    
    // Context menu
    contextMenu && React.createElement('div', {
      className: 'context-menu',
      style: { position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 10000 },
      onClick: function(e) { e.stopPropagation(); }
    },
      React.createElement('button', { className: 'context-menu-item', onClick: function() { onPlay(contextMenu.video, videos.indexOf(contextMenu.video)); setContextMenu(null); } },
        React.createElement(Icon, { name: 'play', size: 'sm' }), ' Play'
      ),
      onCopy && React.createElement('button', { className: 'context-menu-item', onClick: function() { onCopy(contextMenu.video); setContextMenu(null); } },
        React.createElement(Icon, { name: 'copy', size: 'sm' }), ' Copy to clipboard'
      ),
      React.createElement('button', { className: 'context-menu-item danger', onClick: function() { onRemove(contextMenu.video.id); setContextMenu(null); } },
        React.createElement(Icon, { name: 'trash', size: 'sm' }), ' Remove'
      )
    )
  );
}

// ============================================
// Playlist Panel (Draggable)
// ============================================
function PlaylistPanel(props) {
  var playlists = props.playlists;
  var activePlaylist = props.activePlaylist;
  var onSelect = props.onSelect;
  var onCreate = props.onCreate;
  var onDelete = props.onDelete;
  var onRename = props.onRename;
  var onReorder = props.onReorder;
  var onHide = props.onHide;
  var onAddVideoToPlaylist = props.onAddVideoToPlaylist;
  var onExport = props.onExport;
  var onImport = props.onImport;
  var onShowImportModal = props.onShowImportModal;
  var isOwner = props.isOwner;
  var copiedVideo = props.copiedVideo;
  var onPaste = props.onPaste;
  
  var _showCreate = useState(false);
  var showCreate = _showCreate[0];
  var setShowCreate = _showCreate[1];
  
  var _newName = useState('');
  var newName = _newName[0];
  var setNewName = _newName[1];
  
  var _editingId = useState(null);
  var editingId = _editingId[0];
  var setEditingId = _editingId[1];
  
  var _editName = useState('');
  var editName = _editName[0];
  var setEditName = _editName[1];
  
  var _dragItem = useState(null);
  var dragItem = _dragItem[0];
  var setDragItem = _dragItem[1];
  
  var _dragOver = useState(null);
  var dragOver = _dragOver[0];
  var setDragOver = _dragOver[1];
  
  var _videoDragOver = useState(null);
  var videoDragOver = _videoDragOver[0];
  var setVideoDragOver = _videoDragOver[1];
  
  var _contextMenu = useState(null);
  var contextMenu = _contextMenu[0];
  var setContextMenu = _contextMenu[1];
  
  var _showImport = useState(false);
  var showImport = _showImport[0];
  var setShowImport = _showImport[1];
  
  var _showImportOptions = useState(false);
  var showImportOptions = _showImportOptions[0];
  var setShowImportOptions = _showImportOptions[1];
  
  var _showYoutubeImport = useState(false);
  var showYoutubeImport = _showYoutubeImport[0];
  var setShowYoutubeImport = _showYoutubeImport[1];
  
  var _youtubeUrl = useState('');
  var youtubeUrl = _youtubeUrl[0];
  var setYoutubeUrl = _youtubeUrl[1];
  
  var _youtubeImporting = useState(false);
  var youtubeImporting = _youtubeImporting[0];
  var setYoutubeImporting = _youtubeImporting[1];
  
  var _importData = useState('');
  var importData = _importData[0];
  var setImportData = _importData[1];

  useEffect(function() {
    function closeMenu() { setContextMenu(null); setShowImportOptions(false); }
    document.addEventListener('click', closeMenu);
    return function() { document.removeEventListener('click', closeMenu); };
  }, []);

  function handleCreate() {
    if (!newName.trim()) return;
    onCreate(newName.trim());
    setNewName('');
    setShowCreate(false);
  }

  function handleRename(id) {
    if (!editName.trim()) return;
    onRename(id, editName.trim());
    setEditingId(null);
    setEditName('');
  }

  function handleDragStart(e, index) {
    setDragItem(index);
  }

  function handleDragOver(e, index) {
    e.preventDefault();
    if (dragItem === null) return;
    setDragOver(index);
  }
  
  function handleVideoDragOver(e, playlistId) {
    e.preventDefault();
    e.stopPropagation();
    setVideoDragOver(playlistId);
  }
  
  function handleVideoDrop(e, playlist) {
    e.preventDefault();
    e.stopPropagation();
    setVideoDragOver(null);
    
    try {
      var videoData = e.dataTransfer.getData('application/x-video-item');
      if (videoData && onAddVideoToPlaylist) {
        var video = JSON.parse(videoData);
        onAddVideoToPlaylist(playlist.id, video);
      }
    } catch (err) {
      console.error('Drop error:', err);
    }
  }

  function handleDrop(e, index) {
    e.preventDefault();
    
    // Check if this is a video drop
    var videoData = e.dataTransfer.getData('application/x-video-item');
    if (videoData) {
      setVideoDragOver(null);
      return; // Let handleVideoDrop handle it
    }
    
    if (dragItem === null || dragItem === index) {
      setDragItem(null);
      setDragOver(null);
      return;
    }
    var newPlaylists = playlists.slice();
    var item = newPlaylists.splice(dragItem, 1)[0];
    newPlaylists.splice(index, 0, item);
    if (onReorder) onReorder(newPlaylists.map(function(p) { return p.id; }));
    setDragItem(null);
    setDragOver(null);
  }
  
  function handleContextMenu(e, playlist) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, playlist: playlist });
  }
  
  function handleExport(playlist) {
    var exportData = {
      name: playlist.name,
      videos: (playlist.videos || []).map(function(v) {
        return { title: v.title, url: v.url, videoType: v.videoType };
      })
    };
    var blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = playlist.name + '.json';
    a.click();
    URL.revokeObjectURL(url);
  }
  
  function handleImportSubmit() {
    try {
      var data = JSON.parse(importData);
      if (data.name && onImport) {
        onImport(data);
        setShowImport(false);
        setImportData('');
      }
    } catch (err) {
      alert('Invalid JSON data');
    }
  }
  
  function handleYoutubeImport() {
    if (!youtubeUrl.trim()) return;
    
    // Extract playlist ID from URL
    var playlistId = null;
    var url = youtubeUrl.trim();
    
    // Try different YouTube playlist URL formats
    var listMatch = url.match(/[?&]list=([^&]+)/);
    if (listMatch) {
      playlistId = listMatch[1];
    }
    
    if (!playlistId) {
      alert('Could not find playlist ID in URL. Make sure you paste a YouTube playlist URL.');
      return;
    }
    
    setYoutubeImporting(true);
    
    // Use YouTube oEmbed to get playlist info, then fetch videos via noembed
    // Since we can't use YouTube API without a key, we'll create a playlist and let users know
    // they need to add videos manually or we try to scrape what we can
    
    // For now, create a playlist and provide instructions
    // In production, you'd want to use YouTube Data API with an API key
    fetch('https://www.youtube.com/oembed?url=https://www.youtube.com/playlist?list=' + playlistId + '&format=json')
      .then(function(res) { 
        if (!res.ok) throw new Error('Could not fetch playlist info');
        return res.json(); 
      })
      .then(function(data) {
        var playlistName = data.title || 'YouTube Playlist';
        // Remove " - YouTube" suffix if present
        playlistName = playlistName.replace(/ - YouTube$/, '');
        
        // Create playlist with the YouTube URL as the first video
        // Users can then add more videos from the playlist
        if (onImport) {
          onImport({
            name: playlistName,
            videos: [{
              title: playlistName + ' (Full Playlist)',
              url: 'https://www.youtube.com/playlist?list=' + playlistId,
              videoType: 'youtube'
            }]
          });
        }
        
        setShowYoutubeImport(false);
        setYoutubeUrl('');
        setYoutubeImporting(false);
      })
      .catch(function(err) {
        console.error('YouTube import error:', err);
        // Fallback: just create with generic name
        if (onImport) {
          onImport({
            name: 'YouTube Playlist',
            videos: [{
              title: 'YouTube Playlist',
              url: 'https://www.youtube.com/playlist?list=' + playlistId,
              videoType: 'youtube'
            }]
          });
        }
        setShowYoutubeImport(false);
        setYoutubeUrl('');
        setYoutubeImporting(false);
      });
  }

  return React.createElement('div', { className: 'playlist-panel' },
    React.createElement('div', { className: 'sidebar-header' },
      React.createElement('h3', null, 'Playlists'),
      React.createElement('div', { className: 'header-actions' },
        React.createElement('div', { className: 'import-btn-container', style: { position: 'relative' } },
          React.createElement('button', { 
            className: 'icon-btn sm', 
            onClick: function(e) { e.stopPropagation(); setShowImportOptions(!showImportOptions); }, 
            title: 'Import playlist' 
          }, 
            React.createElement(Icon, { name: 'upload', size: 'sm' })
          ),
          showImportOptions && React.createElement('div', { className: 'import-options-dropdown' },
            onShowImportModal && React.createElement('button', { 
              className: 'import-option', 
              onClick: function() { setShowImportOptions(false); onShowImportModal(); } 
            }, 'From My Rooms'),
            React.createElement('button', { 
              className: 'import-option', 
              onClick: function() { setShowImportOptions(false); setShowYoutubeImport(true); } 
            }, 'From YouTube Playlist'),
            React.createElement('button', { 
              className: 'import-option', 
              onClick: function() { setShowImportOptions(false); setShowImport(true); } 
            }, 'From JSON File')
          )
        ),
        React.createElement('button', { className: 'icon-btn sm', onClick: function() { setShowCreate(true); }, title: 'New playlist' }, 
          React.createElement(Icon, { name: 'plus', size: 'sm' })
        ),
        props.onClose && React.createElement('button', { 
          className: 'sidebar-close-btn', 
          onClick: props.onClose,
          title: 'Close'
        }, React.createElement(Icon, { name: 'x', size: 'sm' }))
      )
    ),
    showCreate && React.createElement('div', { className: 'create-playlist-form' },
      React.createElement('input', { value: newName, onChange: function(e) { setNewName(e.target.value); }, placeholder: 'Playlist name', autoFocus: true, onKeyDown: function(e) { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowCreate(false); } }),
      React.createElement('div', { className: 'form-actions' },
        React.createElement('button', { className: 'btn primary sm', onClick: handleCreate }, 'Create'),
        React.createElement('button', { className: 'btn sm', onClick: function() { setShowCreate(false); } }, 'Cancel')
      )
    ),
    showImport && React.createElement('div', { className: 'create-playlist-form' },
      React.createElement('textarea', { 
        value: importData, 
        onChange: function(e) { setImportData(e.target.value); }, 
        placeholder: 'Paste playlist JSON here...', 
        rows: 4,
        style: { width: '100%', resize: 'vertical' }
      }),
      React.createElement('div', { className: 'form-actions' },
        React.createElement('button', { className: 'btn primary sm', onClick: handleImportSubmit }, 'Import'),
        React.createElement('button', { className: 'btn sm', onClick: function() { setShowImport(false); setImportData(''); } }, 'Cancel')
      )
    ),
    showYoutubeImport && React.createElement('div', { className: 'create-playlist-form' },
      React.createElement('input', { 
        type: 'text',
        value: youtubeUrl, 
        onChange: function(e) { setYoutubeUrl(e.target.value); }, 
        placeholder: 'Paste YouTube playlist URL...', 
        autoFocus: true,
        onKeyDown: function(e) { if (e.key === 'Enter') handleYoutubeImport(); if (e.key === 'Escape') { setShowYoutubeImport(false); setYoutubeUrl(''); } }
      }),
      React.createElement('div', { className: 'form-actions' },
        React.createElement('button', { className: 'btn primary sm', onClick: handleYoutubeImport, disabled: youtubeImporting }, youtubeImporting ? 'Importing...' : 'Import'),
        React.createElement('button', { className: 'btn sm', onClick: function() { setShowYoutubeImport(false); setYoutubeUrl(''); } }, 'Cancel')
      )
    ),
    React.createElement('div', { className: 'playlists-list' },
      playlists.length === 0 
        ? React.createElement('div', { className: 'empty-playlists' }, 'No playlists yet')
        : playlists.map(function(p, i) {
            var isActive = activePlaylist && activePlaylist.id === p.id;
            var isEditing = editingId === p.id;
            var isDragging = dragItem === i;
            var isDragOver = dragOver === i;
            var isVideoDragOver = videoDragOver === p.id;
            var isHidden = p.hidden;
            
            return React.createElement('div', { 
              key: p.id, 
              className: 'playlist-item' + (isActive ? ' active' : '') + (isDragging ? ' dragging' : '') + (isDragOver || isVideoDragOver ? ' drag-over' : '') + (isHidden ? ' hidden-playlist' : ''),
              draggable: !isEditing,
              onDragStart: function(e) { handleDragStart(e, i); },
              onDragOver: function(e) { 
                handleDragOver(e, i);
                handleVideoDragOver(e, p.id);
              },
              onDrop: function(e) { 
                handleDrop(e, i);
                handleVideoDrop(e, p);
              },
              onDragEnd: function() { setDragItem(null); setDragOver(null); },
              onDragLeave: function() { setVideoDragOver(null); },
              onContextMenu: function(e) { handleContextMenu(e, p); }
            },
              React.createElement('div', { className: 'drag-handle' }, React.createElement(Icon, { name: 'grip', size: 'sm' })),
              isHidden && React.createElement('span', { className: 'hidden-indicator', title: 'Hidden from guests' }, React.createElement(Icon, { name: 'eyeOff', size: 'sm' })),
              isEditing 
                ? React.createElement('input', { className: 'playlist-edit-input', value: editName, onChange: function(e) { setEditName(e.target.value); }, onBlur: function() { handleRename(p.id); }, onKeyDown: function(e) { if (e.key === 'Enter') handleRename(p.id); if (e.key === 'Escape') { setEditingId(null); setEditName(''); } }, autoFocus: true })
                : React.createElement('button', { className: 'playlist-select', onClick: function() { onSelect(p); } },
                    React.createElement('span', { className: 'playlist-name', title: p.name }, p.name),
                    React.createElement('span', { className: 'playlist-count' }, (p.videos || []).length)
                  ),
              React.createElement('div', { className: 'playlist-actions' },
                React.createElement('button', { className: 'icon-btn sm', onClick: function(e) { e.stopPropagation(); setEditingId(p.id); setEditName(p.name); }, title: 'Rename' }, React.createElement(Icon, { name: 'edit', size: 'sm' })),
                React.createElement('button', { className: 'icon-btn sm danger', onClick: function(e) { e.stopPropagation(); onDelete(p.id); }, title: 'Delete' }, React.createElement(Icon, { name: 'trash', size: 'sm' }))
              )
            );
          })
    ),
    
    // Context menu
    contextMenu && React.createElement('div', {
      className: 'context-menu',
      style: { position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 10000 },
      onClick: function(e) { e.stopPropagation(); }
    },
      React.createElement('button', { className: 'context-menu-item', onClick: function() { handleExport(contextMenu.playlist); setContextMenu(null); } },
        React.createElement(Icon, { name: 'download', size: 'sm' }), ' Export playlist'
      ),
      copiedVideo && React.createElement('button', { className: 'context-menu-item', onClick: function() { onPaste(contextMenu.playlist.id); setContextMenu(null); } },
        React.createElement(Icon, { name: 'clipboard', size: 'sm' }), ' Paste video here'
      ),
      isOwner && onHide && React.createElement('button', { className: 'context-menu-item', onClick: function() { onHide(contextMenu.playlist.id, !contextMenu.playlist.hidden); setContextMenu(null); } },
        React.createElement(Icon, { name: contextMenu.playlist.hidden ? 'eye' : 'eyeOff', size: 'sm' }), 
        contextMenu.playlist.hidden ? ' Show to guests' : ' Hide from guests'
      ),
      React.createElement('button', { className: 'context-menu-item danger', onClick: function() { onDelete(contextMenu.playlist.id); setContextMenu(null); } },
        React.createElement(Icon, { name: 'trash', size: 'sm' }), ' Delete'
      )
    )
  );
}

// ============================================
// User Menu
// ============================================
function UserMenu(props) {
  var user = props.user;
  var onSettings = props.onSettings;
  var onLogout = props.onLogout;
  var onHome = props.onHome;
  
  var _open = useState(false);
  var open = _open[0];
  var setOpen = _open[1];
  
  var ref = useRef(null);

  useEffect(function() {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return function() { document.removeEventListener('mousedown', handleClickOutside); };
  }, []);

  return React.createElement('div', { className: 'user-menu-container', ref: ref },
    React.createElement('button', { className: 'user-menu', onClick: function() { setOpen(!open); } },
      React.createElement('div', { className: 'user-avatar' }, user.displayName ? user.displayName.charAt(0).toUpperCase() : '?'),
      React.createElement('span', { className: 'user-name' }, user.displayName),
      React.createElement(Icon, { name: 'chevronDown', size: 'sm' })
    ),
    open && React.createElement('div', { className: 'user-dropdown' },
      React.createElement('div', { className: 'dropdown-header' },
        React.createElement('div', { className: 'name' }, user.displayName),
        React.createElement('div', { className: 'email' }, user.email)
      ),
      onHome && React.createElement('button', { className: 'dropdown-item', onClick: function() { onHome(); setOpen(false); } }, React.createElement(Icon, { name: 'home', size: 'sm' }), ' My Rooms'),
      React.createElement('button', { className: 'dropdown-item', onClick: function() { onSettings(); setOpen(false); } }, React.createElement(Icon, { name: 'settings', size: 'sm' }), ' Settings'),
      React.createElement('div', { className: 'dropdown-divider' }),
      React.createElement('button', { className: 'dropdown-item danger', onClick: onLogout }, React.createElement(Icon, { name: 'logout', size: 'sm' }), ' Log out')
    )
  );
}

// ============================================
// Guest Menu (for temporary/guest users)
// ============================================
function GuestMenu(props) {
  var displayName = props.displayName;
  var onCreateAccount = props.onCreateAccount;
  
  var _open = useState(false);
  var open = _open[0];
  var setOpen = _open[1];
  
  var ref = useRef(null);

  useEffect(function() {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return function() { document.removeEventListener('mousedown', handleClickOutside); };
  }, []);

  return React.createElement('div', { className: 'user-menu-container', ref: ref },
    React.createElement('button', { className: 'user-menu guest', onClick: function() { setOpen(!open); } },
      React.createElement('div', { className: 'user-avatar guest' }, displayName ? displayName.charAt(0).toUpperCase() : '?'),
      React.createElement('span', { className: 'user-name' }, displayName),
      React.createElement('span', { className: 'guest-tag-small' }, 'Guest'),
      React.createElement(Icon, { name: 'chevronDown', size: 'sm' })
    ),
    open && React.createElement('div', { className: 'user-dropdown' },
      React.createElement('div', { className: 'dropdown-header' },
        React.createElement('div', { className: 'name' }, displayName),
        React.createElement('div', { className: 'email guest-notice' }, 'Temporary account')
      ),
      React.createElement('button', { className: 'dropdown-item primary', onClick: function() { onCreateAccount(); setOpen(false); } }, 
        React.createElement(Icon, { name: 'plus', size: 'sm' }), ' Create Account'
      ),
      React.createElement('div', { className: 'dropdown-hint' }, 'Save your display name and access your room history')
    )
  );
}

// ============================================
// Settings Modal
// ============================================
function SettingsContent(props) {
  var user = props.user;
  var onUpdate = props.onUpdate;
  var onLogout = props.onLogout;
  
  var _tab = useState('profile');
  var tab = _tab[0];
  var setTab = _tab[1];
  
  var _displayName = useState(user.displayName || '');
  var displayName = _displayName[0];
  var setDisplayName = _displayName[1];
  
  var userThemeKey = 'theme_' + user.id;
  var _theme = useState(localStorage.getItem(userThemeKey) || 'gold');
  var theme = _theme[0];
  var setThemeState = _theme[1];
  
  var _newEmail = useState('');
  var newEmail = _newEmail[0];
  var setNewEmail = _newEmail[1];
  
  var _emailPassword = useState('');
  var emailPassword = _emailPassword[0];
  var setEmailPassword = _emailPassword[1];
  
  var _currentPassword = useState('');
  var currentPassword = _currentPassword[0];
  var setCurrentPassword = _currentPassword[1];
  
  var _newPassword = useState('');
  var newPassword = _newPassword[0];
  var setNewPassword = _newPassword[1];
  
  var _confirmPassword = useState('');
  var confirmPassword = _confirmPassword[0];
  var setConfirmPassword = _confirmPassword[1];
  
  var _message = useState(null);
  var message = _message[0];
  var setMessage = _message[1];
  
  var _loading = useState(false);
  var loading = _loading[0];
  var setLoading = _loading[1];

  var themes = [
    { id: 'gold', name: 'Dragon Gold', color: '#d4a824' },
    { id: 'ember', name: 'Ember Red', color: '#ef4444' },
    { id: 'forest', name: 'Forest Green', color: '#22c55e' },
    { id: 'ocean', name: 'Ocean Blue', color: '#3b82f6' },
    { id: 'purple', name: 'Royal Purple', color: '#a855f7' },
    { id: 'sunset', name: 'Sunset Orange', color: '#f97316' },
    { id: 'rose', name: 'Rose Pink', color: '#ec4899' },
    { id: 'cyan', name: 'Cyan', color: '#06b6d4' }
  ];

  function handleSaveProfile() {
    if (!displayName.trim()) return;
    setLoading(true);
    api.auth.updateProfile(displayName.trim()).then(function() {
      onUpdate(Object.assign({}, user, { displayName: displayName.trim() }));
      setMessage({ text: 'Profile saved!', type: 'success' });
      setLoading(false);
    }).catch(function(err) {
      setMessage({ text: err.message, type: 'error' });
      setLoading(false);
    });
  }

  function handleChangeEmail() {
    if (!newEmail.trim() || !emailPassword) {
      setMessage({ text: 'Please fill in all fields', type: 'error' });
      return;
    }
    setLoading(true);
    api.auth.updateEmail(newEmail.trim(), emailPassword).then(function() {
      onUpdate(Object.assign({}, user, { email: newEmail.trim() }));
      setMessage({ text: 'Email updated!', type: 'success' });
      setNewEmail('');
      setEmailPassword('');
      setLoading(false);
    }).catch(function(err) {
      setMessage({ text: err.message, type: 'error' });
      setLoading(false);
    });
  }

  function handleChangePassword() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setMessage({ text: 'Please fill in all fields', type: 'error' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ text: 'New passwords do not match', type: 'error' });
      return;
    }
    if (newPassword.length < 6) {
      setMessage({ text: 'Password must be at least 6 characters', type: 'error' });
      return;
    }
    setLoading(true);
    api.auth.updatePassword(currentPassword, newPassword).then(function() {
      setMessage({ text: 'Password changed!', type: 'success' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setLoading(false);
    }).catch(function(err) {
      setMessage({ text: err.message, type: 'error' });
      setLoading(false);
    });
  }

  function handleSetTheme(themeId) {
    setThemeState(themeId);
    localStorage.setItem(userThemeKey, themeId);
    document.documentElement.setAttribute('data-theme', themeId);
    setMessage({ text: 'Theme updated!', type: 'success' });
  }

  function handleDeleteAccount() {
    if (!confirm('Delete your account? This cannot be undone.')) return;
    setLoading(true);
    api.auth.deleteAccount().then(onLogout).catch(function(err) { 
      setMessage({ text: err.message, type: 'error' }); 
      setLoading(false); 
    });
  }

  return React.createElement('div', { className: 'slide-panel-content settings-panel-content' },
    React.createElement('div', { className: 'settings-tabs' },
      React.createElement('button', { className: 'settings-tab' + (tab === 'profile' ? ' active' : ''), onClick: function() { setTab('profile'); setMessage(null); } }, 'Profile'),
      React.createElement('button', { className: 'settings-tab' + (tab === 'email' ? ' active' : ''), onClick: function() { setTab('email'); setMessage(null); } }, 'Email'),
      React.createElement('button', { className: 'settings-tab' + (tab === 'password' ? ' active' : ''), onClick: function() { setTab('password'); setMessage(null); } }, 'Password'),
      React.createElement('button', { className: 'settings-tab' + (tab === 'theme' ? ' active' : ''), onClick: function() { setTab('theme'); setMessage(null); } }, 'Theme'),
      React.createElement('button', { className: 'settings-tab' + (tab === 'account' ? ' active' : ''), onClick: function() { setTab('account'); setMessage(null); } }, 'Account'),
      React.createElement('button', { className: 'settings-tab logout', onClick: onLogout }, 'Logout')
    ),
    message && React.createElement('div', { className: message.type === 'error' ? 'error-message' : 'success-message' }, message.text),
    
    tab === 'profile' && React.createElement('div', { className: 'settings-section' },
      React.createElement('div', { className: 'input-group' },
        React.createElement('label', null, 'Display Name'),
        React.createElement('input', { type: 'text', value: displayName, onChange: function(e) { setDisplayName(e.target.value); } })
      ),
      React.createElement('div', { className: 'input-group' },
        React.createElement('label', null, 'Email'),
        React.createElement('input', { type: 'email', value: user.email, disabled: true })
      ),
      React.createElement('button', { className: 'btn primary', onClick: handleSaveProfile, disabled: loading }, loading ? 'Saving...' : 'Save Changes')
    ),
    
    tab === 'email' && React.createElement('div', { className: 'settings-section' },
      React.createElement('div', { className: 'input-group' },
        React.createElement('label', null, 'Current Email'),
        React.createElement('input', { type: 'email', value: user.email, disabled: true })
      ),
      React.createElement('div', { className: 'input-group' },
        React.createElement('label', null, 'New Email'),
        React.createElement('input', { type: 'email', value: newEmail, onChange: function(e) { setNewEmail(e.target.value); }, placeholder: 'Enter new email' })
      ),
      React.createElement('div', { className: 'input-group' },
        React.createElement('label', null, 'Current Password'),
        React.createElement('input', { type: 'password', value: emailPassword, onChange: function(e) { setEmailPassword(e.target.value); }, placeholder: 'Confirm with password' })
      ),
      React.createElement('button', { className: 'btn primary', onClick: handleChangeEmail, disabled: loading }, loading ? 'Updating...' : 'Update Email')
    ),
    
    tab === 'password' && React.createElement('div', { className: 'settings-section' },
      React.createElement('div', { className: 'input-group' },
        React.createElement('label', null, 'Current Password'),
        React.createElement('input', { type: 'password', value: currentPassword, onChange: function(e) { setCurrentPassword(e.target.value); }, placeholder: 'Enter current password' })
      ),
      React.createElement('div', { className: 'input-group' },
        React.createElement('label', null, 'New Password'),
        React.createElement('input', { type: 'password', value: newPassword, onChange: function(e) { setNewPassword(e.target.value); }, placeholder: 'Enter new password' })
      ),
      React.createElement('div', { className: 'input-group' },
        React.createElement('label', null, 'Confirm New Password'),
        React.createElement('input', { type: 'password', value: confirmPassword, onChange: function(e) { setConfirmPassword(e.target.value); }, placeholder: 'Confirm new password' })
      ),
      React.createElement('button', { className: 'btn primary', onClick: handleChangePassword, disabled: loading }, loading ? 'Changing...' : 'Change Password')
    ),
    
    tab === 'theme' && React.createElement('div', { className: 'settings-section' },
      React.createElement('p', { className: 'section-description' }, 'Choose your preferred color theme'),
      React.createElement('div', { className: 'theme-grid' },
        themes.map(function(t) {
          return React.createElement('div', {
            key: t.id,
            className: 'theme-option' + (theme === t.id ? ' active' : ''),
            onClick: function() { handleSetTheme(t.id); }
          },
            React.createElement('div', { className: 'theme-swatch', style: { backgroundColor: t.color } }),
            React.createElement('span', { className: 'theme-name' }, t.name)
          );
        })
      )
    ),
    
    tab === 'account' && React.createElement('div', { className: 'settings-section' },
      React.createElement('div', { className: 'danger-zone' },
        React.createElement('h4', null, '⚠️ Danger Zone'),
        React.createElement('p', null, 'Deleting your account will permanently remove all your data including rooms and playlists.'),
        React.createElement('button', { className: 'btn danger', onClick: handleDeleteAccount, disabled: loading }, loading ? 'Deleting...' : 'Delete My Account')
      )
    )
  );
}

function SettingsModal(props) {
  var user = props.user;
  var onClose = props.onClose;
  var onUpdate = props.onUpdate;
  var onLogout = props.onLogout;
  
  var _tab = useState('profile');
  var tab = _tab[0];
  var setTab = _tab[1];
  
  var _displayName = useState(user.displayName || '');
  var displayName = _displayName[0];
  var setDisplayName = _displayName[1];
  
  // Use user-specific theme storage
  var userThemeKey = 'theme_' + user.id;
  var _theme = useState(localStorage.getItem(userThemeKey) || 'gold');
  var theme = _theme[0];
  var setThemeState = _theme[1];
  
  var _newEmail = useState('');
  var newEmail = _newEmail[0];
  var setNewEmail = _newEmail[1];
  
  var _emailPassword = useState('');
  var emailPassword = _emailPassword[0];
  var setEmailPassword = _emailPassword[1];
  
  var _currentPassword = useState('');
  var currentPassword = _currentPassword[0];
  var setCurrentPassword = _currentPassword[1];
  
  var _newPassword = useState('');
  var newPassword = _newPassword[0];
  var setNewPassword = _newPassword[1];
  
  var _confirmPassword = useState('');
  var confirmPassword = _confirmPassword[0];
  var setConfirmPassword = _confirmPassword[1];
  
  var _message = useState(null);
  var message = _message[0];
  var setMessage = _message[1];
  
  var _loading = useState(false);
  var loading = _loading[0];
  var setLoading = _loading[1];

  function handleSaveProfile() {
    if (!displayName.trim()) return;
    setLoading(true);
    api.auth.updateProfile(displayName.trim()).then(function() {
      onUpdate(Object.assign({}, user, { displayName: displayName.trim() }));
      setMessage({ text: 'Profile saved!', type: 'success' });
      setLoading(false);
    }).catch(function(err) {
      setMessage({ text: err.message, type: 'error' });
      setLoading(false);
    });
  }

  function handleChangeEmail() {
    if (!newEmail.trim() || !emailPassword) {
      setMessage({ text: 'Please fill in all fields', type: 'error' });
      return;
    }
    setLoading(true);
    api.auth.updateEmail(newEmail.trim(), emailPassword).then(function() {
      onUpdate(Object.assign({}, user, { email: newEmail.trim() }));
      setMessage({ text: 'Email updated!', type: 'success' });
      setNewEmail('');
      setEmailPassword('');
      setLoading(false);
    }).catch(function(err) {
      setMessage({ text: err.message, type: 'error' });
      setLoading(false);
    });
  }

  function handleChangePassword() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setMessage({ text: 'Please fill in all fields', type: 'error' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ text: 'New passwords do not match', type: 'error' });
      return;
    }
    if (newPassword.length < 6) {
      setMessage({ text: 'Password must be at least 6 characters', type: 'error' });
      return;
    }
    setLoading(true);
    api.auth.updatePassword(currentPassword, newPassword).then(function() {
      setMessage({ text: 'Password changed!', type: 'success' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setLoading(false);
    }).catch(function(err) {
      setMessage({ text: err.message, type: 'error' });
      setLoading(false);
    });
  }

  var themes = [
    { id: 'gold', name: 'Dragon Gold', color: '#d4a824' },
    { id: 'ember', name: 'Ember Red', color: '#ef4444' },
    { id: 'forest', name: 'Forest', color: '#22c55e' },
    { id: 'ocean', name: 'Ocean', color: '#3b82f6' },
    { id: 'purple', name: 'Royal Purple', color: '#a855f7' },
    { id: 'sunset', name: 'Sunset', color: '#f97316' },
    { id: 'rose', name: 'Rose', color: '#ec4899' },
    { id: 'cyan', name: 'Cyan', color: '#06b6d4' }
  ];

  function handleSetTheme(themeId) {
    setThemeState(themeId);
    localStorage.setItem(userThemeKey, themeId);
    document.documentElement.setAttribute('data-theme', themeId);
  }

  function handleDeleteAccount() {
    if (!confirm('Delete your account? This cannot be undone.')) return;
    setLoading(true);
    api.auth.deleteAccount().then(onLogout).catch(function(err) { setMessage({ text: err.message, type: 'error' }); setLoading(false); });
  }

  return React.createElement('div', { className: 'modal-overlay', onClick: onClose },
    React.createElement('div', { className: 'modal settings-modal', onClick: function(e) { e.stopPropagation(); } },
      React.createElement('button', { className: 'modal-close', onClick: onClose }, '×'),
      React.createElement('h2', null, 'Settings'),
      React.createElement('div', { className: 'settings-tabs' },
        React.createElement('button', { className: 'settings-tab' + (tab === 'profile' ? ' active' : ''), onClick: function() { setTab('profile'); setMessage(null); } }, 'Profile'),
        React.createElement('button', { className: 'settings-tab' + (tab === 'email' ? ' active' : ''), onClick: function() { setTab('email'); setMessage(null); } }, 'Email'),
        React.createElement('button', { className: 'settings-tab' + (tab === 'password' ? ' active' : ''), onClick: function() { setTab('password'); setMessage(null); } }, 'Password'),
        React.createElement('button', { className: 'settings-tab' + (tab === 'danger' ? ' active' : ''), onClick: function() { setTab('danger'); setMessage(null); } }, 'Account'),
        React.createElement('button', { className: 'settings-tab' + (tab === 'theme' ? ' active' : ''), onClick: function() { setTab('theme'); setMessage(null); } }, 'Theme')
      ),
      message && React.createElement('div', { className: message.type === 'error' ? 'error-message' : 'success-message' }, message.text),
      
      tab === 'profile' && React.createElement('div', { className: 'settings-content' },
        React.createElement('div', { className: 'modal-input-group' },
          React.createElement('label', null, 'Display Name'),
          React.createElement('input', { type: 'text', value: displayName, onChange: function(e) { setDisplayName(e.target.value); } })
        ),
        React.createElement('button', { className: 'btn primary', onClick: handleSaveProfile, disabled: loading }, loading ? 'Saving...' : 'Save Changes')
      ),
      
      tab === 'email' && React.createElement('div', { className: 'settings-content' },
        React.createElement('div', { className: 'modal-input-group' },
          React.createElement('label', null, 'Current Email'),
          React.createElement('input', { type: 'email', value: user.email, disabled: true })
        ),
        React.createElement('div', { className: 'modal-input-group' },
          React.createElement('label', null, 'New Email'),
          React.createElement('input', { type: 'email', value: newEmail, onChange: function(e) { setNewEmail(e.target.value); }, placeholder: 'Enter new email' })
        ),
        React.createElement('div', { className: 'modal-input-group' },
          React.createElement('label', null, 'Current Password'),
          React.createElement('input', { type: 'password', value: emailPassword, onChange: function(e) { setEmailPassword(e.target.value); }, placeholder: 'Confirm with password' })
        ),
        React.createElement('button', { className: 'btn primary', onClick: handleChangeEmail, disabled: loading }, loading ? 'Updating...' : 'Update Email')
      ),
      
      tab === 'password' && React.createElement('div', { className: 'settings-content' },
        React.createElement('div', { className: 'modal-input-group' },
          React.createElement('label', null, 'Current Password'),
          React.createElement('input', { type: 'password', value: currentPassword, onChange: function(e) { setCurrentPassword(e.target.value); }, placeholder: 'Enter current password' })
        ),
        React.createElement('div', { className: 'modal-input-group' },
          React.createElement('label', null, 'New Password'),
          React.createElement('input', { type: 'password', value: newPassword, onChange: function(e) { setNewPassword(e.target.value); }, placeholder: 'Enter new password' })
        ),
        React.createElement('div', { className: 'modal-input-group' },
          React.createElement('label', null, 'Confirm New Password'),
          React.createElement('input', { type: 'password', value: confirmPassword, onChange: function(e) { setConfirmPassword(e.target.value); }, placeholder: 'Confirm new password' })
        ),
        React.createElement('button', { className: 'btn primary', onClick: handleChangePassword, disabled: loading }, loading ? 'Changing...' : 'Change Password')
      ),
      
      tab === 'danger' && React.createElement('div', { className: 'settings-content' },
        React.createElement('div', { className: 'danger-zone' },
          React.createElement('h3', null, '⚠️ Danger Zone'),
          React.createElement('p', null, 'Deleting your account will permanently remove all your data.'),
          React.createElement('button', { className: 'btn danger', onClick: handleDeleteAccount, disabled: loading }, loading ? 'Deleting...' : 'Delete My Account')
        )
      ),
      
      tab === 'theme' && React.createElement('div', { className: 'settings-content' },
        React.createElement('p', { style: { marginBottom: '12px', color: 'var(--text-secondary)' } }, 'Choose your preferred color theme'),
        React.createElement('div', { className: 'theme-grid' },
          themes.map(function(t) {
            return React.createElement('div', {
              key: t.id,
              className: 'theme-option' + (theme === t.id ? ' active' : ''),
              onClick: function() { handleSetTheme(t.id); }
            },
              React.createElement('div', { className: 'theme-swatch', style: { backgroundColor: t.color } }),
              React.createElement('span', { className: 'theme-name' }, t.name)
            );
          })
        )
      )
    )
  );
}

// ============================================
// Import Playlist Modal - Cross-room import
// ============================================
function ImportPlaylistModal(props) {
  var _rooms = useState([]);
  var rooms = _rooms[0];
  var setRooms = _rooms[1];
  
  var _loading = useState(true);
  var loading = _loading[0];
  var setLoading = _loading[1];
  
  var _selectedPlaylist = useState(null);
  var selectedPlaylist = _selectedPlaylist[0];
  var setSelectedPlaylist = _selectedPlaylist[1];
  
  var _importing = useState(false);
  var importing = _importing[0];
  var setImporting = _importing[1];
  
  var _expandedRoom = useState(null);
  var expandedRoom = _expandedRoom[0];
  var setExpandedRoom = _expandedRoom[1];

  useEffect(function() {
    api.rooms.getMyPlaylists().then(function(data) {
      // Filter out the current room
      var filteredRooms = (data.rooms || []).filter(function(r) {
        return r.id !== props.currentRoomId;
      });
      setRooms(filteredRooms);
      setLoading(false);
    }).catch(function(err) {
      console.error('Failed to load playlists:', err);
      setLoading(false);
    });
  }, []);

  function handleImport() {
    if (!selectedPlaylist) return;
    setImporting(true);
    
    api.playlists.importFromPlaylist(selectedPlaylist.id, props.currentRoomId)
      .then(function(result) {
        props.onImported(result);
        props.onClose();
      })
      .catch(function(err) {
        alert('Import failed: ' + err.message);
        setImporting(false);
      });
  }

  return React.createElement('div', { className: 'modal-overlay', onClick: function(e) { if (e.target === e.currentTarget) props.onClose(); } },
    React.createElement('div', { className: 'modal import-modal' },
      React.createElement('div', { className: 'modal-header' },
        React.createElement('h2', null, 'Import from My Rooms'),
        React.createElement('button', { className: 'modal-close', onClick: props.onClose }, '×')
      ),
      React.createElement('div', { className: 'modal-body' },
        loading 
          ? React.createElement('div', { className: 'import-loading' }, 'Loading your playlists...')
          : rooms.length === 0
            ? React.createElement('div', { className: 'import-empty' }, 
                React.createElement('p', null, 'No other rooms found.'),
                React.createElement('p', { className: 'text-muted' }, 'Create playlists in your other rooms to import them here.')
              )
            : React.createElement('div', { className: 'import-rooms-list' },
                React.createElement('p', { className: 'import-help' }, 'Select a playlist to import:'),
                rooms.map(function(room) {
                  var isExpanded = expandedRoom === room.id;
                  return React.createElement('div', { key: room.id, className: 'import-room' },
                    React.createElement('div', { 
                      className: 'import-room-header' + (isExpanded ? ' expanded' : ''),
                      onClick: function() { setExpandedRoom(isExpanded ? null : room.id); }
                    },
                      React.createElement('span', { className: 'import-room-name' }, room.name),
                      React.createElement('span', { className: 'import-room-count' }, room.playlists.length + ' playlist' + (room.playlists.length !== 1 ? 's' : '')),
                      React.createElement('span', { className: 'import-room-arrow' }, isExpanded ? '▾' : '▸')
                    ),
                    isExpanded && room.playlists.length > 0 && React.createElement('div', { className: 'import-playlists' },
                      room.playlists.map(function(playlist) {
                        var isSelected = selectedPlaylist && selectedPlaylist.id === playlist.id;
                        return React.createElement('div', { 
                          key: playlist.id, 
                          className: 'import-playlist-item' + (isSelected ? ' selected' : ''),
                          onClick: function() { setSelectedPlaylist(isSelected ? null : playlist); }
                        },
                          React.createElement('span', { className: 'import-playlist-name' }, playlist.name),
                          React.createElement('span', { className: 'import-playlist-videos' }, playlist.videoCount + ' video' + (playlist.videoCount !== 1 ? 's' : '')),
                          isSelected && React.createElement('span', { className: 'import-playlist-check' }, '✓')
                        );
                      })
                    ),
                    isExpanded && room.playlists.length === 0 && React.createElement('div', { className: 'import-playlists-empty' }, 'No playlists in this room')
                  );
                })
              )
      ),
      React.createElement('div', { className: 'modal-footer' },
        React.createElement('button', { className: 'btn secondary', onClick: props.onClose }, 'Cancel'),
        React.createElement('button', { 
          className: 'btn primary', 
          onClick: handleImport, 
          disabled: !selectedPlaylist || importing 
        }, importing ? 'Importing...' : 'Import')
      )
    )
  );
}

// ============================================
// Guest Join Modal
// ============================================
function GuestJoinModal(props) {
  var _name = useState('');
  var name = _name[0];
  var setName = _name[1];
  
  var _isReturning = useState(false);
  var isReturning = _isReturning[0];
  var setIsReturning = _isReturning[1];

  function generateGuestName() {
    return 'Guest ' + Math.floor(Math.random() * 9000 + 1000);
  }

  function handleJoin() {
    var displayName = name.trim() || generateGuestName();
    // Pass the name and whether they're claiming a returning session
    props.onJoin(displayName, isReturning);
  }

  return React.createElement('div', { className: 'modal-overlay' },
    React.createElement('div', { className: 'modal guest-modal' },
      React.createElement('div', { className: 'guest-modal-icon' }, '🐉'),
      React.createElement('h2', null, 'Join Room'),
      React.createElement('p', null, isReturning ? 'Enter your previous guest name to continue' : 'Enter a display name or join anonymously'),
      React.createElement('div', { className: 'modal-input-group' },
        React.createElement('input', { 
          type: 'text', 
          value: name, 
          onChange: function(e) { setName(e.target.value); }, 
          placeholder: isReturning ? 'Your previous guest name' : 'Your name (optional)', 
          autoFocus: true, 
          onKeyDown: function(e) { if (e.key === 'Enter') handleJoin(); } 
        })
      ),
      React.createElement('button', { className: 'btn primary', onClick: handleJoin }, 
        name.trim() ? (isReturning ? 'Continue as ' + name.trim() : 'Join as ' + name.trim()) : 'Join as Guest'
      ),
      React.createElement('div', { className: 'guest-modal-divider' }, React.createElement('span', null, 'or')),
      !isReturning 
        ? React.createElement('button', { className: 'btn secondary', onClick: function() { setIsReturning(true); } }, 'I was here before')
        : React.createElement('button', { className: 'btn secondary', onClick: function() { setIsReturning(false); setName(''); } }, 'Join as new guest'),
      React.createElement('div', { className: 'guest-modal-divider' }, React.createElement('span', null, 'or')),
      React.createElement('button', { className: 'btn secondary', onClick: props.onLogin }, 'Sign in / Create Account')
    )
  );
}

// ============================================
// Auth Screen
// ============================================
function AuthScreen(props) {
  var embedded = props.embedded;
  var suggestedName = props.suggestedName;
  
  var _mode = useState(embedded ? 'register' : 'login');
  var mode = _mode[0];
  var setMode = _mode[1];
  
  var _email = useState('');
  var email = _email[0];
  var setEmail = _email[1];
  
  var _username = useState('');
  var username = _username[0];
  var setUsername = _username[1];
  
  var _password = useState('');
  var password = _password[0];
  var setPassword = _password[1];
  
  var _displayName = useState(suggestedName || '');
  var displayName = _displayName[0];
  var setDisplayName = _displayName[1];
  
  var _error = useState('');
  var error = _error[0];
  var setError = _error[1];
  
  var _loading = useState(false);
  var loading = _loading[0];
  var setLoading = _loading[1];

  useEffect(function() {
    if (GOOGLE_CLIENT_ID && window.google) {
      window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: function(response) {
        setLoading(true);
        api.auth.googleLogin(response.credential).then(props.onAuth).catch(function(err) { setError(err.message); }).finally(function() { setLoading(false); });
      } });
    }
  }, []);

  function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    var promise = mode === 'register' ? api.auth.register(email, username || null, password, displayName) : api.auth.login(email, password);
    promise.then(props.onAuth).catch(function(err) { setError(err.message); }).finally(function() { setLoading(false); });
  }

  // Embedded mode - simpler UI for modal
  if (embedded) {
    return React.createElement('div', { className: 'auth-embedded' },
      React.createElement('h2', null, mode === 'login' ? 'Sign In' : 'Create Account'),
      React.createElement('p', { className: 'auth-subtitle' }, mode === 'login' ? 'Welcome back!' : 'Save your display name and room history'),
      error && React.createElement('div', { className: 'error-message' }, error),
      React.createElement('form', { onSubmit: handleSubmit },
        mode === 'register' && React.createElement('div', { className: 'input-group' },
          React.createElement('label', null, 'Display Name'),
          React.createElement('input', { type: 'text', value: displayName, onChange: function(e) { setDisplayName(e.target.value); }, required: true, placeholder: 'Your display name' })
        ),
        React.createElement('div', { className: 'input-group' },
          React.createElement('label', null, 'Email'),
          React.createElement('input', { type: 'email', value: email, onChange: function(e) { setEmail(e.target.value); }, required: true, placeholder: 'your@email.com' })
        ),
        React.createElement('div', { className: 'input-group' },
          React.createElement('label', null, 'Password'),
          React.createElement('input', { type: 'password', value: password, onChange: function(e) { setPassword(e.target.value); }, required: true, placeholder: mode === 'register' ? 'Create a password' : 'Your password' })
        ),
        React.createElement('button', { type: 'submit', className: 'btn primary full-width', disabled: loading }, 
          loading ? 'Please wait...' : (mode === 'login' ? 'Sign In' : 'Create Account')
        )
      ),
      React.createElement('div', { className: 'auth-switch' },
        mode === 'login' 
          ? React.createElement('span', null, "Don't have an account? ", React.createElement('button', { type: 'button', className: 'link-btn', onClick: function() { setMode('register'); setError(''); } }, 'Sign up'))
          : React.createElement('span', null, 'Already have an account? ', React.createElement('button', { type: 'button', className: 'link-btn', onClick: function() { setMode('login'); setError(''); } }, 'Sign in'))
      )
    );
  }

  return React.createElement('div', { className: 'auth-screen' },
    React.createElement(DragonFire, null),
    React.createElement('div', { className: 'auth-container' },
      React.createElement('div', { className: 'logo-section' },
        React.createElement('span', { className: 'logo-icon' }, '🐉'),
        React.createElement('h1', { className: 'logo' }, 'Multiview'),
        React.createElement('p', { className: 'tagline' }, 'Watch together, anywhere')
      ),
      React.createElement('div', { className: 'auth-box' },
        React.createElement('h2', null, mode === 'login' ? 'Welcome back' : 'Create account'),
        error && React.createElement('div', { className: 'error-message' }, error),
        React.createElement('form', { onSubmit: handleSubmit },
          mode === 'register' && React.createElement('div', { className: 'input-group' },
            React.createElement('label', null, 'Display Name'),
            React.createElement('input', { type: 'text', value: displayName, onChange: function(e) { setDisplayName(e.target.value); }, required: true })
          ),
          React.createElement('div', { className: 'input-group' },
            React.createElement('label', null, mode === 'register' ? 'Email' : 'Email or Username'),
            React.createElement('input', { type: mode === 'register' ? 'email' : 'text', value: email, onChange: function(e) { setEmail(e.target.value); }, required: true })
          ),
          mode === 'register' && React.createElement('div', { className: 'input-group' },
            React.createElement('label', null, 'Username (optional)'),
            React.createElement('input', { type: 'text', value: username, onChange: function(e) { setUsername(e.target.value); } })
          ),
          React.createElement('div', { className: 'input-group' },
            React.createElement('label', null, 'Password'),
            React.createElement('input', { type: 'password', value: password, onChange: function(e) { setPassword(e.target.value); }, required: true, minLength: 6 })
          ),
          React.createElement('button', { type: 'submit', className: 'auth-submit', disabled: loading }, loading ? 'Please wait...' : (mode === 'login' ? 'Sign in' : 'Create account'))
        ),
        React.createElement('div', { className: 'auth-divider' }, React.createElement('span', null, 'or')),
        React.createElement('button', { type: 'button', className: 'google-btn', onClick: function() { if (window.google) window.google.accounts.id.prompt(); } },
          React.createElement('svg', { viewBox: '0 0 24 24', width: 18, height: 18 },
            React.createElement('path', { fill: '#4285F4', d: 'M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z' }),
            React.createElement('path', { fill: '#34A853', d: 'M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z' }),
            React.createElement('path', { fill: '#FBBC05', d: 'M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z' }),
            React.createElement('path', { fill: '#EA4335', d: 'M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z' })
          ),
          'Continue with Google'
        ),
        React.createElement('div', { className: 'auth-links' },
          mode === 'login' 
            ? React.createElement(React.Fragment, null, React.createElement('span', null, 'New here? '), React.createElement('button', { type: 'button', onClick: function() { setMode('register'); setError(''); } }, 'Create account'))
            : React.createElement(React.Fragment, null, React.createElement('span', null, 'Have an account? '), React.createElement('button', { type: 'button', onClick: function() { setMode('login'); setError(''); } }, 'Sign in'))
        )
      )
    )
  );
}

// ============================================
// Home Page
// ============================================
function HomePage(props) {
  var user = props.user;
  
  var _rooms = useState([]);
  var rooms = _rooms[0];
  var setRooms = _rooms[1];
  
  var _visitedRooms = useState([]);
  var visitedRooms = _visitedRooms[0];
  var setVisitedRooms = _visitedRooms[1];
  
  var _craftRooms = useState([]);
  var craftRooms = _craftRooms[0];
  var setCraftRooms = _craftRooms[1];
  
  var _showCreate = useState(false);
  var showCreate = _showCreate[0];
  var setShowCreate = _showCreate[1];
  
  var _newRoomName = useState('');
  var newRoomName = _newRoomName[0];
  var setNewRoomName = _newRoomName[1];
  
  var _showCreateCraft = useState(false);
  var showCreateCraft = _showCreateCraft[0];
  var setShowCreateCraft = _showCreateCraft[1];
  
  var _newCraftName = useState('');
  var newCraftName = _newCraftName[0];
  var setNewCraftName = _newCraftName[1];
  
  var _editingRoom = useState(null);
  var editingRoom = _editingRoom[0];
  var setEditingRoom = _editingRoom[1];
  
  var _editName = useState('');
  var editName = _editName[0];
  var setEditName = _editName[1];
  
  var _editingCraftRoom = useState(null);
  var editingCraftRoom = _editingCraftRoom[0];
  var setEditingCraftRoom = _editingCraftRoom[1];
  
  var _editCraftName = useState('');
  var editCraftName = _editCraftName[0];
  var setEditCraftName = _editCraftName[1];
  
  var _settingsOpen = useState(false);
  var settingsOpen = _settingsOpen[0];
  var setSettingsOpen = _settingsOpen[1];
  
  var _notification = useState(null);
  var notification = _notification[0];
  var setNotification = _notification[1];
  
  var _loading = useState(true);
  var loading = _loading[0];
  var setLoading = _loading[1];

  useEffect(function() { loadRooms(); }, []);

  function loadRooms() {
    setLoading(true);
    Promise.all([
      api.rooms.list().then(function(r) {
        if (!r || r.length === 0) return api.rooms.create('My Room').then(function(room) { return [room]; });
        return r;
      }).catch(function(err) { 
        console.error('Error loading rooms:', err);
        return []; 
      }),
      api.rooms.getVisited().catch(function(err) { 
        console.error('Error loading visited rooms:', err);
        return []; 
      }),
      api.craftRooms.list().catch(function(err) {
        console.error('Error loading craft rooms:', err);
        return [];
      })
    ]).then(function(results) {
      setRooms(results[0] || []);
      setVisitedRooms(results[1] || []);
      setCraftRooms(results[2] || []);
    }).catch(function(err) {
      console.error('Error in loadRooms:', err);
    }).finally(function() { setLoading(false); });
  }

  function showNotif(msg, type) {
    setNotification({ message: msg, type: type || 'success' });
    setTimeout(function() { setNotification(null); }, 3000);
  }

  function createRoom() {
    if (!newRoomName.trim()) return;
    api.rooms.create(newRoomName.trim()).then(function(room) {
      setRooms(rooms.concat([room]));
      setNewRoomName('');
      setShowCreate(false);
      showNotif('Room created!');
    });
  }
  
  function createCraftRoom() {
    if (!newCraftName.trim()) return;
    api.craftRooms.create(newCraftName.trim()).then(function(room) {
      // Add owner info so card renders correctly
      room.owner_name = user.displayName || user.username;
      room.member_count = 1;
      room.online_count = 0;
      setCraftRooms(craftRooms.concat([room]));
      setNewCraftName('');
      setShowCreateCraft(false);
      showNotif('Craft room created!');
    });
  }

  function renameRoom(roomId) {
    if (!editName.trim()) return;
    api.rooms.update(roomId, { name: editName.trim() }).then(function() {
      setRooms(rooms.map(function(r) { return r.id === roomId ? Object.assign({}, r, { name: editName.trim() }) : r; }));
      setEditingRoom(null);
      showNotif('Renamed!');
    });
  }
  
  function renameCraftRoom(roomId) {
    if (!editCraftName.trim()) return;
    api.craftRooms.rename(roomId, editCraftName.trim()).then(function() {
      setCraftRooms(craftRooms.map(function(r) { return r.id === roomId ? Object.assign({}, r, { name: editCraftName.trim() }) : r; }));
      setEditingCraftRoom(null);
      showNotif('Renamed!');
    });
  }

  function deleteRoom(roomId) {
    if (!confirm('Delete this room?')) return;
    api.rooms.delete(roomId).then(function() {
      setRooms(rooms.filter(function(r) { return r.id !== roomId; }));
      showNotif('Deleted!', 'warning');
    });
  }
  
  function deleteCraftRoom(roomId) {
    if (!confirm('Delete this craft room and all its data?')) return;
    api.craftRooms.delete(roomId).then(function() {
      setCraftRooms(craftRooms.filter(function(r) { return r.id !== roomId; }));
      showNotif('Deleted!', 'warning');
    });
  }

  function copyShareLink(roomId) {
    navigator.clipboard.writeText(location.origin + location.pathname + '#/room/' + user.id + '/' + roomId);
    showNotif('Link copied!');
  }
  
  function copyCraftShareLink(roomId, ownerId) {
    navigator.clipboard.writeText(location.origin + '/craft.html#/room/' + ownerId + '/' + roomId);
    showNotif('Craft room link copied!');
  }

  function enterVisitedRoom(room) {
    location.hash = '/room/' + room.ownerId + '/' + room.id;
    props.onEnterRoom(room, room.ownerId);
  }

  function removeVisitedRoom(roomId) {
    api.rooms.removeVisited(roomId).then(function() {
      setVisitedRooms(visitedRooms.filter(function(r) { return r.id !== roomId; }));
      showNotif('Removed from history');
    }).catch(function(err) {
      showNotif('Failed to remove', 'error');
    });
  }

  function formatTimeAgo(dateStr) {
    if (!dateStr) return '';
    var date = new Date(dateStr);
    var now = new Date();
    var diffMs = now - date;
    var diffMins = Math.floor(diffMs / 60000);
    var diffHours = Math.floor(diffMs / 3600000);
    var diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return diffMins + 'm ago';
    if (diffHours < 24) return diffHours + 'h ago';
    if (diffDays < 7) return diffDays + 'd ago';
    return date.toLocaleDateString();
  }

  if (loading) {
    return React.createElement('div', { className: 'home-page' },
      React.createElement(DragonFire, null),
      React.createElement('div', { className: 'loading-screen' },
        React.createElement('div', { className: 'loading-dragon' }, '🐉'),
        React.createElement('div', { className: 'loading-text' }, 'Loading...')
      )
    );
  }

  return React.createElement('div', { className: 'home-page' },
    React.createElement(DragonFire, null),
    React.createElement('header', { className: 'home-header' },
      React.createElement('div', { className: 'logo-small' }, React.createElement('span', { className: 'dragon-icon' }, '🐉'), React.createElement('span', null, 'Multiview')),
      React.createElement('div', { className: 'home-header-right' },
        React.createElement('a', { className: 'btn', href: '/desktop.html', target: '_blank', rel: 'noopener noreferrer', title: 'Download the Multiview desktop app' }, React.createElement(Icon, { name: 'download', size: 'sm' }), ' Desktop App'),
        React.createElement(UserMenu, { user: user, onSettings: function() { setSettingsOpen(true); }, onLogout: props.onLogout })
      )
    ),
    React.createElement('main', { className: 'home-content' },
      React.createElement('div', { className: 'home-welcome' },
        React.createElement('h1', null, 'Welcome, ' + user.displayName),
        React.createElement('p', null, 'Watch together and craft adventures with friends')
      ),
      
      // ─── 3-Column Layout ───
      React.createElement('div', { className: 'rooms-columns' },
        
        // ─── Video Rooms Column ───
        React.createElement('div', { className: 'rooms-section video-rooms-section' },
          React.createElement('div', { className: 'rooms-header' },
            React.createElement('h2', null, 'Video Rooms'),
            React.createElement('button', { className: 'btn primary', onClick: function() { setShowCreate(true); } }, React.createElement(Icon, { name: 'plus', size: 'sm' }), ' New Room')
          ),
          showCreate && React.createElement('div', { className: 'create-room-form' },
            React.createElement('input', { type: 'text', value: newRoomName, onChange: function(e) { setNewRoomName(e.target.value); }, placeholder: 'Room name', autoFocus: true, onKeyDown: function(e) { if (e.key === 'Enter') createRoom(); } }),
            React.createElement('button', { className: 'btn primary', onClick: createRoom }, 'Create'),
            React.createElement('button', { className: 'btn', onClick: function() { setShowCreate(false); } }, 'Cancel')
          ),
          rooms.length === 0 && !showCreate && React.createElement('div', { className: 'empty-section' },
            'Create a Video Room to watch together with friends'
          ),
          React.createElement('div', { className: 'rooms-grid' },
            rooms.map(function(room) {
              return React.createElement('div', { key: room.id, className: 'room-card video-card' },
                React.createElement('div', { className: 'room-card-content' },
                  editingRoom === room.id 
                    ? React.createElement('input', { type: 'text', value: editName, onChange: function(e) { setEditName(e.target.value); }, onBlur: function() { renameRoom(room.id); }, onKeyDown: function(e) { if (e.key === 'Enter') renameRoom(room.id); if (e.key === 'Escape') setEditingRoom(null); }, autoFocus: true, className: 'room-edit-input' })
                    : React.createElement('h3', null, room.name),
                  React.createElement('div', { className: 'room-meta' },
                    React.createElement('span', { className: 'room-owner' }, 'Owner'),
                    room.onlineCount > 0 && React.createElement('span', { className: 'online-badge' }, room.onlineCount + ' online')
                  ),
                  React.createElement('div', { className: 'room-card-actions' },
                    React.createElement('button', { className: 'btn primary', onClick: function() { props.onEnterRoom(room); } }, React.createElement(Icon, { name: 'enter', size: 'sm' }), ' Enter'),
                    React.createElement('button', { className: 'icon-btn', onClick: function() { copyShareLink(room.id); }, title: 'Share' }, React.createElement(Icon, { name: 'share', size: 'sm' })),
                    React.createElement('button', { className: 'icon-btn', onClick: function() { setEditingRoom(room.id); setEditName(room.name); }, title: 'Rename' }, React.createElement(Icon, { name: 'edit', size: 'sm' })),
                    React.createElement('button', { className: 'icon-btn danger', onClick: function() { deleteRoom(room.id); }, title: 'Delete' }, React.createElement(Icon, { name: 'trash', size: 'sm' }))
                  )
                )
              );
            })
          )
        ),
        
        // ─── Craft Rooms Column ───
        React.createElement('div', { className: 'rooms-section craft-rooms-section' },
          React.createElement('div', { className: 'rooms-header' },
            React.createElement('h2', null, 'Craft Rooms'),
            React.createElement('button', { className: 'btn primary', onClick: function() { setShowCreateCraft(true); } }, React.createElement(Icon, { name: 'plus', size: 'sm' }), ' New Craft Room')
          ),
          showCreateCraft && React.createElement('div', { className: 'create-room-form' },
            React.createElement('input', { type: 'text', value: newCraftName, onChange: function(e) { setNewCraftName(e.target.value); }, placeholder: 'Craft room name', autoFocus: true, onKeyDown: function(e) { if (e.key === 'Enter') createCraftRoom(); } }),
            React.createElement('button', { className: 'btn primary', onClick: createCraftRoom }, 'Create'),
            React.createElement('button', { className: 'btn', onClick: function() { setShowCreateCraft(false); } }, 'Cancel')
          ),
          craftRooms.length === 0 && !showCreateCraft && React.createElement('div', { className: 'empty-section' },
            'Create a Craft Room for character sheets, writing, soundscapes, and more'
          ),
          React.createElement('div', { className: 'rooms-grid' },
            craftRooms.map(function(room) {
              var isMine = room.owner_id === user.id;
              return React.createElement('div', { key: room.id, className: 'room-card craft-card' },
                React.createElement('div', { className: 'room-card-content' },
                  editingCraftRoom === room.id
                    ? React.createElement('input', { type: 'text', value: editCraftName, onChange: function(e) { setEditCraftName(e.target.value); }, onBlur: function() { renameCraftRoom(room.id); }, onKeyDown: function(e) { if (e.key === 'Enter') renameCraftRoom(room.id); if (e.key === 'Escape') setEditingCraftRoom(null); }, autoFocus: true, className: 'room-edit-input' })
                    : React.createElement('h3', { className: 'craft-card-title' }, room.name),
                  React.createElement('div', { className: 'room-meta' },
                    isMine
                      ? React.createElement('span', { className: 'room-owner' }, 'Owner')
                      : React.createElement('span', { className: 'room-joined-badge' }, 'Joined'),
                    !isMine && React.createElement('span', { className: 'room-owner' }, 'by ' + (room.owner_name || 'Unknown')),
                    parseInt(room.online_count) > 0 && React.createElement('span', { className: 'online-badge' }, room.online_count + ' online')
                  ),
                  React.createElement('div', { className: 'room-card-actions' },
                    React.createElement('button', { className: 'btn primary', onClick: function() { window.location.href = '/craft.html#/room/' + (room.owner_id || user.id) + '/' + room.id; } }, React.createElement(Icon, { name: 'enter', size: 'sm' }), ' Enter'),
                    React.createElement('button', { className: 'icon-btn', onClick: function() { copyCraftShareLink(room.id, room.owner_id || user.id); }, title: 'Share' }, React.createElement(Icon, { name: 'share', size: 'sm' })),
                    isMine && React.createElement('button', { className: 'icon-btn', onClick: function() { setEditingCraftRoom(room.id); setEditCraftName(room.name); }, title: 'Rename' }, React.createElement(Icon, { name: 'edit', size: 'sm' })),
                    isMine && React.createElement('button', { className: 'icon-btn danger', onClick: function() { deleteCraftRoom(room.id); }, title: 'Delete' }, React.createElement(Icon, { name: 'trash', size: 'sm' }))
                  )
                )
              );
            })
          )
        ),
        
        // ─── Recently Visited Column (only if has rooms) ───
        visitedRooms.length > 0 && React.createElement('div', { className: 'rooms-section visited-rooms-section' },
          React.createElement('div', { className: 'rooms-header' },
            React.createElement('h2', null, 'Recently Visited')
          ),
          React.createElement('div', { className: 'rooms-grid' },
            visitedRooms.map(function(room) {
              return React.createElement('div', { key: room.id, className: 'room-card visited-card' },
                React.createElement('div', { className: 'room-card-content' },
                  React.createElement('h3', null, room.name),
                  React.createElement('div', { className: 'room-meta' },
                    React.createElement('span', { className: 'room-owner' }, 'by ' + room.ownerName),
                    room.onlineCount > 0 && React.createElement('span', { className: 'online-badge' }, room.onlineCount + ' online'),
                    React.createElement('span', { className: 'last-visited' }, formatTimeAgo(room.lastVisited))
                  ),
                  React.createElement('div', { className: 'room-card-actions' },
                    React.createElement('button', { className: 'btn primary', onClick: function() { enterVisitedRoom(room); } }, React.createElement(Icon, { name: 'enter', size: 'sm' }), ' Join'),
                    React.createElement('button', { className: 'icon-btn danger', onClick: function() { removeVisitedRoom(room.id); }, title: 'Remove from history' }, React.createElement(Icon, { name: 'x', size: 'sm' }))
                  )
                )
              );
            })
          )
        )
      )
    ),
    settingsOpen && React.createElement(SettingsModal, { user: user, onClose: function() { setSettingsOpen(false); }, onUpdate: props.onUpdateUser, onLogout: props.onLogout }),
    notification && React.createElement('div', { className: 'notification ' + notification.type }, notification.message)
  );
}

// ============================================
// Room Component with Synchronized Playback
// ============================================
function Room(props) {
  var user = props.user;
  var room = props.room;
  var hostId = props.hostId;
  var guestDisplayName = props.guestDisplayName;
  var onKicked = props.onKicked;
  
  var _roomLoading = useState(true);
  var roomLoading = _roomLoading[0];
  var setRoomLoading = _roomLoading[1];
  
  var _playlists = useState([]);
  var playlists = _playlists[0];
  var setPlaylists = _playlists[1];
  
  var _activePlaylist = useState(null);
  var activePlaylist = _activePlaylist[0];
  var setActivePlaylist = _activePlaylist[1];
  var activePlaylistIdRef = useRef(null); // Track active playlist ID persistently
  
  var _copiedVideo = useState(null);
  var copiedVideo = _copiedVideo[0];
  var setCopiedVideo = _copiedVideo[1];
  
  var _queueContextMenu = useState(null);
  var queueContextMenu = _queueContextMenu[0];
  var setQueueContextMenu = _queueContextMenu[1];
  
  var _isPlaylistOwner = useState(false);
  var isPlaylistOwner = _isPlaylistOwner[0];
  var setIsPlaylistOwner = _isPlaylistOwner[1];
  
  var _currentVideo = useState(null);
  var currentVideo = _currentVideo[0];
  var setCurrentVideo = _currentVideo[1];
  
  var _currentIndex = useState(-1);
  var currentIndex = _currentIndex[0];
  var setCurrentIndex = _currentIndex[1];
  
  var _playbackState = useState('paused');
  var playbackState = _playbackState[0];
  var setPlaybackState = _playbackState[1];
  
  var _playbackTime = useState(0);
  var playbackTime = _playbackTime[0];
  var setPlaybackTime = _playbackTime[1];
  
  var _urlInput = useState('');
  var urlInput = _urlInput[0];
  var setUrlInput = _urlInput[1];
  
  var _uploading = useState(false);
  var uploading = _uploading[0];
  var setUploading = _uploading[1];
  
  var _uploadProgress = useState(0);
  var uploadProgress = _uploadProgress[0];
  var setUploadProgress = _uploadProgress[1];
  
  var fileInputRef = useRef(null);
  
  var _sidebarOpen = useState(window.innerWidth > 768);
  var sidebarOpen = _sidebarOpen[0];
  var setSidebarOpen = _sidebarOpen[1];
  
  var _mobileQueueOpen = useState(false);
  var mobileQueueOpen = _mobileQueueOpen[0];
  var setMobileQueueOpen = _mobileQueueOpen[1];
  
  var _mobileNotesOpen = useState(false);
  var mobileNotesOpen = _mobileNotesOpen[0];
  var setMobileNotesOpen = _mobileNotesOpen[1];
  
  var _roomName = useState(room.name);
  var roomName = _roomName[0];
  var setRoomName = _roomName[1];
  
  var _editingRoomName = useState(false);
  var editingRoomName = _editingRoomName[0];
  var setEditingRoomName = _editingRoomName[1];
  
  var _roomNameInput = useState('');
  var roomNameInput = _roomNameInput[0];
  var setRoomNameInput = _roomNameInput[1];
  
  var _shareModalOpen = useState(false);
  var shareModalOpen = _shareModalOpen[0];
  var setShareModalOpen = _shareModalOpen[1];
  
  var _settingsOpen = useState(false);
  var settingsOpen = _settingsOpen[0];
  var setSettingsOpen = _settingsOpen[1];
  
  var _connectedPanelOpen = useState(false);
  var connectedPanelOpen = _connectedPanelOpen[0];
  var setConnectedPanelOpen = _connectedPanelOpen[1];
  
  var _showAuthModal = useState(false);
  var showAuthModal = _showAuthModal[0];
  var setShowAuthModal = _showAuthModal[1];
  
  var _showImportModal = useState(false);
  var showImportModal = _showImportModal[0];
  var setShowImportModal = _showImportModal[1];
  
  var _notification = useState(null);
  var notification = _notification[0];
  var setNotification = _notification[1];
  
  var _autoplay = useState(true);
  var autoplay = _autoplay[0];
  var setAutoplay = _autoplay[1];
  
  var _shuffle = useState(false);
  var shuffle = _shuffle[0];
  var setShuffle = _shuffle[1];
  
  var _loop = useState(false);
  var loop = _loop[0];
  var setLoop = _loop[1];
  
  // Notes panel (right side panel for current video notes)
  var _notesPanelOpen = useState(false);
  var notesPanelOpen = _notesPanelOpen[0];
  var setNotesPanelOpen = _notesPanelOpen[1];
  
  // Note: Per-video notes hiding is now stored in each video object (video.notesHidden)
  // No room-level hideNotes state needed
  
  // Sort mode for queue (null = manual, 'alpha' = alphabetical A-Z, 'alpha-desc' = Z-A)
  var _queueSortMode = useState(null);
  var queueSortMode = _queueSortMode[0];
  var setQueueSortMode = _queueSortMode[1];
  
  // Personal volume control (0-100, not synced to room)
  var _volume = useState(parseInt(localStorage.getItem('multiview_volume') || '100', 10));
  var volume = _volume[0];
  var setVolume = _volume[1];
  
  // Refs to track latest toggle values for use in callbacks
  var autoplayRef = useRef(autoplay);
  var shuffleRef = useRef(shuffle);
  var loopRef = useRef(loop);
  
  // Refs for playlist state (avoid stale closures in callbacks)
  var activePlaylistRef = useRef(activePlaylist);
  var currentIndexRef = useRef(currentIndex);
  var currentVideoRef = useRef(currentVideo);
  var handleVideoEndedRef = useRef(null);
  
  // Keep refs updated when state changes
  useEffect(function() { autoplayRef.current = autoplay; }, [autoplay]);
  useEffect(function() { shuffleRef.current = shuffle; }, [shuffle]);
  useEffect(function() { loopRef.current = loop; }, [loop]);
  useEffect(function() { activePlaylistRef.current = activePlaylist; }, [activePlaylist]);
  useEffect(function() { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(function() { currentVideoRef.current = currentVideo; }, [currentVideo]);
  
  // Save volume to localStorage and apply to player
  useEffect(function() {
    localStorage.setItem('multiview_volume', volume.toString());
    // Apply volume to YouTube player
    if (globalYTPlayer.player && globalYTPlayer.isReady) {
      try {
        globalYTPlayer.player.setVolume(volume);
      } catch (e) {}
    }
  }, [volume]);
  
  // Sync global playlist options for background playback
  useEffect(function() {
    globalPlaylist.setOptions(autoplay, shuffle, loop);
    console.log('GlobalPlaylist: Options updated - autoplay:', autoplay, 'shuffle:', shuffle, 'loop:', loop);
  }, [autoplay, shuffle, loop]);
  
  // Broadcast playback options when changed (only if not during initial sync)
  function updatePlaybackOptions(newAutoplay, newShuffle, newLoop) {
    api.rooms.updateOptions(room.id, {
      autoplay: newAutoplay,
      shuffle: newShuffle,
      loop: newLoop
    }).catch(console.error);
  }
  
  // Sync global playlist videos when active playlist changes
  useEffect(function() {
    if (activePlaylist && activePlaylist.videos) {
      globalPlaylist.setPlaylist(activePlaylist.videos, currentIndex);
    } else {
      globalPlaylist.setPlaylist([], -1);
    }
  }, [activePlaylist]);
  
  // Sync global playlist index when current index changes
  useEffect(function() {
    globalPlaylist.setIndex(currentIndex);
  }, [currentIndex]);
  
  // Set up global callback to sync React state when video changes in background
  useEffect(function() {
    globalPlaylist.onVideoChange = function(video, index) {
      console.log('GlobalPlaylist: Video changed, tab visible:', document.visibilityState === 'visible');
      
      // Store pending change - DON'T sync React state immediately in background
      // React state updates cause re-renders which recreate the YouTube player
      globalPlaylist.pendingVideo = video;
      globalPlaylist.pendingIndex = index;
      
      // Only sync React state if tab is visible
      if (document.visibilityState === 'visible') {
        console.log('GlobalPlaylist: Tab visible, syncing React state immediately');
        setCurrentVideo(video);
        setCurrentIndex(index);
        setPlaybackState('playing');
        setPlaybackTime(0);
        broadcastState(video, 'playing', 0);
        globalPlaylist.pendingVideo = null;
        globalPlaylist.pendingIndex = null;
      } else {
        console.log('GlobalPlaylist: Tab hidden, deferring React state sync');
        // Broadcast to other users even in background (for sync)
        broadcastState(video, 'playing', 0);
      }
    };
    
    // Sync pending changes when tab becomes visible
    function syncPendingChanges() {
      if (document.visibilityState === 'visible' && globalPlaylist.pendingVideo) {
        console.log('GlobalPlaylist: Tab visible, syncing pending video change');
        var video = globalPlaylist.pendingVideo;
        var index = globalPlaylist.pendingIndex;
        globalPlaylist.pendingVideo = null;
        globalPlaylist.pendingIndex = null;
        
        setCurrentVideo(video);
        setCurrentIndex(index);
        setPlaybackState('playing');
        // Don't set time to 0 - get current time from player
        if (globalYTPlayer.player && globalYTPlayer.isReady) {
          try {
            var currentTime = globalYTPlayer.player.getCurrentTime();
            setPlaybackTime(currentTime);
          } catch (e) {
            setPlaybackTime(0);
          }
        }
      }
    }
    
    document.addEventListener('visibilitychange', syncPendingChanges);
    
    globalYTPlayer.onVideoEndCallback = function() {
      if (handleVideoEndedRef.current) {
        handleVideoEndedRef.current();
      }
    };
    return function() {
      globalPlaylist.onVideoChange = null;
      globalPlaylist.pendingVideo = null;
      globalPlaylist.pendingIndex = null;
      globalYTPlayer.onVideoEndCallback = null;
      document.removeEventListener('visibilitychange', syncPendingChanges);
    };
  }, []);
  
  // Close queue context menu on click
  useEffect(function() {
    function closeQueueMenu() { setQueueContextMenu(null); }
    document.addEventListener('click', closeQueueMenu);
    return function() { document.removeEventListener('click', closeQueueMenu); };
  }, []);
  
  var _connectedUsers = useState([]);
  var connectedUsers = _connectedUsers[0];
  var setConnectedUsers = _connectedUsers[1];
  
  var syncInterval = useRef(null);
  var lastLocalChange = useRef(0);
  var pendingBroadcast = useRef(null); // Queue broadcast during initial sync

  var visitorId = user ? user.id : api.getGuestId();
  var isOwner = user && user.id === hostId;
  var displayName = guestDisplayName || (user ? user.displayName : 'Guest');

  // Track current video ID to prevent re-renders
  var currentVideoIdRef = useRef(null);
  var lastSyncedState = useRef(null);
  var lastSyncedTime = useRef(0);
  var isInitialSync = useRef(true); // Prevent broadcasting during initial join
  var hasConfirmedJoin = useRef(false); // Only check kicks after confirmed in room
  var joinTime = useRef(Date.now()); // Track when we joined
  var hasInitialVideoSync = useRef(false); // Ensure first video sync always applies

  // Pause video when no users are connected (room is empty)
  useEffect(function() {
    // Only check after initial sync has happened
    if (!hasConfirmedJoin.current) return;
    
    // If no users connected, pause the video locally
    // Don't broadcast - this is just a local safeguard
    if (connectedUsers.length === 0) {
      console.log('Room empty - pausing video locally');
      if (globalYTPlayer.player && globalYTPlayer.isReady) {
        try {
          globalYTPlayer.player.pauseVideo();
        } catch (e) {}
      }
      setPlaybackState('paused');
    }
  }, [connectedUsers]);

  function syncRoomState() {
    api.rooms.getSync(room.id).then(function(data) {
      // Check if current user is in room
      if (data.members) {
        var stillInRoom = data.members.some(function(m) {
          var visId = m.visitorId || m.guestId;
          return visId === visitorId;
        });
        
        if (stillInRoom) {
          // User is in room, confirm join
          hasConfirmedJoin.current = true;
        } else if (hasConfirmedJoin.current && (Date.now() - joinTime.current > 10000)) {
          // User was confirmed in room but is no longer there, and it has been > 10 seconds since join
          // This means they were kicked
          console.log('You have been kicked from the room');
          if (onKicked) onKicked();
          return;
        }
        // If not confirmed yet and not in list, just wait - still joining
        
        setConnectedUsers(data.members);
        
        // Note: Removed auto-pause when room empty - it was causing issues
        // when owner rejoins (their presence is not registered yet on first sync)
      }
      
      if (data.playlists) {
        setPlaylists(data.playlists);
        if (data.isPlaylistOwner !== undefined) {
          setIsPlaylistOwner(data.isPlaylistOwner);
        }
        
        // Sync notes to currentVideo from ANY playlist (not just active)
        // This ensures notes sync even when user hasn't selected a playlist
        if (currentVideoRef.current && data.playlists.length > 0) {
          var freshVideo = null;
          
          // Search all playlists for the current video
          for (var pIdx = 0; pIdx < data.playlists.length && !freshVideo; pIdx++) {
            var pVideos = data.playlists[pIdx].videos || [];
            
            // Try to find by ID first
            if (currentVideoRef.current.id && currentVideoRef.current.id.length > 30) {
              freshVideo = pVideos.find(function(v) { return v.id === currentVideoRef.current.id; });
            }
            
            // Try by URL
            if (!freshVideo && currentVideoRef.current.url) {
              freshVideo = pVideos.find(function(v) { return v.url === currentVideoRef.current.url; });
            }
            
            // Try by video ID match
            if (!freshVideo && currentVideoRef.current.url) {
              var currentParsed = parseVideoUrl(currentVideoRef.current.url);
              if (currentParsed) {
                freshVideo = pVideos.find(function(v) {
                  var vParsed = parseVideoUrl(v.url);
                  return vParsed && vParsed.id === currentParsed.id;
                });
              }
            }
          }
          
          if (freshVideo) {
            // Check if we need to update currentVideo
            var needsUpdate = false;
            
            // Missing DB ID - update with full object
            if (!currentVideoRef.current.id || currentVideoRef.current.id.length < 30) {
              console.log('>>> Updating currentVideo with full DB object');
              setCurrentVideo(freshVideo);
              needsUpdate = true;
            } else {
              // Check for notes/visibility changes
              var currentNotes = currentVideoRef.current.notes || '';
              var freshNotes = freshVideo.notes || '';
              var currentUpdatedBy = currentVideoRef.current.notesUpdatedBy || '';
              var freshUpdatedBy = freshVideo.notesUpdatedBy || '';
              var currentHidden = currentVideoRef.current.notesHidden || false;
              var freshHidden = freshVideo.notesHidden || false;
              
              if (currentNotes !== freshNotes || currentUpdatedBy !== freshUpdatedBy || currentHidden !== freshHidden) {
                console.log('>>> Syncing notes - content changed:', currentNotes !== freshNotes, 'editor:', currentUpdatedBy, '->', freshUpdatedBy, 'hidden:', currentHidden, '->', freshHidden);
                setCurrentVideo(Object.assign({}, currentVideoRef.current, { 
                  notes: freshVideo.notes,
                  notesUpdatedBy: freshVideo.notesUpdatedBy,
                  notesUpdatedAt: freshVideo.notesUpdatedAt,
                  notesHidden: freshVideo.notesHidden
                }));
              }
            }
          }
        }
        
        // Use ref to reliably track which playlist should be active
        var targetId = activePlaylistIdRef.current;
        if (targetId) {
          var updated = data.playlists.find(function(p) { return p.id === targetId; });
          if (updated) {
            setActivePlaylist(updated);
          }
          // If playlist was deleted, clear the ref and selection
          else {
            activePlaylistIdRef.current = null;
            setActivePlaylist(null);
          }
        }
        // Do not auto-select - let user choose
      }
      
      // Skip sync if we made a local change recently
      // BUT always allow the first video sync to happen
      var timeSinceLocalChange = Date.now() - (lastLocalChange.current || 0);
      if (timeSinceLocalChange < 2000 && hasInitialVideoSync.current) {
        return;
      }
      
      // Sync from server
      if (data.room) {
        // Sync room name
        if (data.room.name && data.room.name !== roomName) {
          setRoomName(data.room.name);
        }
        
        // Sync playback options (autoplay, shuffle, loop) from server
        if (data.room.autoplay !== undefined && data.room.autoplay !== autoplay) {
          setAutoplay(data.room.autoplay);
        }
        if (data.room.shuffle !== undefined && data.room.shuffle !== shuffle) {
          setShuffle(data.room.shuffle);
        }
        if (data.room.loop !== undefined && data.room.loop !== loop) {
          setLoop(data.room.loop);
        }
        
        // Sync active playlist from server (only if we don't have one selected locally)
        // This ensures new users joining see the same playlist the room is using
        if (data.room.currentPlaylistId && data.playlists) {
          var serverPlaylistId = data.room.currentPlaylistId;
          // Only sync if we haven't selected a playlist yet, or if the server has a different one
          // and we made no recent local change
          if (!activePlaylistIdRef.current || 
              (serverPlaylistId !== activePlaylistIdRef.current && timeSinceLocalChange >= 2000)) {
            var serverPlaylist = data.playlists.find(function(p) { return p.id === serverPlaylistId; });
            if (serverPlaylist) {
              console.log('>>> SYNCING PLAYLIST from server:', serverPlaylist.name);
              activePlaylistIdRef.current = serverPlaylistId;
              setActivePlaylist(serverPlaylist);
            }
          }
        }
        
        var serverUrl = data.room.currentVideoUrl;
        var serverState = data.room.playbackState || 'paused';
        var serverTime = data.room.playbackTime || 0;
        
        if (serverUrl) {
          // Extract video ID for comparison
          var serverParsed = parseVideoUrl(serverUrl);
          var serverVideoId = serverParsed ? serverParsed.id : serverUrl;
          
          // Only update video if ID actually changed
          if (serverVideoId !== currentVideoIdRef.current) {
            console.log('>>> NEW VIDEO:', serverVideoId, 'state:', serverState, 'time:', serverTime.toFixed(1));
            currentVideoIdRef.current = serverVideoId;
            lastSyncedState.current = serverState;
            lastSyncedTime.current = serverTime;
            
            // Try to find the actual video object from playlists to get database UUID
            // Match by URL or by extracted video ID (handles different YouTube URL formats)
            var foundVideo = null;
            if (data.playlists) {
              for (var pi = 0; pi < data.playlists.length && !foundVideo; pi++) {
                var pVideos = data.playlists[pi].videos || [];
                for (var vi = 0; vi < pVideos.length; vi++) {
                  var pv = pVideos[vi];
                  // Try exact URL match first
                  if (pv.url === serverUrl) {
                    foundVideo = pv;
                    break;
                  }
                  // Also try matching by extracted video ID (handles different URL formats)
                  var pvParsed = parseVideoUrl(pv.url);
                  if (pvParsed && pvParsed.id === serverVideoId) {
                    foundVideo = pv;
                    break;
                  }
                }
              }
            }
            
            if (foundVideo) {
              console.log('>>> Found video in playlist with DB id:', foundVideo.id);
              setCurrentVideo(foundVideo);
              // Update index if this video is in active playlist
              if (activePlaylistRef.current && activePlaylistRef.current.videos) {
                var foundIdx = activePlaylistRef.current.videos.findIndex(function(v) { return v.id === foundVideo.id; });
                if (foundIdx >= 0) {
                  setCurrentIndex(foundIdx);
                  currentIndexRef.current = foundIdx;
                }
              }
            } else {
              console.log('>>> Video not found in playlists, creating temporary (notes disabled)');
              // Fallback: create temporary video object (notes won't work but playback will)
              setCurrentVideo({ 
                id: null, // No DB id available - notes will be disabled
                youtubeId: serverVideoId,
                title: data.room.currentVideoTitle || serverUrl, 
                url: serverUrl 
              });
            }
            setPlaybackState(serverState);
            setPlaybackTime(serverTime);
          } else {
            // Same video - check for state or time changes
            var stateChanged = serverState !== lastSyncedState.current;
            var timeDiff = Math.abs(serverTime - lastSyncedTime.current);
            var timeChanged = timeDiff > 1; // Sync if > 1 second difference
            
            if (stateChanged) {
              // Safeguard: Don't switch to 'playing' if video has truly ended (state 0)
              // This prevents stale 'playing' state from server from restarting a finished video
              var shouldApplyState = true;
              if (serverState === 'playing' && globalYTPlayer.player && globalYTPlayer.isReady) {
                try {
                  var playerState = globalYTPlayer.player.getPlayerState();
                  // Only block if video is in ended state (0) - not buffering or other states
                  if (playerState === 0) {
                    var duration = globalYTPlayer.player.getDuration();
                    var currentTime = globalYTPlayer.player.getCurrentTime();
                    // Confirm it's actually at the end (not just unstarted)
                    if (duration > 0 && currentTime >= duration - 1) {
                      console.log('>>> Ignoring server PLAY - video has ended');
                      shouldApplyState = false;
                    }
                  }
                } catch (e) {}
              }
              
              if (shouldApplyState) {
                console.log('>>> STATE CHANGE:', lastSyncedState.current, '->', serverState);
                lastSyncedState.current = serverState;
                setPlaybackState(serverState);
              }
            }
            
            if (timeChanged) {
              // Only sync time if it makes sense:
              // - If paused, sync to server time
              // - If playing, only sync if server is AHEAD (someone else seeked forward)
              // - Don't sync backwards during playback (server time is just stale)
              var shouldSyncTime = true;
              
              if (serverState === 'playing' || lastSyncedState.current === 'playing') {
                // Get current player position
                var currentPlayerTime = 0;
                if (globalYTPlayer.player && globalYTPlayer.isReady) {
                  try {
                    currentPlayerTime = globalYTPlayer.player.getCurrentTime() || 0;
                  } catch (e) {}
                }
                
                // Only sync if server is ahead of current position (forward seek)
                // Don't sync backwards - that's just stale server data
                if (serverTime < currentPlayerTime - 2) {
                  console.log('>>> SKIPPING TIME SYNC - server behind player (server:', serverTime.toFixed(1), ', player:', currentPlayerTime.toFixed(1), ')');
                  shouldSyncTime = false;
                  // Update server with our current position instead
                  lastSyncedTime.current = currentPlayerTime;
                }
              }
              
              if (shouldSyncTime) {
                console.log('>>> TIME SYNC:', lastSyncedTime.current, '->', serverTime, '(diff:', timeDiff, ')');
                lastSyncedTime.current = serverTime;
                setPlaybackTime(serverTime);
              }
            }
          }
        } else {
          // No video on server
          if (currentVideoIdRef.current) {
            console.log('>>> Clearing video');
            currentVideoIdRef.current = null;
            lastSyncedState.current = null;
            lastSyncedTime.current = 0;
            setCurrentVideo(null);
            setPlaybackState('paused');
            setPlaybackTime(0);
          }
        }
        // Mark that we have done at least one video sync
        hasInitialVideoSync.current = true;
      }
    }).catch(function(err) {
      console.error('Sync error:', err);
    });
  }

  useEffect(function() {
    console.log('Joining room and starting sync...');
    isInitialSync.current = true; // Reset on join
    hasConfirmedJoin.current = false; // Reset join confirmation
    hasInitialVideoSync.current = false; // Reset video sync flag
    joinTime.current = Date.now(); // Track join time
    
    // Check if this is a returning guest
    var returningGuestName = localStorage.getItem('returning_guest_' + room.id);
    if (returningGuestName) {
      localStorage.removeItem('returning_guest_' + room.id); // Clear after use
    }
    
    api.rooms.join(room.id, displayName, returningGuestName).then(function() {
      console.log('Joined room, syncing...');
      syncRoomState();
      
      // Mark room as loaded after initial sync
      setTimeout(function() {
        setRoomLoading(false);
      }, 500);
      
      // Allow broadcasting after initial sync settles (3 seconds)
      setTimeout(function() {
        console.log('Initial sync complete, enabling broadcasts');
        isInitialSync.current = false;
        
        // Send any queued broadcast from user interactions during initial sync
        if (pendingBroadcast.current) {
          console.log('>>> Sending queued broadcast');
          var pb = pendingBroadcast.current;
          pendingBroadcast.current = null;
          broadcastState(pb.video, pb.state, pb.time);
        }
      }, 3000);
    }).catch(console.error);
    
    // Regular sync interval for video state
    syncInterval.current = setInterval(function() {
      syncRoomState();
    }, SYNC_INTERVAL);
    
    // Use Web Worker for heartbeat to avoid browser throttling in background tabs
    // Regular setInterval gets throttled to ~1 minute in background, Worker doesn't
    var heartbeatWorkerCode = 'setInterval(function(){postMessage("heartbeat")},3000)';
    var heartbeatBlob = new Blob([heartbeatWorkerCode], { type: 'application/javascript' });
    var heartbeatWorkerUrl = URL.createObjectURL(heartbeatBlob);
    var heartbeatWorker = new Worker(heartbeatWorkerUrl);
    
    heartbeatWorker.onmessage = function() {
      api.presence.heartbeat(room.id, 'online').catch(console.error);
    };
    
    // Also send immediate heartbeat
    api.presence.heartbeat(room.id, 'online').catch(console.error);
    
    // Backup regular interval for browsers that don't support workers well
    var heartbeatInterval = setInterval(function() {
      api.presence.heartbeat(room.id, 'online').catch(console.error);
    }, 10000); // Less frequent as backup
    
    // Handle visibility changes - sync when tab becomes visible
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        console.log('Tab visible - forcing full sync from server...');
        api.presence.heartbeat(room.id, 'online').catch(console.error);
        
        // Reset sync tracking refs to force accepting server state
        // This ensures we always get the latest state after being away
        lastSyncedState.current = null;
        lastSyncedTime.current = -1;
        
        // Clear local change timestamp so sync isn't blocked
        // After being in background, we should always defer to server state
        lastLocalChange.current = 0;
        
        // Sync from server
        syncRoomState();
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', function() {
      api.presence.heartbeat(room.id, 'online').catch(console.error);
      
      // Also force sync on focus - reset everything to accept server state
      lastSyncedState.current = null;
      lastSyncedTime.current = -1;
      lastLocalChange.current = 0;
      syncRoomState();
    });
    
    return function() {
      clearInterval(syncInterval.current);
      clearInterval(heartbeatInterval);
      if (heartbeatWorker) {
        heartbeatWorker.terminate();
      }
      URL.revokeObjectURL(heartbeatWorkerUrl);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      api.presence.leave(room.id).catch(console.error);
    };
  }, [room.id]);

  function showNotif(msg, type) {
    setNotification({ message: msg, type: type || 'success' });
    setTimeout(function() { setNotification(null); }, 3000);
  }

  function broadcastState(video, state, time) {
    // Do not broadcast local files (blob URLs) - they only work locally
    if (video && video.url && video.url.startsWith('blob:')) {
      console.log('>>> SKIPPING BROADCAST (local file)');
      return;
    }
    
    // Do not broadcast from background/hidden tabs - prevents idle guests from
    // overwriting the room's current video/playlist with stale data
    if (document.visibilityState === 'hidden') {
      console.log('>>> SKIPPING BROADCAST (tab hidden)');
      return;
    }
    
    // During initial sync, queue the broadcast for later
    if (isInitialSync.current) {
      console.log('>>> QUEUING BROADCAST (initial sync):', state, time);
      pendingBroadcast.current = { video: video, state: state, time: time };
      return;
    }
    
    console.log('>>> BROADCASTING:', video ? video.url : null, state, time);
    lastLocalChange.current = Date.now();
    
    api.rooms.updateSync(room.id, {
      currentVideoUrl: video ? video.url : null,
      currentVideoTitle: video ? (video.title || video.url) : null,
      currentPlaylistId: activePlaylist ? activePlaylist.id : null,
      playbackState: state || 'paused',
      playbackTime: time || 0
    }).then(function() {
      console.log('Broadcast successful');
    }).catch(function(err) {
      console.error('Broadcast failed:', err);
    });
  }

  function handlePlayerStateChange(state, time) {
    console.log('Player state changed:', state, 'at', time);
    lastSyncedState.current = state;
    lastSyncedTime.current = time;
    
    // Don't mark as local change or broadcast from background tabs
    // This prevents idle guests from overwriting the room state
    if (document.visibilityState === 'hidden') {
      console.log('>>> IGNORING player state change (tab hidden)');
      return;
    }
    
    // Only mark as local change if not during initial sync
    // This prevents player load events from blocking sync
    if (!isInitialSync.current) {
      lastLocalChange.current = Date.now();
    }
    
    setPlaybackState(state);
    setPlaybackTime(time);
    
    // Do not broadcast during initial sync - prevents new users from affecting room state
    if (!isInitialSync.current) {
      broadcastState(currentVideo, state, time);
    }
  }

  function handlePlayerSeek(time) {
    console.log('Player seeked to:', time);
    lastSyncedTime.current = time;
    
    // Don't mark as local change or broadcast from background tabs
    if (document.visibilityState === 'hidden') {
      console.log('>>> IGNORING player seek (tab hidden)');
      return;
    }
    
    // Only mark as local change if not during initial sync
    if (!isInitialSync.current) {
      lastLocalChange.current = Date.now();
    }
    
    setPlaybackTime(time);
    
    // Do not broadcast during initial sync
    if (!isInitialSync.current) {
      broadcastState(currentVideo, playbackState, time);
    }
  }

  function playVideo(video, index) {
    console.log('Playing video:', video.title || video.url);
    var parsed = parseVideoUrl(video.url);
    var videoId = parsed ? parsed.id : null;
    currentVideoIdRef.current = videoId || video.url;
    lastSyncedState.current = 'playing';
    lastSyncedTime.current = 0;
    
    // Close mobile queue panel when video is played
    if (window.innerWidth <= 768) {
      setMobileQueueOpen(false);
    }
    
    // Directly load video in YouTube player (bypasses React state throttling in background tabs)
    if (videoId && parsed.type === 'youtube' && globalYTPlayer.loadVideo(videoId)) {
      console.log('Loaded video directly via global player');
    }
    
    // Still update React state for UI sync
    setCurrentVideo(video);
    setCurrentIndex(index);
    setPlaybackState('playing');
    setPlaybackTime(0);
    broadcastState(video, 'playing', 0);
  }

  function handleFileUpload(event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;
    
    // Validate file type
    var validTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 
                      'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/mp4', 'audio/ogg', 
                      'audio/flac', 'audio/aac', 'audio/x-m4a', 'audio/x-wav'];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(mp4|webm|ogv|mov|mp3|wav|m4a|ogg|flac|aac)$/i)) {
      showNotif('File type not supported. Use mp4, webm, mp3, wav, m4a, ogg, or flac.', 'error');
      return;
    }
    
    // Validate file size (50MB max)
    if (file.size > 50 * 1024 * 1024) {
      showNotif('File too large. Maximum size is 50MB.', 'error');
      return;
    }
    
    setUploading(true);
    setUploadProgress(0);
    
    api.files.upload(file, room.id)
      .then(function(result) {
        setUploading(false);
        setUploadProgress(100);
        
        // Determine if it's audio based on file type or response
        var isAudio = result.category === 'audio' || file.type.startsWith('audio/');
        
        var videoData = {
          title: file.name,
          url: result.url,
          videoType: 'uploaded',
          isAudio: isAudio
        };
        
        // If we have an active playlist, add to it
        if (activePlaylist) {
          api.playlists.addVideo(activePlaylist.id, videoData).then(function(video) {
            // Update local playlist
            var updated = Object.assign({}, activePlaylist, { 
              videos: (activePlaylist.videos || []).concat([video]) 
            });
            setPlaylists(playlists.map(function(p) { return p.id === activePlaylist.id ? updated : p; }));
            setActivePlaylist(updated);
            showNotif('File uploaded and added to playlist!');
            
            // Optionally play the uploaded file
            playVideo(video);
          });
        } else {
          // No playlist - just play immediately
          var tempVideo = { id: result.fileId, title: file.name, url: result.url, isAudio: isAudio };
          setCurrentVideo(tempVideo);
          setPlaybackState('playing');
          setPlaybackTime(0);
          broadcastState(tempVideo, 'playing', 0);
          showNotif('File uploaded! Add to a playlist to save it.');
        }
        
        // Reset file input
        if (fileInputRef.current) fileInputRef.current.value = '';
      })
      .catch(function(err) {
        setUploading(false);
        console.error('Upload failed:', err);
        showNotif('Upload failed: ' + (err.message || 'Unknown error'), 'error');
        if (fileInputRef.current) fileInputRef.current.value = '';
      });
  }

  function playNow() {
    if (!urlInput.trim()) return;
    var parsed = parseVideoUrl(urlInput.trim());
    if (!parsed) { showNotif('Invalid URL', 'error'); return; }
    
    var urlToAdd = urlInput.trim();
    
    // Add to active playlist if one is selected
    if (activePlaylist) {
      api.playlists.addVideo(activePlaylist.id, { title: urlToAdd, url: urlToAdd, videoType: parsed.type }).then(function(savedVideo) {
        var newVideos = (activePlaylist.videos || []).concat([savedVideo]);
        var updated = Object.assign({}, activePlaylist, { videos: newVideos });
        setPlaylists(playlists.map(function(p) { return p.id === activePlaylist.id ? updated : p; }));
        setActivePlaylist(updated);
        
        // Play the saved video with proper ID
        currentVideoIdRef.current = parsed.id;
        lastSyncedState.current = 'playing';
        lastSyncedTime.current = 0;
        setCurrentVideo(savedVideo);
        setCurrentIndex(newVideos.length - 1);
        setPlaybackState('playing');
        setPlaybackTime(0);
        broadcastState(savedVideo, 'playing', 0);
        showNotif('Added and playing!');
      }).catch(function(err) {
        showNotif('Error adding: ' + err.message, 'error');
      });
    } else {
      // No playlist selected, just play
      currentVideoIdRef.current = parsed.id;
      lastSyncedState.current = 'playing';
      lastSyncedTime.current = 0;
      var video = { id: parsed.id, title: urlToAdd, url: urlToAdd };
      setCurrentVideo(video);
      setPlaybackState('playing');
      setPlaybackTime(0);
      broadcastState(video, 'playing', 0);
    }
    setUrlInput('');
  }

  function playPrev() {
    if (!activePlaylist || currentIndex <= 0) return;
    var videos = activePlaylist.videos || [];
    var video = videos[currentIndex - 1];
    playVideo(video, currentIndex - 1);
  }

  function handleVideoEnded() {
    console.log('=== handleVideoEnded called! ===');
    
    // Stop any existing timer
    videoPlaybackTracker.stop();
    
    // Use refs to get current values (avoid stale closures)
    var isLoop = loopRef.current;
    var isShuffle = shuffleRef.current;
    var isAutoplay = autoplayRef.current;
    var playlist = activePlaylistRef.current;
    var idx = currentIndexRef.current;
    var video = currentVideoRef.current;
    
    console.log('Video ended - loop:', isLoop, 'shuffle:', isShuffle, 'autoplay:', isAutoplay, 'index:', idx, 'playlist:', playlist ? playlist.name : 'none');
    
    // Loop: replay current video
    if (isLoop) {
      // Directly seek and play using YouTube player API (bypasses React state throttling)
      if (globalYTPlayer.player && globalYTPlayer.isReady) {
        console.log('Loop: Directly seeking to 0 and playing');
        globalYTPlayer.player.seekTo(0, true);
        globalYTPlayer.player.playVideo();
        
        // Start timer for the full duration (since we are at 0)
        try {
          var duration = globalYTPlayer.player.getDuration();
          if (duration > 0) {
            videoPlaybackTracker.start(duration, function() {
              handleVideoEnded();
            });
          }
        } catch (e) {}
      }
      // Also update React state for UI sync
      setPlaybackTime(0);
      setPlaybackState('playing');
      broadcastState(video, 'playing', 0);
      return;
    }
    
    if (!playlist) return;
    var videos = playlist.videos || [];
    if (videos.length === 0) return;
    
    // Shuffle: play random video from playlist
    if (isShuffle) {
      // Get a truly random index different from current
      var availableIndices = [];
      for (var i = 0; i < videos.length; i++) {
        if (i !== idx) availableIndices.push(i);
      }
      
      if (availableIndices.length > 0) {
        var randomIdx = availableIndices[Math.floor(Math.random() * availableIndices.length)];
        playVideo(videos[randomIdx], randomIdx);
      } else if (videos.length === 1) {
        // Only one video, replay it - use direct player API
        if (globalYTPlayer.player && globalYTPlayer.isReady) {
          console.log('Shuffle single: Directly seeking to 0 and playing');
          globalYTPlayer.player.seekTo(0, true);
          globalYTPlayer.player.playVideo();
          
          // Start timer for the full duration
          try {
            var dur = globalYTPlayer.player.getDuration();
            if (dur > 0) {
              videoPlaybackTracker.start(dur, function() {
                handleVideoEnded();
              });
            }
          } catch (e) {}
        }
        setPlaybackTime(0);
        setPlaybackState('playing');
        broadcastState(video, 'playing', 0);
      }
      return;
    }
    
    // Autoplay: play next video in order
    if (isAutoplay && idx < videos.length - 1) {
      playVideo(videos[idx + 1], idx + 1);
      return;
    }
    
    // No autoplay/shuffle/loop - video ends, pause state
    console.log('Video ended with no autoplay/shuffle/loop - pausing');
    setPlaybackState('paused');
    broadcastState(video, 'paused', video ? globalYTPlayer.player.getDuration() : 0);
  }
  
  // Keep ref updated for global callback
  handleVideoEndedRef.current = handleVideoEnded;

  function playNext() {
    if (!activePlaylist) return;
    var videos = activePlaylist.videos || [];
    if (currentIndex < videos.length - 1) {
      playVideo(videos[currentIndex + 1], currentIndex + 1);
    }
  }

  // Wrapper to select playlist and update ref
  function handleSaveRoomName() {
    if (!roomNameInput.trim()) {
      setEditingRoomName(false);
      return;
    }
    api.rooms.update(room.id, { name: roomNameInput.trim() }).then(function() {
      setRoomName(roomNameInput.trim());
      setEditingRoomName(false);
      showNotif('Room renamed!');
    }).catch(function(err) {
      showNotif(err.message, 'error');
    });
  }

  function selectPlaylist(playlist) {
    activePlaylistIdRef.current = playlist ? playlist.id : null;
    setActivePlaylist(playlist);
    // Close sidebar on mobile when playlist is selected
    if (window.innerWidth <= 768) {
      setSidebarOpen(false);
    }
    // Broadcast playlist change to sync with other users
    broadcastPlaylistChange(playlist ? playlist.id : null);
  }
  
  // Broadcast just the playlist selection without affecting video playback
  function broadcastPlaylistChange(playlistId) {
    // Don't broadcast during initial sync
    if (isInitialSync.current) return;
    
    console.log('>>> BROADCASTING PLAYLIST:', playlistId);
    lastLocalChange.current = Date.now();
    
    api.rooms.updateSync(room.id, {
      currentPlaylistId: playlistId
    }).catch(function(err) {
      console.error('Playlist broadcast failed:', err);
    });
  }

  function handleCreatePlaylist(name) {
    api.playlists.create(room.id, name).then(function(p) {
      var newPl = Object.assign({}, p, { videos: [] });
      setPlaylists(playlists.concat([newPl]));
      selectPlaylist(newPl);
      showNotif('Created!');
    }).catch(function(err) { showNotif(err.message, 'error'); });
  }

  function handleDeletePlaylist(id) {
    if (!confirm('Delete playlist?')) return;
    api.playlists.delete(id).then(function() {
      setPlaylists(playlists.filter(function(p) { return p.id !== id; }));
      if (activePlaylist && activePlaylist.id === id) { 
        selectPlaylist(null); 
        setCurrentVideo(null); 
      }
      showNotif('Deleted!', 'warning');
    });
  }

  function handleRenamePlaylist(id, name) {
    api.playlists.update(id, { name: name }).then(function() {
      setPlaylists(playlists.map(function(p) { return p.id === id ? Object.assign({}, p, { name: name }) : p; }));
      if (activePlaylist && activePlaylist.id === id) {
        var updated = Object.assign({}, activePlaylist, { name: name });
        selectPlaylist(updated);
      }
      showNotif('Renamed!');
    });
  }

  function handleReorderPlaylists(ids) {
    api.playlists.reorder(room.id, ids).catch(console.error);
  }

  function handleHidePlaylist(id, hidden) {
    api.playlists.setHidden(id, hidden).then(function() {
      setPlaylists(playlists.map(function(p) { return p.id === id ? Object.assign({}, p, { hidden: hidden }) : p; }));
      showNotif(hidden ? 'Playlist hidden from guests' : 'Playlist visible to guests');
    }).catch(function(err) { showNotif(err.message, 'error'); });
  }

  function handleImportPlaylist(playlistData) {
    api.playlists.importPlaylist(room.id, playlistData).then(function() {
      showNotif('Playlist imported!');
      // Sync will pick up the new playlist
    }).catch(function(err) { showNotif(err.message, 'error'); });
  }

  function handleCopyVideo(video) {
    setCopiedVideo(video);
    showNotif('Video copied to clipboard');
  }

  function handlePasteVideo(playlistId) {
    if (!copiedVideo) return;
    api.playlists.copyVideo(playlistId, copiedVideo).then(function(video) {
      setPlaylists(playlists.map(function(p) {
        if (p.id === playlistId) {
          return Object.assign({}, p, { videos: (p.videos || []).concat([video]) });
        }
        return p;
      }));
      if (activePlaylist && activePlaylist.id === playlistId) {
        setActivePlaylist(Object.assign({}, activePlaylist, { videos: (activePlaylist.videos || []).concat([video]) }));
      }
      showNotif('Video pasted!');
    }).catch(function(err) { showNotif(err.message, 'error'); });
  }

  function handleQueueContextMenu(e) {
    if (!activePlaylist) return;
    e.preventDefault();
    setQueueContextMenu({ x: e.clientX, y: e.clientY });
  }

  function handlePlayPlaylist() {
    if (!activePlaylist || !activePlaylist.videos || activePlaylist.videos.length === 0) return;
    playVideo(activePlaylist.videos[0], 0);
    setQueueContextMenu(null);
  }

  function handleExportActivePlaylist() {
    if (!activePlaylist) return;
    var exportData = {
      name: activePlaylist.name,
      videos: (activePlaylist.videos || []).map(function(v) {
        return { title: v.title, url: v.url, videoType: v.videoType };
      })
    };
    var blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = activePlaylist.name + '.json';
    a.click();
    URL.revokeObjectURL(url);
    setQueueContextMenu(null);
  }

  function handlePasteToActivePlaylist() {
    if (!activePlaylist || !copiedVideo) return;
    handlePasteVideo(activePlaylist.id);
    setQueueContextMenu(null);
  }

  function handleAddVideoToPlaylist(playlistId, video) {
    api.playlists.copyVideo(playlistId, video).then(function(newVideo) {
      setPlaylists(playlists.map(function(p) {
        if (p.id === playlistId) {
          return Object.assign({}, p, { videos: (p.videos || []).concat([newVideo]) });
        }
        return p;
      }));
      if (activePlaylist && activePlaylist.id === playlistId) {
        setActivePlaylist(Object.assign({}, activePlaylist, { videos: (activePlaylist.videos || []).concat([newVideo]) }));
      }
      showNotif('Video added to playlist!');
    }).catch(function(err) { showNotif(err.message, 'error'); });
  }

  function handleAddUrl() {
    if (!activePlaylist || !urlInput.trim()) return;
    var parsed = parseVideoUrl(urlInput.trim());
    if (!parsed) { showNotif('Invalid URL', 'error'); return; }
    api.playlists.addVideo(activePlaylist.id, { title: urlInput.trim(), url: urlInput.trim(), videoType: parsed.type }).then(function(video) {
      var newVideos = (activePlaylist.videos || []).concat([video]);
      var updated = Object.assign({}, activePlaylist, { videos: newVideos });
      setPlaylists(playlists.map(function(p) { return p.id === activePlaylist.id ? updated : p; }));
      setActivePlaylist(updated);
      setUrlInput('');
      showNotif('Added!');
    });
  }

  function removeVideo(videoId) {
    if (!activePlaylist) return;
    api.playlists.removeVideo(activePlaylist.id, videoId).then(function() {
      var newVideos = (activePlaylist.videos || []).filter(function(v) { return v.id !== videoId; });
      var updated = Object.assign({}, activePlaylist, { videos: newVideos });
      setPlaylists(playlists.map(function(p) { return p.id === activePlaylist.id ? updated : p; }));
      setActivePlaylist(updated);
      if (currentVideo && currentVideo.id === videoId) setCurrentVideo(null);
      showNotif('Removed!');
    });
  }

  function renameVideo(videoId, title) {
    if (!activePlaylist) return;
    api.playlists.updateVideo(activePlaylist.id, videoId, { title: title }).then(function() {
      var newVideos = (activePlaylist.videos || []).map(function(v) { return v.id === videoId ? Object.assign({}, v, { title: title }) : v; });
      var updated = Object.assign({}, activePlaylist, { videos: newVideos });
      setPlaylists(playlists.map(function(p) { return p.id === activePlaylist.id ? updated : p; }));
      setActivePlaylist(updated);
      showNotif('Renamed!');
    });
  }

  function reorderVideos(videoIds) {
    if (!activePlaylist) return;
    api.playlists.reorderVideos(activePlaylist.id, videoIds).then(function() {
      var videoMap = {};
      (activePlaylist.videos || []).forEach(function(v) { videoMap[v.id] = v; });
      var newVideos = videoIds.map(function(id) { return videoMap[id]; }).filter(Boolean);
      var updated = Object.assign({}, activePlaylist, { videos: newVideos });
      setPlaylists(playlists.map(function(p) { return p.id === activePlaylist.id ? updated : p; }));
      setActivePlaylist(updated);
    });
  }

  function updateVideoNotes(videoId, notes, editorName) {
    if (!activePlaylist) return;
    
    // Validate that videoId is a valid UUID (not a YouTube video ID)
    // UUIDs are 36 characters with dashes, YouTube IDs are ~11 characters
    if (!videoId || videoId.length < 30) {
      console.error('>>> Invalid video ID for notes (not a UUID):', videoId);
      showNotif('Cannot save notes - video not in playlist');
      return;
    }
    
    console.log('>>> Saving notes for video:', videoId, 'by:', editorName);
    api.playlists.updateVideo(activePlaylist.id, videoId, { notes: notes, notesUpdatedBy: editorName }).then(function() {
      console.log('>>> Notes saved successfully');
      var now = new Date().toISOString();
      var updated = Object.assign({}, activePlaylist, { 
        videos: (activePlaylist.videos || []).map(function(v) { 
          return v.id === videoId ? Object.assign({}, v, { notes: notes, notesUpdatedBy: editorName, notesUpdatedAt: now }) : v; 
        }) 
      });
      setPlaylists(playlists.map(function(p) { return p.id === activePlaylist.id ? updated : p; }));
      setActivePlaylist(updated);
      // Also update currentVideo if it's the one being edited
      if (currentVideo && currentVideo.id === videoId) {
        setCurrentVideo(Object.assign({}, currentVideo, { 
          notes: notes, 
          notesUpdatedBy: editorName, 
          notesUpdatedAt: now 
        }));
      }
      showNotif('Notes saved!');
    }).catch(function(err) {
      console.error('>>> Failed to save notes:', err);
      showNotif('Failed to save notes');
    });
  }

  function toggleVideoNotesHidden() {
    if (!currentVideo || !currentVideo.id || !activePlaylist) {
      showNotif('No video selected');
      return;
    }
    var newHidden = !currentVideo.notesHidden;
    api.playlists.updateVideo(activePlaylist.id, currentVideo.id, { notesHidden: newHidden }).then(function() {
      // Update local state
      var updatedVideo = Object.assign({}, currentVideo, { notesHidden: newHidden });
      setCurrentVideo(updatedVideo);
      
      // Update in playlist
      var updated = Object.assign({}, activePlaylist, { 
        videos: (activePlaylist.videos || []).map(function(v) { 
          return v.id === currentVideo.id ? updatedVideo : v; 
        }) 
      });
      setPlaylists(playlists.map(function(p) { return p.id === activePlaylist.id ? updated : p; }));
      setActivePlaylist(updated);
      
      showNotif(newHidden ? 'Notes hidden from guests for this video' : 'Notes visible to all for this video');
    }).catch(function(err) {
      console.error('Failed to toggle notes visibility:', err);
      showNotif('Failed to update notes visibility');
    });
  }

  function getSortedVideos(videos) {
    if (!queueSortMode || !videos) return videos;
    var sorted = videos.slice();
    if (queueSortMode === 'alpha') {
      sorted.sort(function(a, b) { return (a.title || '').localeCompare(b.title || ''); });
    } else if (queueSortMode === 'alpha-desc') {
      sorted.sort(function(a, b) { return (b.title || '').localeCompare(a.title || ''); });
    }
    return sorted;
  }

  function copyShareLink() {
    navigator.clipboard.writeText(location.origin + location.pathname + '#/room/' + hostId + '/' + room.id);
    showNotif('Copied!');
    setShareModalOpen(false);
  }

  function handleKick(visitorId, guestId) {
    api.rooms.kick(room.id, visitorId, guestId).then(function() {
      setConnectedUsers(connectedUsers.filter(function(u) { return u.visitorId !== visitorId && u.guestId !== guestId; }));
      showNotif('Kicked!');
    });
  }

  function handleRenameUser(visitorId, guestId, name) {
    api.presence.updateMember(room.id, visitorId, guestId, { displayName: name }).then(function() {
      setConnectedUsers(connectedUsers.map(function(u) { return (u.visitorId === visitorId || u.guestId === guestId) ? Object.assign({}, u, { displayName: name }) : u; }));
      showNotif('Renamed!');
    });
  }

  function handleColorChange(visitorId, guestId, color) {
    api.presence.updateMember(room.id, visitorId, guestId, { color: color }).then(function() {
      setConnectedUsers(connectedUsers.map(function(u) { return (u.visitorId === visitorId || u.guestId === guestId) ? Object.assign({}, u, { color: color }) : u; }));
    });
  }

  return React.createElement('div', { className: 'dashboard' },
    // Room loading overlay
    roomLoading && React.createElement('div', { className: 'room-loading-overlay' },
      React.createElement('div', { className: 'room-loading-content' },
        React.createElement('div', { className: 'loading-flames' },
          Array.from({ length: 5 }, function(_, i) {
            return React.createElement('div', { key: i, className: 'loading-flame', style: { animationDelay: (i * 0.15) + 's' } });
          })
        ),
        React.createElement('p', { className: 'loading-text' }, 'Loading room...')
      )
    ),
    
    React.createElement(DragonFire, null),
    
    React.createElement('header', { className: 'dashboard-header' },
      React.createElement('div', { className: 'header-left' },
        React.createElement('button', { className: 'icon-btn', onClick: function() { setSidebarOpen(!sidebarOpen); } }, React.createElement(Icon, { name: 'menu' })),
        props.onHome && React.createElement('button', { className: 'icon-btn', onClick: props.onHome, title: 'Home' }, React.createElement(Icon, { name: 'home' })),
        editingRoomName 
          ? React.createElement('input', {
              className: 'room-title-input',
              value: roomNameInput,
              onChange: function(e) { setRoomNameInput(e.target.value); },
              onBlur: handleSaveRoomName,
              onKeyDown: function(e) {
                if (e.key === 'Enter') handleSaveRoomName();
                if (e.key === 'Escape') setEditingRoomName(false);
              },
              autoFocus: true
            })
          : React.createElement('h1', { 
              className: 'room-title' + (isOwner ? ' editable' : ''), 
              onClick: isOwner ? function() { setEditingRoomName(true); setRoomNameInput(roomName); } : null,
              title: isOwner ? 'Click to rename' : null
            }, roomName)
      ),
      React.createElement('div', { className: 'header-center' },
        React.createElement('div', { className: 'url-bar' },
          React.createElement('input', { value: urlInput, onChange: function(e) { setUrlInput(e.target.value); }, placeholder: 'Paste URL (YouTube, Vimeo, Twitch, etc.)...', onKeyDown: function(e) { if (e.key === 'Enter') playNow(); } }),
          React.createElement('button', { className: 'icon-btn primary', onClick: playNow, title: 'Play Now' }, React.createElement(Icon, { name: 'play' })),
          React.createElement('button', { className: 'icon-btn', onClick: handleAddUrl, disabled: !activePlaylist, title: 'Add to Playlist' }, React.createElement(Icon, { name: 'plus' })),
          // Hidden file input
          React.createElement('input', { 
            ref: fileInputRef,
            type: 'file', 
            accept: 'video/mp4,video/webm,video/ogg,video/quicktime,audio/mpeg,audio/mp3,audio/wav,audio/mp4,audio/ogg,audio/flac,audio/aac,.mp4,.webm,.ogv,.mov,.mp3,.wav,.m4a,.ogg,.flac,.aac',
            onChange: handleFileUpload,
            style: { display: 'none' }
          }),
          React.createElement('button', { 
            className: 'icon-btn' + (uploading ? ' uploading' : ''), 
            onClick: function() { if (!uploading && fileInputRef.current) fileInputRef.current.click(); }, 
            disabled: uploading,
            title: uploading ? 'Uploading...' : 'Upload Audio/Video File'
          }, uploading 
            ? React.createElement('span', { className: 'upload-spinner' }, '⏳')
            : React.createElement(Icon, { name: 'upload' })
          )
        )
      ),
      React.createElement('div', { className: 'header-right' },
        React.createElement('button', { className: 'btn secondary sm', onClick: function() { setShareModalOpen(true); } }, React.createElement(Icon, { name: 'share', size: 'sm' }), ' Share'),
        user 
          ? React.createElement(UserMenu, { user: user, onSettings: function() { setSettingsOpen(true); }, onLogout: props.onLogout, onHome: props.onHome })
          : React.createElement(GuestMenu, { displayName: displayName, onCreateAccount: function() { setShowAuthModal(true); } })
      )
    ),
    
    React.createElement('div', { className: 'dashboard-content' },
      // Sidebar overlay for mobile - closes sidebar when tapped
      sidebarOpen && React.createElement('div', { 
        className: 'sidebar-overlay visible',
        onClick: function() { setSidebarOpen(false); }
      }),
      
      React.createElement('aside', { className: 'sidebar' + (sidebarOpen ? '' : ' closed') },
        React.createElement(PlaylistPanel, { 
          playlists: playlists, 
          activePlaylist: activePlaylist, 
          onSelect: selectPlaylist, 
          onCreate: handleCreatePlaylist, 
          onDelete: handleDeletePlaylist, 
          onRename: handleRenamePlaylist, 
          onReorder: handleReorderPlaylists,
          onHide: handleHidePlaylist,
          onAddVideoToPlaylist: handleAddVideoToPlaylist,
          onImport: handleImportPlaylist,
          onShowImportModal: user ? function() { setShowImportModal(true); } : null,
          isOwner: isPlaylistOwner,
          copiedVideo: copiedVideo,
          onPaste: handlePasteVideo,
          onClose: function() { setSidebarOpen(false); }
        })
      ),
      
      React.createElement('main', { className: 'main-content' },
        // Mobile queue overlay
        mobileQueueOpen && React.createElement('div', { 
          className: 'queue-overlay visible',
          onClick: function() { setMobileQueueOpen(false); }
        }),
        
        React.createElement('div', { className: 'queue-panel' + (mobileQueueOpen ? ' mobile-open' : ''), onContextMenu: handleQueueContextMenu },
          React.createElement('div', { className: 'queue-header' }, 
            React.createElement('h3', null, '📜 ', activePlaylist ? activePlaylist.name : 'Select Playlist'),
            React.createElement('div', { className: 'queue-header-actions' },
              // Sort dropdown button
              React.createElement('div', { className: 'sort-dropdown' },
                React.createElement('button', { 
                  className: 'icon-btn sm' + (queueSortMode ? ' active' : ''), 
                  title: 'Sort: ' + (queueSortMode === 'alpha' ? 'A-Z' : queueSortMode === 'alpha-desc' ? 'Z-A' : 'Manual'),
                  onClick: function() {
                    // Cycle through: null -> alpha -> alpha-desc -> null
                    if (!queueSortMode) setQueueSortMode('alpha');
                    else if (queueSortMode === 'alpha') setQueueSortMode('alpha-desc');
                    else setQueueSortMode(null);
                  }
                }, React.createElement(Icon, { name: 'sort-alpha', size: 'sm' }), 
                   queueSortMode && React.createElement('span', { className: 'sort-indicator' }, queueSortMode === 'alpha' ? '↓' : '↑')
                )
              ),
              React.createElement('button', { 
                className: 'queue-close-btn',
                onClick: function() { setMobileQueueOpen(false); }
              }, React.createElement(Icon, { name: 'x', size: 'sm' }))
            )
          ),
          activePlaylist 
            ? React.createElement(DraggableVideoList, { videos: getSortedVideos(activePlaylist.videos || []), currentVideo: currentVideo, onPlay: playVideo, onRemove: removeVideo, onRename: renameVideo, onReorder: reorderVideos, onCopy: handleCopyVideo, sortMode: queueSortMode })
            : React.createElement('div', { className: 'empty-queue' }, React.createElement('p', null, 'Select a playlist')),
          
          // Queue panel context menu
          queueContextMenu && activePlaylist && React.createElement('div', {
            className: 'context-menu',
            style: { position: 'fixed', top: queueContextMenu.y, left: queueContextMenu.x, zIndex: 10000 },
            onClick: function(e) { e.stopPropagation(); }
          },
            React.createElement('button', { className: 'context-menu-item', onClick: handlePlayPlaylist },
              React.createElement(Icon, { name: 'play', size: 'sm' }), ' Play playlist'
            ),
            React.createElement('button', { className: 'context-menu-item', onClick: handleExportActivePlaylist },
              React.createElement(Icon, { name: 'download', size: 'sm' }), ' Export playlist'
            ),
            copiedVideo && React.createElement('button', { className: 'context-menu-item', onClick: handlePasteToActivePlaylist },
              React.createElement(Icon, { name: 'clipboard', size: 'sm' }), ' Paste video'
            )
          )
        ),
        
        React.createElement('div', { className: 'video-section' },
          React.createElement(VideoPlayer, { 
            key: currentVideo ? currentVideo.url : 'no-video',
            video: currentVideo, 
            playbackState: playbackState, 
            playbackTime: playbackTime, 
            onStateChange: handlePlayerStateChange,
            onSeek: handlePlayerSeek,
            onEnded: handleVideoEnded,
            isLocalChange: (Date.now() - lastLocalChange.current) < 2000
          }),
          React.createElement('div', { className: 'playback-controls' },
            React.createElement('button', { className: 'btn sm', onClick: playPrev, disabled: !activePlaylist || currentIndex <= 0 }, React.createElement(Icon, { name: 'prev', size: 'sm' }), ' Prev'),
            React.createElement('div', { className: 'playback-toggles' },
              React.createElement('button', { 
                className: 'icon-btn toggle' + (shuffle ? ' active' : ''), 
                onClick: function() { 
                  var newShuffle = !shuffle;
                  var newAutoplay = newShuffle ? true : autoplay;
                  setShuffle(newShuffle); 
                  if (newShuffle) setAutoplay(true);
                  updatePlaybackOptions(newAutoplay, newShuffle, loop);
                },
                title: 'Shuffle' + (shuffle ? ' (On)' : ' (Off)')
              }, React.createElement(Icon, { name: 'shuffle', size: 'sm' })),
              React.createElement('button', { 
                className: 'icon-btn toggle' + (loop ? ' active' : ''), 
                onClick: function() { 
                  var newLoop = !loop;
                  setLoop(newLoop);
                  updatePlaybackOptions(autoplay, shuffle, newLoop);
                },
                title: 'Loop' + (loop ? ' (On)' : ' (Off)')
              }, React.createElement(Icon, { name: 'loop', size: 'sm' })),
              React.createElement('button', { 
                className: 'icon-btn toggle' + (autoplay ? ' active' : ''), 
                onClick: function() { 
                  var newAutoplay = !autoplay;
                  setAutoplay(newAutoplay);
                  updatePlaybackOptions(newAutoplay, shuffle, loop);
                },
                title: 'Autoplay' + (autoplay ? ' (On)' : ' (Off)')
              }, React.createElement(Icon, { name: 'autoplay', size: 'sm' }))
            ),
            React.createElement('div', { className: 'now-playing' },
              currentVideo 
                ? React.createElement(React.Fragment, null, 
                    React.createElement('span', { className: 'playing-label' }, playbackState === 'playing' ? '▶ Playing' : '⏸ Paused'),
                    React.createElement('span', { className: 'playing-title' }, currentVideo.title || currentVideo.url)
                  )
                : React.createElement('span', { className: 'playing-label' }, 'Nothing playing')
            ),
            React.createElement('div', { className: 'volume-control' },
              React.createElement(Icon, { name: volume === 0 ? 'volume-x' : (volume < 50 ? 'volume-1' : 'volume-2'), size: 'sm' }),
              React.createElement('input', { 
                type: 'range', 
                className: 'volume-slider',
                min: 0, 
                max: 100, 
                value: volume, 
                onChange: function(e) { setVolume(parseInt(e.target.value, 10)); },
                title: 'Volume: ' + volume + '%'
              })
            ),
            React.createElement('button', { className: 'btn sm', onClick: playNext, disabled: !activePlaylist || currentIndex >= ((activePlaylist && activePlaylist.videos || []).length) - 1 }, 'Next ', React.createElement(Icon, { name: 'next', size: 'sm' })),
            // Notes toggle button - always visible so owner can toggle and users can see notes exist
            // Desktop: toggles notes panel, Mobile: opens slide-up panel
            React.createElement('button', { 
              className: 'icon-btn toggle notes-toggle' + (notesPanelOpen || mobileNotesOpen ? ' active' : '') + (currentVideo && currentVideo.notesHidden && !isOwner ? ' hidden-indicator' : ''), 
              onClick: function() { 
                // Check if mobile (based on viewport width)
                if (window.innerWidth <= 768) {
                  var newState = !mobileNotesOpen;
                  setMobileNotesOpen(newState);
                  if (newState) { setSidebarOpen(false); setMobileQueueOpen(false); setShareModalOpen(false); setSettingsOpen(false); setConnectedPanelOpen(false); }
                } else {
                  setNotesPanelOpen(!notesPanelOpen); 
                }
              },
              title: currentVideo && currentVideo.notesHidden && !isOwner ? 'Notes (hidden by owner)' : 'Video Notes'
            }, React.createElement(Icon, { name: 'fileText', size: 'sm' }))
          ),
          React.createElement(ConnectedUsers, { users: connectedUsers, isHost: isOwner, currentUserId: visitorId, roomId: room.id, onKick: handleKick, onRename: handleRenameUser, onColorChange: handleColorChange })
        ),
        
        // Notes Panel (collapsible right panel) - always render, content changes based on visibility
        React.createElement('aside', { className: 'notes-panel' + (notesPanelOpen ? '' : ' closed') },
          React.createElement('div', { className: 'notes-panel-header' },
            React.createElement('h3', null, React.createElement(Icon, { name: 'fileText', size: 'sm' }), ' Notes'),
            React.createElement('div', { className: 'notes-header-actions' },
              isOwner && currentVideo && currentVideo.id && React.createElement('button', {
                className: 'icon-btn sm' + (currentVideo.notesHidden ? ' active' : ''),
                onClick: toggleVideoNotesHidden,
                title: currentVideo.notesHidden ? 'Notes hidden from guests (click to show)' : 'Notes visible to all (click to hide)'
              }, React.createElement(Icon, { name: currentVideo.notesHidden ? 'eyeOff' : 'eye', size: 'sm' })),
              React.createElement('button', { 
                className: 'icon-btn sm', 
                onClick: function() { setNotesPanelOpen(false); }
              }, React.createElement(Icon, { name: 'chevron-right', size: 'sm' }))
            )
          ),
          React.createElement('div', { className: 'notes-panel-content' },
            currentVideo 
              ? React.createElement(VideoNotesEditor, {
                  video: currentVideo,
                  onSave: updateVideoNotes,
                  isOwner: isOwner,
                  displayName: displayName
                })
              : React.createElement('div', { className: 'notes-empty' }, 'Select a video to view or edit notes')
          )
        )
      )
    ),
    
    // Mobile bottom navigation
    React.createElement('nav', { className: 'mobile-nav' },
      React.createElement('div', { className: 'mobile-nav-items' },
        React.createElement('button', { 
          className: 'mobile-nav-item' + (sidebarOpen ? ' active' : ''),
          onClick: function() { 
            var newState = !sidebarOpen;
            setSidebarOpen(newState); 
            if (newState) { setMobileQueueOpen(false); setShareModalOpen(false); setSettingsOpen(false); setConnectedPanelOpen(false); }
          }
        },
          React.createElement(Icon, { name: 'menu' }),
          React.createElement('span', null, 'Playlists')
        ),
        React.createElement('button', { 
          className: 'mobile-nav-item' + (mobileQueueOpen ? ' active' : ''),
          onClick: function() { 
            var newState = !mobileQueueOpen;
            setMobileQueueOpen(newState); 
            if (newState) { setSidebarOpen(false); setShareModalOpen(false); setSettingsOpen(false); setConnectedPanelOpen(false); }
          }
        },
          React.createElement(Icon, { name: 'list' }),
          React.createElement('span', null, 'Queue')
        ),
        React.createElement('button', { 
          className: 'mobile-nav-item' + (connectedPanelOpen ? ' active' : ''),
          onClick: function() { 
            var newState = !connectedPanelOpen;
            setConnectedPanelOpen(newState); 
            if (newState) { setSidebarOpen(false); setMobileQueueOpen(false); setShareModalOpen(false); setSettingsOpen(false); }
          }
        },
          React.createElement(Icon, { name: 'users' }),
          React.createElement('span', null, 'Users')
        ),
        React.createElement('button', { 
          className: 'mobile-nav-item' + (shareModalOpen ? ' active' : ''),
          onClick: function() { 
            var newState = !shareModalOpen;
            setShareModalOpen(newState); 
            if (newState) { setSidebarOpen(false); setMobileQueueOpen(false); setSettingsOpen(false); setConnectedPanelOpen(false); }
          }
        },
          React.createElement(Icon, { name: 'share' }),
          React.createElement('span', null, 'Share')
        ),
        React.createElement('button', { 
          className: 'mobile-nav-item' + (settingsOpen ? ' active' : ''),
          onClick: function() { 
            if (!user) { setShowAuthModal(true); return; }
            var newState = !settingsOpen;
            setSettingsOpen(newState);
            if (newState) { setSidebarOpen(false); setMobileQueueOpen(false); setShareModalOpen(false); setConnectedPanelOpen(false); }
          }
        },
          React.createElement(Icon, { name: 'settings' }),
          React.createElement('span', null, user ? 'Settings' : 'Sign In')
        )
      )
    ),
    
    // Panel overlay (closes any open panel when tapped)
    (shareModalOpen || connectedPanelOpen || settingsOpen || mobileNotesOpen) && React.createElement('div', { 
      className: 'panel-overlay visible',
      onClick: function() { setShareModalOpen(false); setConnectedPanelOpen(false); setSettingsOpen(false); setMobileNotesOpen(false); }
    }),
    
    // Share slide-up panel
    React.createElement('div', { className: 'slide-panel share-panel' + (shareModalOpen ? ' open' : '') },
      React.createElement('div', { className: 'slide-panel-header' },
        React.createElement('h3', null, '🔗 Share Room'),
        React.createElement('button', { className: 'panel-close-btn', onClick: function() { setShareModalOpen(false); } }, React.createElement(Icon, { name: 'x', size: 'sm' }))
      ),
      React.createElement('div', { className: 'slide-panel-content' },
        React.createElement('p', { className: 'panel-description' }, 'Anyone with this link can join your room'),
        React.createElement('div', { className: 'share-link-box' },
          React.createElement('input', { value: location.origin + location.pathname + '#/room/' + hostId + '/' + room.id, readOnly: true }),
          React.createElement('button', { className: 'btn primary', onClick: function() { copyShareLink(); } }, 'Copy Link')
        )
      )
    ),
    
    // Connected Users slide-up panel  
    React.createElement('div', { className: 'slide-panel connected-panel' + (connectedPanelOpen ? ' open' : '') },
      React.createElement('div', { className: 'slide-panel-header' },
        React.createElement('h3', null, '👥 In Room (', connectedUsers.length, ')'),
        React.createElement('button', { className: 'panel-close-btn', onClick: function() { setConnectedPanelOpen(false); } }, React.createElement(Icon, { name: 'x', size: 'sm' }))
      ),
      React.createElement('div', { className: 'slide-panel-content' },
        connectedUsers.length === 0 
          ? React.createElement('p', { className: 'empty-message' }, 'No one else is here yet. Share the room link to invite friends!')
          : React.createElement('div', { className: 'users-list-panel' },
              connectedUsers.map(function(u) {
                var uDisplayName = u.displayName || u.guestName || 'Guest';
                var isCurrentUser = (u.visitorId || u.guestId) === visitorId;
                var userColor = u.color || '#d4a824';
                var isGuest = u.guestId || (u.visitorId && u.visitorId.startsWith('guest_'));
                var statusClass = u.status || 'offline';
                return React.createElement('div', { key: u.visitorId || u.guestId, className: 'user-list-item' + (isCurrentUser ? ' current' : '') + (u.isOwner ? ' owner' : '') },
                  React.createElement('div', { className: 'user-avatar', style: { background: userColor } }, 
                    u.isOwner ? '👑' : uDisplayName.charAt(0).toUpperCase()
                  ),
                  React.createElement('div', { className: 'user-info' },
                    React.createElement('span', { className: 'user-name' }, 
                      uDisplayName, 
                      isCurrentUser && ' (You)',
                      isGuest && !isCurrentUser && React.createElement('span', { className: 'guest-tag' }, ' (guest)')
                    ),
                    React.createElement('span', { className: 'user-status ' + statusClass }, 
                      statusClass === 'online' ? '● Connected' : '○ Away'
                    )
                  ),
                  isOwner && !isCurrentUser && React.createElement('button', { 
                    className: 'icon-btn sm danger', 
                    onClick: function() { handleKick(u.visitorId || u.guestId); },
                    title: 'Kick user'
                  }, React.createElement(Icon, { name: 'x', size: 'sm' }))
                );
              })
            )
      )
    ),
    
    // Mobile Notes slide-up panel - always render, content changes based on visibility
    React.createElement('div', { className: 'slide-panel notes-panel-mobile' + (mobileNotesOpen ? ' open' : '') },
      React.createElement('div', { className: 'slide-panel-header' },
        React.createElement('h3', null, '📝 Video Notes'),
        React.createElement('div', { className: 'notes-header-actions' },
          isOwner && currentVideo && currentVideo.id && React.createElement('button', {
            className: 'icon-btn sm' + (currentVideo.notesHidden ? ' active' : ''),
            onClick: toggleVideoNotesHidden,
            title: currentVideo.notesHidden ? 'Notes hidden from guests' : 'Notes visible to all'
          }, React.createElement(Icon, { name: currentVideo.notesHidden ? 'eyeOff' : 'eye', size: 'sm' })),
          React.createElement('button', { className: 'panel-close-btn', onClick: function() { setMobileNotesOpen(false); } }, React.createElement(Icon, { name: 'x', size: 'sm' }))
        )
      ),
      React.createElement('div', { className: 'slide-panel-content' },
        currentVideo 
          ? React.createElement(VideoNotesEditor, {
              video: currentVideo,
              onSave: updateVideoNotes,
              isOwner: isOwner,
              displayName: displayName
            })
          : React.createElement('div', { className: 'notes-empty' }, 'Select a video to view or edit notes')
      )
    ),
    
    // Settings slide-up panel (mobile only - hidden on desktop via CSS)
    React.createElement('div', { className: 'slide-panel settings-panel' + (settingsOpen && user ? ' open' : '') },
      React.createElement('div', { className: 'slide-panel-header' },
        React.createElement('h3', null, '⚙️ Settings'),
        React.createElement('button', { className: 'panel-close-btn', onClick: function() { setSettingsOpen(false); } }, React.createElement(Icon, { name: 'x', size: 'sm' }))
      ),
      user && React.createElement(SettingsContent, { user: user, onUpdate: props.onUpdateUser, onLogout: function() { props.onLogout(); setSettingsOpen(false); } })
    ),
    
    // Desktop Settings Modal (desktop only - hidden on mobile via CSS)
    settingsOpen && user && React.createElement('div', { className: 'desktop-settings-modal' },
      React.createElement(SettingsModal, { user: user, onClose: function() { setSettingsOpen(false); }, onUpdate: props.onUpdateUser, onLogout: props.onLogout })
    ),
    
    // Desktop Share Modal (desktop only - hidden on mobile via CSS)
    shareModalOpen && React.createElement('div', { className: 'desktop-share-modal' },
      React.createElement('div', { className: 'modal-overlay', onClick: function() { setShareModalOpen(false); } },
        React.createElement('div', { className: 'modal share-modal', onClick: function(e) { e.stopPropagation(); } },
          React.createElement('button', { className: 'modal-close', onClick: function() { setShareModalOpen(false); } }, '×'),
          React.createElement('h2', null, '🔗 Share Room'),
          React.createElement('p', null, 'Anyone with this link can join your room'),
          React.createElement('div', { className: 'share-link-box' },
            React.createElement('input', { value: location.origin + location.pathname + '#/room/' + hostId + '/' + room.id, readOnly: true }),
            React.createElement('button', { className: 'btn primary', onClick: copyShareLink }, 'Copy Link')
          )
        )
      )
    ),
    
    // Auth modal for guests to create account (keep as modal)
    showAuthModal && React.createElement('div', { className: 'modal-overlay', onClick: function() { setShowAuthModal(false); } },
      React.createElement('div', { className: 'modal auth-modal-in-room', onClick: function(e) { e.stopPropagation(); } },
        React.createElement('button', { className: 'modal-close', onClick: function() { setShowAuthModal(false); } }, '×'),
        React.createElement(AuthScreen, { 
          onAuth: function(newUser) { 
            props.onUpdateUser(newUser);
            setShowAuthModal(false);
            showNotif('Account created! Welcome, ' + newUser.displayName);
          },
          embedded: true,
          suggestedName: displayName
        })
      )
    ),
    
    // Import Playlist Modal (cross-room import)
    showImportModal && React.createElement(ImportPlaylistModal, {
      currentRoomId: room.id,
      onClose: function() { setShowImportModal(false); },
      onImported: function(result) {
        showNotif('Imported "' + result.name + '" with ' + result.videoCount + ' videos!');
        // Sync will pick up the new playlist
      }
    }),
    
    notification && React.createElement('div', { className: 'notification ' + notification.type }, notification.message)
  );
}

// ============================================
// Main App
// ============================================
function MultiviewApp() {
  var _user = useState(null);
  var user = _user[0];
  var setUser = _user[1];
  
  var _loading = useState(true);
  var loading = _loading[0];
  var setLoading = _loading[1];
  
  var _currentView = useState('home');
  var currentView = _currentView[0];
  var setCurrentView = _currentView[1];
  
  var _currentRoom = useState(null);
  var currentRoom = _currentRoom[0];
  var setCurrentRoom = _currentRoom[1];
  
  var _roomHostId = useState(null);
  var roomHostId = _roomHostId[0];
  var setRoomHostId = _roomHostId[1];
  
  var _guestDisplayName = useState(null);
  var guestDisplayName = _guestDisplayName[0];
  var setGuestDisplayName = _guestDisplayName[1];
  
  var _showGuestModal = useState(false);
  var showGuestModal = _showGuestModal[0];
  var setShowGuestModal = _showGuestModal[1];
  
  var _showAuthScreen = useState(false);
  var showAuthScreen = _showAuthScreen[0];
  var setShowAuthScreen = _showAuthScreen[1];
  
  var _pendingRoom = useState(null);
  var pendingRoom = _pendingRoom[0];
  var setPendingRoom = _pendingRoom[1];

  useEffect(function() {
    api.auth.getCurrentUser().then(function(u) {
      if (u) {
        setUser(u);
        // Apply user's saved theme
        var userTheme = localStorage.getItem('theme_' + u.id) || 'gold';
        document.documentElement.setAttribute('data-theme', userTheme);
      }
      var roomInfo = parseRoomUrl();
      if (roomInfo) handleJoinFromUrl(roomInfo.hostId, roomInfo.roomId, u);
    }).finally(function() { setLoading(false); });
  }, []);

  useEffect(function() {
    function handleHashChange() {
      var roomInfo = parseRoomUrl();
      if (roomInfo) handleJoinFromUrl(roomInfo.hostId, roomInfo.roomId, user);
      else if (currentView === 'room') { setCurrentView('home'); setCurrentRoom(null); }
    }
    window.addEventListener('hashchange', handleHashChange);
    return function() { window.removeEventListener('hashchange', handleHashChange); };
  }, [currentView, user]);

  function handleJoinFromUrl(hostId, roomId, currentUser) {
    api.rooms.get(roomId).then(function(room) {
      if (!room) { alert('Room not found'); location.hash = ''; return; }
      if (currentUser) {
        setCurrentRoom(room);
        setRoomHostId(hostId);
        setGuestDisplayName(currentUser.displayName);
        setCurrentView('room');
      } else {
        setPendingRoom({ room: room, hostId: hostId });
        setShowGuestModal(true);
      }
    }).catch(function(err) { alert('Failed: ' + err.message); location.hash = ''; });
  }

  function handleGuestJoin(name, isReturning) {
    if (!pendingRoom) return;
    
    if (isReturning && name) {
      // Try to find existing guest session by name in this room
      // Store the returning guest name so join can look it up
      localStorage.setItem('returning_guest_' + pendingRoom.room.id, name);
    }
    
    setCurrentRoom(pendingRoom.room);
    setRoomHostId(pendingRoom.hostId);
    setGuestDisplayName(name);
    setCurrentView('room');
    setShowGuestModal(false);
    setPendingRoom(null);
  }

  function handleAuthComplete(u) {
    setUser(u);
    setShowAuthScreen(false);
    if (pendingRoom) {
      setCurrentRoom(pendingRoom.room);
      setRoomHostId(pendingRoom.hostId);
      setGuestDisplayName(u.displayName);
      setCurrentView('room');
      setPendingRoom(null);
    }
  }

  function handleEnterRoom(room, hostId) {
    var actualHostId = hostId || room.ownerId || user.id;
    location.hash = '/room/' + actualHostId + '/' + room.id;
    setCurrentRoom(room);
    setRoomHostId(actualHostId);
    setGuestDisplayName(user.displayName);
    setCurrentView('room');
  }

  function handleGoHome() {
    location.hash = '';
    setCurrentView('home');
    setCurrentRoom(null);
  }

  function handleKicked() {
    alert('You have been kicked from the room.');
    location.hash = '';
    setCurrentView('home');
    setCurrentRoom(null);
  }

  function handleLogout() {
    api.auth.logout().then(function() {
      setUser(null);
      setCurrentView('home');
      setCurrentRoom(null);
      location.hash = '';
      // Reset to default gold theme when logged out
      document.documentElement.setAttribute('data-theme', 'gold');
    });
  }

  if (loading) return React.createElement('div', { className: 'loading-screen' }, React.createElement('div', { className: 'loading-dragon' }, '🐉'), React.createElement('div', { className: 'loading-text' }, 'Loading...'));

  if (showGuestModal) return React.createElement(GuestJoinModal, { onJoin: handleGuestJoin, onLogin: function() { setShowGuestModal(false); setShowAuthScreen(true); } });

  if (showAuthScreen) return React.createElement(AuthScreen, { onAuth: handleAuthComplete });

  if (!user && currentView !== 'room') return React.createElement(AuthScreen, { onAuth: function(u) { 
    setUser(u); 
    // Apply user's saved theme on login
    var userTheme = localStorage.getItem('theme_' + u.id) || 'gold';
    document.documentElement.setAttribute('data-theme', userTheme);
    var ri = parseRoomUrl(); 
    if (ri) handleJoinFromUrl(ri.hostId, ri.roomId, u); 
  } });

  if (currentView === 'room' && currentRoom) return React.createElement(Room, { user: user, room: currentRoom, hostId: roomHostId, guestDisplayName: guestDisplayName, onHome: user ? handleGoHome : null, onLogout: handleLogout, onUpdateUser: setUser, onKicked: handleKicked });

  if (user) return React.createElement(HomePage, { user: user, onEnterRoom: handleEnterRoom, onLogout: handleLogout, onUpdateUser: setUser });

  return React.createElement(AuthScreen, { onAuth: setUser });
}

// Initialize theme to default gold
// User-specific theme will be applied after login
(function() {
  document.documentElement.setAttribute('data-theme', 'gold');
})();

// Disable browser's default right-click context menu
// Our custom context menus will still work because they use stopPropagation
document.addEventListener('contextmenu', function(e) {
  // Allow default context menu on input/textarea elements for text editing
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
    return;
  }
  e.preventDefault();
});

// Render
console.log('Multiview with YouTube IFrame API sync');
ReactDOM.createRoot(document.getElementById('app')).render(React.createElement(MultiviewApp));

// ============================================
// MultiView Desktop - Preload Script
// Bridges web app with Electron offline storage
// ============================================
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('multiviewDesktop', {
  isDesktop: true,
  version: '1.0.0',

  // Save room state locally for offline editing
  saveOffline: (roomId, state) => {
    return ipcRenderer.invoke('offline-store-save', roomId, state);
  },

  // Get cached offline state for a room
  getOffline: (roomId) => {
    return ipcRenderer.invoke('offline-store-get', roomId);
  },

  // Clear offline data after successful sync
  clearOffline: (roomId) => {
    return ipcRenderer.invoke('offline-store-clear', roomId);
  },

  // Get all pending offline edits
  getPending: () => {
    return ipcRenderer.invoke('offline-store-pending');
  },

  // Notify main process that an edit was synced
  markSynced: (roomId) => {
    ipcRenderer.send('offline-edit-synced', roomId);
  },

  // Listen for sync requests from main process
  onSyncRequest: (callback) => {
    ipcRenderer.on('sync-offline-edit', (event, edit) => {
      callback(edit);
    });
  }
});

// ─── Auto-inject offline detection into the web app ───
window.addEventListener('DOMContentLoaded', () => {
  // Monitor online/offline status
  const updateStatus = () => {
    document.body.classList.toggle('desktop-offline', !navigator.onLine);
    document.body.classList.toggle('desktop-online', navigator.onLine);

    // Dispatch custom event for the web app to handle
    window.dispatchEvent(new CustomEvent('multiview-connection-change', {
      detail: { online: navigator.onLine }
    }));
  };

  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);
  updateStatus();

  // Inject desktop indicator badge
  const injectBadge = () => {
    if (document.querySelector('.desktop-badge')) return;
    const badge = document.createElement('div');
    badge.className = 'desktop-badge';
    badge.innerHTML = '🖥️ Desktop';
    badge.style.cssText = 'position:fixed;bottom:8px;right:8px;background:rgba(212,168,36,0.15);color:#d4a824;font-size:9px;padding:3px 8px;border-radius:4px;z-index:999;pointer-events:none;font-family:Inter,sans-serif;letter-spacing:0.05em;border:1px solid rgba(212,168,36,0.2);';
    document.body.appendChild(badge);
  };
  setTimeout(injectBadge, 1000);

  // ─── Hook into craft room sync for offline support ───
  // Intercept failed pushes and save locally
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    try {
      const response = await originalFetch.apply(this, args);
      return response;
    } catch (err) {
      // Network error - we're offline
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
      if (url && url.includes('/craftrooms/') && url.includes('/sync') && args[1]?.method === 'PUT') {
        // Save the state locally for later sync
        try {
          const body = JSON.parse(args[1].body);
          const roomMatch = url.match(/\/craftrooms\/(\d+)\/sync/);
          if (roomMatch && body.state && window.multiviewDesktop) {
            await window.multiviewDesktop.saveOffline(roomMatch[1], body.state);
            console.log('[Desktop] Saved offline edit for room', roomMatch[1]);

            // Return a fake "success" response so the app doesn't error
            return new Response(JSON.stringify({ version: Date.now(), offline: true }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        } catch (saveErr) {
          console.error('[Desktop] Failed to save offline:', saveErr);
        }
      }
      throw err;
    }
  };

  // Listen for sync requests when we come back online
  if (window.multiviewDesktop) {
    window.multiviewDesktop.onSyncRequest(async (edit) => {
      if (!navigator.onLine) return;
      try {
        const token = localStorage.getItem('mv_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = 'Bearer ' + token;

        const resp = await originalFetch('/api/craftrooms/' + edit.roomId + '/sync', {
          method: 'PUT',
          headers,
          body: JSON.stringify({ state: edit.state })
        });

        if (resp.ok) {
          window.multiviewDesktop.markSynced(edit.roomId);
          console.log('[Desktop] Synced offline edit for room', edit.roomId);
        }
      } catch (err) {
        console.warn('[Desktop] Sync failed, will retry:', err);
      }
    });

    // Auto-sync when coming back online
    window.addEventListener('online', async () => {
      console.log('[Desktop] Back online, syncing pending edits...');
      const pending = await window.multiviewDesktop.getPending();
      for (const edit of pending) {
        try {
          const token = localStorage.getItem('mv_token');
          const headers = { 'Content-Type': 'application/json' };
          if (token) headers['Authorization'] = 'Bearer ' + token;

          const resp = await originalFetch('/api/craftrooms/' + edit.roomId + '/sync', {
            method: 'PUT',
            headers,
            body: JSON.stringify({ state: edit.state })
          });

          if (resp.ok) {
            window.multiviewDesktop.markSynced(edit.roomId);
            console.log('[Desktop] Synced room', edit.roomId);
          }
        } catch (err) {
          console.warn('[Desktop] Failed to sync room', edit.roomId, err);
        }
      }
    });
  }
});

// ============================================
// MultiView Desktop - Main Process
// Electron wrapper with offline support
// ============================================
const { app, BrowserWindow, ipcMain, session, Menu, shell, dialog } = require('electron');
const path = require('path');
const OfflineStore = require('./offline-store');

// Your deployed site URL
const SITE_URL = 'https://multiview.app'; // <-- UPDATE THIS to your actual domain

let mainWindow = null;
const offlineStore = new OfflineStore();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: 'MultiView',
    icon: path.join(__dirname, 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    backgroundColor: '#060606',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      partition: 'persist:multiview'
    }
  });

  // Show window once content is ready (avoids white flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Build application menu
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'Home', click: () => mainWindow.loadURL(SITE_URL) },
        { type: 'separator' },
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => mainWindow.reload() },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'toggleDevTools' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        { label: 'MultiView Website', click: () => shell.openExternal(SITE_URL) },
        { type: 'separator' },
        {
          label: 'Offline Data',
          click: () => {
            const pending = offlineStore.getPendingCount();
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Offline Status',
              message: pending > 0
                ? `You have ${pending} offline edit(s) waiting to sync.`
                : 'All changes are synced. No pending offline edits.'
            });
          }
        }
      ]
    }
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  // Load the site
  mainWindow.loadURL(SITE_URL);

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http') && !url.includes(new URL(SITE_URL).hostname)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Inject offline bridge scripts after page loads
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.executeJavaScript(`
      window.__MULTIVIEW_DESKTOP = true;
      window.__DESKTOP_VERSION = '1.0.0';
    `);

    // If we have pending offline edits, try to sync them
    syncPendingEdits();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── Offline Edit Sync ───
async function syncPendingEdits() {
  const pending = offlineStore.getAllPending();
  if (!pending.length) return;

  for (const edit of pending) {
    try {
      // Ask the renderer to sync this edit
      mainWindow.webContents.send('sync-offline-edit', edit);
    } catch (err) {
      console.error('Failed to sync offline edit:', err);
    }
  }
}

// IPC handlers for offline support
ipcMain.handle('offline-store-save', (event, roomId, state) => {
  offlineStore.saveEdit(roomId, state);
  return { success: true };
});

ipcMain.handle('offline-store-get', (event, roomId) => {
  return offlineStore.getEdit(roomId);
});

ipcMain.handle('offline-store-clear', (event, roomId) => {
  offlineStore.clearEdit(roomId);
  return { success: true };
});

ipcMain.handle('offline-store-pending', () => {
  return offlineStore.getAllPending();
});

ipcMain.on('offline-edit-synced', (event, roomId) => {
  offlineStore.clearEdit(roomId);
});

// ─── App Lifecycle ───
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Handle certificate errors gracefully (for self-signed dev certs)
app.on('certificate-error', (event, webContents, url, error, cert, callback) => {
  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    event.preventDefault();
    callback(true);
  } else {
    callback(false);
  }
});

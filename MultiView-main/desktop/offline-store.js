// ============================================
// MultiView Desktop - Offline Storage
// Stores room edits locally when offline
// ============================================
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class OfflineStore {
  constructor() {
    this.storePath = path.join(app.getPath('userData'), 'offline-edits.json');
    this.data = this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.storePath)) {
        return JSON.parse(fs.readFileSync(this.storePath, 'utf8'));
      }
    } catch (err) {
      console.error('Failed to load offline store:', err);
    }
    return { edits: {} };
  }

  _save() {
    try {
      const dir = path.dirname(this.storePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.storePath, JSON.stringify(this.data, null, 2));
    } catch (err) {
      console.error('Failed to save offline store:', err);
    }
  }

  saveEdit(roomId, state) {
    this.data.edits[roomId] = {
      roomId,
      state,
      timestamp: Date.now(),
      synced: false
    };
    this._save();
  }

  getEdit(roomId) {
    return this.data.edits[roomId] || null;
  }

  clearEdit(roomId) {
    delete this.data.edits[roomId];
    this._save();
  }

  getAllPending() {
    return Object.values(this.data.edits).filter(e => !e.synced);
  }

  getPendingCount() {
    return this.getAllPending().length;
  }
}

module.exports = OfflineStore;

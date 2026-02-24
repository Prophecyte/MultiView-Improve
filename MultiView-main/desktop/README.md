# MultiView Desktop App

Electron wrapper for MultiView that enables offline editing and syncs when back online.

## Prerequisites

- **Node.js** 18+ (https://nodejs.org)
- **npm** (comes with Node.js)

## Quick Start (Development)

```bash
cd desktop
npm install
npm start
```

## Building for Distribution

### Windows (.exe installer)
```bash
npm run build:win
```
Output: `desktop/dist/MultiView Setup X.X.X.exe`

### macOS (.dmg)
```bash
npm run build:mac
```
Output: `desktop/dist/MultiView-X.X.X.dmg`

### Both platforms
```bash
npm run build:all
```

## Configuration

1. Open `main.js`
2. Update `SITE_URL` to your deployed MultiView domain:
   ```js
   const SITE_URL = 'https://your-domain.netlify.app';
   ```

## App Icons

Place your icons in the `icons/` folder:
- `icon.ico` — Windows (256×256 .ico)
- `icon.icns` — macOS (.icns bundle)
- `icon.png` — Linux/fallback (512×512 .png)

To generate icons from a single PNG, use a tool like https://iconverticons.com

## How Offline Mode Works

1. **Normal mode**: The app loads your live site and works exactly like the browser
2. **Going offline**: When the network drops, any craft room edits are saved locally to disk
3. **Coming back online**: The app automatically pushes all saved edits to the server
4. **No data loss**: Edits queue locally and sync in order when connection returns

### Technical Details

- Offline edits stored in: `{userData}/offline-edits.json`
  - Windows: `%APPDATA%/multiview-desktop/`
  - macOS: `~/Library/Application Support/multiview-desktop/`
- The preload script intercepts failed `PUT /craftrooms/:id/sync` requests
- Failed pushes return a fake 200 so the craft room UI doesn't show errors
- On reconnection, all pending edits are replayed to the server in order
- Session/auth tokens are persisted between launches via `persist:multiview` partition

## Folder Structure

```
desktop/
├── main.js           # Electron main process
├── preload.js        # Bridge between web app and Electron
├── offline-store.js  # Local file-based edit storage
├── package.json      # Dependencies and build config
├── icons/            # App icons (add your own)
└── README.md         # This file
```

## Notes

- The app uses `contextIsolation: true` for security
- External links open in the system browser
- The app menu includes File, Edit, View, and Help menus
- A small "🖥️ Desktop" badge appears in the bottom-right corner
- `Ctrl+R` / `Cmd+R` reloads the page
- DevTools available via View menu or `Ctrl+Shift+I`

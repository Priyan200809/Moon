const { app, ipcMain } = require('electron');
const wm = require('./windowManager');
const store = require('./settingsStore');
const { createTrackingService } = require('./tracking/service');

const tracking = createTrackingService(store);

// Accept a command only from the exact window (top frame) that is allowed to send it.
function windowFor(who, event) {
  const win = who === 'moon' ? wm.getMoon() : wm.getDashboard();
  const ok = win && !win.isDestroyed() && event.sender === win.webContents && event.senderFrame === event.sender.mainFrame;
  return ok ? win : null;
}
function on(channel, who, handler) {
  ipcMain.on(channel, (event) => { const win = windowFor(who, event); if (win) handler(win); });
}
function handle(channel, who, handler) {
  ipcMain.handle(channel, (event, payload) => {
    if (!windowFor(who, event)) throw new Error('Rejected');
    return handler(payload);
  });
}

function registerIpc() {
  on('moon:drag-start', 'moon', wm.dragStart);
  on('moon:drag-move', 'moon', wm.dragMove);
  on('moon:drag-end', 'moon', wm.dragEnd);
  on('moon:menu', 'moon', wm.showMoonMenu);
  on('dashboard:open', 'moon', wm.openDashboard);
  on('dashboard:minimize', 'dashboard', (w) => w.minimize());
  on('dashboard:close', 'dashboard', (w) => w.close());
  on('dashboard:toggle-maximize', 'dashboard', (w) => (w.isMaximized() ? w.unmaximize() : w.maximize()));
  on('app:exit', 'dashboard', wm.quit);
  handle('settings:get', 'dashboard', () => store.getPreferences());
  handle('settings:save', 'dashboard', (p) => store.savePreferences(p));
  handle('usage:summary', 'dashboard', () => tracking.getSummary());
  handle('tracking:get', 'dashboard', () => tracking.getSettings());
  handle('tracking:save', 'dashboard', (p) => tracking.saveSettings(p));
  handle('usage:exclude', 'dashboard', (p) => tracking.setExcluded(p));
  handle('usage:delete-history', 'dashboard', (p) => tracking.deleteHistory(p));
  ipcMain.handle('app:version', () => app.getVersion());
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => wm.openDashboard());
  app.whenReady().then(() => {
    registerIpc();
    tracking.init();
    wm.createMoon();
  });
  // The moon keeps the app alive; closing the dashboard never quits.
  app.on('window-all-closed', () => {});
  app.on('before-quit', wm.prepareQuit);
  app.on('will-quit', () => tracking.shutdown()); // closes the open session and the database
}

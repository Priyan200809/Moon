const { app, BrowserWindow, Menu, screen } = require('electron');
const path = require('path');
const store = require('./settingsStore');

const MOON = 120; // window edge in DIPs (moon art + hard shadow)
const DEV_URL = process.env.LILMOON_DEV_URL;

let moon = null;
let dashboard = null;
let drag = null;
let quitting = false;
let saveTimer = null;
let cursor = () => screen.getCursorScreenPoint(); // overridable for tests

// ---------- persistence (see settingsStore.js) ----------
function savePosition() {
  if (!moon || moon.isDestroyed()) return;
  const [x, y] = moon.getPosition();
  try { store.saveMoon({ x, y }); } catch (err) { console.error('[lil-moon] could not save position:', err); }
}

function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(savePosition, 300);
}

// ---------- positioning ----------
const inside = (r, p) => p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;

function clampToScreen(x, y) {
  const centre = { x: Math.round(x + MOON / 2), y: Math.round(y + MOON / 2) };
  const a = screen.getDisplayNearestPoint(centre).workArea; // excludes the taskbar
  return {
    x: Math.round(Math.min(Math.max(x, a.x), a.x + a.width - MOON)),
    y: Math.round(Math.min(Math.max(y, a.y), a.y + a.height - MOON)),
  };
}

function initialPosition() {
  const m = store.getMoon();
  if (m && Number.isFinite(m.x) && Number.isFinite(m.y)) {
    const centre = { x: m.x + MOON / 2, y: m.y + MOON / 2 };
    // Ignore a saved spot on a monitor that no longer exists.
    if (screen.getAllDisplays().some((d) => inside(d.workArea, centre))) return clampToScreen(m.x, m.y);
  }
  const a = screen.getPrimaryDisplay().workArea;
  return { x: a.x + a.width - MOON - 24, y: a.y + a.height - MOON - 24 };
}

function reclamp() {
  if (!moon || moon.isDestroyed()) return;
  const [x, y] = moon.getPosition();
  moon.setBounds({ ...clampToScreen(x, y), width: MOON, height: MOON });
  saveSoon();
}

// ---------- windows ----------
const webPreferences = {
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
};

function loadView(win, route) {
  if (DEV_URL) win.loadURL(`${DEV_URL}#/${route}`);
  else win.loadFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'), { hash: `/${route}` });
}

function harden(win) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

function createMoon() {
  const p = initialPosition();
  moon = new BrowserWindow({
    x: p.x, y: p.y, width: MOON, height: MOON,
    frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
    thickFrame: false, resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, alwaysOnTop: true, show: false, title: 'Lil Moon', webPreferences,
  });
  moon.setAlwaysOnTop(true, 'screen-saver');
  harden(moon);
  loadView(moon, 'moon');
  moon.once('ready-to-show', () => moon.show());
  moon.on('blur', () => moon && !moon.isDestroyed() && moon.setAlwaysOnTop(true, 'screen-saver'));
  // The moon can only be closed through an explicit exit.
  moon.on('close', (e) => { if (!quitting) e.preventDefault(); });
  moon.on('closed', () => { moon = null; });
  screen.on('display-removed', reclamp);
  screen.on('display-metrics-changed', reclamp);
  return moon;
}

function openDashboard() {
  if (dashboard && !dashboard.isDestroyed()) {
    if (dashboard.isMinimized()) dashboard.restore();
    dashboard.show();
    dashboard.focus();
    return dashboard;
  }
  const a = (moon ? screen.getDisplayMatching(moon.getBounds()) : screen.getPrimaryDisplay()).workArea;
  const width = Math.min(1100, a.width - 80);
  const height = Math.min(760, a.height - 80);
  dashboard = new BrowserWindow({
    x: a.x + Math.round((a.width - width) / 2), y: a.y + Math.round((a.height - height) / 2),
    width, height, minWidth: 640, minHeight: 480, frame: false, resizable: true,
    backgroundColor: '#FFE500', show: false, title: 'Lil Moon', webPreferences,
  });
  harden(dashboard);
  loadView(dashboard, 'dashboard');
  dashboard.once('ready-to-show', () => { dashboard.show(); dashboard.focus(); });
  dashboard.on('closed', () => { dashboard = null; });
  return dashboard;
}

// ---------- dragging (cursor-driven, so it is correct at any display scaling) ----------
function dragStart() {
  if (!moon) return;
  const c = cursor();
  const [x, y] = moon.getPosition();
  drag = { dx: c.x - x, dy: c.y - y };
}

function dragMove() {
  if (!drag || !moon) return;
  const c = cursor();
  const p = clampToScreen(c.x - drag.dx, c.y - drag.dy);
  moon.setBounds({ x: p.x, y: p.y, width: MOON, height: MOON }); // fixed size avoids mixed-DPI growth
}

function dragEnd() {
  if (!drag) return;
  drag = null;
  savePosition();
}

function showMoonMenu() {
  if (!moon) return;
  Menu.buildFromTemplate([
    { label: 'Open dashboard', click: openDashboard },
    { type: 'separator' },
    { label: 'Exit Lil Moon', click: quit },
  ]).popup({ window: moon });
}

function prepareQuit() {
  quitting = true;
  clearTimeout(saveTimer);
  savePosition();
}

function quit() {
  quitting = true;
  app.quit();
}

module.exports = {
  MOON, createMoon, openDashboard, dragStart, dragMove, dragEnd, showMoonMenu, prepareQuit, quit,
  getMoon: () => moon,
  getDashboard: () => dashboard,
  __setCursor: (fn) => { cursor = fn; },
};

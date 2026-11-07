// Automated smoke test, run with `npm run smoke` (two phases: persistence is checked across a restart).
// It drives the real windows and IPC; it cannot judge visuals or true Windows behaviour.
const { app, screen } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const phase = process.env.SMOKE_PHASE || '1';
const dir = process.env.SMOKE_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'lilmoon-'));
app.setPath('userData', dir);
require('../electron/main.js');
const wm = require('../electron/windowManager');

const results = [];
const check = (name, ok) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const watch = (win, tag) => {
  win.webContents.on('console-message', (e) => { if (e.level === 'error') errors.push(`${tag}: ${e.message}`); });
  win.webContents.on('did-fail-load', (_e, c, d) => errors.push(`${tag}: load failed ${c} ${d}`));
};
const fire = (win, code) => win.webContents.executeJavaScript(code).catch(() => {}); // window may vanish mid-call
const ev = (win, code) => win.webContents.executeJavaScript(code);
const pointer = (type, x, y) =>
  `document.querySelector('.moon').dispatchEvent(new PointerEvent('${type}',{bubbles:true,button:0,pointerId:1,screenX:${x},screenY:${y}}))`;

app.whenReady().then(async () => {
  try {
    await wait(1500);
    const moon = wm.getMoon();
    watch(moon, 'moon');
    await moon.webContents.reload(); await wait(1000);
    const prefs = moon.webContents.getLastWebPreferences();
    check('moon window created, always on top', !!moon && moon.isAlwaysOnTop());
    check('security: contextIsolation, no nodeIntegration, sandbox',
      prefs.contextIsolation === true && prefs.nodeIntegration === false && prefs.sandbox === true);
    check('renderer sees only the lilMoon bridge (no require/process)',
      await ev(moon, `typeof window.lilMoon==='object' && typeof require==='undefined' && typeof process==='undefined'`));

    const wa = screen.getPrimaryDisplay().workArea;
    if (phase === '2') {
      const saved = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')).moon;
      const [x, y] = moon.getPosition();
      check('moon position restored after restart', x === saved.x && y === saved.y);
      check('settings persisted across restart', JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')).preferences.defaultDailyLimitMin === 90);
    } else {
      const start = moon.getPosition();
      let cur = { x: start[0] + 50, y: start[1] + 50 };
      wm.__setCursor(() => cur);
      await ev(moon, pointer('pointerdown', 500, 500));
      cur = { x: cur.x - 200, y: cur.y - 150 };
      await ev(moon, pointer('pointermove', 300, 350));
      await wait(100);
      const moved = moon.getPosition();
      check('dragging moves the moon', moved[0] !== start[0] && moved[1] !== start[1]);
      await ev(moon, pointer('pointerup', 300, 350));
      await wait(200);
      check('dragging does not open the dashboard', wm.getDashboard() === null);
      const saved = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')).moon;
      check('position saved to disk', saved.x === moved[0] && saved.y === moved[1]);

      cur = { x: -9000, y: -9000 };
      await ev(moon, pointer('pointerdown', 300, 350));
      await ev(moon, pointer('pointermove', 100, 100));
      await ev(moon, pointer('pointerup', 100, 100));
      await wait(100);
      const [ex, ey] = moon.getPosition();
      check('dragging off-screen is clamped into the work area',
        ex >= wa.x && ey >= wa.y && ex + wm.MOON <= wa.x + wa.width && ey + wm.MOON <= wa.y + wa.height);
      const [fx, fy] = moon.getPosition();
      const sf = path.join(dir, 'settings.json');
      fs.writeFileSync(sf, JSON.stringify({ ...JSON.parse(fs.readFileSync(sf, 'utf8')), moon: { x: fx, y: fy } }));

      for (let i = 0; i < 3; i++) {
        await ev(moon, pointer('pointerdown', 10, 10));
        await ev(moon, pointer('pointerup', 10, 10));
      }
      await wait(2500);
      const dash = wm.getDashboard();
      check('clicking the moon opens the dashboard', !!dash);
      check('repeated clicks create no duplicate dashboards', require('electron').BrowserWindow.getAllWindows().length === 2);
      watch(dash, 'dashboard');
      await dash.webContents.reload(); await wait(1200);
      const text = (sel) => ev(dash, `document.querySelector(${JSON.stringify(sel)})?.textContent ?? ''`);
      const nav = async (label) => { await ev(dash, `[...document.querySelectorAll('.nav-btn')].find(b=>b.textContent===${JSON.stringify(label)}).click()`); await wait(250); };
      check('dashboard has 5 nav sections', (await ev(dash, `document.querySelectorAll('.nav-btn').length`)) === 5);
      check('home shows branding and status', (await text('h1')).includes("Lil Moon") && (await ev(dash, `document.body.innerText.includes('Assistant status')`)));
      await nav('Application usage');
      check('application page: rows with progress bars and sample label',
        (await ev(dash, `document.querySelectorAll('.usage-item .progress').length`)) === 5 && (await ev(dash, `document.body.innerText.includes('Sample data')`)));
      await nav('Website usage');
      check('website page renders', (await text('h1')) === 'Website usage' && (await ev(dash, `document.querySelectorAll('.usage-item').length`)) === 4);
      await nav('Voice assistant');
      check('voice page is honest about being unimplemented', (await ev(dash, `document.body.innerText.includes('not built yet') && document.body.innerText.includes('Not listening')`)));
      await nav('Settings');
      const good = { defaultDailyLimitMin: 90, theme: 'cream', startWithWindows: true };
      check('settings save returns validated values', JSON.stringify(await ev(dash, `window.lilMoon.dashboard.saveSettings(${JSON.stringify(good)})`)) === JSON.stringify(good));
      check('settings read back', JSON.stringify(await ev(dash, `window.lilMoon.dashboard.getSettings()`)) === JSON.stringify(good));
      const rejected = await ev(dash, `window.lilMoon.dashboard.saveSettings({defaultDailyLimitMin:-5,theme:'x',startWithWindows:1}).then(()=>false,()=>true)`);
      check('main process rejects invalid settings', rejected === true);
      check('saving settings keeps the moon position', !!JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')).moon);
      await dash.webContents.reload(); await wait(1200);
      await nav('Settings');
      check('saved theme and limit are applied after reload', (await ev(dash, `document.documentElement.dataset.theme`)) === 'cream' && (await ev(dash, `document.querySelector('.field input').value`)) === '90');
      await ev(dash, `window.lilMoon.dashboard.minimize()`); await wait(400);
      check('dashboard minimize (needs a window manager, may fail under bare Xvfb)', dash.isMinimized());
      await ev(moon, pointer('pointerdown', 10, 10)); await ev(moon, pointer('pointerup', 10, 10)); await wait(400);
      check('clicking the moon restores a minimized dashboard', !dash.isMinimized());
      await fire(dash, `window.lilMoon.dashboard.close()`); await wait(500);
      check('closing dashboard keeps the moon alive', wm.getDashboard() === null && !moon.isDestroyed() && moon.isVisible());
      await ev(moon, pointer('pointerdown', 10, 10)); await ev(moon, pointer('pointerup', 10, 10)); await wait(2000);
      app.on('will-quit', () => {
        check('explicit Exit quits the app', true);
        check('no JavaScript errors in renderers', errors.length === 0);
        process.exit(results.every(Boolean) ? 0 : 1);
      });
      await fire(wm.getDashboard(), `window.lilMoon.dashboard.exitApp()`);
      await wait(3000);
      check('explicit Exit quits the app', false);
    }
    check('no JavaScript errors in renderers', errors.length === 0);
    if (errors.length) console.log(errors);
  } catch (err) {
    console.error(err); check('smoke run completed without exception', false);
  }
  process.exit(results.every(Boolean) ? 0 : 1);
});

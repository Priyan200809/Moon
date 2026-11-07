// Exercises the Electron-facing layer (settings validation, service API, IPC-style payload checks) with a stubbed
// `electron` module, so it runs under plain Node. The Windows detector itself cannot be tested off Windows.
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { EventEmitter } = require('node:events');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lm-svc-'));
const power = Object.assign(new EventEmitter(), { getSystemIdleTime: () => 0 });
const electronStub = { app: { getPath: () => dir, getVersion: () => 'test' }, powerMonitor: power };
const origLoad = Module._load;
Module._load = function (request, ...rest) { return request === 'electron' ? electronStub : origLoad.call(this, request, ...rest); };

const store = require('../electron/settingsStore');
const { createTrackingService } = require('../electron/tracking/service');
const { openDatabase } = require('../electron/tracking/db');
const { UsageRepo } = require('../electron/tracking/usageRepo');
const { localDate } = require('../electron/tracking/timeutil');

const svc = createTrackingService(store);
svc.init();
test.after(() => { svc.shutdown(); Module._load = origLoad; fs.rmSync(dir, { recursive: true, force: true }); });

const other = new UsageRepo(openDatabase(path.join(dir, 'lil-moon.db'))); // second connection plays "earlier sessions"
const now = Date.now();

test('tracking defaults to OFF (opt-in) and the setting validates and persists', () => {
  assert.equal(svc.getSettings().enabled, false);
  assert.deepEqual(svc.saveSettings({ enabled: true, idleThresholdSec: 45, countLilMoon: false }), { enabled: true, idleThresholdSec: 45, countLilMoon: false });
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')).tracking.idleThresholdSec, 45);
  for (const bad of [null, {}, { enabled: 1, idleThresholdSec: 60, countLilMoon: false }, { enabled: true, idleThresholdSec: 5, countLilMoon: false },
    { enabled: true, idleThresholdSec: 60.5, countLilMoon: false }, { enabled: true, idleThresholdSec: 99999, countLilMoon: false }, { enabled: true, idleThresholdSec: 60, countLilMoon: 'yes' }]) {
    assert.throws(() => svc.saveSettings(bad));
  }
  assert.equal(svc.getSettings().idleThresholdSec, 45, 'a rejected save changes nothing');
});

test('Phase 2 preferences and the moon position survive tracking saves', () => {
  store.saveMoon({ x: 10, y: 20 });
  store.savePreferences({ defaultDailyLimitMin: 90, theme: 'lilac', startWithWindows: false });
  svc.saveSettings({ enabled: false, idleThresholdSec: 60, countLilMoon: false });
  assert.deepEqual(store.getMoon(), { x: 10, y: 20 });
  assert.equal(store.getPreferences().defaultDailyLimitMin, 90);
});

test('summary returns database-backed totals, most-used app and total', () => {
  const t0 = new Date(); t0.setHours(9, 0, 0, 0);
  const s = Math.min(t0.getTime(), now - 3 * 3600_000);
  if (localDate(s) === localDate(now)) { // skip the data insert in the first 3 hours after local midnight
    other.recordSpan({ exeName: 'code.exe', displayName: 'Visual Studio Code', startMs: s, endMs: s + 600_000 });
    other.recordSpan({ exeName: 'chrome.exe', displayName: 'Google Chrome', startMs: s + 700_000, endMs: s + 1_000_000 });
    const sum = svc.getSummary();
    assert.deepEqual(sum.apps.map((a) => [a.exeName, a.usedSec]), [['code.exe', 600], ['chrome.exe', 300]]);
    assert.equal(sum.totalSec, 900);
    assert.equal(sum.mostUsed.exeName, 'code.exe');
  }
});

test('exclusion payloads are validated, exclusion hides the app, and it can be undone', () => {
  other.recordSpan({ exeName: 'zed.exe', displayName: 'Zed', startMs: now - 50_000, endMs: now - 40_000 });
  for (const bad of [null, {}, { exeName: '..\\x.exe', excluded: true }, { exeName: 'zed.exe', excluded: 'yes' }, { exeName: 5, excluded: true }]) {
    assert.throws(() => svc.setExcluded(bad), /Invalid request/);
  }
  assert.throws(() => svc.setExcluded({ exeName: 'never-seen.exe', excluded: true }), /not been tracked/);
  svc.setExcluded({ exeName: 'zed.exe', excluded: true });
  assert.ok(!svc.getSummary().apps.some((a) => a.exeName === 'zed.exe'));
  assert.deepEqual(svc.getSummary().excluded.map((a) => a.exeName), ['zed.exe']);
  svc.setExcluded({ exeName: 'zed.exe', excluded: false });
  assert.deepEqual(svc.getSummary().excluded, []);
});

test('delete history needs explicit confirmation and then empties the data', () => {
  assert.throws(() => svc.deleteHistory({}), /confirmation/);
  assert.throws(() => svc.deleteHistory(undefined), /confirmation/);
  svc.deleteHistory({ confirm: true });
  const sum = svc.getSummary();
  assert.equal(sum.apps.length, 0);
  assert.equal(sum.totalSec, 0);
  assert.equal(sum.mostUsed, null);
});

test('with tracking on but no Windows APIs (this Linux box) the status says so instead of crashing', async () => {
  svc.saveSettings({ enabled: true, idleThresholdSec: 60, countLilMoon: false });
  await new Promise((r) => setTimeout(r, 1300)); // one real poll
  assert.equal(svc.getSummary().status.state, 'unavailable');
});

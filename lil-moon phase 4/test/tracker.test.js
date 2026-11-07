const test = require('node:test');
const assert = require('node:assert/strict');
const { makeWorld } = require('./helpers');
const { localDate, nextLocalMidnight } = require('../electron/tracking/timeutil');

test('switching between two applications closes one session and starts the next', () => {
  const w = makeWorld();
  w.fg = w.app('chrome.exe'); w.run(20);
  w.fg = w.app('code.exe'); w.run(30);
  w.tracker.stop();
  const rows = w.rows();
  assert.deepEqual(rows.map((r) => [r.exe_name, r.duration_sec]), [['chrome.exe', 20], ['code.exe', 30]]);
  assert.equal(rows[0].end_ts, rows[1].start_ts, 'sessions touch but never overlap');
});

test('duration is measured on the monotonic clock and end = start + elapsed', () => {
  const w = makeWorld();
  w.fg = w.app('chrome.exe'); w.run(10);
  w.wall -= 3_600_000; // user sets the system clock back an hour mid-session
  w.run(5);
  w.tracker.stop();
  const [r] = w.rows();
  assert.equal(r.duration_sec, 15);
  assert.equal(r.end_ts - r.start_ts, 15_000);
});

test('stops counting at the configured idle threshold and credits time only up to the last input', () => {
  const w = makeWorld();
  w.fg = w.app('chrome.exe'); w.run(30);        // active for 30s
  w.idle = 0; w.run(90, { idleGrows: true });   // then no input at all
  assert.equal(w.tracker.state, 'idle');
  assert.equal(w.tracker.cur, null);
  assert.deepEqual(w.rows().map((r) => r.duration_sec), [30]);
});

test('resumes with a new session after user activity', () => {
  const w = makeWorld();
  w.fg = w.app('chrome.exe'); w.run(10);
  w.run(70, { idleGrows: true });               // idle
  w.idle = 0; w.run(25);                        // user is back
  w.tracker.stop();
  const rows = w.rows();
  assert.equal(rows.length, 2);
  assert.ok(rows[1].start_ts > rows[0].end_ts);
  assert.equal(rows[1].duration_sec, 25);
});

test('Lil Moon itself is excluded by default and counted only when the setting allows', () => {
  const w = makeWorld();
  w.fg = { pid: w.selfPid, exeName: 'electron.exe', ignored: false }; w.run(20);
  assert.equal(w.rows().length, 0);
  assert.equal(w.tracker.state, 'not-counting');
  w.settings.countLilMoon = true; w.run(10); w.tracker.stop();
  assert.equal(w.rows().length, 1);
});

test('desktop, lock screen and missing windows are not counted', () => {
  const w = makeWorld();
  w.fg = { pid: 1, exeName: 'explorer.exe', ignored: true }; w.run(10);
  w.fg = w.app('lockapp.exe'); w.run(10);
  w.fg = null; w.run(10);
  w.tracker.stop();
  assert.equal(w.rows().length, 0);
});

test('suspend event ends the session at suspend time; resume starts clean', () => {
  const w = makeWorld();
  w.fg = w.app('chrome.exe'); w.run(20);
  w.tracker.onSuspend();
  w.wall += 8 * 3600_000; w.mono += 5000; // the PC sleeps; the monotonic clock may barely move
  w.tracker.onResume();
  w.run(10);
  w.tracker.stop();
  assert.deepEqual(w.rows().map((r) => r.duration_sec), [20, 10]);
});

test('a stalled timer without any power event (sleep/hibernate) never inflates a session', () => {
  const w = makeWorld();
  w.fg = w.app('chrome.exe'); w.run(20);
  w.wall += 3 * 3600_000; w.mono += 3 * 3600_000; // 3 hours pass between two polls
  w.run(1);
  w.run(10);
  w.tracker.stop();
  const rows = w.rows();
  assert.equal(rows[0].duration_sec, 20);
  assert.ok(rows.every((r) => r.duration_sec < 60));
});

test('lock stops counting and unlock resumes it', () => {
  const w = makeWorld();
  w.fg = w.app('chrome.exe'); w.run(15);
  w.tracker.onLock(); w.run(600);
  w.tracker.onUnlock(); w.run(10);
  w.tracker.stop();
  assert.deepEqual(w.rows().map((r) => r.duration_sec), [15, 10]);
});

test('a session crossing local midnight is split into one row per date and the parts add up', () => {
  const w = makeWorld({ start: new Date(2026, 9, 25, 23, 59, 40).getTime() });
  w.fg = w.app('chrome.exe'); w.run(60);
  w.tracker.stop();
  const rows = w.rows();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].session_date, '2026-10-25');
  assert.equal(rows[1].session_date, '2026-10-26');
  assert.equal(rows[0].end_ts, nextLocalMidnight(rows[0].start_ts));
  assert.equal(rows[0].duration_sec + rows[1].duration_sec, 60);
});

test('disabled tracking records nothing and closes any open session', () => {
  const w = makeWorld();
  w.fg = w.app('chrome.exe'); w.run(10);
  w.settings.enabled = false; w.run(10);
  assert.equal(w.tracker.state, 'off');
  assert.equal(w.tracker.cur, null);
  assert.deepEqual(w.rows().map((r) => r.duration_sec), [10]);
  w.run(30);
  assert.equal(w.rows().length, 1);
});

test('an unavailable detector or a detector error is reported, not thrown', () => {
  const w = makeWorld();
  w.available = false; w.run(3);
  assert.equal(w.tracker.state, 'unavailable');
  w.available = true; w.fgThrows = true; w.run(3);
  assert.equal(w.tracker.state, 'unavailable');
  w.fgThrows = false; w.fg = w.app('chrome.exe'); w.run(3);
  assert.equal(w.tracker.state, 'tracking');
});

test('polling repeatedly never double counts', () => {
  const w = makeWorld();
  w.fg = w.app('chrome.exe');
  for (let i = 0; i < 3; i++) w.tracker.tick(); // three polls at the same instant
  w.run(10); w.tracker.stop();
  assert.equal(w.rows().length, 1);
  assert.equal(w.rows()[0].duration_sec, 10);
});

test('crash recovery closes the orphaned session at its last heartbeat, exactly once', () => {
  const w = makeWorld();
  w.fg = w.app('chrome.exe'); w.run(75); // heartbeat fires at 30s and 60s; the app then "crashes" (no stop())
  const t2 = makeWorld({ db: w.db, start: w.wall + 5 * 60_000 }); // restart 5 minutes later, same database file
  t2.tracker.recover();
  t2.tracker.recover(); // a second recovery must be a no-op
  const rows = w.rows();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].duration_sec, 60); // last heartbeat, not the 5-minute gap
  assert.equal(w.repo.takeActive(), null);
});

test('stop() (app shutdown) saves the open session', () => {
  const w = makeWorld();
  w.fg = w.app('chrome.exe'); w.run(12);
  w.tracker.stop();
  w.tracker.stop();
  assert.deepEqual(w.rows().map((r) => r.duration_sec), [12]);
});

test('excluded apps are not recorded and are not rewritten on every poll', () => {
  const w = makeWorld();
  w.fg = w.app('chrome.exe'); w.run(5);
  w.repo.setExcluded('chrome.exe', true);
  w.tracker.resetSkip(); w.tracker.discardCurrent('chrome.exe');
  w.run(20);
  w.fg = w.app('code.exe'); w.run(10); w.tracker.stop();
  assert.deepEqual(w.rows().map((r) => r.exe_name), ['code.exe']);
});

test('live() reports the open session for today only', () => {
  const w = makeWorld();
  w.fg = w.app('chrome.exe'); w.run(7);
  assert.equal(w.tracker.live(localDate(w.wall)).seconds, 7);
  assert.equal(w.tracker.live('2000-01-01'), null);
});

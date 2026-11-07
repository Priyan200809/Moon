const { openDatabase } = require('../electron/tracking/db');
const { UsageRepo } = require('../electron/tracking/usageRepo');
const { SessionTracker } = require('../electron/tracking/sessionTracker');

// A controllable world: wall clock, monotonic clock, foreground window, idle seconds, settings.
function makeWorld({ start = new Date(2026, 9, 25, 10, 0, 0).getTime(), db = openDatabase(':memory:'), settings = {} } = {}) {
  const w = {
    wall: start, mono: 1_000_000, fg: null, idle: 0, available: true,
    settings: { enabled: true, idleThresholdSec: 60, countLilMoon: false, ...settings },
    db, repo: new UsageRepo(db), selfPid: 4242,
  };
  w.detector = { get available() { return w.available; }, reason: 'test', getForeground: () => { if (w.fgThrows) throw new Error('boom'); return w.fg; } };
  w.tracker = new SessionTracker({
    repo: w.repo, detector: w.detector, getIdleSec: () => w.idle, getSettings: () => w.settings,
    now: () => w.wall, mono: () => w.mono, pollMs: 1000, heartbeatMs: 30000, selfPids: () => [w.selfPid],
    log: { error() {} },
  });
  w.tracker.lastTick = w.mono;
  // advance time by `sec`, polling once per second like the real loop
  // The first poll happens at the current instant (the moment a window change is noticed), then once per second.
  w.run = (sec, { idleGrows = false } = {}) => {
    w.tracker.tick();
    for (let i = 0; i < sec; i++) { w.wall += 1000; w.mono += 1000; if (idleGrows) w.idle += 1; w.tracker.tick(); }
  };
  w.app = (exeName, pid = 100) => ({ pid, exeName, ignored: false });
  w.rows = () => db.prepare(
    'SELECT a.exe_name, s.start_ts, s.end_ts, s.duration_sec, s.session_date FROM app_sessions s JOIN tracked_apps a ON a.id = s.app_id ORDER BY s.start_ts'
  ).all();
  return w;
}
module.exports = { makeWorld };

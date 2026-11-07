// The only module that touches the usage tables. Validates every record before it is written.
const { localDate, nextLocalMidnight } = require('./timeutil');

const EXE_RE = /^[^\\/:*?"<>|\u0000-\u001f]{1,255}$/;
const MIN_SESSION_SEC = 1;      // shorter flickers (alt-tab) are not recorded
const MAX_PIECE_MS = 25 * 3600 * 1000; // one calendar day (a DST day can be 25h); anything longer is a bug

class UsageError extends Error {}

const normExe = (exe) => {
  const e = typeof exe === 'string' ? exe.trim().toLowerCase() : '';
  if (!EXE_RE.test(e)) throw new UsageError('Invalid executable name.');
  return e;
};
const cleanName = (n, fallback) => (typeof n === 'string' && n.trim() ? n.trim().slice(0, 120) : fallback);
const isMs = (n) => Number.isSafeInteger(n) && n > 0;

class UsageRepo {
  constructor(db) {
    this.db = db;
  }

  tx(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      this.db.exec('COMMIT');
      return out;
    } catch (err) {
      try { this.db.exec('ROLLBACK'); } catch { /* ignore */ }
      throw err;
    }
  }

  // Creates the app row on first sight; keeps the user's exclusion choice untouched.
  upsertApp(exeName, displayName, nowMs) {
    const exe = normExe(exeName);
    const name = cleanName(displayName, exe);
    this.db.prepare(
      `INSERT INTO tracked_apps (exe_name, display_name, first_seen_ts) VALUES (?, ?, ?)
       ON CONFLICT(exe_name) DO UPDATE SET display_name = excluded.display_name`
    ).run(exe, name, nowMs);
    const row = this.db.prepare('SELECT id, exe_name, display_name, is_excluded FROM tracked_apps WHERE exe_name = ?').get(exe);
    return { id: row.id, exeName: row.exe_name, displayName: row.display_name, excluded: row.is_excluded === 1 };
  }

  isExcluded(exeName) {
    const row = this.db.prepare('SELECT is_excluded FROM tracked_apps WHERE exe_name = ?').get(normExe(exeName));
    return !!row && row.is_excluded === 1;
  }

  // Stores a finished span, split at local midnights so each row belongs to exactly one date.
  // Rejects bad input; silently skips spans shorter than MIN_SESSION_SEC and spans that duplicate or overlap
  // an existing row. Returns the number of rows inserted.
  recordSpan({ exeName, displayName, startMs, endMs }, { clearActive = false } = {}) {
    const exe = normExe(exeName);
    if (!isMs(startMs) || !isMs(endMs)) throw new UsageError('Invalid session timestamps.');
    if (endMs < startMs) throw new UsageError('Session ends before it starts.');

    const pieces = [];
    for (let s = startMs; s < endMs; ) {
      const e = Math.min(endMs, nextLocalMidnight(s));
      pieces.push([s, e]);
      s = e;
    }
    for (const [s, e] of pieces) if (e - s > MAX_PIECE_MS) throw new UsageError('Session is implausibly long.');

    return this.tx(() => {
      let inserted = 0;
      const app = this.upsertApp(exe, displayName, startMs);
      const overlap = this.db.prepare('SELECT 1 FROM app_sessions WHERE start_ts < ? AND end_ts > ? LIMIT 1');
      const insert = this.db.prepare(
        'INSERT INTO app_sessions (app_id, start_ts, end_ts, duration_sec, session_date) VALUES (?, ?, ?, ?, ?)'
      );
      for (const [s, e] of pieces) {
        const sec = Math.round((e - s) / 1000);
        if (sec < MIN_SESSION_SEC) continue;
        if (overlap.get(e, s)) continue; // duplicate or overlapping record
        insert.run(app.id, s, e, sec, localDate(s));
        inserted++;
      }
      if (clearActive) this.db.exec('DELETE FROM app_active_session');
      return inserted;
    });
  }

  // ---- open-session bookkeeping (crash recovery) ----
  saveActive(appId, startMs, heartbeatMs) {
    this.db.prepare(
      `INSERT INTO app_active_session (id, app_id, start_ts, heartbeat_ts) VALUES (1, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET app_id = excluded.app_id, start_ts = excluded.start_ts, heartbeat_ts = excluded.heartbeat_ts`
    ).run(appId, startMs, heartbeatMs);
  }
  heartbeat(heartbeatMs) {
    this.db.prepare('UPDATE app_active_session SET heartbeat_ts = ? WHERE id = 1').run(heartbeatMs);
  }
  takeActive() {
    const r = this.db.prepare(
      `SELECT a.exe_name, a.display_name, s.start_ts, s.heartbeat_ts
       FROM app_active_session s JOIN tracked_apps a ON a.id = s.app_id WHERE s.id = 1`
    ).get();
    return r ? { exeName: r.exe_name, displayName: r.display_name, startMs: r.start_ts, heartbeatMs: r.heartbeat_ts } : null;
  }
  clearActive() {
    this.db.exec('DELETE FROM app_active_session');
  }

  // ---- reads / user controls ----
  dailyTotals(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new UsageError('Invalid date.');
    return this.db.prepare(
      `SELECT a.exe_name, a.display_name, SUM(s.duration_sec) AS used_sec
       FROM app_sessions s JOIN tracked_apps a ON a.id = s.app_id
       WHERE s.session_date = ? AND a.is_excluded = 0
       GROUP BY a.id ORDER BY used_sec DESC, a.display_name`
    ).all(date).map((r) => ({ exeName: r.exe_name, displayName: r.display_name, usedSec: r.used_sec }));
  }
  listExcluded() {
    return this.db.prepare('SELECT exe_name, display_name FROM tracked_apps WHERE is_excluded = 1 ORDER BY display_name')
      .all().map((r) => ({ exeName: r.exe_name, displayName: r.display_name }));
  }
  setExcluded(exeName, excluded) {
    if (typeof excluded !== 'boolean') throw new UsageError('Invalid value.');
    const res = this.db.prepare('UPDATE tracked_apps SET is_excluded = ? WHERE exe_name = ?').run(excluded ? 1 : 0, normExe(exeName));
    if (res.changes === 0) throw new UsageError('That application has not been tracked.');
  }
  deleteAllHistory() {
    this.tx(() => {
      this.db.exec('DELETE FROM app_sessions; DELETE FROM app_active_session;');
      this.db.exec('DELETE FROM tracked_apps WHERE is_excluded = 0'); // keep the user's exclusion list
    });
  }
}

module.exports = { UsageRepo, UsageError, MIN_SESSION_SEC };

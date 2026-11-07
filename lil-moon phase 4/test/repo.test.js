const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { openDatabase, SCHEMA_VERSION } = require('../electron/tracking/db');
const { UsageRepo } = require('../electron/tracking/usageRepo');
const { friendlyName } = require('../electron/tracking/displayName');

const T = new Date(2026, 9, 25, 12, 0, 0).getTime();
const mk = () => { const db = openDatabase(':memory:'); return { db, repo: new UsageRepo(db) }; };

test('migrations are idempotent and keep data across reopen', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lm-'));
  const file = path.join(dir, 'x.db');
  let db = openDatabase(file);
  new UsageRepo(db).recordSpan({ exeName: 'a.exe', displayName: 'A', startMs: T, endMs: T + 5000 });
  db.close();
  db = openDatabase(file);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, SCHEMA_VERSION);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM app_sessions').get().n, 1);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('invalid records are rejected', () => {
  const { repo, db } = mk();
  const bad = [
    { exeName: 'a.exe', startMs: T, endMs: T - 1 },                 // negative duration
    { exeName: 'a.exe', startMs: NaN, endMs: T },
    { exeName: 'a.exe', startMs: 1.5, endMs: 5000 },                // not an integer timestamp
    { exeName: '..\\evil.exe', startMs: T, endMs: T + 1000 },        // path separators
    { exeName: '', startMs: T, endMs: T + 1000 },
    { exeName: 5, startMs: T, endMs: T + 1000 },
  ];
  for (const b of bad) assert.throws(() => repo.recordSpan(b), undefined, JSON.stringify(b));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM app_sessions').get().n, 0);
});

test('duplicate and overlapping sessions are not stored twice', () => {
  const { repo, db } = mk();
  const s = { exeName: 'a.exe', displayName: 'A', startMs: T, endMs: T + 10_000 };
  assert.equal(repo.recordSpan(s), 1);
  assert.equal(repo.recordSpan(s), 0);
  assert.equal(repo.recordSpan({ ...s, exeName: 'b.exe', startMs: T + 5000, endMs: T + 15_000 }), 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM app_sessions').get().n, 1);
});

test('sub-second flickers are skipped; the database also enforces non-negative durations', () => {
  const { repo, db } = mk();
  assert.equal(repo.recordSpan({ exeName: 'a.exe', startMs: T, endMs: T + 400 }), 0);
  const app = repo.upsertApp('a.exe', 'A', T);
  assert.throws(() => db.prepare('INSERT INTO app_sessions (app_id,start_ts,end_ts,duration_sec,session_date) VALUES (?,?,?,?,?)').run(app.id, T, T + 1000, -5, '2026-10-25'));
});

test('daily totals sum per app, per date, and hide excluded apps', () => {
  const { repo } = mk();
  repo.recordSpan({ exeName: 'a.exe', displayName: 'A', startMs: T, endMs: T + 60_000 });
  repo.recordSpan({ exeName: 'a.exe', displayName: 'A', startMs: T + 100_000, endMs: T + 160_000 });
  repo.recordSpan({ exeName: 'b.exe', displayName: 'B', startMs: T + 200_000, endMs: T + 230_000 });
  const day = repo.dailyTotals('2026-10-25');
  assert.deepEqual(day.map((r) => [r.exeName, r.usedSec]), [['a.exe', 120], ['b.exe', 30]]);
  assert.deepEqual(repo.dailyTotals('2026-10-24'), []);
  repo.setExcluded('a.exe', true);
  assert.deepEqual(repo.dailyTotals('2026-10-25').map((r) => r.exeName), ['b.exe']);
  assert.deepEqual(repo.listExcluded().map((r) => r.exeName), ['a.exe']);
  assert.throws(() => repo.setExcluded('never-seen.exe', true));
});

test('SQL metacharacters in names are stored as plain text', () => {
  const { repo, db } = mk();
  repo.recordSpan({ exeName: "x'; DROP TABLE app_sessions;--.exe", displayName: "x'); --", startMs: T, endMs: T + 2000 });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM app_sessions').get().n, 1);
});

test('deleting history removes sessions but keeps the exclusion list', () => {
  const { repo, db } = mk();
  repo.recordSpan({ exeName: 'a.exe', displayName: 'A', startMs: T, endMs: T + 5000 });
  repo.recordSpan({ exeName: 'b.exe', displayName: 'B', startMs: T + 9000, endMs: T + 14000 });
  repo.setExcluded('b.exe', true);
  repo.deleteAllHistory();
  assert.equal(db.prepare('SELECT COUNT(*) n FROM app_sessions').get().n, 0);
  assert.deepEqual(repo.listExcluded().map((r) => r.exeName), ['b.exe']);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM tracked_apps').get().n, 1);
});

test('friendly names', () => {
  assert.equal(friendlyName('chrome.exe'), 'Google Chrome');
  assert.equal(friendlyName('my-cool_app.exe'), 'My Cool App');
  assert.equal(friendlyName(''), 'Unknown application');
});

test('DST: a span over the 23-hour spring-forward day keeps the right real duration', () => {
  const prev = process.env.TZ;
  process.env.TZ = 'America/New_York';
  try {
    const { repo, db } = mk();
    const start = new Date(2026, 2, 8, 0, 30).getTime(); // 8 Mar 2026: clocks jump 02:00 -> 03:00
    const end = new Date(2026, 2, 9, 0, 30).getTime();   // 23 real hours later
    assert.equal(end - start, 23 * 3600_000);
    repo.recordSpan({ exeName: 'a.exe', displayName: 'A', startMs: start, endMs: end });
    const rows = db.prepare('SELECT session_date, duration_sec FROM app_sessions ORDER BY start_ts').all();
    assert.deepEqual(rows.map((r) => r.session_date), ['2026-03-08', '2026-03-09']);
    assert.equal(rows[0].duration_sec + rows[1].duration_sec, 23 * 3600);
  } finally { if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev; }
});

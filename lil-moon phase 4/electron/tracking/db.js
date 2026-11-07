// Opens the local SQLite file and applies versioned migrations (PRAGMA user_version).
// Uses Node's built-in node:sqlite, so there is no native module to rebuild for Electron.
// All SQL elsewhere uses bound parameters. Tables are prefixed so they cannot collide with other tables in the file.
const { DatabaseSync } = require('node:sqlite');

const MIGRATIONS = [
  // v1: application usage tracking (Phase 4)
  `
  CREATE TABLE tracked_apps (
    id            INTEGER PRIMARY KEY,
    exe_name      TEXT NOT NULL UNIQUE,                      -- lower-case file name only, never a path
    display_name  TEXT NOT NULL,
    is_excluded   INTEGER NOT NULL DEFAULT 0 CHECK (is_excluded IN (0, 1)),
    first_seen_ts INTEGER NOT NULL                           -- epoch ms, UTC
  );
  CREATE TABLE app_sessions (
    id            INTEGER PRIMARY KEY,
    app_id        INTEGER NOT NULL REFERENCES tracked_apps(id) ON DELETE CASCADE,
    start_ts      INTEGER NOT NULL,                          -- epoch ms, UTC
    end_ts        INTEGER NOT NULL,                          -- epoch ms, UTC
    duration_sec  INTEGER NOT NULL CHECK (duration_sec >= 0),
    session_date  TEXT NOT NULL CHECK (session_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'), -- local date
    CHECK (end_ts >= start_ts),
    UNIQUE (app_id, start_ts)
  );
  CREATE INDEX idx_app_sessions_date  ON app_sessions (session_date, app_id);
  CREATE INDEX idx_app_sessions_range ON app_sessions (start_ts, end_ts);
  -- At most one row: the session currently open. Used to recover after a crash or power loss.
  CREATE TABLE app_active_session (
    id           INTEGER PRIMARY KEY CHECK (id = 1),
    app_id       INTEGER NOT NULL REFERENCES tracked_apps(id) ON DELETE CASCADE,
    start_ts     INTEGER NOT NULL,
    heartbeat_ts INTEGER NOT NULL
  );
  `,
];

function migrate(db) {
  const current = db.prepare('PRAGMA user_version').get().user_version;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`); // v is an internal integer, not user input
      db.exec('COMMIT');
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch { /* ignore */ }
      throw err;
    }
  }
}

function openDatabase(file) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
  migrate(db);
  return db;
}

module.exports = { openDatabase, SCHEMA_VERSION: MIGRATIONS.length };

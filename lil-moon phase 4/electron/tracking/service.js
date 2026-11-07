// Wires the tracker to Electron (power events, idle time) and exposes the small, validated API the dashboard uses.
// Nothing here opens a network port: the renderer talks to this through the existing preload/IPC bridge only.
const path = require('path');
const { app, powerMonitor } = require('electron');
const { openDatabase } = require('./db');
const { UsageRepo, UsageError } = require('./usageRepo');
const { SessionTracker } = require('./sessionTracker');
const { createWindowsDetector } = require('./foreground');
const { localDate } = require('./timeutil');

const SAFE = 'Usage data is unavailable right now. Please try again.';
const EXE_RE = /^[^\\/:*?"<>|\u0000-\u001f]{1,255}$/;

function createTrackingService(settingsStore) {
  let db = null, repo = null, tracker = null, initError = '';
  let settings = settingsStore.getTracking();
  let status = { state: 'off', detail: 'Tracking is turned off.' };

  // Messages we wrote ourselves are safe to show; anything else (SQL errors, paths) is replaced.
  const safe = (err) => new Error(err instanceof UsageError ? err.message : SAFE);

  function init() {
    try {
      db = openDatabase(path.join(app.getPath('userData'), 'lil-moon.db'));
      repo = new UsageRepo(db);
      tracker = new SessionTracker({
        repo,
        detector: createWindowsDetector(),
        getIdleSec: () => powerMonitor.getSystemIdleTime(),
        getSettings: () => settings,
        selfPids: () => [process.pid],
        onStatus: (s) => { status = s; },
      });
      powerMonitor.on('lock-screen', () => tracker.onLock());
      powerMonitor.on('unlock-screen', () => tracker.onUnlock());
      powerMonitor.on('suspend', () => tracker.onSuspend());
      powerMonitor.on('resume', () => tracker.onResume());
      tracker.start();
    } catch (err) {
      initError = 'The local usage database could not be opened.';
      console.error('[lil-moon] usage tracking disabled:', err);
    }
  }

  function requireRepo() {
    if (!repo) throw new Error(initError || SAFE);
    return repo;
  }

  return {
    init,

    getSettings: () => ({ ...settings }),
    saveSettings(next) {
      const v = settingsStore.saveTracking(next); // validates; throws a readable message
      settings = v;
      return { ...v };
    },

    getSummary() {
      const date = localDate(Date.now());
      const base = { date, tracking: { ...settings }, status: initError ? { state: 'error', detail: initError } : { ...status } };
      if (!repo) return { ...base, apps: [], totalSec: 0, mostUsed: null, excluded: [] };
      try {
        const apps = repo.dailyTotals(date).map((a) => ({ ...a, live: false }));
        const live = tracker && tracker.live(date);
        if (live) {
          const hit = apps.find((a) => a.exeName === live.exeName);
          if (hit) { hit.usedSec += live.seconds; hit.live = true; }
          else apps.push({ exeName: live.exeName, displayName: live.displayName, usedSec: live.seconds, live: true });
          apps.sort((a, b) => b.usedSec - a.usedSec || a.displayName.localeCompare(b.displayName));
        }
        const totalSec = apps.reduce((t, a) => t + a.usedSec, 0);
        return { ...base, apps, totalSec, mostUsed: apps[0] || null, excluded: repo.listExcluded() };
      } catch (err) {
        console.error('[lil-moon] summary failed:', err);
        throw safe(err);
      }
    },

    setExcluded(payload) {
      if (!payload || typeof payload.exeName !== 'string' || !EXE_RE.test(payload.exeName) || typeof payload.excluded !== 'boolean') {
        throw new Error('Invalid request.');
      }
      try {
        requireRepo().setExcluded(payload.exeName, payload.excluded);
        if (tracker) { tracker.resetSkip(); if (payload.excluded) tracker.discardCurrent(payload.exeName); }
      } catch (err) { throw safe(err); }
    },

    deleteHistory(payload) {
      if (!payload || payload.confirm !== true) throw new Error('Deleting history needs confirmation.');
      try {
        requireRepo().deleteAllHistory();
        if (tracker) tracker.discardCurrent();
      } catch (err) { throw safe(err); }
    },

    // Ends the open session and closes the database. Called from before-quit; must never throw.
    shutdown() {
      try { tracker && tracker.stop(); } catch (err) { console.error('[lil-moon] tracker stop failed:', err); }
      try { db && db.close(); } catch { /* ignore */ }
      tracker = null; repo = null; db = null;
    },
  };
}

module.exports = { createTrackingService };

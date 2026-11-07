// Turns "which window is in front, and is the user here?" into stored usage sessions.
// Pure logic: every outside dependency (clock, detector, idle source, database) is injected, so it is fully testable.
//
// Timing model: a session's start is a wall-clock timestamp; its length comes from a MONOTONIC clock, and its stored
// end is start + monotonic elapsed. System clock changes during a session therefore cannot create negative or inflated
// durations. Sessions are split at local midnight, ended at lock/suspend, and ended when the timer stalls (sleep).

const SYSTEM_IGNORED_EXES = new Set([
  'lockapp.exe', 'logonui.exe', 'searchhost.exe', 'startmenuexperiencehost.exe', 'shellexperiencehost.exe', 'textinputhost.exe',
]);
const { friendlyName } = require('./displayName');
const { nextLocalMidnight, localDate } = require('./timeutil');

class SessionTracker {
  constructor({
    repo, detector, getIdleSec, getSettings,
    now = Date.now, mono = () => performance.now(),
    pollMs = 1000, heartbeatMs = 30000, selfPids = () => [process.pid],
    log = console, onStatus = () => {},
  }) {
    Object.assign(this, { repo, detector, getIdleSec, getSettings, now, mono, pollMs, heartbeatMs, selfPids, log, onStatus });
    this.maxGapMs = Math.max(5000, pollMs * 5); // a longer silence means the process was frozen (e.g. sleep)
    this.cur = null;                            // the one open session
    this.locked = false;
    this.asleep = false;
    this.state = 'off';
    this.detail = '';
    this.running = false;
    this.timer = null;
    this.lastTick = this.mono();
    this.warnedDetector = false;
    this.skip = null;                           // foreground app already known to be excluded (avoids a DB write per tick)
  }

  // ---------- lifecycle ----------
  start() {
    if (this.running) return;
    this.running = true;
    this.recover();
    this.lastTick = this.mono();
    this.schedule();
  }

  // Ends the open session at "now" and stops polling. Safe to call more than once.
  stop() {
    this.running = false;
    clearTimeout(this.timer);
    this.finalize(this.mono());
  }

  schedule() {
    this.timer = setTimeout(() => {
      try { this.tick(); } catch (err) { this.fail(err); }
      if (this.running) this.schedule();
    }, this.pollMs);
  }

  // A session left open by a crash or power loss is closed at its last heartbeat (a conservative end).
  recover() {
    try {
      const a = this.repo.takeActive();
      if (!a) return;
      const end = Math.max(a.startMs, Math.min(a.heartbeatMs, this.now())); // never later than "now" if the clock moved back
      this.repo.recordSpan({ exeName: a.exeName, displayName: a.displayName, startMs: a.startMs, endMs: end }, { clearActive: true });
    } catch (err) {
      this.fail(err);
      try { this.repo.clearActive(); } catch { /* ignore */ }
    }
  }

  // ---------- power / session events (wired by the service) ----------
  onLock() { this.locked = true; this.finalize(this.mono()); this.setState('locked', 'The screen is locked.'); }
  onUnlock() { this.locked = false; this.lastTick = this.mono(); }
  onSuspend() { this.asleep = true; this.finalize(this.mono()); this.setState('asleep', 'The PC is asleep.'); }
  onResume() { this.asleep = false; this.lastTick = this.mono(); }

  // ---------- the poll ----------
  tick() {
    const m = this.mono();
    const prev = this.lastTick;
    this.lastTick = m;

    // Timer stalled (sleep without an event, hibernate, long freeze): close at the last moment we knew was good.
    if (this.cur && m - prev > this.maxGapMs) this.finalize(prev);

    const s = this.getSettings();
    if (!s.enabled) { this.finalize(m); return this.setState('off', 'Tracking is turned off.'); }
    if (this.locked) return this.setState('locked', 'The screen is locked.');
    if (this.asleep) return this.setState('asleep', 'The PC is asleep.');
    if (!this.detector || !this.detector.available) {
      this.finalize(m);
      return this.setState('unavailable', (this.detector && this.detector.reason) || 'Foreground tracking is not available.');
    }

    // Idle: the session ends when the last input happened, so the waiting time is not counted.
    const idle = this.getIdleSec();
    if (idle >= s.idleThresholdSec) {
      this.finalize(m - idle * 1000);
      return this.setState('idle', `No keyboard or mouse input for ${s.idleThresholdSec}s.`);
    }

    let fg;
    try { fg = this.detector.getForeground(); this.warnedDetector = false; }
    catch (err) {
      this.finalize(m);
      if (!this.warnedDetector) { this.warnedDetector = true; this.log.error('[lil-moon] foreground detection failed:', err); }
      return this.setState('unavailable', 'Could not read the foreground window.');
    }

    const exe = fg && fg.exeName ? String(fg.exeName).toLowerCase() : null;
    if (this.cur && exe === this.cur.exe) return this.continueSession(m);
    if (this.skip && this.skip.exe === exe) return this.setState('not-counting', this.skip.detail);
    this.skip = null;

    this.finalize(m);
    if (!fg || !exe || fg.ignored || SYSTEM_IGNORED_EXES.has(exe)) return this.setState('not-counting', 'No application window is in front.');
    if (!s.countLilMoon && this.selfPids().includes(fg.pid)) return this.setState('not-counting', 'Lil Moon is in front (not counted).');
    this.begin(exe, fg.displayName || friendlyName(exe), m);
  }

  begin(exe, displayName, m) {
    try {
      const app = this.repo.upsertApp(exe, displayName, this.now());
      if (app.excluded) {
        this.skip = { exe, detail: `${app.displayName} is excluded from tracking.` };
        return this.setState('not-counting', this.skip.detail);
      }
      const startWall = this.now();
      this.cur = { exe, displayName: app.displayName, startWall, startMono: m, beatMono: m };
      this.repo.saveActive(app.id, startWall, startWall);
      this.setState('tracking', `Tracking ${app.displayName}.`);
    } catch (err) { this.cur = null; this.fail(err); }
  }

  continueSession(m) {
    const c = this.cur;
    // Day boundary: close at local midnight and carry on in a new session (so each row has one date).
    for (;;) {
      const boundary = nextLocalMidnight(c.startWall);
      const virtualNow = c.startWall + (m - c.startMono);
      if (virtualNow < boundary) break;
      const boundaryMono = c.startMono + (boundary - c.startWall);
      this.finalize(boundaryMono);
      try {
        const app = this.repo.upsertApp(c.exe, c.displayName, boundary);
        if (app.excluded) return this.setState('not-counting', `${app.displayName} is excluded from tracking.`);
        this.repo.saveActive(app.id, boundary, boundary);
      } catch (err) { return this.fail(err); }
      this.cur = Object.assign(c, { startWall: boundary, startMono: boundaryMono, beatMono: boundaryMono });
    }
    if (m - c.beatMono >= this.heartbeatMs) {
      try { this.repo.heartbeat(Math.round(c.startWall + (m - c.startMono))); c.beatMono = m; } catch (err) { this.fail(err); }
    }
    this.setState('tracking', `Tracking ${c.displayName}.`);
  }

  // Closes the open session at monotonic time `endMono` and stores it. Never throws.
  finalize(endMono) {
    const c = this.cur;
    if (!c) return;
    this.cur = null;
    const elapsed = Math.max(0, endMono - c.startMono);
    try {
      this.repo.recordSpan(
        { exeName: c.exe, displayName: c.displayName, startMs: c.startWall, endMs: Math.round(c.startWall + elapsed) },
        { clearActive: true }
      );
    } catch (err) { this.fail(err); }
  }

  // Call after the exclusion list changes so the next poll re-checks the app in front.
  resetSkip() { this.skip = null; }

  // Drops the open session without saving it (used after the user deletes history or excludes the app in front).
  discardCurrent(exe) {
    if (!this.cur || (exe && this.cur.exe !== String(exe).toLowerCase())) return;
    this.cur = null;
    try { this.repo.clearActive(); } catch (err) { this.fail(err); }
  }

  // Seconds of the open session that fall on `date` (so the dashboard can show live totals).
  live(date) {
    const c = this.cur;
    if (!c || localDate(c.startWall) !== date) return null;
    return { exeName: c.exe, displayName: c.displayName, seconds: Math.max(0, Math.floor((this.mono() - c.startMono) / 1000)) };
  }

  fail(err) {
    this.log.error('[lil-moon] usage tracking error:', err);
    this.setState('error', 'Could not save usage data to the local database.');
  }

  setState(state, detail) {
    if (state !== this.state || detail !== this.detail) {
      this.state = state; this.detail = detail;
      this.onStatus({ state, detail });
    }
  }
}

module.exports = { SessionTracker, SYSTEM_IGNORED_EXES };

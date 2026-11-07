// Single owner of settings.json. Moon position and user preferences live side by side and never clobber each other.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const THEMES = ['sunny', 'cream', 'lilac'];
const DEFAULTS = { defaultDailyLimitMin: 360, theme: 'sunny', startWithWindows: false };
const file = () => path.join(app.getPath('userData'), 'settings.json');

function read() {
  try {
    const s = JSON.parse(fs.readFileSync(file(), 'utf8'));
    return s && typeof s === 'object' && !Array.isArray(s) ? s : {};
  } catch {
    return {};
  }
}

function write(data) {
  const tmp = file() + '.tmp';
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file());
}

// Throws a user-readable Error for anything outside the allowed shape (IPC input is untrusted).
function validate(p) {
  if (!p || typeof p !== 'object') throw new Error('Settings are invalid.');
  const m = p.defaultDailyLimitMin;
  if (!Number.isInteger(m) || m < 5 || m > 1440) throw new Error('Daily limit must be a whole number of minutes from 5 to 1440.');
  if (!THEMES.includes(p.theme)) throw new Error('Unknown theme.');
  if (typeof p.startWithWindows !== 'boolean') throw new Error('Startup preference must be on or off.');
  return { defaultDailyLimitMin: m, theme: p.theme, startWithWindows: p.startWithWindows };
}

// Usage-tracking controls live under their own `tracking` key so the Phase 2 preferences stay untouched.
// Tracking is OPT-IN: it stays off until the user turns it on from the Application usage page.
const TRACKING_DEFAULTS = { enabled: false, idleThresholdSec: 60, countLilMoon: false };

function validateTracking(t) {
  if (!t || typeof t !== 'object') throw new Error('Tracking settings are invalid.');
  if (typeof t.enabled !== 'boolean') throw new Error('Tracking must be on or off.');
  if (!Number.isInteger(t.idleThresholdSec) || t.idleThresholdSec < 10 || t.idleThresholdSec > 3600) {
    throw new Error('Idle time must be a whole number of seconds from 10 to 3600.');
  }
  if (typeof t.countLilMoon !== 'boolean') throw new Error('Counting Lil Moon must be on or off.');
  return { enabled: t.enabled, idleThresholdSec: t.idleThresholdSec, countLilMoon: t.countLilMoon };
}

module.exports = {
  getTracking() {
    try { return validateTracking({ ...TRACKING_DEFAULTS, ...read().tracking }); } catch { return { ...TRACKING_DEFAULTS }; }
  },
  saveTracking(t) {
    const v = validateTracking(t);
    write({ ...read(), tracking: v });
    return v;
  },
  getPreferences() {
    try { return validate({ ...DEFAULTS, ...read().preferences }); } catch { return { ...DEFAULTS }; }
  },
  savePreferences(p) {
    const v = validate(p);
    write({ ...read(), preferences: v });
    return v;
  },
  getMoon: () => read().moon,
  saveMoon: (moon) => write({ ...read(), moon }),
};

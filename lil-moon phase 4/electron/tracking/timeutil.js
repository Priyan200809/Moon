// Local-calendar helpers. Session dates are the LOCAL date at the time the session was recorded and are stored
// as text, so a later time-zone change never rewrites history. Midnight is computed with the Date constructor,
// which handles DST (23/25-hour days) correctly.
const pad = (n) => String(n).padStart(2, '0');

function localDate(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// First local midnight strictly after `ms`.
function nextLocalMidnight(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
}

module.exports = { localDate, nextLocalMidnight };

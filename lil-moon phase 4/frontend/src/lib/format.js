export const fmt = (min) => {
  const a = Math.abs(Math.round(min));
  const h = Math.floor(a / 60), m = a % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
};

// Seconds -> "1h 05m 09s" style text (tracking is second-accurate; the old fmt() works in whole minutes).
export const fmtSec = (sec) => {
  const t = Math.max(0, Math.round(sec));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
};

// Message from a rejected IPC call without Electron's technical prefix.
export const cleanError = (err) =>
  String(err?.message || err || 'Something went wrong.').replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

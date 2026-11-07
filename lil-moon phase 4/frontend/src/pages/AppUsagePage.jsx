import { useEffect, useState } from 'react';
import DashboardCard from '../components/DashboardCard.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import AppUsageList from '../components/AppUsageList.jsx';
import { useSettings } from '../hooks/useSettings.jsx';
import { useUsage } from '../hooks/useUsage.jsx';
import { fmt, fmtSec, cleanError } from '../lib/format.js';

const EMPTY_HINT = {
  off: 'Tracking is off. Turn it on above to start recording which apps you use.',
  unavailable: 'Tracking cannot run on this computer right now (see the status above).',
  error: 'The local usage database has a problem, so nothing can be recorded or shown.',
};

export default function AppUsagePage() {
  const api = window.lilMoon?.dashboard;
  const { settings } = useSettings();
  const { summary, error, loading, refresh } = useUsage();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: '', error: false });
  const [idle, setIdle] = useState('60');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => { if (summary) setIdle(String(summary.tracking.idleThresholdSec)); }, [summary?.tracking.idleThresholdSec]);

  const run = async (fn, ok) => {
    setBusy(true); setMsg({ text: '', error: false });
    try { await fn(); await refresh(); if (ok) setMsg({ text: ok, error: false }); }
    catch (err) { setMsg({ text: cleanError(err), error: true }); }
    finally { setBusy(false); }
  };

  const t = summary?.tracking;
  const saveTracking = (patch, ok) => run(() => api.saveTrackingSettings({ ...t, ...patch }), ok);
  const idleN = Number(idle);
  const idleOk = Number.isInteger(idleN) && idleN >= 10 && idleN <= 3600;
  const limitSec = settings.defaultDailyLimitMin * 60;
  const state = summary?.status?.state;

  return (
    <>
      <div className="page-head">
        <h1>Application usage</h1>
        <span className="badge badge-live">Real tracked data</span>
        <button className="btn btn-small" onClick={refresh} disabled={loading}>Refresh</button>
      </div>
      <p className="lead">Lil Moon records only which app is in front and for how long. No screenshots, no keystrokes, no window titles, and nothing leaves this PC. Time is counted only while you are active; idle, locked and sleeping time is not.</p>

      {loading && !summary && <p className="state-box" role="status">Loading usage data…</p>}
      {error && <p className="state-box state-error" role="alert">{error} <button className="btn btn-small" onClick={refresh}>Try again</button></p>}
      {msg.text && <p className={`state-box${msg.error ? ' state-error' : ''}`} role={msg.error ? 'alert' : 'status'}>{msg.text}</p>}

      {summary && (
        <>
          <div className="grid">
            <DashboardCard title="Tracking" tone="purple" badge={t.enabled ? 'On' : 'Off'}>
              <p className="note">{summary.status.detail}</p>
              <div className="quick">
                <button className="btn btn-strong" disabled={busy || !api} onClick={() => saveTracking({ enabled: !t.enabled }, t.enabled ? 'Tracking turned off.' : 'Tracking turned on.')}>
                  {t.enabled ? 'Turn tracking off' : 'Turn tracking on'}
                </button>
              </div>
              <label className="field">Count as idle after (seconds)
                <input type="number" min="10" max="3600" value={idle} aria-invalid={!idleOk} onChange={(e) => setIdle(e.target.value)} />
              </label>
              <label className="row">
                <input type="checkbox" checked={t.countLilMoon} disabled={busy} onChange={(e) => saveTracking({ countLilMoon: e.target.checked })} />
                Also count time spent in Lil Moon itself
              </label>
              <div className="quick">
                <button className="btn btn-small" disabled={busy || !idleOk || idleN === t.idleThresholdSec} onClick={() => saveTracking({ idleThresholdSec: idleN }, 'Idle time saved.')}>Save idle time</button>
              </div>
            </DashboardCard>

            <DashboardCard title="Total tracked today" badge="Real">
              <p className="big">{fmtSec(summary.totalSec)}</p>
              <ProgressBar used={summary.totalSec} limit={limitSec} label="Total tracked application usage today" />
              <p className="note">{summary.totalSec > limitSec ? `Over the ${fmt(settings.defaultDailyLimitMin)} daily limit by ${fmtSec(summary.totalSec - limitSec)}` : `${fmtSec(limitSec - summary.totalSec)} left of your ${fmt(settings.defaultDailyLimitMin)} daily limit`}</p>
            </DashboardCard>

            <DashboardCard title="Most used today" tone="cream" badge="Real">
              {summary.mostUsed
                ? <><p className="big small">{summary.mostUsed.displayName}</p><p className="note">{fmtSec(summary.mostUsed.usedSec)} · {summary.mostUsed.exeName}</p></>
                : <p className="note">Nothing tracked yet today.</p>}
            </DashboardCard>
          </div>

          <h2 className="section-title">Today by application <span className="muted">({summary.date})</span></h2>
          {summary.apps.length === 0
            ? <p className="state-box">{EMPTY_HINT[state] || 'No application time recorded yet today. Use a few apps and it will appear here.'}</p>
            : <AppUsageList apps={summary.apps} defaultLimitMin={settings.defaultDailyLimitMin} busy={busy} onExclude={(exe, v) => run(() => api.setAppExcluded(exe, v), 'App excluded. It will no longer be tracked.')} />}

          {summary.excluded.length > 0 && (
            <>
              <h2 className="section-title">Excluded apps</h2>
              <ul className="usage-list">
                {summary.excluded.map((a) => (
                  <li key={a.exeName} className="usage-item usage-top">
                    <h3>{a.displayName} <small className="exe">{a.exeName}</small></h3>
                    <button className="btn btn-small" disabled={busy} onClick={() => run(() => api.setAppExcluded(a.exeName, false), 'App will be tracked again.')}>Track again</button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <h2 className="section-title">Your data</h2>
          <DashboardCard title="Delete usage history">
            <p className="note">Everything is stored only on this PC. Deleting removes all recorded sessions; your excluded-apps list is kept.</p>
            {!confirmDelete
              ? <div className="quick"><button className="btn" disabled={busy} onClick={() => setConfirmDelete(true)}>Delete all usage history…</button></div>
              : (
                <div className="quick">
                  <button className="btn btn-danger" disabled={busy} onClick={() => run(async () => { await api.deleteUsageHistory(); setConfirmDelete(false); }, 'Usage history deleted.')}>Yes, delete everything</button>
                  <button className="btn" onClick={() => setConfirmDelete(false)}>Cancel</button>
                </div>
              )}
          </DashboardCard>
        </>
      )}
    </>
  );
}

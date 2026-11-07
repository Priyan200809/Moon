import DashboardCard from '../components/DashboardCard.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import { MoonArt } from '../components/FloatingMoon.jsx';
import { useSettings } from '../hooks/useSettings.jsx';
import { useUsage } from '../hooks/useUsage.jsx';
import { sampleApps, sampleSites, SAMPLE_LABEL } from '../data/sampleData.js';
import { fmt } from '../lib/format.js';
import { PAGES } from '../components/Sidebar.jsx';

function summarize(items, defaultLimit) {
  const total = items.reduce((t, i) => t + i.usedMin, 0);
  const over = items.filter((i) => i.usedMin > (i.limitMin ?? defaultLimit)).length;
  const top = [...items].sort((a, b) => b.usedMin - a.usedMin)[0];
  return { total, over, top };
}

export default function Home({ onNavigate }) {
  const { settings } = useSettings();
  const { summary } = useUsage();
  const trackingOn = summary?.tracking?.enabled;
  const limit = settings.defaultDailyLimitMin;
  const apps = summarize(sampleApps, limit);
  const sites = summarize(sampleSites, limit);

  return (
    <>
      <section className="welcome">
        <MoonArt className="welcome-moon" />
        <div>
          <h1>Hi, I'm Lil Moon.</h1>
          <p>I float above your windows. Closing this dashboard keeps me on your desktop. Use Exit Lil Moon to stop me.</p>
        </div>
      </section>

      <div className="grid">
        <DashboardCard title="Assistant status">
          <ul className="status-list">
            <li>Moon widget <span className="pill pill-on">Running</span></li>
            <li>Usage tracking <span className={`pill${trackingOn ? ' pill-on' : ''}`}>{trackingOn ? 'On' : 'Off'}</span></li>
            <li>Voice commands <span className="pill">Not built yet</span></li>
          </ul>
        </DashboardCard>

        <DashboardCard title="Today's screen time" tone="purple" badge={SAMPLE_LABEL}>
          <p className="big">{fmt(apps.total)}</p>
          <ProgressBar used={apps.total} limit={limit} label="Screen time today" />
          <p className="note">{apps.total > limit ? `Over the ${fmt(limit)} daily limit by ${fmt(apps.total - limit)}` : `${fmt(limit - apps.total)} left of your ${fmt(limit)} daily limit`}</p>
        </DashboardCard>

        <DashboardCard title="Application usage" badge={SAMPLE_LABEL}>
          <p className="big">{fmt(apps.total)}</p>
          <p className="note">Most used: {apps.top.name} ({fmt(apps.top.usedMin)}). {apps.over} over limit.</p>
        </DashboardCard>

        <DashboardCard title="Website usage" tone="cream" badge={SAMPLE_LABEL}>
          <p className="big">{fmt(sites.total)}</p>
          <p className="note">Most visited: {sites.top.name} ({fmt(sites.top.usedMin)}). {sites.over} over limit.</p>
        </DashboardCard>
      </div>

      <h2 className="section-title">Go to</h2>
      <div className="quick">
        {PAGES.filter(([id]) => id !== 'home').map(([id, label]) => (
          <button key={id} className="btn" onClick={() => onNavigate(id)}>{label}</button>
        ))}
      </div>
    </>
  );
}

import UsageList from '../components/UsageList.jsx';
import { useSettings } from '../hooks/useSettings.jsx';
import { sampleApps, sampleSites, SAMPLE_LABEL } from '../data/sampleData.js';
import { fmt } from '../lib/format.js';

const COPY = {
  apps: { title: 'Application usage', noun: 'application', items: sampleApps },
  sites: { title: 'Website usage', noun: 'website', items: sampleSites },
};

export default function UsagePage({ kind }) {
  const { settings } = useSettings();
  const { title, noun, items } = COPY[kind];
  return (
    <>
      <div className="page-head">
        <h1>{title}</h1>
        <span className="badge">{SAMPLE_LABEL}</span>
      </div>
      <p className="lead">Example numbers only. Real tracking is not built yet. Rows without their own limit use your default of {fmt(settings.defaultDailyLimitMin)} a day (change it in Settings).</p>
      <UsageList items={items} defaultLimit={settings.defaultDailyLimitMin} noun={noun} />
    </>
  );
}

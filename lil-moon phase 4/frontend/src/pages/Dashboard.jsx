import { useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import Home from './Home.jsx';
import UsagePage from './UsagePage.jsx';
import AppUsagePage from './AppUsagePage.jsx';
import TrackingChip from '../components/TrackingChip.jsx';
import { UsageProvider } from '../hooks/useUsage.jsx';
import VoicePage from './VoicePage.jsx';
import SettingsPage from './SettingsPage.jsx';

export default function Dashboard() {
  const api = window.lilMoon?.dashboard;
  const [page, setPage] = useState('home');

  return (
    <UsageProvider>
    <div className="dash">
      <div className="titlebar">
        <div className="left"><strong>Lil Moon</strong><TrackingChip /></div>
        <div className="win-buttons">
          <button onClick={() => api?.minimize()} aria-label="Minimize dashboard">Minimize</button>
          <button onClick={() => api?.close()} aria-label="Close dashboard">Close</button>
          <button className="exit" onClick={() => api?.exitApp()} aria-label="Exit Lil Moon completely">Exit Lil Moon</button>
        </div>
      </div>
      <div className="shell">
        <Sidebar page={page} onNavigate={setPage} />
        <main className="content">
          {page === 'home' && <Home onNavigate={setPage} />}
          {page === 'apps' && <AppUsagePage />}
          {page === 'sites' && <UsagePage kind="sites" />}
          {page === 'voice' && <VoicePage />}
          {page === 'settings' && <SettingsPage />}
        </main>
      </div>
    </div>
    </UsageProvider>
  );
}

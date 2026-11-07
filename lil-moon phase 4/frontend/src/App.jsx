import FloatingMoon from './components/FloatingMoon.jsx';
import Dashboard from './pages/Dashboard.jsx';
import { SettingsProvider } from './hooks/useSettings.jsx';

// One bundle, two windows: the main process loads index.html#/moon or #/dashboard.
export default function App() {
  const isMoon = window.location.hash === '#/moon';
  document.body.className = isMoon ? 'moon-mode' : 'dash-mode';
  return isMoon ? <FloatingMoon /> : <SettingsProvider><Dashboard /></SettingsProvider>;
}

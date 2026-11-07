import { useState } from 'react';
import DashboardCard from '../components/DashboardCard.jsx';
import { exampleCommands } from '../data/sampleData.js';

export default function VoicePage() {
  const [note, setNote] = useState('');
  return (
    <>
      <div className="page-head">
        <h1>Voice assistant</h1>
        <span className="badge">Preview only</span>
      </div>
      <p className="lead">Voice commands are not built yet. Nothing here listens to your microphone.</p>
      <div className="grid">
        <DashboardCard title="Microphone" tone="purple">
          <button className="mic" aria-label="Microphone (not available yet)" onClick={() => setNote('Voice commands are not built yet, so nothing was recorded.')}>
            <svg viewBox="0 0 24 24" width="44" height="44" aria-hidden="true">
              <rect x="9" y="2" width="6" height="12" rx="3" fill="#FFE500" stroke="#000" strokeWidth="2" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v4" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <p className="big small">Not listening</p>
          <p className="note" role="status">{note || 'Status: voice is not implemented.'}</p>
        </DashboardCard>
        <DashboardCard title="Command history">
          <p className="note">No commands yet. Once voice works, what you say and what Lil Moon did will appear here.</p>
        </DashboardCard>
        <DashboardCard title="Example commands" tone="cream" badge="Not working yet">
          <ul className="examples">
            {exampleCommands.map((c) => <li key={c}>"{c}"</li>)}
          </ul>
        </DashboardCard>
      </div>
    </>
  );
}

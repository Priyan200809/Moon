import { useUsage } from '../hooks/useUsage.jsx';

const LABEL = {
  tracking: 'Tracking', idle: 'Paused: idle', locked: 'Paused: locked', asleep: 'Paused: asleep',
  'not-counting': 'Tracking on', off: 'Tracking off', unavailable: 'Tracking unavailable', error: 'Tracking error',
};

// Always-visible indicator in the title bar: tells the user, in plain words, whether Lil Moon is recording usage.
export default function TrackingChip() {
  const { summary } = useUsage();
  const state = summary?.status?.state;
  const on = state === 'tracking' || state === 'not-counting';
  return (
    <span className={`track-chip${on ? ' on' : ''}`} role="status" aria-live="polite" title={summary?.status?.detail || ''}>
      <span className="dot" aria-hidden="true" />{state ? LABEL[state] || 'Tracking' : 'Tracking: checking'}
    </span>
  );
}

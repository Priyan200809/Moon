export default function ProgressBar({ used, limit, label }) {
  const pct = Math.min(100, Math.round((used / limit) * 100));
  return (
    <div className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(used, limit)}>
      <div className={`progress-fill${used > limit ? ' over' : ''}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

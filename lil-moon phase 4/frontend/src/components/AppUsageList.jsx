import ProgressBar from './ProgressBar.jsx';
import { fmtSec } from '../lib/format.js';

// Real, database-backed rows. Seconds throughout (limit comes from settings in minutes).
export default function AppUsageList({ apps, defaultLimitMin, onExclude, busy }) {
  const limitSec = defaultLimitMin * 60;
  return (
    <ul className="usage-list">
      {apps.map((a) => {
        const over = a.usedSec > limitSec;
        return (
          <li key={a.exeName} className="usage-item">
            <div className="usage-top">
              <h3>{a.displayName} <small className="exe">{a.exeName}</small></h3>
              <span>
                {a.live && <span className="flag flag-live">In use now</span>}{' '}
                <span className={`flag${over ? ' flag-over' : ''}`}>{over ? `Over by ${fmtSec(a.usedSec - limitSec)}` : `${fmtSec(limitSec - a.usedSec)} left`}</span>
              </span>
            </div>
            <ProgressBar used={a.usedSec} limit={limitSec} label={`${a.displayName} usage today`} />
            <dl className="usage-stats">
              <div><dt>Used today</dt><dd>{fmtSec(a.usedSec)}</dd></div>
              <div><dt>Daily limit</dt><dd>{fmtSec(limitSec)} (default)</dd></div>
              <div><dt>Remaining</dt><dd>{over ? '0s' : fmtSec(limitSec - a.usedSec)}</dd></div>
            </dl>
            <div className="row-actions">
              <button className="btn btn-small" disabled={busy} onClick={() => onExclude(a.exeName, true)}>Stop tracking this app</button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

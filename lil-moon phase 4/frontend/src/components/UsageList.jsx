import ProgressBar from './ProgressBar.jsx';
import { fmt } from '../lib/format.js';

export default function UsageList({ items, defaultLimit, noun }) {
  return (
    <ul className="usage-list">
      {items.map((item) => {
        const limit = item.limitMin ?? defaultLimit;
        const over = item.usedMin > limit;
        return (
          <li key={item.name} className="usage-item">
            <div className="usage-top">
              <h3>{item.name}</h3>
              <span className={`flag${over ? ' flag-over' : ''}`}>{over ? `Over by ${fmt(item.usedMin - limit)}` : `${fmt(limit - item.usedMin)} left`}</span>
            </div>
            <ProgressBar used={item.usedMin} limit={limit} label={`${item.name} ${noun} usage`} />
            <dl className="usage-stats">
              <div><dt>Used today</dt><dd>{fmt(item.usedMin)}</dd></div>
              <div><dt>Daily limit</dt><dd>{fmt(limit)}{item.limitMin == null && ' (default)'}</dd></div>
              <div><dt>Remaining</dt><dd>{over ? '0m' : fmt(limit - item.usedMin)}</dd></div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}

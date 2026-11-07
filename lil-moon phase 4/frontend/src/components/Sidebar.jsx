export const PAGES = [
  ['home', 'Home'],
  ['apps', 'Application usage'],
  ['sites', 'Website usage'],
  ['voice', 'Voice assistant'],
  ['settings', 'Settings'],
];

export default function Sidebar({ page, onNavigate }) {
  return (
    <nav className="sidebar" aria-label="Dashboard sections">
      {PAGES.map(([id, label]) => (
        <button key={id} className="nav-btn" aria-current={page === id ? 'page' : undefined} onClick={() => onNavigate(id)}>
          {label}
        </button>
      ))}
    </nav>
  );
}

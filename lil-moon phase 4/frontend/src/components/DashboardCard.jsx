export default function DashboardCard({ title, tone = 'white', badge, children }) {
  return (
    <section className={`card card-${tone}`}>
      <header className="card-head">
        <h2>{title}</h2>
        {badge && <span className="badge">{badge}</span>}
      </header>
      {children}
    </section>
  );
}

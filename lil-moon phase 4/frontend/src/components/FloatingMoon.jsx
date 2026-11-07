import { useRef } from 'react';

const CLICK_SLOP = 5; // px of pointer travel that turns a click into a drag

export function MoonArt({ className = '' }) {
  const crescent = 'M53.7 10.16A42 42 0 1 0 88.66 68.42A34 34 0 1 1 53.7 10.16Z';
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true">
      <g transform="translate(6 6)">
        <path d={crescent} transform="translate(7 7)" fill="#000" />
        <path d={crescent} fill="#FFE500" stroke="#000" strokeWidth="5" strokeLinejoin="round" />
        <circle cx="33" cy="50" r="3.8" fill="#000" />
        <circle cx="25" cy="63" r="5.5" fill="#B98AFF" stroke="#000" strokeWidth="2.5" />
        <path d="M33 66q6 8 13 2" fill="none" stroke="#000" strokeWidth="3.5" strokeLinecap="round" />
        <circle cx="75" cy="38" r="7" fill="#B98AFF" stroke="#000" strokeWidth="3.5" />
      </g>
    </svg>
  );
}

export default function FloatingMoon() {
  const press = useRef(null);
  const api = window.lilMoon?.moon;

  const down = (e) => {
    if (e.button !== 0) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    press.current = { x: e.screenX, y: e.screenY, dragging: false };
    api?.dragStart();
  };
  const move = (e) => {
    const p = press.current;
    if (!p) return;
    if (!p.dragging && Math.hypot(e.screenX - p.x, e.screenY - p.y) < CLICK_SLOP) return;
    p.dragging = true;
    api?.dragMove();
  };
  const up = (e) => {
    const p = press.current;
    if (!p) return;
    press.current = null;
    api?.dragEnd();
    if (!p.dragging && e.type === 'pointerup') api?.openDashboard();
  };

  return (
    <div
      className="moon"
      role="button"
      tabIndex={0}
      aria-label="Open Lil Moon dashboard"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onContextMenu={(e) => { e.preventDefault(); api?.showMenu(); }}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && api?.openDashboard()}
    >
      <MoonArt className="moon-art" />
    </div>
  );
}

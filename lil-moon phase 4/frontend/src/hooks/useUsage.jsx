import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { cleanError } from '../lib/format.js';

const Ctx = createContext(null);
const POLL_MS = 5000;

// One shared poller for real tracked usage (summary + tracking status). Used by the Application usage page,
// the title-bar chip and Home. Outside Electron (plain browser) there is no bridge, so it reports that instead.
export function UsageProvider({ children }) {
  const api = window.lilMoon?.dashboard;
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!!api?.getUsageSummary);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    if (!api?.getUsageSummary) { setError('Usage tracking needs the Lil Moon desktop app.'); setLoading(false); return; }
    try {
      const s = await api.getUsageSummary();
      if (!alive.current) return;
      setSummary(s); setError('');
    } catch (err) {
      if (alive.current) setError(cleanError(err));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    alive.current = true;
    refresh();
    const id = setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS);
    return () => { alive.current = false; clearInterval(id); };
  }, [refresh]);

  return <Ctx.Provider value={{ summary, error, loading, refresh }}>{children}</Ctx.Provider>;
}

export const useUsage = () => useContext(Ctx);

import { createContext, useContext, useEffect, useState } from 'react';

export const DEFAULTS = { defaultDailyLimitMin: 360, theme: 'sunny', startWithWindows: false };
const Ctx = createContext(null);

// Settings live in the main process (validated, saved to disk). Without the Electron bridge (plain browser) it falls back to defaults.
export function SettingsProvider({ children }) {
  const api = window.lilMoon?.dashboard;
  const [settings, setSettings] = useState(DEFAULTS);

  useEffect(() => {
    let live = true;
    (api?.getSettings ? api.getSettings() : Promise.resolve(DEFAULTS))
      .then((s) => live && setSettings(s))
      .catch(() => {});
    return () => { live = false; };
  }, [api]);

  useEffect(() => { document.documentElement.dataset.theme = settings.theme; }, [settings.theme]);

  const save = async (next) => {
    const saved = api?.saveSettings ? await api.saveSettings(next) : next;
    setSettings(saved);
    return saved;
  };
  return <Ctx.Provider value={{ settings, save }}>{children}</Ctx.Provider>;
}

export const useSettings = () => useContext(Ctx);

import { useState } from 'react';
import DashboardCard from '../components/DashboardCard.jsx';
import { useSettings } from '../hooks/useSettings.jsx';
import { fmt } from '../lib/format.js';

const THEMES = [['sunny', 'Sunny yellow'], ['cream', 'Cream'], ['lilac', 'Lilac']];

export default function SettingsPage() {
  const { settings, save } = useSettings();
  const [draft, setDraft] = useState(settings);
  const [msg, setMsg] = useState({ text: '', error: false });
  const limitOk = Number.isInteger(draft.defaultDailyLimitMin) && draft.defaultDailyLimitMin >= 5 && draft.defaultDailyLimitMin <= 1440;
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const set = (patch) => { setDraft({ ...draft, ...patch }); setMsg({ text: '', error: false }); };

  const onSave = async () => {
    try {
      await save(draft);
      setMsg({ text: 'Settings saved.', error: false });
    } catch (err) {
      setMsg({ text: err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), error: true });
    }
  };

  return (
    <>
      <div className="page-head"><h1>Settings</h1></div>
      <div className="grid">
        <DashboardCard title="Default daily limit" badge="Works">
          <label className="field">Minutes per day
            <input type="number" min="5" max="1440" step="5" value={Number.isNaN(draft.defaultDailyLimitMin) ? '' : draft.defaultDailyLimitMin}
              onChange={(e) => set({ defaultDailyLimitMin: e.target.valueAsNumber })} aria-invalid={!limitOk} />
          </label>
          <p className="note">{limitOk ? `That is ${fmt(draft.defaultDailyLimitMin)} a day.` : 'Enter a whole number from 5 to 1440.'} It is saved now and applies to the sample data until real tracking exists.</p>
        </DashboardCard>

        <DashboardCard title="Theme" tone="purple" badge="Works">
          <fieldset className="choices">
            <legend>Dashboard background</legend>
            {THEMES.map(([id, label]) => (
              <label key={id} className="row"><input type="radio" name="theme" checked={draft.theme === id} onChange={() => set({ theme: id })} /> {label}</label>
            ))}
          </fieldset>
        </DashboardCard>

        <DashboardCard title="Startup" tone="cream" badge="Placeholder">
          <label className="row"><input type="checkbox" checked={draft.startWithWindows} onChange={(e) => set({ startWithWindows: e.target.checked })} /> Start Lil Moon with Windows</label>
          <p className="note">Your choice is saved, but Lil Moon does not start with Windows yet.</p>
        </DashboardCard>
      </div>

      <div className="save-bar">
        <button className="btn btn-strong" onClick={onSave} disabled={!limitOk || !dirty}>Save settings</button>
        <span role="status" className={msg.error ? 'msg-error' : ''}>{msg.text}</span>
      </div>
    </>
  );
}

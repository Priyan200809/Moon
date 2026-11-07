# Lil Moon (Phases 1-4)

A floating, moon-shaped desktop companion for Windows. Neobrutalism look, built with Electron + React.

## Setup (Windows 10/11)
1. Install Node.js 20 or newer (LTS) from https://nodejs.org (includes npm).
2. Open PowerShell in this folder and run:
```
npm install
```

## Run
- Normal run (builds the UI, then launches): `npm start`
- Development (Vite dev server, UI reloads on save): `npm run dev`
- Build the UI only: `npm run build`
- Automated smoke test: `npm run smoke` (Linux/CI with a display; see "Testing")

## Use
- Drag the moon anywhere. A short click opens the dashboard; a drag never does.
- Clicking again focuses (or restores) the same dashboard window.
- Dashboard buttons: Minimize, Close (moon stays), Exit Lil Moon (quits everything).
- Right-click the moon for Open dashboard / Exit Lil Moon.
- The moon's position is saved to `%APPDATA%\lil-moon\settings.json` and restored on launch.

## Dashboard (Phase 2)
Sections: Home, Application usage, Website usage, Voice assistant, Settings (left sidebar, top tabs when narrow).
- **Works:** navigation, progress bars and remaining-time maths, default daily limit (saved, validated in the main process, drives the sample data), theme (Sunny yellow / Cream / Lilac, saved and applied on launch).
- **Placeholder:** all usage numbers (labelled "Sample data"), microphone button, command history, example commands, "Start with Windows" (saved but not applied).
Settings are stored under `preferences` in `%APPDATA%\lil-moon\settings.json`, next to the moon position.

## Layout
```
electron/   main.js (lifecycle + IPC validation), windowManager.js (windows, drag), settingsStore.js (settings file), preload.js (bridge)
frontend/   React UI (one bundle, routes #/moon and #/dashboard): pages/, components/, hooks/, data/sampleData.js
scripts/    dev.js (Vite + Electron), smoke.js (automated test)
```

## Security
contextIsolation on, nodeIntegration off, sandbox on, preload exposes only fixed no-argument commands, main checks that each command comes from the correct window's top frame, navigation and new windows are blocked, production CSP is set in index.html. No filesystem or shell access is exposed.

## Troubleshooting
- Blank or missing moon: run `npm run build` first, or use `npm start`.
- Electron download failed during install: re-run `npm install`, or `node node_modules/electron/install.js`.
- Port 5173 busy in dev: close the other Vite process.
- Moon hidden behind a full-screen exclusive game: expected; borderless/windowed games are fine.
- Reset the moon's position: delete `%APPDATA%\lil-moon\settings.json`.

## Implemented
Floating frameless transparent always-on-top moon, drag vs click detection, dashboard with sample-data cards, single dashboard instance, minimize/close/exit, edge clamping, multi-monitor and display-change handling, saved position.

## Known limitations
- Application/website usage, voice assistant and settings are visual placeholders; sample data is labelled.
- No tray icon or app icon yet (the moon's right-click menu is the way out without opening the dashboard).
- Windows-specific behaviour (DPI scaling, always-on-top over other topmost windows) was not tested on real Windows.

## Testing
`npm run smoke` runs two phases (set `SMOKE_PHASE=1` then `2` with the same `SMOKE_DIR`) to check restart persistence. Under Linux use `xvfb-run -a npx electron --no-sandbox scripts/smoke.js`.


## Phase 4: application usage tracking

**Important:** the uploaded Phase 2 project contained no Phase 3 code (no database, no backend). Phase 4 therefore ships a *minimal* local data layer: one SQLite file, `%APPDATA%\lil-moon\lil-moon.db`, opened in the Electron main process and reached only through validated IPC. No HTTP server and no open port. If you already have a Phase 3 database, point `openDatabase()` in `electron/tracking/db.js` at it and keep the `app_*` tables (they are prefixed to avoid clashes), or port `usageRepo.js` to your data layer.

### Run (Windows 10/11)
```
npm install      # adds "koffi" (prebuilt, no compiler needed)
npm start        # or: npm run dev
npm test         # unit tests, needs Node 22.13+ (uses node:sqlite)
```
Tracking is **off until you turn it on** (Application usage page > Turn tracking on). A chip in the dashboard title bar always shows the state.

### What it records
Executable file name (lower-case, no path), friendly name, start/end time, duration in seconds and the local date. Never window titles, screenshots, keystrokes or anything off-device.

### How it works (`electron/tracking/`)
- `foreground.js`: polls once a second via `koffi` (GetForegroundWindow, GetWindowThreadProcessId, QueryFullProcessImageNameW). Skips the desktop, taskbar and Alt-Tab windows. Processes Windows will not let us inspect share one "Unknown application" bucket.
- `sessionTracker.js`: one open session at a time. Durations come from a monotonic clock (end = start + elapsed), so system clock changes cannot produce negative or inflated times.
- Idle: Electron `powerMonitor.getSystemIdleTime()`. The session ends at the moment of the last input; the waiting time is not counted. Threshold default 60 s (10-3600, configurable).
- Lock / sleep: `lock-screen`, `suspend` events end the session. If a timer stall is seen without an event, the session is closed at the last good poll.
- Midnight: sessions are split at local midnight (DST-safe), one row per date. `session_date` is stored, so a later time-zone change never rewrites history.
- Crash recovery: the open session is written to `app_active_session` and heartbeated every 30 s. On next start it is closed at its last heartbeat (loses at most ~30 s). App shutdown closes it normally.
- Lil Moon itself is not counted unless you tick "Also count time spent in Lil Moon itself".

### Database (migration v1, `PRAGMA user_version`)
`tracked_apps` (exe_name unique, display_name, is_excluded), `app_sessions` (app_id, start_ts, end_ts, duration_sec >= 0, session_date, UNIQUE(app_id, start_ts), CHECK end >= start), `app_active_session` (single row). Overlapping or duplicate sessions are skipped; sessions under 1 s are not stored. All SQL is parameterised.

### IPC (dashboard window only; sender is verified like the existing channels)
`usage:summary`, `tracking:get`, `tracking:save`, `usage:exclude`, `usage:delete-history` (needs `{confirm:true}`). Errors shown to the UI are sanitised.

### Privacy controls
On/off switch, visible status chip, per-app exclusion (and "Track again"), delete all history, local-only storage.

### Known limitations
- Idle time is "no keyboard/mouse input". Watching a video or reading without touching the input devices counts as idle after the threshold; a mouse nudge while you are away counts as active. This is a proxy for attention, not a measurement of it.
- Foreground = the app that owns the focused window. Overlays, UWP apps hosted by `ApplicationFrameHost.exe`, and elevated/protected windows may be grouped under the host process or "Unknown application".
- Fast user switching and remote-desktop disconnects are not handled specially (idle detection usually covers them).
- Windows 'shutdown' is not delivered as an event; a forced power-off is handled by crash recovery.
- Per-app daily limits are not implemented (all rows use the default limit from Settings). Website tracking is not part of this phase; the Home cards and Website usage page remain labelled sample data.
- The Windows detector (`foreground.js`) and the Electron wiring were written but **not executed** in the build environment (Linux, no Electron, no network).

### Windows test procedure (do this once)
1. `npm install`, `npm start`, open the dashboard > Application usage > Turn tracking on. Chip should read "Tracking".
2. Switch between Notepad and a browser for ~20 s each; refresh. Both appear with about the right times.
3. Leave the PC untouched for the idle threshold + 10 s: status "Paused: idle"; totals stop growing. Move the mouse: tracking resumes.
4. Press Win+L for 30 s, unlock: status "Paused: locked" then back; locked time not added.
5. Sleep the PC for a minute and wake it: no inflated session.
6. Click the moon / open Lil Moon: its time is not counted (status "not counting").
7. Kill the app in Task Manager mid-session, restart: the last session appears (up to ~30 s short), no duplicate.
8. Exclude an app, use it: nothing recorded. Delete history: list empties.
9. Optional: set the Windows clock back 1 h mid-session; durations stay sane.

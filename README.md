# Lil Moon (Phase 1)

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
- Backend/database/AI/file-index tests (plain Node 22.13+, no window): `npm test` (63 tests)
- Extension logic tests (Phase 5, currently has failures, see below): `npm run test:extension`
- Electron smoke test: `npm run smoke` (Linux/CI with a display; see "Testing")

## Use
- Drag the moon anywhere. A short click opens the dashboard; a drag never does.
- Clicking again focuses (or restores) the same dashboard window.
- Dashboard buttons: Minimize, Close (moon stays), Exit Lil Moon (quits everything).
- Right-click the moon for Open dashboard / Exit Lil Moon.
- The moon's position is saved to `%APPDATA%\lil-moon\settings.json` and restored on launch.

## Dashboard and local database (Phases 2-3)
Sections: Home, Application usage, Website usage, Voice assistant, Settings. Data comes from a local SQLite database through a local-only API. See `docs/BACKEND.md` for the schema, API reference, time-zone strategy and security notes.
- **Real (database-backed):** daily limit (default 3 h), theme, usage summaries, usage history, database status.
- **Manual for now:** nothing is tracked automatically. Use "Add a test session" on the usage pages to create records (they can be deleted from History).
- **Placeholders:** voice assistant (mic, history, examples), "Start with Windows", automatic application/website tracking, restrictions.

## AI assistant, memory and local file search (Phase 8)
Dashboard pages: **AI assistant**, **AI memory**, **Local files**. Everything about setup, privacy, tools, schema and limits is in `docs/AI.md`. Short version: add a model and key in AI setup (or point it at a local Ollama), add folders on the Local files page, and nothing from your files is sent to an AI unless you switch that on.

## Layout
```
backend/    ai/ (providers, tools, chat), files/ (indexer, extraction, search), aiRepo.js, aiRoutes.js, services.js, safety.js
            database.js (SQLite, migrations, queries), validators.js, server.js (Express API)
electron/   main.js (lifecycle + IPC validation), windowManager.js (windows, drag), settingsStore.js (moon position file), preload.js (bridge)
frontend/   React UI (one bundle, routes #/moon and #/dashboard): pages/, components/, hooks/, data/sampleData.js
scripts/    dev.js (Vite + Electron), smoke.js (automated test)
```

## Security
contextIsolation on, nodeIntegration off, sandbox on, preload exposes only fixed no-argument commands, main checks that each command comes from the correct window's top frame, navigation and new windows are blocked, production CSP is set in index.html. No filesystem or shell access is exposed.

## Status of earlier phases (honest summary)
Phases 1-3: working and tested. Phase 5 (website tracking): backend, idle monitor and extension are built and the backend tests pass, but `npm run test:extension` still has failing end-to-end tests, the dashboard's Website page is still the Phase 3 page, and nothing has been run in real Chrome. Phases 4, 6 and 7 do not exist in this project.

## Troubleshooting
- Blank or missing moon: run `npm run build` first, or use `npm start`.
- Electron download failed during install: re-run `npm install`, or `node node_modules/electron/install.js`.
- Port 5173 busy in dev: close the other Vite process.
- Moon hidden behind a full-screen exclusive game: expected; borderless/windowed games are fine.
- Reset the moon's position: delete `%APPDATA%\lil-moon\settings.json`.
- Dashboard says it could not open the database: the file is kept untouched; close other copies of Lil Moon and press Try again. To start fresh, quit Lil Moon and delete `%APPDATA%\lil-moon\lil-moon.db*` (this erases your data).
- A console warning that SQLite is experimental is expected.

## Implemented
Floating frameless transparent always-on-top moon, drag vs click detection, dashboard with sample-data cards, single dashboard instance, minimize/close/exit, edge clamping, multi-monitor and display-change handling, saved position.

## Known limitations
- Application/website usage, voice assistant and settings are visual placeholders; sample data is labelled.
- No tray icon or app icon yet (the moon's right-click menu is the way out without opening the dashboard).
- Windows-specific behaviour (DPI scaling, always-on-top over other topmost windows) was not tested on real Windows.

## Testing
`npm test` runs the 13 backend tests. `npm run smoke` runs two phases (set `SMOKE_PHASE=1` then `2` with the same `SMOKE_DIR`) to check restart persistence. Under Linux use `xvfb-run -a npx electron --no-sandbox scripts/smoke.js`.

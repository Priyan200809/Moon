# Lil Moon Phase 8: AI assistant, memory and local file search

## Architecture
```
Dashboard (React)  --token-->  Express /api/ai/* and /api/files/*  (inside Electron's main process)
                                  |- chat.js        history + memory + retrieved excerpts + tool loop + citation check
                                  |- providers/*    openai-compatible (cloud or local) | anthropic   <- swappable
                                  |- tools.js       fixed tool set, validated args, confirmation, log
                                  |- files/*        walk -> extract -> clean -> chunk -> SQLite FTS5 -> search
                                  `- aiRepo.js      conversations, memory, folders, files, chunks, tool log (SQL lives here)
Main process only: electron/keyStore.js (API key, encrypted with Windows secure storage), native folder dialog, open/reveal.
```
The renderer never sees the API key, never supplies a file path, and cannot run SQL.

## Setup
1. `npm install` then `npm start`.
2. Dashboard > **AI assistant** > AI setup. Pick a preset, enter the model name and your API key, Save.
   - Cloud: OpenAI-compatible address (for example `https://api.openai.com/v1`) or the Anthropic type.
   - Local model: choose "Local (Ollama)" (`http://localhost:11434/v1`); no key needed. Plain `http://` is only accepted for localhost.
   - Alternative to saving a key: set the environment variable `LILMOON_AI_API_KEY` (takes precedence, nothing written to disk).
3. Without a key and model the assistant says what is missing and sends nothing.

## Database (schema v3, migration keeps existing data)
`ai_settings`, `conversations`, `messages` (role, content, timestamp, provider, model, sources), `memories`, `memory_candidates` (awaiting approval), `memory_avoid`, `indexed_folders`, `indexed_files` (size, mtime, content hash, status), `file_chunks` + `file_chunks_fts` (FTS5, porter stemming, kept in sync by triggers), `tool_log`. Memory is stored apart from conversations: deleting one never touches the other.

## Memory
Categories: preference, project, fact, task, instruction. A memory exists only if you add it, say "remember that ...", or approve a suggestion. Suggestions come from the model through the `propose_memory` tool and wait on a card (Save / Not now / Never remember this). Secrets (keys, tokens, passwords, card numbers, PINs) are refused everywhere; sensitive topics (health, religion, income...) are never proposed by the model. A phrase list ("things not to remember") blocks suggestions. Memory can be switched off, edited, deleted one by one, or cleared.

## Local files
Supported: TXT, MD, CSV, JSON, PDF, DOCX, PY, JS, JSX, TS, TSX, HTML, CSS, SQL. Folders come from a native dialog; drives, system folders, `AppData`, browser profiles, credential folders and Lil Moon's own data folder are refused. Always skipped: `.env`, private keys, `*.pem/*.key/*.pfx`, `credentials*`, `secrets*`, `node_modules`, `.git`, symlinks, binaries, files over 2 MB (25 MB for PDF/DOCX). Secret-looking strings are redacted in the index. Unchanged files are skipped (size + modified time, then content hash); edits, renames and deletions are picked up on re-index and at startup. Removing a folder deletes its index. Original files are never modified. Opening: documents and data files open normally; scripts and web files (.py .js .html .sql ...) are only **revealed** in Explorer, never launched, because opening a script can run it on Windows.

## Retrieval (RAG) and consent
Search = FTS5 BM25 over chunks + file-name matching. When you tick "Search my files" **and** have allowed it in AI setup, the top excerpts are sent to your provider wrapped as `<untrusted_document>` data and the model must cite `[n]`. Citations that were not provided are stripped, file names that were not retrieved are flagged, and with no matches the model is told so. With sharing off (default) nothing from your files leaves the computer. Semantic/vector search is **not implemented**; `file_chunks` is ready for an optional embeddings column behind the same search function.

## Tools
`search_files`, `read_document`, `get_usage_today`, `get_recent_sessions`, `get_daily_limit`, `propose_memory`, `navigate_dashboard` (run directly) and `open_file`, `open_website` (need your Allow click; card text comes from Lil Moon's own lookup). Arguments are schema-validated, unknown tools and extra arguments are rejected, files are addressed by index id only, websites must be in your tracked list, and everything is logged (`GET /api/ai/tool-log`). No shell, SQL or arbitrary-path tool exists. There is no tool for opening applications (no approved-application list exists yet).

## API (all under `/api`, bearer token)
`GET /ai/status` `PUT /ai/settings` `PUT|DELETE /ai/key` (write-only) | `GET|POST|DELETE /ai/conversations`, `PATCH|DELETE /ai/conversations/:id`, `GET|DELETE /ai/conversations/:id/messages`, `POST /ai/conversations/:id/messages` (SSE stream; closing the connection stops generation) | `POST /ai/tools/:id/confirm` | `GET|POST|DELETE /ai/memories`, `PATCH|DELETE /ai/memories/:id`, `POST /ai/memory-candidates/:id/accept|dismiss`, `POST /ai/memory-avoid`, `DELETE /ai/memory-avoid/:id` | `GET /files/status`, `POST /files/folders` (opens the dialog), `DELETE /files/folders/:id`, `POST /files/folders/:id/reindex`, `GET /files/search?q=`, `POST /files/:id/open`.

## Known limitations
- Only keyword search; no semantic search yet.
- Document text is untrusted but a real model can still be swayed by it. The defences here (data wrapping, validated tools, confirmation, consent gate) limit what a swayed model can DO; they cannot guarantee what it SAYS. Tests use a fake worst-case model, not a real one.
- PDF text comes from the PDF's text layer; scanned PDFs need OCR (not included). Password-protected PDF/DOCX are reported as errors.
- Indexing runs in the main process (yielding between files); a very large PDF may briefly slow the app.
- Stored conversations are plain rows in `lil-moon.db` (protected only by your Windows account); use "Delete all history".
- When file sharing is on, excerpts go to the provider you configured, under that provider's terms.
- Not verified on Windows or with a real cloud model (see below).

## Manual checklist (Windows, real provider)
1. AI setup: enter a real key and model; send "hello" and watch it stream; press Stop mid-answer.
2. Restart the app: the conversation is still there. Rename, search and delete it.
3. Say "remember that I prefer short answers": it appears in AI memory. Edit it, delete it.
4. Local files > Add folder (native dialog) with a TXT, a PDF and a DOCX. Wait for "Up to date".
5. Search a phrase from each; click Open / Show in folder.
6. In AI setup turn on file sharing; ask "What does my DBMS note say about normalization?" with "Search my files" ticked; check the [1] source card and Open.
7. Edit a file, press Re-index, search the new phrase. Remove the folder and confirm search is empty and the file still exists.
8. Turn the network off and ask something: you should get a clear connection error and the app keeps working.

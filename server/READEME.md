# Server architecture & data flow

This document describes the **backend (Node/Express)** portion of the project as implemented under `server/`.

## Tech + runtime dependencies

Server runtime and tooling are defined in `server/package.json`.

- **express**: HTTP server + routing (`server/server.js`)
- **cors**: CORS policy enforcement (allowlist from env; see `CORS_ORIGINS` below)
- **dotenv**: loads environment variables from `.env` at startup
- **mongoose**: MongoDB ODM, schema definitions under `server/models/`
- **multer**: `multipart/form-data` file uploads to disk
- **openai**: calls OpenAI Chat Completions for graph generation
- **uuid**: session UUID generation

Dev dependencies:

- **nodemon**: hot-reload for `npm run dev`
- **eslint** (`eslint.config.mjs`): ESLint 9 **flat** config; **`globals.node`** so `process` and other Node builtins resolve (this package has no React/JSX). From the repo root, **`npm run lint`** runs `eslint` for both `client/` and `server/`.

## Environment variables (required)

The server requires these environment variables at runtime:

- **`OPENAI_API_KEY`**: required; server exits on startup if missing.
- **`MONGODB_URI`**: required; server will retry connection if missing/unreachable.
- **`NODE_ENV`**: affects default data directory (when `DATA_DIR` is unset), static serving, and Mongo options.
- **`PORT`**: optional; defaults to `5001`.

## Environment variables (optional — configuration)

Resolved in `server/config.js` (loaded after `dotenv` via `import 'dotenv/config'` in `server.js`):

- **`CORS_ORIGINS`**: comma-separated browser origins allowed for cross-origin API calls, e.g.  
  `https://your-app.onrender.com,http://localhost:3000`  
  If unset, defaults to `https://talk-graph.onrender.com` and `http://localhost:3000`.

- **`DATA_DIR`**: absolute path, or path relative to **current working directory** (when you run `cd server && node server.js`, cwd is `server/`).  
  This directory holds `uploads/`, `metadata/`, and `graphs/` on disk.  
  If unset: **development** uses the `server/` folder (same directory as `config.js`); **production** defaults to `/opt/render/project/src/server` (Render layout).

- **`OPENAI_ANALYZE_MODEL`**: optional; chat model id for `POST /api/analyze` and `POST /api/generate-node` (default **`gpt-4o`**). Override if your API key only has access to a different model.

- **`GENERATE_NODE_MAX_NEW_NODES`** / **`GENERATE_NODE_MAX_SELECTED`**: optional caps for **`POST /api/generate-node`** (defaults **5** / **12**; GitHub **#37**).

- **`OPENAI_TRANSCRIBE_MODEL`**: optional; Whisper model id for `POST /api/transcribe` (default **`whisper-1`**). Same **`OPENAI_API_KEY`** as other OpenAI calls (GitHub **#34**).

**Billing:** A working [API quickstart](https://developers.openai.com/api/docs/quickstart) proves your key and code can reach OpenAI; it does **not** mean unlimited free usage. If OpenAI returns **429**, add credits or a payment method under [Billing](https://platform.openai.com/account/billing) (or you may be on a rate limit—retry later).

## High-level architecture

The backend is an **Express app** with:

- **REST-ish JSON endpoints** for session tracking, analysis, telemetry, and feedback.
- **File upload and file retrieval** endpoints backed by the filesystem.
- **MongoDB persistence** (Mongoose) for sessions, metadata, transforms, graphs, and analytics.
- **OpenAI integration** for generating graph JSON from source content.

There is intentional **hybrid persistence**:

- The filesystem provides durable artifacts (`uploads/`, `metadata/`, `graphs/`).
- MongoDB stores structured records for querying and tracking user activity.

**User activity audit:** `UserActivity` (`server/models/userActivity.js`) records high-level outcomes (session, upload, analyze, graph save/load tracking, feedback) with links to domain documents where useful. **`POST /api/operations`** remains represented only by **`GraphOperation`** documents (no duplicate audit row).

## Data consistency (hybrid persistence)

The server intentionally stores some data **on disk** and related metadata **in MongoDB**. Below: **source of truth per concern**, and **when the two layers can diverge**.

### Source of truth by concern

| Concern | Authoritative record | Secondary / mirror | Code notes |
|--------|----------------------|--------------------|------------|
| **Session identity** | MongoDB `Session` (UUID `sessionId` + `_id`) | — | All API flows that need a session validate against `Session` (or fail). |
| **Raw upload bytes** | `uploads/` under **`DATA_DIR`** | MongoDB `File` document (`path`, names, `sessionId`, etc.) | A successful **`POST /api/upload`** requires **metadata JSON on disk**, **multer file on disk**, and **`File.save()`**. If the DB write fails, artifacts are removed so disk and DB stay aligned (see upload flow). |
| **Library file list** | MongoDB `File` when **`GET /api/files?sessionId=`** or **`?userId=`** / **`X-Mindmap-User-Id`** (#32) | **`metadata/*.json`** mirror | Scoped listing uses **`File`**; legacy unscoped **`GET /api/files`** still scans **metadata/** only. **Session-only** listings exclude rows with **`File.userId`** set (account-owned), so guests do not see another account’s uploads after sign-out in the same browser session. Upload writes both; drift is possible if metadata is edited by hand. |
| **Serving file content** | **`GET /api/files/:filename`** reads **`uploads/`** by filename | **`File`** / metadata **`userId`** for **403** when the caller is not the owner | Account-owned files require matching **`X-Mindmap-User-Id`**; see §3 *File listing + file content retrieval*. |
| **Saved graph snapshot** | Pair: **`graphs/graph_*.json`** + MongoDB `Graph` | `GraphView` when load tracking runs | **`POST /api/graphs/save`** writes **JSON to disk first**, then **`dbGraph.save()`**. If Mongo fails after the file write, a graph JSON file may exist **without** a matching `Graph` document—see GitHub **#44**. **`GET /api/graphs`** lists files in **`graphs/`**; load uses disk JSON and may join Mongo by `metadata.generatedAt`. |
| **Analyze runs** | MongoDB `GraphTransform` | `UserActivity` (`ANALYZE_COMPLETE`) | Transform is authoritative; audit is supplementary. |
| **Graph UI telemetry** | MongoDB `GraphOperation` | — | No duplicate row in `UserActivity` (see persistence matrix). |
| **Feedback** | MongoDB `Feedback` | `UserActivity` (`FEEDBACK_SUBMIT`) | Feedback doc is authoritative. |
| **Cross-cutting audit** | MongoDB `UserActivity` | — | Does **not** replace domain collections; used for support/analytics. |

### Divergence scenarios (operators & contributors)

1. **Upload rollback (handled):** DB error after disk writes → handler deletes uploaded file + metadata JSON → **503** / **409**; no orphaned `File` row.
2. **Graph save partial write (known gap):** DB error after `graphs/` write → orphan JSON on disk; **`UserActivity` `GRAPH_SNAPSHOT_SAVE`** is only written after successful Mongo save, so monitoring will not show a “success” audit for a failed DB row—see **#44** for hardening options.
3. **Library list vs Mongo:** Corrupt or stray `metadata/*.json` entries are skipped (`null` in list); `File` collection can still contain rows for paths no longer on disk if data was changed outside the app.
4. **Mongo unavailable:** Session creation, upload, analyze, graph save, and other DB-backed routes fail or return errors; disk-only endpoints are limited—treat Mongo as **required** for normal operation.

### Related documentation

- Persistence matrix (which handlers write what): earlier sections and the **User activity audit** table in this file.
- Client expectations: **`client/README.md`** (flows assume successful API responses match persisted state).

## Project layout (server/)

- `config.js`: **`DATA_DIR`** (uploads/metadata/graphs root) and **`CORS_ORIGINS`** parsing
- `server.js`: main entrypoint (Express app + OpenAI analyze/generate-node + DB connect); mounts routers below
- `routes/files.js`: **`/api/files`**, **`/api/upload`**, **`/api/files/:filename`** (library uploads + metadata)
- `routes/auth.js`: **`/api/auth/register`**, **`/api/auth/login`**, **`/api/auth/logout`**, **`/api/auth/me`**, **`PATCH /api/auth/me`** (JWT **`mindmap_auth`** httpOnly cookie; GitHub **#63**)
- `routes/graphs.js`: **`/api/graphs/*`** (save, list, load, view stats)
- `routes/`: other modules (sessions, feedback, graph operations)
- `models/`: Mongoose schemas (Session, File, Graph, GraphTransform, UserActivity, etc.)
- `lib/`: shared helpers (`recordUserActivity.js`, `sessionObjectId.js`)
- `scripts/migrate.js`: migration script (see root README for how it’s used)
- `uploads/`: uploaded raw files (written by multer)
- `metadata/`: metadata JSON files describing uploads (written by server code)
- `graphs/`: saved graph JSON snapshots

## Request/data flows

### 1) Session initialization + lifecycle

**Goal**: create a durable session record and record client environment metadata.

1. Client sends `POST /api/sessions` with `sessionStart` and `userMetadata`.
2. Server finds or creates a `UserMetadata` document.
3. Server creates a `Session` document with a generated UUID `sessionId`.
4. Client stores the UUID and uses it for later requests.
5. On page unload, client sends `POST /api/sessions/:sessionId` (often via `sendBeacon`) with `sessionEnd` and `sessionDuration`.

Relevant code:

- `server/routes/sessions.js`
- `server/models/session.js`
- `server/models/userMetadata.js`

### 2) Upload flow (file + metadata)

**Goal**: accept a text/markdown file, store it on disk, and associate it with a session.

1. Client uploads `multipart/form-data` to `POST /api/upload` including:
   - `file`
   - `customName`
   - `sessionId` (UUID)
2. Server validates that the session exists in Mongo (`Session.findOne({ sessionId })`).
3. Server writes:
   - raw file to `server/uploads/` (via multer storage)
   - metadata JSON to `server/metadata/<filename>.json`
4. Server saves a `File` record to Mongo (many files may share the same `sessionId`). **If that save fails**, the response is an error (no success body implying persistence):
   - **503** `DATABASE_PERSIST_FAILED` — transient DB / server error; the uploaded file and metadata JSON are **removed** so disk and DB do not diverge.
   - **409** `DUPLICATE_KEY` — rare (e.g. duplicate `path` or a **legacy** unique index still on `sessionId` from older deployments); artifacts are rolled back the same way.
   - **500** `METADATA_WRITE_FAILED` — metadata JSON could not be written; the multer file is removed.
5. **200** responses include `success: true` and `persistedToDatabase: true` when both disk and Mongo are in sync.

**MongoDB (existing databases):** If this project previously created a **unique** index on `sessionId` only, drop it after deploying this schema so multiple uploads per session work:

`db.files.dropIndex("sessionId_1")` (name may vary; use `db.files.getIndexes()` in `mongosh` to confirm).

Relevant code:

- `server/routes/files.js` (`POST /upload` → `POST /api/upload` when mounted)
- `server/models/file.js`

### 2b) Audio transcription (Whisper) — GitHub **#34**

**Goal**: turn a short audio clip into plain text for the same analyze pipeline as uploads (client uploads transcript as `.txt` via **`POST /api/upload`**).

1. Client sends `multipart/form-data` to **`POST /api/transcribe`** with:
   - **`audio`** — one file (`audio/*` MIME; max **25 MB**, Whisper API limit)
   - **`sessionId`** — UUID; must match an existing Mongo **`Session`**
2. Server calls OpenAI **`audio.transcriptions.create`** (model **`OPENAI_TRANSCRIBE_MODEL`**, default **`whisper-1`**).
3. **200** response JSON:
   - **`success`**: `true`
   - **`transcript`**: string (may be empty)
   - **`model`**: model id used
   - **Optional (GitHub #58):** If the client sends **`verbose`** (multipart field or query) with a truthy value (`1`, `true`, `yes`, `on`), the server uses OpenAI **`response_format: verbose_json`** and adds:
     - **`duration`**: number (seconds), when the API returns it
     - **`segments`**: array of `{ start, end, text }` (seconds; one row per phrase)
4. **Errors:** **`400`** — missing `sessionId`, invalid session, missing file, unsupported MIME (**`code`**: `SESSION_REQUIRED`, `INVALID_SESSION`, `NO_AUDIO_FILE`, `UNSUPPORTED_AUDIO_TYPE`). **`413`** — **`FILE_TOO_LARGE`** (`maxBytes`). **`401`** / **`429`** — OpenAI auth / quota (**`OPENAI_AUTH`**, **`OPENAI_QUOTA`**). Failures record **`UserActivity`** **`TRANSCRIBE_COMPLETE`** **`FAILURE`**; successes record **`SUCCESS`**.

No audio bytes are persisted as library **`File`** rows on this route — only audit metadata. The client saves text through the normal upload API.

**Default response** uses the compact transcription shape (**`transcript`** only). **Segment timestamps** are opt-in via **`verbose`** (**#58**). **Speaker labels** are not returned by **`whisper-1`**; see **`gpt-4o-transcribe-diarize`** / **`diarized_json`** — GitHub **#59**.

**Follow-ups (outside #58 scope):** HTTP-level tests with a stubbed OpenAI client (**#60**). Browser E2E for the verbose checkbox and segment UI — **#24**. Optional **word-level** timing, **subtitle export** (SRT/VTT), or **persisting `segments`** with uploads — **#61**. Combining **#58** segment timing with **#59** speaker labels will need a merged response contract when both land.

Relevant code:

- `server/routes/transcribe.js`
- Unit tests: `server/routes/transcribe.test.mjs` (`npm test` in `server/`)

### 3) File listing + file content retrieval

**Goal**: allow the UI to list uploaded content and fetch it for analysis.

- `GET /api/files` — **User/session scoping (GitHub #32):**
  - **`?userId=`** or header **`X-Mindmap-User-Id`**: MongoDB **`File.find({ userId })`** — account library (signed-in client uses **`GET /api/files`** without `sessionId` in the query; header carries the id).
  - **`?sessionId=<uuid>`** only (guest / signed-out): **`File.find({ sessionId, … })`** where **`userId`** is **missing, null, or empty** — “guest” uploads for that session. Rows with a non-empty **`File.userId`** are **excluded**, so account-owned uploads are not visible after sign-out while the browser **`sessionId`** is unchanged.
  - **No** `sessionId`/`userId`: falls back to enumerating **`server/metadata/`** (legacy unscoped list; **not recommended for production** — see backlog).
- Response may include **`listingScope`**: **`sessionId`**, **`userId`**, or **`legacy`**.
- `GET /api/files/:filename` — reads from `server/uploads/`. If the **`File`** row or metadata JSON has **`userId`**, the request must send **`X-Mindmap-User-Id`** with the **same** value or the server returns **403** (`FORBIDDEN`).
- `DELETE /api/files/:filename?sessionId=` — **Guest-only** files: metadata **`sessionId`** must match. **Account-owned** files: only the matching **`X-Mindmap-User-Id`** may delete (session match alone is insufficient), so a guest cannot delete another user’s file in the same session.

**Auth registration / profile (GitHub #63):** **`POST /api/auth/register`**, **`POST /api/auth/login`** set a **`mindmap_auth`** httpOnly cookie; **`GET /api/auth/me`** and **`PATCH /api/auth/me`** read/update the current user. Request bodies for auth routes are **redacted** in the default request logger.

**Follow-ups (outside current scope):** Verify **`X-Mindmap-User-Id`** against the JWT cookie server-side (do not rely on the client header alone); authorize **`POST /api/analyze`** against owned files; retire or gate legacy unscoped **`GET /api/files`** in production — see GitHub issues linked from **`docs/github-backlog-issues.md`**.

Relevant code:

- `server/routes/files.js`
- `server/routes/auth.js`

### 4) AI analysis → graph JSON (OpenAI) + transform tracking

**Goal**: turn file content into a graph representation.

1. Client calls `POST /api/analyze` with:
   - `content` (text from `/api/files/:filename`)
   - optional `context`
   - `sessionId` (UUID)
   - `sourceFiles` (identifiers for files)
2. Server looks up the `Session` by UUID.
3. If `content` is missing, responds **400** (no `GraphTransform` is created).
4. Server resolves `sourceFiles` to `File` IDs when possible and creates a `GraphTransform` document with `status: pending` (including an **empty** `sourceFiles` array when nothing matched).
5. Server calls OpenAI Chat Completions (model from **`OPENAI_ANALYZE_MODEL`**, default **`gpt-4o`**) and **expects JSON** with:
   - `nodes[]` (concept nodes: id, label, description, wikiUrl, etc.)
   - `links[]` (relationships: source, target, relationship)
6. Server parses the reply with the same helper used for generate-node: strips common markdown code fences, extracts a `{ ... }` object, then validates `nodes` and `links` arrays.
7. On success, server updates `GraphTransform` with `result`, marks it `completed`, writes `UserActivity` **`ANALYZE_COMPLETE`** **`SUCCESS`**, then returns the graph JSON. On failure (OpenAI **429** / **401**, parse errors, etc.), returns a non-2xx JSON body with `details` and `code` (e.g. `OPENAI_QUOTA`, `ANALYSIS_FAILED`), marks the transform `failed`, and writes **`ANALYZE_COMPLETE`** **`FAILURE`** when a transform record exists.

Relevant code:

- `server/server.js` (`/api/analyze`)
- `server/models/graphTransform.js`

**Multi-select uploads (library UI):** The client may call **`POST /api/analyze` once per selected file** (one `GraphTransform` per request). For visualization it merges responses in the browser with **namespaced node ids** so OpenAI-local ids do not collide across files — see **`client/src/utils/mergeGraphs.js`** and **`client/README.md`** (GitHub **#21**). The merged graph is a **disjoint union** of per-file subgraphs unless/until optional **fusion** or **split** features land (**#47**).

**Persistence matrix (audit vs domain):**

| Handler | Primary Mongo document(s) | `UserActivity` action (when applicable) |
|--------|---------------------------|------------------------------------------|
| `POST /api/sessions` | `Session`, `UserMetadata` | `SESSION_CREATE` |
| `POST /api/sessions/:sessionId` | `Session` | `SESSION_UPDATE` |
| `POST /api/upload` | `File` | `FILE_UPLOAD` |
| `POST /api/transcribe` | *(no `File`; audit only)* | `TRANSCRIBE_COMPLETE` |
| `POST /api/analyze` | `GraphTransform` | `ANALYZE_COMPLETE` |
| `POST /api/graphs/save` | `Graph` | `GRAPH_SNAPSHOT_SAVE` |
| `GET /api/graphs/:filename` | `GraphView` (if DB graph matched) | `GRAPH_VIEW_RECORD` |
| `POST /api/feedback` | `Feedback` | `FEEDBACK_SUBMIT` (if session row exists) |
| `POST /api/operations` | `GraphOperation` | *(use `GraphOperation` only)* |

### 5) “Generate node(s)” graph expansion (OpenAI)

**Goal**: expand an existing graph by adding new nodes + links connected to selected nodes.

1. Client sends `POST /api/generate-node` with **`selectedNodes`** (non-empty array, each with **`id`**) and optional **`numNodes`** (default **3**). **Growth budgets (GitHub #37):** **`GENERATE_NODE_MAX_NEW_NODES`** (default **5**) and **`GENERATE_NODE_MAX_SELECTED`** (default **12**) cap request size. Invalid requests return **400** with **`code`** such as **`MISSING_SELECTED_NODES`**, **`TOO_MANY_SELECTED`**, **`NUM_NODES_OVER_CAP`**, etc.
2. **Dry run:** JSON body **`dryRun: true`** skips OpenAI and returns **`{ success: true, dryRun: true, preview: { numNodes, selectedCount, estimatedNewLinks, caps } }`** so the UI can show a **preview/apply** round without spending tokens.
3. Otherwise server prompts OpenAI (same **`OPENAI_ANALYZE_MODEL`** / default **`gpt-4o`** as analyze) to return JSON with `nodes` and `links`.
4. Server parses the assistant message with **`parseGraphJsonFromCompletion`** (markdown code fences, stray prose, and `{ ... }` extraction—same as **`/api/analyze`**). If parsing or shape checks fail, responds with **502** and `code: INVALID_MODEL_JSON`.
5. Server validates graph semantics (connectivity of new nodes to all selected nodes). On validation failure, responds with **200** and `{ success: false, error, details }` (legacy shape for this endpoint).
6. On OpenAI HTTP errors, responds with **429** / **401** and `code` **`OPENAI_QUOTA`** / **`OPENAI_AUTH`** (same semantics as analyze).
7. On other failures, **500** with `code: GENERATE_NODE_FAILED` when appropriate.

Relevant code:

- `server/server.js` (`/api/generate-node`)
- `server/lib/generateNodeBudget.js` (validation + dry-run preview; tests: **`lib/generateNodeBudget.test.mjs`**)

### 6) Save/load graphs (filesystem + MongoDB)

**Goal**: persist generated/edited graphs and reload them later.

- `POST /api/graphs/save`
  - writes `server/graphs/graph_<timestamp>.json`
  - also stores a `Graph` document in Mongo
- `GET /api/graphs`
  - lists saved graph JSON snapshots in `server/graphs/`. **#32:** pass **`?userId=`** / **`X-Mindmap-User-Id`** for **`metadata.userId`**, or **`?sessionId=`** for guest session snapshots **excluding** any JSON whose **`metadata.userId`** is set (account-owned graphs are not listed in session-only mode). Omitting both returns **all** snapshots (**legacy**). Response may include **`listingScope`**.
- `POST /api/graphs/save` — **`metadata.userId`** is taken from **`X-Mindmap-User-Id`** when present, else from the request body (header wins).
- `GET /api/graphs/:filename`
  - loads a snapshot from disk. If **`metadata.userId`** is set, requires matching **`X-Mindmap-User-Id`** or returns **403**.
  - optionally enriches/links to Mongo data and records a `GraphView`

Relevant code:

- `server/routes/graphs.js`
- `server/models/graph.js`
- `server/models/graphView.js`

### 7) Telemetry: graph operations

**Goal**: record user actions taken in the visualization UI (generate/add/delete/etc.).

1. Client posts `POST /api/operations` with sessionId, operation type, status/duration, and details.
2. Server stores a `GraphOperation` document in Mongo.
3. `GET /api/graphs/:graphId/operations` returns recent operations for a graph.

Relevant code:

- `server/routes/graphOperations.js`
- `server/models/graphOperation.js`

### 8) Feedback capture

**Goal**: store user feedback tied to a session.

- `POST /api/feedback`: stores a `Feedback` doc (sessionId + comment + optional rating + category/tags).
- `GET /api/feedback`: retrieves recent feedback.
- `GET /api/feedback/view`: filtering + pagination.

Relevant code:

- `server/routes/feedback.js`
- `server/models/feedback.js`

## CORS + deployment behavior

- CORS allowlist comes from **`CORS_ORIGINS`** (see above) or the default pair for local + the current Render URL.
- In `production`, Express serves the React build from `client/build` and has a catch-all route for non-API requests.
- On-disk data lives under **`DATA_DIR`** (or the defaults described above): `uploads/`, `metadata/`, and `graphs/` are subdirectories of that root.

**Render:** set `OPENAI_API_KEY`, `MONGODB_URI`, and `NODE_ENV=production` in the dashboard. Add **`CORS_ORIGINS`** if the public site URL changes; add **`DATA_DIR`** only if you move persistence off the default path.

## Notes / current caveats (as implemented)

- **`/api/analyze`** and **`/api/generate-node`** remain in `server/server.js` (OpenAI client wiring). Library files and graph CRUD live under `routes/files.js` and `routes/graphs.js`.
- Disk vs Mongo guarantees and orphan-graph behavior: see **Data consistency (hybrid persistence)** above and GitHub **#44**.
- **Legacy DB:** If uploads still fail with duplicate key on `sessionId`, drop the old `sessionId` unique index on `files` (see upload flow above).

## Quick reference: scripts

From `server/package.json`:

- `npm run dev`: `nodemon server.js`
- `npm start`: `node server.js`


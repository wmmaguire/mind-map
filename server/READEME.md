# Server architecture & data flow

This document describes the **backend (Node/Express)** portion of the project as implemented under `server/`.

## Tech + runtime dependencies

Server runtime and tooling are defined in `server/package.json`.

- **express**: HTTP server + routing (`server/server.js`)
- **cors**: CORS policy enforcement (allowlist from env; see `CORS_ORIGINS` below)
- **dotenv**: loads environment variables from `.env` at startup (path is relative to **process cwd**, typically `server/` when using `cd server && …`)
- **nodemailer**: optional outbound email for **password reset** (`server/lib/passwordResetMail.js`; requires SMTP env — see optional vars below)
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

- **`GENERATE_NODE_RELATIONSHIP_SYNTHESIS`**: optional; set **`0`** / **`false`** / **`off`** to **skip** the second OpenAI pass that rewrites link labels (cheaper; keeps first-pass relationship text). Default: on.

- **`OPENAI_RELATIONSHIP_SYNTHESIS_MODEL`**: optional; model id for that second pass only (default **`gpt-4o-mini`**). The first generate pass still uses **`OPENAI_ANALYZE_MODEL`**.

- **`OPENAI_TRANSCRIBE_MODEL`**: optional; Whisper model id for `POST /api/transcribe` (default **`whisper-1`**). Same **`OPENAI_API_KEY`** as other OpenAI calls (GitHub **#34**).

- **Password reset email (optional — required in production to send mail):** **`APP_PUBLIC_ORIGIN`** — public SPA origin for links in emails (no trailing slash), e.g. `https://your-app.onrender.com`. In development, code may default reset links to `http://localhost:3000` when unset. **`SMTP_URL`** (**`smtp://`…** or **`smtps://`…** only) **or** discrete **`SMTP_HOST`**, **`SMTP_PORT`**, **`SMTP_SECURE`**, **`SMTP_USER`**, **`SMTP_PASS`**; **`MAIL_FROM`** / **`SMTP_FROM`**. If **`SMTP_URL`** is set to a non-SMTP URL (e.g. `https://…`), it is ignored and host-based vars are used. Production: forgot-password **skips** storing a token if **`APP_PUBLIC_ORIGIN`** or SMTP is not configured (same generic JSON response as unknown email).

- **`HTTP_MAX_HEADER_SIZE`**: optional; max request header size in bytes for the Node HTTP server (default **65536**). Helps avoid **HTTP 431** when cookies/headers are large.

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
| **Library file list** | MongoDB `File` when **`GET /api/files?sessionId=`** or **`?userId=`** / **`X-Mindmap-User-Id`** (#32) | **`metadata/*.json`** mirror | Scoped listing uses **`File`** and **skips rows whose `path` no longer exists on disk** (common after PaaS redeploys with ephemeral disk) so the UI does not offer phantom files. Legacy unscoped **`GET /api/files`** still scans **metadata/** only. **Session-only** listings exclude rows with **`File.userId`** set (account-owned). Upload writes both disk + DB; drift is possible if data is edited outside the app. |
| **Serving file content** | **`GET /api/files/:filename`** reads **`uploads/`** by filename | **`File`** / metadata **`userId`** for **403** when the caller is not the owner | Account-owned files require matching **`X-Mindmap-User-Id`**; see §3 *File listing + file content retrieval*. |
| **Saved graph snapshot** | MongoDB **`Graph`** (`payload` = `{ nodes, links }`, **`metadata.filename`** = stable id such as **`graph_<timestamp>.json`**, **`metadata.sessionUuid`**, optional **`metadata.userId`**) | Legacy **`graphs/graph_*.json`** on disk (optional; **one-off import** via script below) | **`POST /api/graphs/save`** persists **only** to Mongo (no new disk snapshot). **`GET /api/graphs`** / **`GET /api/graphs/:filename`** read from Mongo. **`GraphView`** on load when DB graph id is known. **Import:** run **`node server/scripts/migrate-graphs-to-mongo.js`** once if you still have old JSON files under **`graphs/`** (upserts by **`metadata.filename`**). GitHub **#44** orphan-graph-on-disk scenario applies to **legacy** saves, not new Mongo-only saves. |
| **Analyze runs** | MongoDB `GraphTransform` | `UserActivity` (`ANALYZE_COMPLETE`) | Transform is authoritative; audit is supplementary. |
| **Graph UI telemetry** | MongoDB `GraphOperation` | — | No duplicate row in `UserActivity` (see persistence matrix). |
| **Feedback** | MongoDB `Feedback` | `UserActivity` (`FEEDBACK_SUBMIT`) | Feedback doc is authoritative. |
| **Cross-cutting audit** | MongoDB `UserActivity` | — | Does **not** replace domain collections; used for support/analytics. |

### Divergence scenarios (operators & contributors)

1. **Upload rollback (handled):** DB error after disk writes → handler deletes uploaded file + metadata JSON → **503** / **409**; no orphaned `File` row.
2. **Legacy graph save partial write:** Historical flow wrote **`graphs/`** before Mongo; DB failure could leave orphan JSON—see **#44**. **Current** saves are Mongo-only (no new orphan disk files from save).
3. **Library list vs Mongo / disk:** Corrupt or stray `metadata/*.json` entries are skipped (`null` in list); `File` can still reference paths missing on disk after host redeploy—scoped **`GET /api/files`** omits those rows from the API list, but **stale `File` documents** may remain until a reconcile job (backlog—see **`docs/github-backlog-issues.md`**).
4. **Mongo unavailable:** Session creation, upload, analyze, graph save, and other DB-backed routes fail or return errors; disk-only endpoints are limited—treat Mongo as **required** for normal operation.

### Related documentation

- Persistence matrix (which handlers write what): earlier sections and the **User activity audit** table in this file.
- Client expectations: **`client/README.md`** (flows assume successful API responses match persisted state).

## Project layout (server/)

- `config.js`: **`DATA_DIR`** (uploads/metadata/graphs root) and **`CORS_ORIGINS`** parsing
- `server.js`: main entrypoint (Express app + OpenAI analyze/generate-node + DB connect); mounts routers below; **`GET /health`** and **`GET /api/test`** (JSON health) are registered **early** (before other `/api` routers); HTTP server uses **`http.createServer`** with configurable **`maxHeaderSize`**
- `routes/files.js`: **`/api/files`**, **`/api/upload`**, **`/api/files/:filename`** (library uploads + metadata)
- `routes/auth.js`: **`/api/auth/register`**, **`/api/auth/login`**, **`/api/auth/logout`**, **`GET /api/auth/me`**, **`PATCH /api/auth/me`**, **`POST /api/auth/forgot-password`**, **`POST /api/auth/reset-password`** (JWT **`mindmap_auth`** httpOnly cookie; password reset uses one-time token, **1h** expiry, hashed at rest — GitHub **#63** / **#31**)
- `routes/graphs.js`: **`/api/graphs/*`** (save, list, load, view stats, read-only share token — **#39**)
- `routes/`: other modules (sessions, feedback, graph operations)
- `models/`: Mongoose schemas (Session, File, Graph, GraphTransform, UserActivity, etc.)
- `lib/`: shared helpers (`recordUserActivity.js`, `sessionObjectId.js`)
- `scripts/migrate.js`: migration script (see root README for how it’s used)
- `scripts/migrate-graphs-to-mongo.js`: **one-off** import of legacy **`graphs/*.json`** into the **`Graph`** collection (requires **`MONGODB_URI`**)
- `uploads/`: uploaded raw files (written by multer)
- `metadata/`: metadata JSON files describing uploads (written by server code)
- `graphs/`: **legacy** on-disk graph snapshots (optional; not written by **`POST /api/graphs/save`** after Mongo-only persistence)

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

**Default response** uses the compact transcription shape (**`transcript`** only). **Segment timestamps** are opt-in via **`verbose`** (**#58**). The **web** **`FileUpload`** modal exposes the **`verbose`** checkbox only on the **Record** sub-tab; **`POST /api/transcribe`** still accepts **`verbose`** from any client. **Speaker labels** are not returned by **`whisper-1`**; see **`gpt-4o-transcribe-diarize`** / **`diarized_json`** — GitHub **#59**.

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

**Auth registration / profile / password reset (GitHub #63, #31):** **`POST /api/auth/register`**, **`POST /api/auth/login`** set a **`mindmap_auth`** httpOnly cookie; **`GET /api/auth/me`** and **`PATCH /api/auth/me`** read/update the current user. **`POST /api/auth/forgot-password`** (`{ email }`) stores a one-time reset token (**1 hour**, hashed) and sends mail when SMTP + **`APP_PUBLIC_ORIGIN`** are configured (generic success body to avoid email enumeration). **`POST /api/auth/reset-password`** (`{ token, password }`) sets a new password, clears reset fields, and sets the session cookie. Request bodies for auth routes are **redacted** in the default request logger.

**Follow-ups (outside current scope):** Verify **`X-Mindmap-User-Id`** against the JWT cookie server-side (do not rely on the client header alone); authorize **`POST /api/analyze`** against owned files; retire or gate legacy unscoped **`GET /api/files`** in production — see GitHub issues linked from **`docs/github-backlog-issues.md`**. Password-reset **rate limiting**, **audit events**, **E2E**, and **HTML mail** are backlog — see **`docs/github-backlog-issues.md`** (*Password reset — follow-ups*).

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
   - Prompting is **aligned with generate-node** where practical: structured system rules; optional **`context`** is framed as **USER GUIDANCE — TONE, VOICE, AND CONCEPT CHOICES** (when present: bias **which** concepts to extract from the text as well as **how** descriptions and relationship strings are written; **connectivity** is softened—prefer a coherent cluster; avoid weak edges that only exist to connect unrelated concepts); **`temperature`** is **`0.35`** without guidance and **`0.48`** with guidance; **`max_tokens`** is **`4096`**. Preset strings live in **`client/src/utils/generationGuidance.js`**. (Generate-node retains its own topology rules and optional relationship-synthesis pass.)
6. Server parses the reply with the same helper used for generate-node: strips common markdown code fences, extracts a `{ ... }` object, then validates `nodes` and `links` arrays.
7. **Wikipedia URL repair:** After parse, **`repairAnalyzeGraphWikiUrls`** (`server/lib/repairAnalyzeGraphWikiUrls.js`) normalizes English Wikipedia URLs, validates via the REST **page/summary** API, and on failure tries **opensearch** from the node **label** (tests: **`lib/repairAnalyzeGraphWikiUrls.test.mjs`**). Errors during repair are logged; the response still returns the graph. Repair performs **sequential** HTTP work per node (see backlog in **`docs/github-backlog-issues.md`**).
8. **Optional Wikipedia lead thumbnails (GitHub #75):** **`enrichGraphNodesWithThumbnails`** (`server/lib/enrichGraphNodesWithThumbnails.js`) calls **`fetchWikipediaThumbnailUrl`** (`server/lib/wikipediaThumbnail.js`) for each node that has **`wikiUrl`** but not yet **`thumbnailUrl`**, using the same REST **page/summary** response’s **`thumbnail.source`** (no HTML scraping). Work is **sequential** to reduce rate-limit risk; failures are logged per node. The same enrichment runs after **`POST /api/generate-node`** before the response is returned, and on **`GET /api/graphs/:filename`** so **Mongo-backed** loads get thumbnails even when older saves omitted them. Saved graphs persist **`thumbnailUrl`** via **`POST /api/graphs/save`** when present.
9. On success, server updates `GraphTransform` with `result`, marks it `completed`, writes `UserActivity` **`ANALYZE_COMPLETE`** **`SUCCESS`**, then returns the graph JSON. On failure (OpenAI **429** / **401**, parse errors, etc.), returns a non-2xx JSON body with `details` and `code` (e.g. `OPENAI_QUOTA`, `ANALYSIS_FAILED`), marks the transform `failed`, and writes **`ANALYZE_COMPLETE`** **`FAILURE`** when a transform record exists.

Relevant code:

- `server/server.js` (`/api/analyze`)
- `server/models/graphTransform.js`
- `server/lib/repairAnalyzeGraphWikiUrls.js` (normalize + validate/repair **`wikiUrl`**)
- `server/lib/wikipediaThumbnail.js` / `server/lib/enrichGraphNodesWithThumbnails.js` (optional **`thumbnailUrl`** on nodes, GitHub **#75**)

**Multi-select uploads (library UI):** The client may call **`POST /api/analyze` once per selected file** (one `GraphTransform` per request). For visualization it merges responses in the browser with **namespaced node ids** so OpenAI-local ids do not collide across files — see **`client/src/utils/mergeGraphs.js`** and **`client/README.md`** (GitHub **#21**). The merged graph is a **disjoint union** of per-file subgraphs unless/until optional **fusion** or **split** features land (**#47**). After merge, the client assigns **one shared playback timestamp** (`createdAt` / `timestamp`) to **every** node and link produced in that **Apply** run so **#36** replay treats the batch as a single step; future **text-derived ordering** within a batch is backlog **#72** (`docs/github-backlog-issues.md`).

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

1. Client sends `POST /api/generate-node` with **`selectedNodes`** (non-empty array, each with **`id`**) and optional **`numNodes`** (default **3**). Optional **`generationContext`** (string, max **2000** characters after trim) is injected into the **first** and **second** OpenAI prompts as **USER GUIDANCE — TONE, VOICE, AND CONCEPT CHOICES**: it biases **which** new Wikipedia-suitable concepts are chosen as well as **how** descriptions and relationship strings are written (must not override required IDs or connectivity). **Growth budgets (GitHub #37):** **`GENERATE_NODE_MAX_NEW_NODES`** (default **5**) and **`GENERATE_NODE_MAX_SELECTED`** (default **12**) cap request size. Invalid requests return **400** with **`code`** such as **`MISSING_SELECTED_NODES`**, **`TOO_MANY_SELECTED`**, **`NUM_NODES_OVER_CAP`**, **`GENERATION_CONTEXT_TOO_LONG`**, etc.
2. **Dry run:** JSON body **`dryRun: true`** skips OpenAI and returns **`{ success: true, dryRun: true, preview: { …, generationContextIncluded, generationContextMaxChars, … } }`** so the UI can show a **preview/apply** round without spending tokens.
3. Otherwise the server runs the **first** OpenAI completion (**`OPENAI_ANALYZE_MODEL`**, default **`gpt-4o`**) and expects JSON with `nodes` and `links`.
4. Server parses the assistant message with **`parseGraphJsonFromCompletion`** (markdown code fences, stray prose, and `{ ... }` extraction—same as **`/api/analyze`**). If parsing or shape checks fail, responds with **502** and `code: INVALID_MODEL_JSON`.
5. Server validates new node labels vs **`existingGraphNodes`**, assigns timestamps, then validates topology. **Manual:** **`normalizeManualExpansionLinks`** keeps only edges between a new node and a **highlighted** anchor (drops extra model edges to other nodes), accepts **new→anchor** or **anchor→new**, then checks full connectivity. **Community evolution (`randomizedGrowth`):** **`buildRandomExpansionLinks`**. On validation failure, responds with **200** and `{ success: false, error, details }` where applicable.
6. **Optional second pass** — relationship label rewrite (env **`GENERATE_NODE_RELATIONSHIP_SYNTHESIS`**, **`OPENAI_RELATIONSHIP_SYNTHESIS_MODEL`**): Wikipedia extracts are fetched **in parallel**, then a **smaller default model** (**`gpt-4o-mini`**) rewrites link `relationship` strings. Set **`GENERATE_NODE_RELATIONSHIP_SYNTHESIS=off`** to skip (cheaper; keeps step 3 link text).
7. On OpenAI HTTP errors, responds with **429** / **401** and `code` **`OPENAI_QUOTA`** / **`OPENAI_AUTH`** (same semantics as analyze).
8. On other failures, **500** with `code: GENERATE_NODE_FAILED` when appropriate.

Relevant code:

- `server/server.js` (`/api/generate-node`)
- `server/lib/generateNodeBudget.js` (validation + dry-run preview; tests: **`lib/generateNodeBudget.test.mjs`**)
- `server/lib/relationshipSynthesisConfig.js`, **`synthesizeLinkRelationships.js`**, **`wikipediaExtract.js`**, **`manualExpansionLinks.js`**

### 6) Save/load graphs (MongoDB)

**Goal**: persist generated/edited graphs and reload them later.

- `POST /api/graphs/save`
  - stores a **`Graph`** document in Mongo (**`payload`**, **`metadata.filename`** = `graph_<timestamp>.json`, **`metadata.sessionUuid`**, optional **`metadata.userId`**, etc.). **Does not** write **`server/graphs/*.json`**.
  - Playback metadata: `payload.nodes[]` / `payload.links[]` may include `createdAt`/legacy `timestamp` and optional `deletedAt` (client “Pop”) so history ordering and deletions persist after save.
- `GET /api/graphs`
  - lists from the **`Graph`** collection. **#32:** pass **`?userId=`** / **`X-Mindmap-User-Id`** for **`metadata.userId`**, or **`?sessionId=`** for guest session graphs **excluding** account-owned rows. Omitting both returns **all** graphs (**legacy**). Response may include **`listingScope`**.
- `POST /api/graphs/save` — **`metadata.userId`** is taken from **`X-Mindmap-User-Id`** when present, else from the request body (header wins).
- `GET /api/graphs/:filename`
  - Loads by **`metadata.filename`** from Mongo. If **`metadata.userId`** is set, requires matching **`X-Mindmap-User-Id`** **or** a valid **`?shareToken=`** that matches **`metadata.shareReadToken`** (constant-time compare; **#39**).
  - **Share links (#39):** Mint or rotate with **`POST /api/graphs/:filename/share-read-token`** (**`X-Mindmap-User-Id`** must equal **`metadata.userId`**; only graphs saved while signed in). The token is **never** echoed on **`GET`** responses. **`POST /api/graphs/save`** returns **403** if **`?shareToken=`** is present so share secrets do not authorize writes. **`shareReadToken`** in the save JSON body is **ignored** (stripped before persist) so clients cannot mint or overwrite the secret via save. Share viewers omit **`dbId`** in metadata.
  - **Comments / collaboration (not implemented — permissions model for future work):** The **`shareReadToken`** grants **read-only graph snapshot access** only (no writes, no comments). When graph or library **comments** exist, plan for at least: **Owner** — full edit + moderate; **Signed-in collaborator** (future) — comment/write per graph policy; **Share link holder** — read-only unless upgraded to a signed-in role. Until then, treat **`POST /api/feedback`** as product feedback to operators, not per-graph threaded discussion.
  - Before returning JSON, runs **`enrichGraphNodesWithThumbnails`** on the graph payload (same helper as analyze/generate-node) so nodes with **`wikiUrl`** but missing **`thumbnailUrl`** get a lead image URL when available (sequential HTTP; see backlog for caching/perf).
  - Optionally enriches/links to Mongo data and records a `GraphView`

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
- Disk vs Mongo guarantees, legacy orphan **`graphs/`** files, and **upload** durability on ephemeral hosts: see **Data consistency (hybrid persistence)** above, GitHub **#20** / **#44**, and **`docs/github-backlog-issues.md`** (ops note).
- **Legacy DB:** If uploads still fail with duplicate key on `sessionId`, drop the old `sessionId` unique index on `files` (see upload flow above).

## Quick reference: scripts

From `server/package.json`:

- `npm run dev`: `nodemon server.js`
- `npm start`: `node server.js`


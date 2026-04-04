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
- **eslint** (+ config files): linting

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

- **`OPENAI_ANALYZE_MODEL`**: optional; chat model id for `POST /api/analyze` (default **`gpt-4o`**). Override if your API key only has access to a different model.

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

## Project layout (server/)

- `config.js`: **`DATA_DIR`** (uploads/metadata/graphs root) and **`CORS_ORIGINS`** parsing
- `server.js`: main entrypoint (Express app + routes + OpenAI + DB connect)
- `routes/`: route modules (sessions, feedback, graph operations; plus graph save/load endpoints)
- `models/`: Mongoose schemas (Session, File, Graph, GraphTransform, etc.)
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
4. Server saves a `File` record to Mongo. **If that save fails**, the response is an error (no success body implying persistence):
   - **503** `DATABASE_PERSIST_FAILED` — transient DB / server error; the uploaded file and metadata JSON are **removed** so disk and DB do not diverge.
   - **409** `SESSION_FILE_EXISTS` — unique constraint (`sessionId` already has a file); artifacts are rolled back the same way.
   - **500** `METADATA_WRITE_FAILED` — metadata JSON could not be written; the multer file is removed.
5. **200** responses include `success: true` and `persistedToDatabase: true` when both disk and Mongo are in sync.

Relevant code:

- `server/server.js` (`/api/upload`)
- `server/models/file.js`

### 3) File listing + file content retrieval

**Goal**: allow the UI to list uploaded content and fetch it for analysis.

- `GET /api/files` enumerates JSON files under `server/metadata/` and returns a list to the client.
- `GET /api/files/:filename` reads file content from `server/uploads/` and returns it as JSON `{ success, content }`.

Relevant code:

- `server/server.js` (`/api/files`, `/api/files/:filename`)

### 4) AI analysis → graph JSON (OpenAI) + transform tracking

**Goal**: turn file content into a graph representation.

1. Client calls `POST /api/analyze` with:
   - `content` (text from `/api/files/:filename`)
   - optional `context`
   - `sessionId` (UUID)
   - `sourceFiles` (identifiers for files)
2. Server looks up the `Session` by UUID.
3. Server resolves `sourceFiles` to `File` IDs when possible and creates a `GraphTransform` document with `status: pending`.
4. Server calls OpenAI Chat Completions and **expects strict JSON** with:
   - `nodes[]` (concept nodes: id, label, description, wikiUrl, etc.)
   - `links[]` (relationships: source, target, relationship)
5. Server parses the JSON, updates `GraphTransform` with `result`, and marks it `completed` (or `failed` on error).
6. Server returns the graph JSON to the client.

Relevant code:

- `server/server.js` (`/api/analyze`)
- `server/models/graphTransform.js`

### 5) “Generate node(s)” graph expansion (OpenAI)

**Goal**: expand an existing graph by adding new nodes + links connected to selected nodes.

1. Client sends `POST /api/generate-node` with `selectedNodes` and optional `numNodes`.
2. Server prompts OpenAI to generate new node concepts and links that connect to *all* selected nodes.
3. Server validates returned JSON and checks connectivity constraints before returning success.

Relevant code:

- `server/server.js` (`/api/generate-node`)

### 6) Save/load graphs (filesystem + MongoDB)

**Goal**: persist generated/edited graphs and reload them later.

- `POST /api/graphs/save`
  - writes `server/graphs/graph_<timestamp>.json`
  - also stores a `Graph` document in Mongo
- `GET /api/graphs`
  - lists saved graph JSON snapshots in `server/graphs/`
- `GET /api/graphs/:filename`
  - loads a snapshot from disk
  - optionally enriches/links to Mongo data and records a `GraphView`

Relevant code:

- `server/routes/upload.js` (despite the name, it also implements graph save/load)
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

- Some endpoints are implemented directly in `server/server.js` *and* related functionality exists in `server/routes/upload.js`. Route ownership is not fully centralized.
- The server favors availability: some DB write failures are logged but do not necessarily fail the request (notably in upload).

## Quick reference: scripts

From `server/package.json`:

- `npm run dev`: `nodemon server.js`
- `npm start`: `node server.js`


## Project status (MindMap / talk-graph)

Last updated: 2026-03-15

### Summary
This repo implements a full-stack web app that turns uploaded text/markdown into an interactive “mind map” graph. The architecture is:
- **React (Create React App)** frontend for uploading, selecting files, and visualizing/editing graphs with D3
- **Node.js / Express** backend for file upload, content retrieval, graph generation via OpenAI, and persistence
- **MongoDB (Mongoose)** for sessions, metadata, transforms, graphs, feedback, and telemetry
- **Filesystem persistence** as a parallel/backup store for uploads + metadata + saved graphs

The README describes the stack correctly but there is some naming drift: the repo is `mind-map`, while package/app names and production URL references still use `talk-graph`.

---

### Repo structure (high-level)
- `client/`: React app (CRA) with D3 visualization and workflow UI
- `server/`: Express API, Mongoose models, routers, and runtime storage directories:
  - `server/uploads/`: uploaded source files
  - `server/metadata/`: per-upload JSON metadata
  - `server/graphs/`: saved graphs as JSON snapshots

Root `package.json` provides convenience scripts to run both sides in dev.

---

### Runtime architecture

#### Frontend
- **Router / pages**
  - Routes are defined in `client/src/App.js`:
    - `/`: landing experience + modal upload entrypoint
    - `/visualize`: library + visualization screen

- **Session lifecycle**
  - `client/src/components/Landing.js` initializes a session by calling `POST /api/sessions`.
  - The returned session UUID is stored globally as `window.currentSessionId` and used by:
    - upload requests (`POST /api/upload`)
    - analysis requests (`POST /api/analyze`)
    - telemetry (`POST /api/operations`)
    - graph saving metadata

- **Core UI flows**
  - **Upload**: `client/src/components/FileUpload.js`
    - Sends `multipart/form-data` to `POST /api/upload` with `file`, `customName`, `sessionId`.
  - **Library + analyze**: `client/src/components/LibraryVisualize.js`
    - Lists files (`GET /api/files`)
    - Reads file content (`GET /api/files/:filename`)
    - Calls analysis (`POST /api/analyze`)
    - Displays graph using `GraphVisualization`
    - Saves/loads graphs (`POST /api/graphs/save`, `GET /api/graphs`, `GET /api/graphs/:filename`)
  - **Visualization + editing**: `client/src/components/GraphVisualization.js`
    - D3 force graph rendering
    - Zoom-driven “community” merge/split behavior
    - Add node, add relationship, delete node/link
    - AI expansion via `POST /api/generate-node`
    - Tracks operations via `POST /api/operations`

#### Backend
- **Entry point**: `server/server.js` (ES modules; server `package.json` uses `"type": "module"`).
- **Environment requirements**
  - `OPENAI_API_KEY` is required; server exits at startup if missing.
  - `MONGODB_URI` is required to connect; connection attempts retry on failure.
- **CORS**
  - Allows `http://localhost:3000` and `https://talk-graph.onrender.com`.

- **Persistence model: hybrid**
  - **Filesystem**
    - Raw uploads saved to `server/uploads/`
    - JSON metadata saved to `server/metadata/`
    - Saved graphs written to `server/graphs/`
  - **MongoDB**
    - Used for sessions/user metadata, files, transforms, graphs, feedback, and telemetry.
    - Some flows intentionally “do not fail” if DB writes fail (e.g., upload logs DB error but returns success).

---

### Implemented API surface (major endpoints)

#### Files + uploads
- `POST /api/upload`
  - Upload a file (multer)
  - Validates session exists (by session UUID)
  - Writes metadata JSON file
  - Attempts to store a `File` record in Mongo
- `GET /api/files`
  - Lists upload metadata from filesystem (`server/metadata/*.json`)
- `GET /api/files/:filename`
  - Reads the uploaded file content from `server/uploads/`

#### Sessions
- `POST /api/sessions`
  - Creates a `Session` with UUID and associated `UserMetadata`
- `POST /api/sessions/:sessionId`
  - Updates session end time and duration (supports sendBeacon style requests)
- `GET /api/sessions/current`
  - Fetches most recent “active” session

#### AI graph generation (OpenAI)
- `POST /api/analyze`
  - Calls OpenAI chat completions (model `"gpt-4"`)
  - Expects strict JSON output: `{ nodes: [...], links: [...] }`
  - Creates/updates a `GraphTransform` record (`pending` → `completed`/`failed`)
- `POST /api/generate-node`
  - Calls OpenAI to generate new nodes + links connected to selected nodes
  - Includes connectivity validation before returning success

#### Graph persistence + analytics
- `POST /api/graphs/save`
  - Saves a graph snapshot:
    - Writes JSON to filesystem (`server/graphs/graph_<timestamp>.json`)
    - Saves a Graph document in Mongo
- `GET /api/graphs`
  - Lists saved graphs from filesystem
- `GET /api/graphs/:filename`
  - Loads a saved graph from filesystem
  - Optionally merges extra Mongo metadata and records a `GraphView`
- `GET /api/graphs/:graphId/views`
  - Returns view statistics for a graph (Mongo)

#### Telemetry and feedback
- `POST /api/operations`
  - Stores a `GraphOperation` record (create/delete/generate/etc.)
- `GET /api/graphs/:graphId/operations`
  - Lists recent operations
- `POST /api/feedback`, `GET /api/feedback`, `GET /api/feedback/view`
  - User feedback capture + retrieval + filtering

---

### Data model overview (MongoDB/Mongoose)
- `Session` (`server/models/session.js`)
  - session UUID, start/end/duration, reference to `UserMetadata`
- `UserMetadata` (`server/models/userMetadata.js`)
  - browser/os/screen/language/timezone
- `File` (`server/models/file.js`)
  - file metadata + path; linked (conceptually) to session + transforms
- `GraphTransform` (`server/models/graphTransform.js`)
  - tracks analysis jobs (status/result), references `Session` and `File`s
- `Graph` (`server/models/graph.js`)
  - persisted graphs with embedded nodes and links
- `Feedback` (`server/models/feedback.js`)
- `GraphOperation`, `GraphView`
  - analytics/telemetry

---

### Known inconsistencies / risks (current state signals)
- **Naming drift**: many references use “talk-graph” (including production URL), while repo is “mind-map”.
- **Route duplication risk**:
  - `server/server.js` defines `/api/upload` and `/api/files` directly and also mounts `uploadRouter` which defines similar endpoints. This can cause confusion depending on route order.
- **Potential data modeling issue**:
  - `File` schema has `sessionId` marked `unique: true` while the UI supports multiple uploads per session. That likely causes DB insert failures after the first upload in a session (uploads still succeed because the server doesn’t hard-fail on DB write errors).
- **Hard-coded base URLs**:
  - Frontend sometimes uses `window.location.origin`, sometimes hardcodes `https://talk-graph.onrender.com`, and sometimes `http://localhost:5001`, which can make deployment environments brittle.

---

### How to run (from current scripts)
- Root scripts (see `package.json`):
  - `npm run dev`: runs `server` (nodemon) + `client` (CRA) concurrently
  - `npm run start`: runs server only
- Ports:
  - frontend dev server: `http://localhost:3000`
  - backend API: `http://localhost:5001`

Required env vars (backend):
- `OPENAI_API_KEY`
- `MONGODB_URI`

---

### Suggested next documentation additions
- Add a real `server/README.md` describing env vars + Mongo collections + OpenAI expectations.
- Add a diagram showing:
  - upload → metadata/fs + Mongo file record
  - analyze → OpenAI → GraphTransform → visualization → save/load graphs
  - telemetry + feedback flows
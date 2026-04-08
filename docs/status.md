## Project status (MindMap / talk-graph)

Last updated: 2026-04-08 — **#63**-related auth, library account isolation, and docs aligned across **`client/README.md`**, **`server/READEME.md`**, **`docs/github-backlog-issues.md`**; prior **#58** notes + follow-ups **#24**, **#59**, **#60**, **#61** remain in **`server/READEME.md`** §2b.

### Summary
This repo implements a full-stack web app that turns uploaded text/markdown into an interactive “mind map” graph. The architecture is:
- **React (Create React App)** frontend for uploading, selecting files, and visualizing/editing graphs with D3
- **Node.js / Express** backend for file upload, content retrieval, graph generation via OpenAI, and persistence
- **MongoDB (Mongoose)** for sessions, metadata, transforms, graphs, feedback, telemetry, and a **`UserActivity`** audit collection for cross-cutting session/upload/analyze/graph/feedback outcomes (see **`server/READEME.md`**, GitHub **#16**)
- **Filesystem persistence** as a parallel/backup store for uploads + metadata + saved graphs; **which store is authoritative per feature** is summarized under **`server/READEME.md`** → *Data consistency (hybrid persistence)* (GitHub **#20**)
- **Client multi-file library flow:** per-file `POST /api/analyze` plus **`mergeGraphs`** namespaced union in **`client/src/utils/`** (GitHub **#21**); roadmap for connected fusion / splitting in **#47**

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
  - `client/src/context/SessionContext.jsx` (`SessionProvider`) creates or restores a session via `POST /api/sessions`.
  - The returned session UUID is exposed via `useSession()` and used by:
    - upload requests (`POST /api/upload`)
    - analysis requests (`POST /api/analyze`)
    - telemetry (`POST /api/operations`)
    - graph saving metadata

- **Identity + auth + Library shell (GitHub #31 foundation, #33 UI, #63 auth)**
  - `AuthContext.jsx` / `AuthProvider`: **`/api/auth`** register, login, logout, **`GET /api/me`**, **`PATCH /api/me`** (httpOnly **`mindmap_auth`** cookie).
  - `index.js`: **`AuthIdentityBridge`** supplies **`user?.id`** to **`IdentityProvider`** so `useIdentity().userId` matches the signed-in account.
  - `IdentityContext.jsx`: optional `userId` / `isRegistered` / `identityKind`; optional `REACT_APP_MINDMAP_USER_ID`; in **development** with **`REACT_APP_ENABLE_DEV_PREVIEW`**, `setDevRegisteredUserId` for guest preview.
  - `GraphTitleContext.jsx`: `LibraryVisualize` sets the current graph title for the shell banner; cleared when leaving **`/visualize`**.
  - `LibraryUiContext.jsx`: mobile “open library” — `LibraryVisualize` registers visibility + opener; control renders in **`GuestIdentityBanner`** (leading), not a fixed left rail.
  - **`GuestIdentityBanner`**: sign-in / register modal, signed-in menu (user settings, sign out); optional dev preview when env allows.
  - **`LibraryAccountChip`**: shows profile **name** when **`useAuth().user`** has one, else truncated id.
  - **#32** / **#63**: scoped listings; **`POST /api/upload`** sets **`File.userId`** when **`X-Mindmap-User-Id`** is sent. Session-only lists **exclude** account-owned rows so guests cannot see another user’s library after sign-out in the same browser session (**`server/READEME.md`** §3). **Follow-up:** verify header against JWT server-side — see **`docs/github-backlog-issues.md`**.

- **Core UI flows**
  - **Upload**: `client/src/components/FileUpload.js`
    - **Text:** `multipart/form-data` to `POST /api/upload` (`file`, `customName`, `sessionId`). **Audio → transcript (#34 / #35 / #58):** sub-tabs **Upload file** or **Record** → `POST /api/transcribe` (`audio`, `sessionId`; optional **`verbose`** for segment timestamps), then `.txt` via **`POST /api/upload`** (plain text only; timings are UI-only unless persisted in a future ticket).
  - **Library + analyze**: `LibraryVisualize.js` + **`LibrarySidebar`**, **`LibrarySourcesPanel`**, **`LibraryAccountChip`**
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
    - **Graph actions UI** (GitHub **#27**) uses the **Actions** FAB and context menu, not a fixed toolbar. **Dead CSS** for the pre–#27 controls shell was removed in **#28** (`GraphVisualization.css`, `LibraryVisualize.css`). **#29** adds **Generate (AI)** vs **Edit graph** accordion sections (Library-style toggles), **link-flow** copy, a bottom **`graph-edit-mode-chip`** when a modal flow is active, and scrollable menu height. **#30** adds touch-sized targets and basic a11y for the Actions menu (**`role="group"`**, focus management, **`aria-hidden`** on decorative icons). **#31** (foundation): **`actionsFabPlacement`** — Library uses **`libraryGraphMount`** so the FAB is anchored to the graph panel (absolute over the SVG); default elsewhere is viewport-fixed. See **`docs/github-backlog-issues.md`** and **`client/README.md`**.

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
- `POST /api/transcribe` (**#34**, **#58**)
  - Multipart `audio` + `sessionId`; optional **`verbose`** → **`verbose_json`** with **`segments`** / **`duration`**; OpenAI Whisper; `UserActivity` **`TRANSCRIBE_COMPLETE`** (`meta.verbose` when applicable); see **`server/routes/transcribe.js`**
- `POST /api/upload`
  - Upload a file (multer)
  - Validates session exists (by session UUID)
  - Writes metadata JSON file
  - Attempts to store a `File` record in Mongo
- `GET /api/files`
  - With **`?sessionId=`** or **`?userId=`** / **`X-Mindmap-User-Id`**, lists from MongoDB **`File`** (GitHub **#32**); otherwise legacy scan of **`server/metadata/*.json`**
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
  - Calls OpenAI chat completions; model from **`OPENAI_ANALYZE_MODEL`** (default **`gpt-4o`**)
  - Parses assistant output with shared JSON extraction (handles markdown fences, validates `nodes` / `links`)
  - Creates/updates a `GraphTransform` record (`pending` → `completed`/`failed`)
  - Non-2xx + JSON `details` / `code` on quota/auth or analysis failure
- `POST /api/generate-node`
  - Same model env and JSON parsing approach as analyze
  - **502** + `INVALID_MODEL_JSON` if the model output cannot be parsed to `{ nodes, links }`
  - **429** / **401** for OpenAI quota/auth; connectivity validation may still return `{ success: false }` with **200** (legacy)

#### Graph persistence + analytics
- `POST /api/graphs/save`
  - Saves a graph snapshot:
    - Writes JSON to filesystem (`server/graphs/graph_<timestamp>.json`)
    - Saves a Graph document in Mongo
- `GET /api/graphs`
  - Lists saved graph JSON files; filtered by **`metadata.sessionId`** or **`metadata.userId`** when query/header provided (**#32**), else lists all (legacy)
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
  - file metadata + path; **`sessionId`**; optional **`userId`** (**#32**)
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
- **Route layout (updated)**:
  - Library uploads and file listing live in `server/routes/files.js`; persisted graphs in `server/routes/graphs.js`. `server/server.js` mounts these and still defines `/api/analyze` and `/api/generate-node` inline.
- **File ↔ session**:
  - Multiple `File` documents per `sessionId` are allowed; `path` is unique per stored artifact. Older DBs may still have a legacy unique index on `sessionId`—drop it if second uploads fail with duplicate key (see `server/READEME.md`).
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
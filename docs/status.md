## Project status (MindMap / talk-graph)

Last updated: 2026-04-15 — **Graph canvas / library playback (#80 branch):** Restored **orange delta highlight** for new nodes and links after a history scrub (timer-based; no D3 transition); **node drag** allowed while scrubbing read-only snapshots (layout only); **link click selection removed** (hover tooltip only); node tooltip **Related concepts** lists show **link strength %** when `link.strength` exists. **Guidance preset** **Funny** → **Simpleton** (`generationGuidance.js`, `GenerationGuidanceFields`; legacy `funny` maps in `resolveGenerationContext`). Docs: **`client/README.md`**, **`docs/github-backlog-issues.md`** (suggested **#36** / **#75** / **#80** comments + follow-ups).

Last updated: 2026-04-14 — **Cluster thumbnail chips (#81):** merged communities render one chip near centroid, anchored to most-connected node; click focuses anchor. **Community evolution (#68):** anchorStrategy + prune + merge. **Library timeline (#86):** smoother scrub transitions. Docs: **`client/README.md`**, **`server/READEME.md`**, **`docs/github-backlog-issues.md`**.

Last updated: 2026-04-13 — **Playback deletions (Apr 2026):** nodes/links now support `deletedAt` so playback can represent removals over time (\([createdAt, deletedAt)\)); delete UI offers **Pop (playback)** vs **Purge (no memory)** via a single in-app modal (avoids `window.confirm` suppression in embedded browsers). `mergePlaybackTimesFromEdit` preserves popped history across subsequent edits at “now”. Graph redraws fade between states (respects `prefers-reduced-motion`). Docs: **`client/README.md`**, **`server/READEME.md`**, and issue follow-ups in **`docs/github-backlog-issues.md`**. **GitHub #75 (branch `issue-75-node-thumbnails`):** Wikipedia **thumbnailUrl** on nodes (REST **page/summary**); **`GET /api/graphs/:filename`** enrichment for load parity with analyze; D3 **`updateVisualization`** on mount/resize + SVG thumb **error** → solid disc; guidance presets (**Awe**, **Nostalgia**, **Shock**, …) bias **concept choice + tone** in **`/api/analyze`** and **`/api/generate-node`** prompts. Docs: **`client/README.md`**, **`server/READEME.md`**, **`docs/github-backlog-issues.md`**. **Landing + guest shell:** **`LandingPage`** on **`/`** — **How it works** (three steps) + **Get Started** → **`/visualize`** (animated CTA, **`prefers-reduced-motion`** respected); **`GuestIdentityBanner`**: **Sign in** chip (**`--auth-sign-in`**), **Create account** line removed from banner (modal only); narrow: icon-only rails + lock icon. Docs: **`client/README.md`**, **`docs/github-backlog-issues.md`**. **Password reset + auth/dev UX (same day):** email **forgot-password** (**`POST /api/auth/forgot-password`**) stores a **1h** one-time token (hashed); **`POST /api/auth/reset-password`** sets a new password and session cookie; **`User`** fields **`passwordResetTokenHash`** / **`passwordResetExpiresAt`**; outbound mail via **nodemailer** (**`server/lib/passwordResetMail.js`**); non-**`smtp(s):`** **`SMTP_URL`** values ignored (web app URL footgun). Client **`GuestIdentityBanner`** “Forgot password?” flow; **`PasswordResetPage`** route **`/reset-password?token=`**; **`AuthContext`** **`requestPasswordReset`** / **`completePasswordReset`**. **Dev:** CRA **`npm start`** forces **`PORT=3000`**; API defaults **`http://localhost:5001`** in development (**`client/src/config.js`**); root **`npm run dev`** sets **`NODE_OPTIONS=--max-http-header-size`**; **`GET /health`** + **`GET /api/test`** registered early in **`server.js`**; HTTP server **`maxHeaderSize`** raised for large cookies (**HTTP 431**). Docs: **`server/READEME.md`** (auth + optional mail env), **`docs/github-backlog-issues.md`** (follow-ups + suggested issue comments). **Production persistence / library UX (Apr 2026):** saved graphs are **Mongo-authoritative** (`Graph.payload`, `metadata.filename`, `metadata.sessionUuid`); **`POST /api/graphs/save`** no longer writes **`server/graphs/*.json`**; **`GET /api/graphs`** / **`GET /api/graphs/:filename`** use Mongo only (no disk fallback). **One-off import:** **`server/scripts/migrate-graphs-to-mongo.js`**. Scoped **`GET /api/files`** omits **`File`** rows whose upload path is missing on disk; **`GET /api/files/:filename`** returns clearer JSON errors (**`FILE_MISSING_ON_DISK`**). Client **`apiRequest`** stringifies object-shaped **`details`**; **`LibraryVisualize`** updates **`currentSource`** after save so banner **SHARE** works; **`GuestIdentityBanner`** z-index above graph Actions FAB. **GitHub #40 (Apr 2026):** **`GraphVisualization`** **empty graph** guidance (`emptyStateVariant` **`library`** / **`default`**, read-only share empty state); shell **Home** / **Visualize** / **Library** / **Upload** rails; **Share link** under **View** menu; **`LibraryAccountChip`** removed (account in banner); library **sidebar** width capped by graph viewport; **mobile** library drawer width + drag-to-close; **graphs** list uses same search/sort as files (**`getFilteredSortedGraphs`**); landing **`LandingPage`** (**How it works** + **Get Started**); shell CTAs remain in **GuestIdentityBanner**. Canvas **tooltip** anchors near the clicked node/link. Docs: **`docs/github-backlog-issues.md`** (#40 follow-ups + suggested issue comments, node thumbnail backlog). Prior **#39** slice (read-only share, hardened Apr 2026): **`POST /api/graphs/:filename/share-read-token`**, **`GET /api/graphs/:filename?shareToken=`** with **`evaluateOwnedGraphRead`** / **`redactGraphMetadataForResponse`** in **`server/lib/graphShareRead.js`**; client **`/visualize?shareGraph=&shareToken=`**, **`LibraryVisualize` `shareViewerMode`**, **`GraphVisualization` `readOnly`**; **`POST /api/graphs/save`** rejects any **`?shareToken=`** (**`SHARE_READ_ONLY`**) and **strips `metadata.shareReadToken`** from save bodies so secrets are **only** minted via share-read-token. HTTP integration test: **`server/routes/graphs.share.integration.test.mjs`** (isolated **`DATA_DIR`**). Docs: **`server/READEME.md`** §6 (share + **future comments/collaboration** permission sketch), **`client/README.md`** (share E2E notes), **`docs/github-backlog-issues.md`** (#39 note + **#74** backlog). **#36** replay: **timestamp-based** playback (**`graphPlayback.js`**, per-entity **`createdAt`** / legacy **`timestamp`**), second shell strip **`GraphPlaybackBanner`** (save + scrubber + speed + share), **`GraphHistoryUiContext`** (`history` / `share` / `save` payloads); identity banner is **title-only**; graph title **blank** when unnamed; **`graphHistory.js`** reducer retained for tests/normalize only; spike **`docs/graph-time-travel-spike.md`**; backlog **#70** + **`docs/github-backlog-issues.md`**. **#62** client polish: Generate modal **Apply**, inline validation, **auto-close** on submit, on-canvas **`graph-edit-mode-chip`** with **progress bar** (indeterminate / per-cycle determinate) + **Stop after this cycle** on the chip; docs in **`client/README.md`**, **`docs/github-backlog-issues.md`**. Still: **#37** **`dryRun`** / budget **Preview** not exposed in the Generate UI (server API unchanged). Earlier same day: **#37** server slice, **#63** auth docs, **#58** follow-ups in **`server/READEME.md`** §2b.
Last updated: 2026-04-13 — **Share link (iOS Safari, Apr 2026):** read-only URL minting unchanged; **`LibraryVisualize`** falls back to an in-app **Share link** modal when **`navigator.clipboard.writeText`** is blocked after the async token mint (common on iOS production). **GitHub #75 (branch `issue-75-node-thumbnails`):** Wikipedia **thumbnailUrl** on nodes (REST **page/summary**); **`GET /api/graphs/:filename`** enrichment for load parity with analyze; D3 **`updateVisualization`** on mount/resize + SVG thumb **error** → solid disc; guidance presets (**Awe**, **Nostalgia**, **Shock**, …) bias **concept choice + tone** in **`/api/analyze`** and **`/api/generate-node`** prompts. Docs: **`client/README.md`**, **`server/READEME.md`**, **`docs/github-backlog-issues.md`**. **Landing + guest shell:** **`LandingPage`** on **`/`** — **How it works** (three steps) + **Get Started** → **`/visualize`** (animated CTA, **`prefers-reduced-motion`** respected); **`GuestIdentityBanner`**: **Sign in** chip (**`--auth-sign-in`**), **Create account** line removed from banner (modal only); narrow: icon-only rails + lock icon. Docs: **`client/README.md`**, **`docs/github-backlog-issues.md`**. **Password reset + auth/dev UX (same day):** email **forgot-password** (**`POST /api/auth/forgot-password`**) stores a **1h** one-time token (hashed); **`POST /api/auth/reset-password`** sets a new password and session cookie; **`User`** fields **`passwordResetTokenHash`** / **`passwordResetExpiresAt`**; outbound mail via **nodemailer** (**`server/lib/passwordResetMail.js`**); non-**`smtp(s):`** **`SMTP_URL`** values ignored (web app URL footgun). Client **`GuestIdentityBanner`** “Forgot password?” flow; **`PasswordResetPage`** route **`/reset-password?token=`**; **`AuthContext`** **`requestPasswordReset`** / **`completePasswordReset`**. **Dev:** CRA **`npm start`** forces **`PORT=3000`**; API defaults **`http://localhost:5001`** in development (**`client/src/config.js`**); root **`npm run dev`** sets **`NODE_OPTIONS=--max-http-header-size`**; **`GET /health`** + **`GET /api/test`** registered early in **`server.js`**; HTTP server **`maxHeaderSize`** raised for large cookies (**HTTP 431**). Docs: **`server/READEME.md`** (auth + optional mail env), **`docs/github-backlog-issues.md`** (follow-ups + suggested issue comments). **Production persistence / library UX (Apr 2026):** saved graphs are **Mongo-authoritative** (`Graph.payload`, `metadata.filename`, `metadata.sessionUuid`); **`POST /api/graphs/save`** no longer writes **`server/graphs/*.json`**; **`GET /api/graphs`** / **`GET /api/graphs/:filename`** use Mongo only (no disk fallback). **One-off import:** **`server/scripts/migrate-graphs-to-mongo.js`**. Scoped **`GET /api/files`** omits **`File`** rows whose upload path is missing on disk; **`GET /api/files/:filename`** returns clearer JSON errors (**`FILE_MISSING_ON_DISK`**). Client **`apiRequest`** stringifies object-shaped **`details`**; **`LibraryVisualize`** updates **`currentSource`** after save so banner **SHARE** works; **`GuestIdentityBanner`** z-index above graph Actions FAB. **GitHub #40 (Apr 2026):** **`GraphVisualization`** **empty graph** guidance (`emptyStateVariant` **`library`** / **`default`**, read-only share empty state); shell **Home** / **Visualize** / **Library** / **Upload** rails; **Share link** under **View** menu; **`LibraryAccountChip`** removed (account in banner); library **sidebar** width capped by graph viewport; **mobile** library drawer width + drag-to-close; **graphs** list uses same search/sort as files (**`getFilteredSortedGraphs`**); landing **`LandingPage`** (**How it works** + **Get Started**); shell CTAs remain in **GuestIdentityBanner**. Canvas **tooltip** anchors near the clicked node/link. Docs: **`docs/github-backlog-issues.md`** (#40 follow-ups + suggested issue comments, node thumbnail backlog). Prior **#39** slice (read-only share, hardened Apr 2026): **`POST /api/graphs/:filename/share-read-token`**, **`GET /api/graphs/:filename?shareToken=`** with **`evaluateOwnedGraphRead`** / **`redactGraphMetadataForResponse`** in **`server/lib/graphShareRead.js`**; client **`/visualize?shareGraph=&shareToken=`**, **`LibraryVisualize` `shareViewerMode`**, **`GraphVisualization` `readOnly`**; **`POST /api/graphs/save`** rejects any **`?shareToken=`** (**`SHARE_READ_ONLY`**) and **strips `metadata.shareReadToken`** from save bodies so secrets are **only** minted via share-read-token. HTTP integration test: **`server/routes/graphs.share.integration.test.mjs`** (isolated **`DATA_DIR`**). Docs: **`server/READEME.md`** §6 (share + **future comments/collaboration** permission sketch), **`client/README.md`** (share E2E notes), **`docs/github-backlog-issues.md`** (#39 note + **#74** backlog). **#36** replay: **timestamp-based** playback (**`graphPlayback.js`**, per-entity **`createdAt`** / legacy **`timestamp`**), second shell strip **`GraphPlaybackBanner`** (save + scrubber + speed + share), **`GraphHistoryUiContext`** (`history` / `share` / `save` payloads); identity banner is **title-only**; graph title **blank** when unnamed; **`graphHistory.js`** reducer retained for tests/normalize only; spike **`docs/graph-time-travel-spike.md`**; backlog **#70** + **`docs/github-backlog-issues.md`**. **#62** client polish: Generate modal **Apply**, inline validation, **auto-close** on submit, on-canvas **`graph-edit-mode-chip`** with **progress bar** (indeterminate / per-cycle determinate) + **Stop after this cycle** on the chip; docs in **`client/README.md`**, **`docs/github-backlog-issues.md`**. Still: **#37** **`dryRun`** / budget **Preview** not exposed in the Generate UI (server API unchanged). Earlier same day: **#37** server slice, **#63** auth docs, **#58** follow-ups in **`server/READEME.md`** §2b.

### Summary
This repo implements a full-stack web app that turns uploaded text/markdown into an interactive “mind map” graph. The architecture is:
- **React (Create React App)** frontend for uploading, selecting files, and visualizing/editing graphs with D3
- **Node.js / Express** backend for file upload, content retrieval, graph generation via OpenAI, and persistence
- **MongoDB (Mongoose)** for sessions, metadata, transforms, graphs, feedback, telemetry, and a **`UserActivity`** audit collection for cross-cutting session/upload/analyze/graph/feedback outcomes (see **`server/READEME.md`**, GitHub **#16**)
- **Filesystem persistence** for uploads + metadata sidecars; **saved graph JSON on disk is legacy** (new saves: Mongo **`Graph.payload`** only). **Which store is authoritative per feature** is summarized under **`server/READEME.md`** → *Data consistency (hybrid persistence)* (GitHub **#20**)
- **Client multi-file library flow:** per-file `POST /api/analyze` plus **`mergeGraphs`** namespaced union in **`client/src/utils/`** (GitHub **#21**); roadmap for connected fusion / splitting in **#47**

The README describes the stack correctly but there is some naming drift: the repo is `mind-map`, while package/app names and production URL references still use `talk-graph`.

---

### Repo structure (high-level)
- `client/`: React app (CRA) with D3 visualization and workflow UI
- `server/`: Express API, Mongoose models, routers, and runtime storage directories:
  - `server/uploads/`: uploaded source files
  - `server/metadata/`: per-upload JSON metadata
  - `server/graphs/`: **legacy** on-disk graph snapshots (optional; import via **`server/scripts/migrate-graphs-to-mongo.js`**)

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
  - `AuthContext.jsx` / `AuthProvider`: **`/api/auth`** register, login, logout, **`GET /api/me`**, **`PATCH /api/me`**, forgot-password + reset-password helpers (httpOnly **`mindmap_auth`** cookie).
  - `index.js`: **`AuthIdentityBridge`** supplies **`user?.id`** to **`IdentityProvider`** so `useIdentity().userId` matches the signed-in account.
  - `IdentityContext.jsx`: optional `userId` / `isRegistered` / `identityKind`; optional `REACT_APP_MINDMAP_USER_ID`; in **development** with **`REACT_APP_ENABLE_DEV_PREVIEW`**, `setDevRegisteredUserId` for guest preview.
  - `GraphTitleContext.jsx`: `LibraryVisualize` sets the current graph title for the shell banner; cleared when leaving **`/visualize`**.
  - `LibraryUiContext.jsx`: mobile “open library” — `LibraryVisualize` registers visibility + opener; control renders in **`GuestIdentityBanner`** (leading), not a fixed left rail.
  - **`GuestIdentityBanner`**: sign-in / register modal, **forgot password** (email reset link), signed-in menu (user settings, sign out); optional dev preview when env allows; **`onOpenUpload`** from **`App`** opens the root **`FileUpload`** modal; leading **Home** / **Visualize** / **Library** rails and **Upload** chip (**#40**); signed-in account trigger uses the same rail styling (replaces sidebar **`LibraryAccountChip`**). **`PasswordResetPage`** (**`/reset-password`**) for completing reset from email link.
  - **#32** / **#63**: scoped listings; **`POST /api/upload`** sets **`File.userId`** when **`X-Mindmap-User-Id`** is sent. Session-only lists **exclude** account-owned rows so guests cannot see another user’s library after sign-out in the same browser session (**`server/READEME.md`** §3). **Follow-up:** verify header against JWT server-side — **#64** (**`docs/github-backlog-issues.md`**).

- **Core UI flows**
  - **Upload**: `client/src/components/FileUpload.js`
    - **Text:** `multipart/form-data` to `POST /api/upload` (`file`, `customName`, `sessionId`). **Audio → transcript (#34 / #35 / #58):** sub-tabs **Upload file** or **Record** → `POST /api/transcribe` (`audio`, `sessionId`; optional **`verbose`** for segment timestamps). **`verbose`** is exposed in the UI only on the **Record** sub-tab (**Segment timestamps**); **elapsed `m:ss` timer** while recording; switching to **Upload file** clears verbose client state. Then `.txt` via **`POST /api/upload`** (plain text only; timings are UI-only unless persisted in a future ticket).
  - **Library + analyze**: `LibraryVisualize.js` + **`LibrarySidebar`**, **`LibrarySourcesPanel`**
    - Lists files (`GET /api/files`)
    - Reads file content (`GET /api/files/:filename`)
    - Calls analysis (`POST /api/analyze`)
    - Displays graph using `GraphVisualization`
    - Saves/loads graphs (`POST /api/graphs/save`, `GET /api/graphs`, `GET /api/graphs/:filename`)
    - **#36 / #39:** client-side **timestamp** replay (**`graphPlayback.js`**); **`GraphPlaybackBanner`** (save + scrubber strip) + **`GraphHistoryUiContext`**; read-only **share** control on **`GuestIdentityBanner`** (left of **View** on **`/visualize`**). See **`docs/graph-time-travel-spike.md`**
  - **Visualization + editing**: `client/src/components/GraphVisualization.js`
    - D3 force graph rendering
    - Zoom-driven “community” merge/split behavior
    - Add node, add relationship, delete node/link
    - AI expansion via `POST /api/generate-node`
    - Tracks operations via `POST /api/operations`
    - **Graph actions UI** (GitHub **#27**) uses the **Actions** FAB and context menu, not a fixed toolbar. **Dead CSS** for the pre–#27 controls shell was removed in **#28** (`GraphVisualization.css`, `LibraryVisualize.css`). **#29** adds **Generate (AI)** vs **Edit graph** accordion sections (Library-style toggles), **link-flow** copy, a bottom **`graph-edit-mode-chip`** when a modal flow is active **or while AI generation runs** after the Generate modal closes, and scrollable menu height. **#30** adds touch-sized targets and basic a11y for the Actions menu (**`role="group"`**, focus management, **`aria-hidden`** on decorative icons). **#31** (foundation): **`actionsFabPlacement`** — Library uses **`libraryGraphMount`** so the FAB is anchored to the graph panel (absolute over the SVG); default elsewhere is viewport-fixed. See **`docs/github-backlog-issues.md`** and **`client/README.md`**.

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
    - **Saved graphs:** Mongo **`Graph`** documents only (legacy **`graphs/`** files may exist from older deploys)
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
  - With **`?sessionId=`** or **`?userId=`** / **`X-Mindmap-User-Id`**, lists from MongoDB **`File`** (GitHub **#32**) and **drops entries whose file is missing on disk**; otherwise legacy scan of **`server/metadata/*.json`**
- `GET /api/files/:filename`
  - Reads the uploaded file content from `server/uploads/` (**404** + **`FILE_MISSING_ON_DISK`** when absent)

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
  - Saves a graph snapshot to Mongo (**`Graph`**, including **`payload`** and **`metadata.filename`** = `graph_<timestamp>.json`). **#39:** rejects **`?shareToken=`** (**403** / **`SHARE_READ_ONLY`**); strips **`metadata.shareReadToken`** from the body (tokens only via **`POST …/share-read-token`**).
- `GET /api/graphs`
  - Lists **`Graph`** documents; filtered by **`metadata.sessionUuid`** or **`metadata.userId`** when query/header provided (**#32**), else lists all (legacy)
- `GET /api/graphs/:filename`
  - Loads by **`metadata.filename`** from Mongo (**#39:** account-owned graphs need owner header or valid **`?shareToken=`**; response redacts secrets / **`dbId`** for share viewers)
  - Records a `GraphView` when applicable
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
  - persisted graphs: canonical **`payload`** `{ nodes, links }`, **`metadata.filename`**, **`metadata.sessionUuid`**, optional **`metadata.userId`**, share token (**#39**); legacy **`nodes`** / **`links`** subschemas retained for older documents
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
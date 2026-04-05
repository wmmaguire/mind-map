# Client architecture & data flow

This document describes the **frontend (React)** portion of the project as implemented under `client/`.

## Tech + runtime dependencies

Client runtime and tooling are defined in `client/package.json`.

- **react / react-dom**: UI runtime
- **react-router-dom**: client-side routing (`client/src/App.js`)
- **d3**: interactive graph visualization and editing (`client/src/components/GraphVisualization.js`)
- **react-scripts**: Create React App build/dev/test toolchain
- **web-vitals**: performance measurement hooks (CRA default)

**Dev dependencies** (see `client/package.json`): **`@testing-library/jest-dom`**, **`@testing-library/react`**, **`@testing-library/user-event`** — DOM matchers and component testing helpers for Jest. The lockfile **`client/package-lock.json`** pins client installs for reproducible CI.

## High-level architecture

The client is a Create React App (CRA) single-page application with:

- A landing flow that **initializes a session** on load.
- A library flow that **lists uploaded files** and **runs analysis**.
- A D3-driven visualization that supports **interactive graph editing** and **AI-assisted expansion**.

The client communicates with the backend via **`apiRequest()`** in `client/src/api/http.js` (see [HTTP client](#http-client-srcapihttpjs)). In development, CRA uses a proxy to the backend (see `client/package.json`).

## HTTP client (`src/api/http.js`)

Shared JSON (and `multipart/form-data`) API access for GitHub **#22**.

| Export | Role |
|--------|------|
| **`apiRequest(path, options)`** | Resolves relative `path` with **`apiUrl(path)`** from `config.js` (or accepts an absolute URL). Set **`json: object`** to stringify the body and send `Content-Type: application/json`. Pass **`body: FormData`** for uploads without forcing JSON headers. On non-2xx, throws **`ApiError`** with `status` and message from `details` / `message` / `error` when present. **`status: 0`** means the browser could not reach the server (maps common network failures to a short dev hint). |
| **`ApiError`** | Normalized failure; read **`message`**, **`status`**, optional **`code`**. |
| **`getApiErrorMessage(err)`** | Safe string for UI (`ApiError` or generic `Error`). |
| **`isNetworkError(err)`** | True when **`ApiError`** and **`status === 0`**. |

**Tests:** `client/src/api/http.test.js` (run with `CI=true npm test -- --watchAll=false`).

**Out of scope for #22** (see **`docs/github-backlog-issues.md`**): global React error boundary, toast/snackbar layer, unified loading skeletons, batch-analyze partial failure (**#48**), and fixing **`VisualizationPage`** save payload vs server (**#49**).

## Key modules

- `client/src/App.js`
  - Top-level router and page composition.
- `client/src/api/http.js`
  - **`apiRequest`**, **`ApiError`**, **`getApiErrorMessage`**, **`isNetworkError`** — shared JSON API client and consistent loading/error behavior (GitHub **#22**).
- `client/src/config.js`
  - **`getApiOrigin()` / `apiUrl()`** — single module for backend base URL (see [API base URL](#api-base-url) below).
- `client/src/context/SessionContext.jsx`
  - **`SessionProvider` / `useSession()`** — creates or restores the browser session (`POST /api/sessions`), persists `sessionId` in `sessionStorage` for refresh, and sends session end via `sendBeacon` on unload. Wraps the app in `client/src/index.js`.
- `client/src/components/GiveFeedbackControl.jsx`
  - App-shell **Give Feedback** FAB + modal for **`POST /api/feedback`** (GitHub **#23**): single mount in **`App.js`**, **`apiRequest`**, safe-area insets, Escape / basic dialog a11y. Post–#23 follow-ups: **#24** (tests), **#50** (toast), **#52** (z-index vs library UI) — see **`docs/github-backlog-issues.md`**.
- `client/src/components/FileUpload.js`
  - Upload modal; posts `multipart/form-data` to **`POST /api/upload`** and associates each upload with the current session. The backend allows **multiple files per session** (see **`server/routes/files.js`** / **`server/models/file.js`**).
- `client/src/components/LibraryVisualize.js`
  - “Library” UI for selecting files, calling analysis, saving/loading graphs, and rendering the visualization.
- `client/src/components/GraphVisualization.js`
  - D3 force graph rendering + interaction model (select, zoom, edit, delete, generate).
- `client/src/setupPolyfills.js`
  - Loaded first in **`App.test.js`** so **`TextEncoder` / `TextDecoder`** exist in the Jest environment before **React Router v7** is imported (Router relies on them during module load).

## Request/data flows

### 1) Session initialization + lifecycle

**Goal**: create a backend session and make its UUID available to other client flows.

1. On initial load, `SessionProvider` either restores `sessionId` / start time from `sessionStorage` or calls `POST /api/sessions` with:
   - `sessionStart`
   - `userMetadata` (browser, OS, screen size, language, timezone)
2. The response contains a `sessionId` (UUID); it is stored in React context (`useSession()`) and in `sessionStorage` for reloads in the same tab.
3. On unload, the client reports end time/duration via `navigator.sendBeacon` to:
   - `POST /api/sessions/:sessionId`

Why it matters: uploads, analysis, and telemetry all reference the session UUID.

The backend persists **`UserActivity`** rows for **`SESSION_CREATE`** and **`SESSION_UPDATE`** (end/duration) so session lifecycle is auditable in Mongo (see **`server/READEME.md`**, GitHub **#16**).

### 2) Upload flow (file + metadata)

**Goal**: upload source file(s) and associate each with the current session.

1. User opens the upload modal (`FileUpload`) and selects a `.txt` or `.md` file.
2. `FileUpload` posts to `POST /api/upload` with form fields:
   - `file`
   - `customName`
   - `sessionId` (from `useSession()`)
3. On success, the server writes the upload to disk, writes metadata JSON, and saves a **`File`** record in Mongo. A **`UserActivity`** row with action **`FILE_UPLOAD`** is also recorded when persistence succeeds (see **`server/READEME.md`**). Users can repeat steps 1–2 for **additional files in the same session** (multiple `File` documents per `sessionId`).
4. On failure, the API may return structured JSON (`error`, `details`, `code`). If a **legacy Mongo index** still enforces one file per session, see **`server/READEME.md`** (GitHub **#42**).

### 3) Library list → analyze → graph render

**Goal**: transform selected source files into a graph and render it.

1. `LibraryVisualize` fetches the available uploads:
   - `GET /api/files` → list of uploaded file metadata
2. For each selected file, it requests the raw content:
   - `GET /api/files/:filename` → `{ success, content }`
3. It calls analysis **once per selected file** (parallel requests):
   - `POST /api/analyze` with `content`, optional `context`, `sessionId`, and **`sourceFiles`** listing that file only (each response is one graph and one server **`GraphTransform`**).
4. It merges the returned graphs **client-side** for the library view only:
   - **`client/src/utils/mergeGraphs.js`** namespaces node ids per file (`namespace__<localId>`) so ids from different analyzes cannot collide, then unions nodes and links. Unit tests: **`mergeGraphs.test.js`**.
   - Renders via **`GraphVisualization`**.

### 4) Save/load graphs

**Goal**: persist and restore graphs across sessions.

- Save current graph:
  - `POST /api/graphs/save` with `{ graph, metadata }` (server records **`UserActivity`** **`GRAPH_SNAPSHOT_SAVE`** on successful Mongo save)
- List saved graphs:
  - `GET /api/graphs`
- Load a saved graph:
  - `GET /api/graphs/:filename`

### 5) Interactive editing + telemetry

**Goal**: allow editing graph structure and track user operations.

In `GraphVisualization` users can:

- Select nodes/links and inspect relationships
- Add nodes and relationships
- Delete nodes/links
- Use “Generate Nodes” to request AI expansion:
  - `POST /api/generate-node` (same OpenAI model env as analyze: `OPENAI_ANALYZE_MODEL` on the server)
  - On failure, the UI prefers the API’s `details` field (quota/auth messages, invalid JSON, etc.) when present

Key operations are logged via:

- `POST /api/operations` (includes `sessionId`, operation type, status, duration, and details)

The feedback form in **`GiveFeedbackControl`** posts to **`POST /api/feedback`**; when the session exists in Mongo, the server also records **`UserActivity`** **`FEEDBACK_SUBMIT`** (see **`server/READEME.md`**).

## API base URL

All API requests go through **`apiRequest()`**, which builds URLs with **`apiUrl('/api/...')`** from `client/src/config.js`. Do not call `fetch(apiUrl(...))` directly for JSON APIs unless there is a strong reason (keeps errors and env behavior consistent).

| Environment | Default behavior |
|---------------|------------------|
| **Development** (`npm start`) | Uses `http://localhost:5001` (matches `proxy` in `client/package.json`). |
| **Production** (`npm run build`) | If **`REACT_APP_API_URL`** is **not** set, requests use **relative** URLs (`/api/...`), i.e. same origin as the static app. |

Set **`REACT_APP_API_URL`** in `.env` or your host’s build settings when the API lives on a different origin (no trailing slash), for example:

```bash
REACT_APP_API_URL=https://your-api.example.com
```

Rebuild after changing env vars; CRA inlines them at build time.

## Scripts (CRA)

In the `client/` directory:

### `npm start`

Runs the app in development mode on `http://localhost:3000`.

### `npm test`

Runs the CRA/Jest test runner in **watch** mode. For a **single non-interactive run** (e.g. CI):

```bash
npm test -- --watchAll=false
```

### `npm run build`

Builds the production bundle to `client/build`.

### `npm run eject`

One-way eject of CRA configuration.

## Testing (Jest)

Tests live under `client/src` (e.g. `App.test.js`). **`setupTests.js`** imports **`@testing-library/jest-dom`** for matchers like `toBeInTheDocument()`.

Because this app uses **React Router v7** and **d3** (ESM), `client/package.json` includes a **`jest`** section (supported CRA overrides only):

| Option | Purpose |
|--------|---------|
| **`moduleNameMapper`** | Maps `react-router`, `react-router/dom`, and `react-router-dom` to their published `dist` entry files so Jest can resolve them. |
| **`transformIgnorePatterns`** | Allows Babel to transform the **`d3`** package (otherwise Jest hits untranspiled `export` syntax in `node_modules`). |

`App.test.js` **must** import `./setupPolyfills` **before** `react-router-dom` so encoding globals exist when the router bundle loads.

Pure utilities such as **`src/utils/mergeGraphs.test.js`** (multi-file graph merge / id namespacing, GitHub **#21**) do not need the router polyfill order.

### Integration-style tests (GitHub **#24**)

**`client/src/criticalPath.integration.test.js`** exercises a **critical path** with **`global.fetch` mocked** (not `jest.mock('./api/http')`): session bootstrap (`POST /api/sessions`), library shell on **`/visualize`** (`GET /api/files`, `GET /api/graphs`), and navigation from the landing **Visualize** control to the empty-library state. **`SessionContext`** caches a one-shot bootstrap promise; tests call **`resetSessionBootstrapForTests()`** (exported from **`context/SessionContext.jsx`**) in **`App.test.js`** and integration **`beforeEach`** so order across test files does not leak session state.

Commands:

| Command | Purpose |
|---------|---------|
| **`npm run test:ci`** | Full client suite once (non-watch); use in CI or before pushing. |
| **`npm run test:integration`** | Only files matching `integration` in the name (faster local check of #24-style tests). |

### Manual end-to-end checks (browser + API)

There is no Playwright/Cypress harness in this repo yet; validate the full stack manually:

1. From the repo root, start API + client: **`npm run dev`** (server on port **5001**, CRA on **3000** with proxy to the API).
2. Open **`http://localhost:3000`**. Confirm the landing page loads and (with DevTools → Network) **`POST /api/sessions`** succeeds.
3. **Upload:** open **Upload**, pick a small `.txt` file, submit; expect success and **`POST /api/upload`** (multipart) **200**.
4. **Visualize:** go to **Visualize** (or **`/visualize`**). Confirm **`GET /api/files`** lists the upload; select the file, **Analyze Selected**; expect **`GET /api/files/:name`**, **`POST /api/analyze`**, then a graph in the visualization area.
5. Optional: **Give feedback** (FAB), **Save** graph if you want to verify **`POST /api/graphs/save`** and **`GET /api/graphs`**.

If the API is not running, the client surfaces **`apiRequest`** / network errors (see **`http.js`**); **`GET /api/files`** failures on the library page show the banner described in **`LibraryVisualize`**.

## Learn more

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).
You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

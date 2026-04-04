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

The client communicates with the backend via fetch calls to the `/api/*` endpoints. In development, CRA uses a proxy to the backend (see `client/package.json`).

## Key modules

- `client/src/App.js`
  - Top-level router and page composition.
- `client/src/config.js`
  - **`getApiOrigin()` / `apiUrl()`** — single module for backend base URL (see [API base URL](#api-base-url) below).
- `client/src/context/SessionContext.jsx`
  - **`SessionProvider` / `useSession()`** — creates or restores the browser session (`POST /api/sessions`), persists `sessionId` in `sessionStorage` for refresh, and sends session end via `sendBeacon` on unload. Wraps the app in `client/src/index.js`.
- `client/src/components/Landing.js`
  - Feedback UI (session id comes from context).
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
3. It calls analysis for each file:
   - `POST /api/analyze` with `content`, optional `context`, `sessionId`, and `sourceFiles`
4. It merges the returned graphs client-side into a combined graph and renders via:
   - `GraphVisualization`

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

The landing feedback form posts to **`POST /api/feedback`**; when the session exists in Mongo, the server also records **`UserActivity`** **`FEEDBACK_SUBMIT`** (see **`server/READEME.md`**).

## API base URL

All fetch targets are built with **`apiUrl('/api/...')`** from `client/src/config.js`.

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

## Learn more

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).
You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

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
  - Top-level router and page composition. **`FileUpload`** modal and upload-success toast at app root; **`GuestIdentityBanner`** receives **`onOpenUpload={openUploadModal}`** so the shell **Upload** chip opens the same modal on any route (**#40**). **`fileRefreshToken`** is passed to **`LibraryVisualize`** on **`/visualize`** so **Add new** in the library refetches the file list after upload. Landing **`/`** (`LandingPage`): **MindMap** title, **How it works** (three steps: add sources → analyze → explore), then a primary **Get Started** button (**`useNavigate('/visualize')`**) with a subtle CSS pulse on **`.landing-cta-primary--dynamic`** (animation disabled when **`prefers-reduced-motion: reduce`**). Styling: **`App.css`** (`.landing-value-loop`, `.landing-steps`, `.landing-cta--post-steps`). The banner rails (**Home** / **Visualize**) remain the persistent shell entry points. Tests: **`App.test.js`** (heading + CTA). Follow-ups: **`docs/github-backlog-issues.md`** (landing + guest shell note), GitHub **#76** (optional hero/illustration backlog), **#24** (E2E).
- `client/src/api/http.js`
  - **`apiRequest`**, **`ApiError`**, **`getApiErrorMessage`**, **`isNetworkError`** — shared JSON API client and consistent loading/error behavior (GitHub **#22**).
- `client/src/config.js`
  - **`getApiOrigin()` / `apiUrl()`** — single module for backend base URL (see [API base URL](#api-base-url) below).
- `client/src/context/SessionContext.jsx`
  - **`SessionProvider` / `useSession()`** — creates or restores the browser session (`POST /api/sessions`), persists `sessionId` in `sessionStorage` for refresh, and sends session end via `sendBeacon` on unload. Wraps the app in `client/src/index.js`.
- `client/src/context/AuthContext.jsx`
  - **`AuthProvider` / `useAuth()`** — **`GET /api/auth/me`** on load (cookie **`mindmap_auth`**), **`register`**, **`login`**, **`logout`**, **`updateProfile`** (**`PATCH /api/auth/me`**). Wraps the app in **`index.js`** (inside **`SessionProvider`**).
- `client/src/index.js`
  - **`AuthIdentityBridge`** — passes **`user?.id`** from **`useAuth()`** into **`IdentityProvider`** as **`initialRegisteredUserId`** so **`useIdentity().userId`** matches the signed-in account (GitHub **#63**).
- `client/src/context/IdentityContext.jsx`
  - **`IdentityProvider` / `useIdentity()`** — guest vs registered: **`AuthIdentityBridge`** + optional **`REACT_APP_MINDMAP_USER_ID`**, dev-only **`setDevRegisteredUserId`** when **`REACT_APP_ENABLE_DEV_PREVIEW=true`** (GitHub **#33**). Wraps **`GraphTitleProvider`** inside **`AuthIdentityBridge`**.
- `client/src/context/GraphTitleContext.jsx`
  - **`GraphTitleProvider` / `useGraphTitle()`** — shell graph title while **`LibraryVisualize`** is mounted (**#33**).
- `client/src/context/LibraryUiContext.jsx`
  - **`LibraryUiProvider` / `useLibraryUi()`** — **`registerMobileLibraryRail`** stores the opener from **`LibraryVisualize`** while **`/visualize`** is mounted; **`GuestIdentityBanner`** calls **`openMobileLibrary`** (**#33**, **#40**). **`mobileRailVisible`** was removed—the Library button is shown whenever **`pathname === '/visualize'`** (not gated by registration state).
- `client/src/components/GiveFeedbackControl.jsx`
  - App-shell **Give Feedback** FAB + modal for **`POST /api/feedback`** (GitHub **#23**): single mount in **`App.js`**, **`apiRequest`**, safe-area insets, Escape / basic dialog a11y. Post–#23 follow-ups: **#24** (tests), **#50** (toast), **#52** (z-index vs library UI) — see **`docs/github-backlog-issues.md`**.
- `client/src/components/FileUpload.js`
  - Upload modal: **Text file** (`.txt` / `.md`) → **`POST /api/upload`** with **`sessionId`**; when signed in, **`apiRequest`** sends **`auth: { userId }`** → **`X-Mindmap-User-Id`** so the server persists **`File.userId`** (**#63**). **Audio → transcript** tab with **Upload file** or in-browser **Record** (`MediaRecorder`), **`POST /api/transcribe`** (default **`whisper-1`**), on the **Record** sub-tab, optional **Segment timestamps** (tooltip: Whisper verbose) → **`verbose=1`** (**#58**), client-side **25 MB** check, editable transcript, then **`.txt`** via **`POST /api/upload`**. The saved **`.txt`** is plain text only (segment rows are UI-only). Speaker labels remain **backlog** (**#59**). Helpers: **`utils/audioRecording.js`**. Tests: **`FileUpload.test.jsx`**, **`audioRecording.test.js`**. Follow-ups outside **#58**: browser E2E for verbose + segments (**#24**), server HTTP tests (**#60**), optional persist segments / word-level / SRT (**#61**) — see **`server/READEME.md`** §2b. The backend allows **multiple files per session** (see **`server/routes/files.js`** / **`server/models/file.js`**).
- `client/src/context/GraphHistoryUiContext.jsx`
  - **`GraphHistoryUiProvider` / `useGraphHistoryUi()`** — registers **`/visualize`** payloads: **`setPayload`** (history scrubber API), **`setSharePayload`** (read-only link, **#39**), **`setSavePayload`** (**Save** current graph). **`GuestIdentityBanner`** puts **Share link** inside the **View** menu when `sharePayload` is set (**#40**); **`GraphPlaybackBanner`** renders save + playback when history or save payloads are set (**#36**). Default no-op when provider absent (tests).
- `client/src/context/GraphChromeUiContext.jsx`
  - **`GraphChromeUiProvider` / `useGraphChromeUi()`** — **GitHub #38:** visibility of the **playback** strip and **graph search** bar on **`/visualize`**, persisted in **`localStorage`** (`mindmap.chrome.playbackStripVisible`, `mindmap.chrome.graphSearchBarVisible`, defaults **true**). **GitHub #83 (v1):** **`insightsPanelVisible`** + **`toggleInsightsPanel`** / **`setInsightsPanelVisible`**, persisted as **`mindmap.chrome.insightsPanelVisible`** (default **off**). Toggled from **`GuestIdentityBanner`** → **View** (**Playback strip**, **Graph search**, **Insights**). **`GraphPlaybackBanner`** respects **`playbackStripVisible`**; **`GraphVisualization`** uses **`graphSearchBarVisible`** and **`insightsPanelVisible`**. Wrapped in **`client/src/index.js`**. Outside provider (tests), hooks return safe no-ops. Epic follow-ons: **#73**, **#83** / **#95** (insights phase 2+).
- `client/src/utils/graphDiscovery.js`
  - **GitHub #38 / #73 slice:** **`normalizeGraphLabel`**, **`nodesMatchingLabelQuery`** (substring + case-fold on **`label`** only), **`createFocusZoomTransform`**, and **`discoveryFocusPoint`** (map a matched **`data.nodes`** entry to the owning **community**’s layout coords so **Focus next** pans to real positions — avoids **`(0,0)`** placeholders). Tests: **`graphDiscovery.test.js`**. Semantic / server search: **#73**.
- `client/src/utils/graphInsights.js`
  - **GitHub #83 (v1):** **`computeGraphInsights`**, **`graphInsightNodeId`** — client-side **undirected multigraph** metrics on the current snapshot: node/edge counts, **density**, **components**, degree min/median/max, **weighted degree** (uses finite **`link.strength`** when present, else **1**), **average local clustering** (nodes with ≥2 neighbors), **isolates**, **top 10 by degree** (for **Insights** panel **Focus**). Tests: **`graphInsights.test.js`**. Advanced centrality, shortest paths, pattern detection, workers, and playback-linked trends: **#83**, **#95**.
- `client/src/components/GraphPlaybackBanner.jsx`
  - Second shell strip (**`App.js`**, below **`GuestIdentityBanner`**): **`GraphHistoryBannerControls`** when history (≥2 steps) or **save** payload is set (**#36**). Hidden when **`playbackStripVisible`** is false (**`useGraphChromeUi`**, **#38**). Styles: **`GuestIdentityBanner.css`** (playback strip classes). Share control: **View** menu → **Share link** (**`GuestIdentityBanner`**, **#39**, **#40**).
- `client/src/utils/graphPlayback.js`
  - **`buildGraphAtPlaybackTime`**, **`mergePlaybackTimesFromEdit`**, **`ensurePlaybackTimestamps`**, etc. — timestamp replay for **#36**. Tests: **`graphPlayback.test.js`**.
  - **Deletion history (Apr 2026):** nodes/links may include **`deletedAt`**; playback treats entities as present in \([createdAt, deletedAt)\). Edits at “now” preserve popped history even though the visible snapshot omits deleted entities.
- `client/src/components/LibraryVisualize.js`
  - Library workflow: **`LibrarySidebar`** / **`LibrarySourcesPanel`**; selecting files, analyze, save/load graphs, **`GraphVisualization`**. Desktop: **resizable** sidebar (persisted width capped so the graph keeps **≥200px**), collapsible **Files** / **Graphs** sections. **Graphs** list: same **search** / **sort** as files via **`getFilteredSortedGraphs`** (**`libraryFileList.js`**). Narrow viewports: **mobile Library** overlay with **persisted drawer width**, optional **maximize**, and **drag left past ~140px** to dismiss (**#40**). **Files** list: search, sort, select-all/clear, skeleton, empty states; **+ Add new** / **Delete selected** / **Analyze Selected**; delete **toasts**; compact empty states with **Home** / upload CTAs. Current graph **name** is shown in **`GuestIdentityBanner`** via **`GraphTitleContext`**. **`GraphVisualization`**: explicit **`width` / `height`**, **`actionsFabPlacement="libraryGraphMount"`**, **`emptyStateVariant="library"`** except in read-only **share** mode (**#40**). **`apiRequest`** may send **`X-Mindmap-User-Id`** when **`useIdentity().userId`** is set (**#32** / **#33**). The graph wrapper uses **`library-graph-mount`** with scoped **`LibraryVisualize.css`**; legacy global mobile **`.graph-container`** rules in **`GraphVisualization.css`** were **removed** in **#28** (**#55** audit). **#36:** **timestamp-based** replay (**`utils/graphPlayback.js`**) with **`committedGraph`** + **`playbackStepIndex`**; **`GraphPlaybackBanner`** (second strip in **`App.js`**) shows **save**, **Play** / scrubber / **speed** (persisted in **`localStorage`**), and **share** when applicable; **`GraphHistoryUiContext`** registers payloads from **`LibraryVisualize`**. **≥2** unique playback times needed to scrub. Legacy **`utils/graphHistory.js`** (snapshot reducer) remains for **normalize/materialize** + unit tests, not the live replay path. See **`docs/graph-time-travel-spike.md`**. GitHub **#25**, **#26**, **#28**, **#33**, **#39**, **#40**.
- `client/src/components/GraphVisualization.js`
  - D3 force graph rendering + interaction model (select nodes, zoom, pan, edit, delete, generate). **#40:** when **`readOnly`** is false and the graph has **no nodes**, an **empty-state** overlay (**`graph-empty-state`**) explains next steps; **`emptyStateVariant="library"`** uses a numbered list aligned with the library workflow, **`default`** a shorter hint; **`readOnly`** + empty shows a compact status line. The **docked** **`graph-canvas-tooltip`** is positioned **next to** the clicked **node** (clamped inside the canvas). **Links (Apr 2026):** edges show a **hover** tooltip only—**click does not select** a link; **Related concepts** lines include **`strength`** as a percentage when the payload provides **`link.strength`** in \([0,1]\). **Library playback scrub:** newly appearing nodes/links are **highlighted briefly** after stepping the history control (**`playbackScrubToken`** + timer in **`GraphVisualization`**); **node drag** remains available during scrub for layout (not persisted until returning to the live tail). Optional **`thumbnailUrl`** on nodes (**GitHub #75**): the server sets Wikimedia HTTPS URLs via Wikipedia REST **`thumbnail.source`** (**`enrichGraphNodesWithThumbnails`** on **`POST /api/analyze`**, **`POST /api/generate-node`**, and **`GET /api/graphs/:filename`** so saved loads match fresh analysis). Single-node communities render a circular **SVG `image`** in place of the solid blue **circle** (**`safeThumbnailUrl.js`** allowlist); failed image loads fall back to the solid disc. D3 calls **`updateVisualization()`** on initial mount (and when the library viewport resizes) so thumbnails use the same community layer as merge/split—not only after zoom. Tooltips show text and **Learn more** only (no duplicate thumbnail). **Graph actions** (GitHub **#27**): the old sidebar toolbar was replaced by a floating **Actions** button, a **context menu** on **right-click** on the graph, and **`#graph-action-menu`** (header, hint, **×** close). **`actionsFabPlacement`** (GitHub **#31** follow-on UX): **`fixedViewport`** (default) keeps the FAB **`position: fixed`** to the **window** top-right; **`libraryGraphMount`** (used by **`LibraryVisualize`**) uses **`position: absolute`** top-right inside **`.graph-visualization-container`** so the FAB sits over the **SVG**, not the shell strip (**`GuestIdentityBanner`** / graph title — **#33**). **#29** groups menu actions into **Generate (AI)** vs **Edit graph** with **accordion** toggles (same interaction pattern as Library **Files** / **Graphs** sections), **link-flow** hint text for **Add Relationship**, and a fixed **`graph-edit-mode-chip`** (`role="status"`, **`aria-busy`** while generating) while generate / add / relationship / connect flows are open—or **while AI generation is in flight** after the Generate modal auto-closes. **#30** adds **≥44px** touch targets for menu actions and the close control, **`role="group"`** on the panel, initial focus on **Close**, **`aria-haspopup`** on the FAB, and **`aria-hidden`** on decorative icons in menu rows. Selection for menu actions is **snapshotted when the menu opens**. **Add Node** can prompt for **one relationship per highlighted node** when nodes were selected before opening the menu. There is **no long-press on the canvas** to open the menu (avoids fighting pan/zoom and node selection); use **Actions** or **right-click**. The Actions FAB uses **`z-index: 1190`**; the edit-mode chip uses **`1195`** (below **`#graph-action-menu`** stacking). **Generate (AI)** modal: inline validation under the title when manual mode has no anchors or randomized mode needs more nodes than **connections per new node**; primary submit is **Apply**; on a valid **Apply** the modal **closes immediately** and progress is shown on the chip (**indeterminate** bar for manual / before the first cycle; **determinate** bar by cycle for multi-cycle randomized). **Stop after this cycle** for randomized runs lives on the chip while generating. **Styles:** **`GraphVisualization.css`** — obsolete **controls-panel** / **edit-controls** / legacy mobile shell CSS removed in **#28**. Unit tests: **`GraphVisualization.test.js`**. Follow-ups: **`docs/github-backlog-issues.md`** (**#52** z-index audit, **#24** browser E2E, **#51** D3 `useEffect` deps, **#55** / **#56** optional polish, **#57** D3 canvas SR a11y).
  - **#81 cluster chips:** when zoomed out into merged community view, each cluster renders one small “thumbnail chip” near its centroid. The chip is anchored to the **most-connected node** in that cluster (highest within-cluster degree): it shows the anchor’s thumbnail (when present) + label and is clickable to focus/zoom to that anchor. **`clusterAnchor.js`** (`pickCommunityAnchorNode`) is shared with explode/tooltip anchoring.
  - **#69 Explode subgraph:** see [Interactive editing](#5-interactive-editing--telemetry) — tooltip **`POST /api/explode-node`**, **`mergeGenerateNodeResponse`**, **`explosionExpandedAt`**, tests in **`GraphVisualization.test.js`**.
  - **#80 relationship strength:** links may include numeric **`strength`** in \([0,1]\) (server-filled for analyze/generate flows; preserved in saves) so future UI can fade/filter weak relationships.
  - **#38 Discovery & navigation / #73 slice (`issue-73-minimap-pan`):** in-canvas **search** (label keyword match), **Focus next** / **Enter** (cycles matches using **`discoveryFocusPoint`** + **`applyProgrammaticZoomTransformRef`** so **d3.zoom** stays consistent), **Show all** (reset clusters + fit). **Minimap:** overview **click-to-center** and **drag-to-pan** (CSS **`pointer-events: auto`**), viewport rect **rAF**-throttled; minimap **`role="img"`** + **`aria-label`**. After **Focus next**, the focused node is **selected** (**`selectedNodeIds`** refs + **`updateHighlighting`**, including merged clusters) and the **docked `graph-canvas-tooltip`** opens like a click — **`setSelectedNodes` is not used** there because **`selectedNodes`** is in the D3 **`useEffect`** deps and would teardown the graph (**`tooltip.remove()`**); sync React selection is **#94**. Chrome toggles via **`GraphChromeUiContext`**. Phase **2+** backlog: **#73** (semantic search, N-hop, lenses, provenance, minimap **zoom-from-overview**, scale, **#94** / **#51** D3 deps, read-only policy).
  - **#83 Insights (v1, `issue-83-graph-insights`):** **View → Insights** shows a **Network snapshot** panel (global metrics + **Top by degree** with **Focus**). **Focus** reuses the same **`discoveryFocusPoint`** + **`createFocusZoomTransform`** + **`applyProgrammaticZoomTransformRef`** + double **`requestAnimationFrame`** + **`applyDiscoveryFocusNodeUiRef`** path as **Focus next** (no **`setSelectedNodes`**; **#94**). Metrics from **`computeGraphInsights`** (**`graphInsights.js`**); computation runs while the panel is visible. Remaining epic scope (centrality, diameter, patterns, playback deltas, workers): **#83**, **#95**, **`docs/github-backlog-issues.md`**.
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

#### Identity + auth (guest, preview, accounts) — GitHub **#31** / **#33** / **#63**

**Goal**: **guest-first** app (`sessionId`); optional **dev preview** of registered UX; **real** registration/login with httpOnly cookie and profile update.

1. **`AuthProvider`** (**`AuthContext`**) — session state: **`loading` / `guest` / `authenticated`**; **`user`** (`id`, `email`, `name`); **`register`**, **`login`**, **`logout`**, **`updateProfile`**.
2. **`AuthIdentityBridge`** (**`index.js`**) — maps **`user?.id`** onto **`IdentityProvider`** so **`useIdentity().userId`** is the Mongo user id when signed in.
3. **`IdentityProvider`** exposes **`useIdentity()`**: `identityKind`, `isRegistered`, `userId`; optional **`REACT_APP_MINDMAP_USER_ID`**; in **development** with **`REACT_APP_ENABLE_DEV_PREVIEW=true`**, **`setDevRegisteredUserId`** for **Guest / Preview** without real auth.
4. **`GuestIdentityBanner`** — shell strip: graph title (**`GraphTitleContext`**), **Sign in** (or dev **Preview** when enabled); the guest sign-in control uses **`guest-identity-banner__account-control--auth-sign-in`** so the chip matches library rail height and keeps a single-line label; the secondary **Create account** line next to Sign in on the banner was removed (registration remains in the auth modal). Signed-in menu (**User settings** → **`PATCH /api/auth/me`**, **Sign out**), **Home** / **Visualize** / **Library** / **Upload** rails (**#40**), **View** menu on **`/visualize`**: **Graph search** / **Playback strip** / **Insights** visibility (**`GraphChromeUiContext`**, **#38** + **#83**), **Share link** when owner, graph **Search…** / **Focus next** entry points when applicable. **Narrow viewports** (`max-width: 36rem`): icon-only rail chips, tighter grid, sign-in shows a lock icon when the text label is hidden; see **`GuestIdentityBanner.css`**.
5. **API:** **`apiRequest(..., { auth: { userId } })`** sets **`X-Mindmap-User-Id`** for listings, uploads, analyze, graph save/load, and deletes (**#32**). **`LibraryVisualize`** / **`Library.js`** call **`GET /api/files`** and **`GET /api/graphs`** **without** `sessionId` in the query when **`userId`** is set (header-only account scope); guests use **`?sessionId=`**. Server rules prevent account-owned files/graphs from appearing in session-only lists after sign-out (**`server/READEME.md`** §3).
6. **Do not** log tokens or secrets in client code; cookies are httpOnly.

### 2) Upload flow (file + metadata)

**Goal**: upload source file(s) and associate each with the current session.

**Text path**

1. User opens the upload modal (`FileUpload`) and selects a `.txt` or `.md` file.
2. `FileUpload` posts to `POST /api/upload` with form fields:
   - `file`
   - `customName`
   - `sessionId` (from `useSession()`)
   - When signed in, **`X-Mindmap-User-Id`** is sent; the server stores **`File.userId`** and metadata **`userId`** (**#63**).
3. On success, the server writes the upload to disk, writes metadata JSON, and saves a **`File`** record in Mongo. A **`UserActivity`** row with action **`FILE_UPLOAD`** is also recorded when persistence succeeds (see **`server/READEME.md`**). Users can repeat steps 1–2 for **additional files in the same session** (multiple `File` documents per `sessionId`).
4. On failure, the API may return structured JSON (`error`, `details`, `code`). If a **legacy Mongo index** still enforces one file per session, see **`server/READEME.md`** (GitHub **#42**).

**Audio → transcript (same modal):** User switches to **Audio → transcript**, then **Upload file** or **Record**. Recording uses **`getUserMedia`** + **`MediaRecorder`** (best-effort MIME via **`pickMediaRecorderMimeType`**), preview with **`<audio controls>`**, then **`POST /api/transcribe`** with `audio` + `sessionId` — same as choosing a file. On **Record**, optional **Segment timestamps** adds **`verbose=1`**; when the API returns **`segments`**, a **Segment timings** disclosure lists start/end times per phrase (**#58**). Oversize clips are rejected **client-side** before upload (**25 MB**, aligned with the server). Edit transcript, then **`POST /api/upload`** as `.txt` for Library **Analyze**.

### 3) Library list → analyze → graph render

**Goal**: transform selected source files into a graph and render it.

1. `LibraryVisualize` fetches uploads (GitHub **#32** / **#63**): **guest** — `GET /api/files?sessionId=<uuid>`; **signed-in** — `GET /api/files` with **`X-Mindmap-User-Id`** only (no `sessionId` query). **`GET /api/graphs`** follows the same pattern.
2. For each selected file, it requests the raw content:
   - `GET /api/files/:filename` → `{ success, content }`
3. It calls analysis **once per selected file** (parallel requests):
   - `POST /api/analyze` with `content`, optional `context`, `sessionId`, and **`sourceFiles`** listing that file only (each response is one graph and one server **`GraphTransform`**).
4. **Generate Graph** modal (**Analyze Selected**): header **Generate Graph**; primary **Apply**. **Guidance for this run** matches **AI Generation** — preset dropdown (**None**, **Awe**, **Simpleton**, **Happy**, **Nostalgia**, **Profound**, **Sexy**, **Shock**, **Weird**, **Custom**) via **`GenerationGuidanceFields`** and shared copy in **`client/src/utils/generationGuidance.js`**; **Custom** opens a textarea. Presets resolve to the **`context`** string sent with each analyze request. Each preset describes **voice/tone** and **which kinds of concepts to prefer** when several Wikipedia-suitable choices exist; the server prompt frames this as **USER GUIDANCE — TONE, VOICE, AND CONCEPT CHOICES** (see **`server/READEME.md`** §4).
5. It merges the returned graphs **client-side** for the library view only:
   - **`client/src/utils/mergeGraphs.js`** namespaces node ids per file (`namespace__<localId>`) so ids from different analyzes cannot collide, then unions nodes and links. **`mergeAnalyzedGraphs`** assigns **one shared** `createdAt` / `timestamp` to **all** nodes and links from that **Apply** so history playback (**#36**) treats the import as a **single** step. Unit tests: **`mergeGraphs.test.js`**.
   - Renders via **`GraphVisualization`**.

### 4) Save/load graphs

**Goal**: persist and restore graphs across sessions.

- Save current graph:
  - `POST /api/graphs/save` with `{ graph, metadata }` (server records **`UserActivity`** **`GRAPH_SNAPSHOT_SAVE`** on successful Mongo save)
- List saved graphs:
  - `GET /api/graphs`
- Load a saved graph:
  - `GET /api/graphs/:filename`
- Graph payload may include `createdAt`/`deletedAt` so playback order and deletions persist through saves.
- **Read-only share links (GitHub #39):** Signed-in owners use the **share** control to the **left of View** on the identity banner on **`/visualize`** (mints **`POST /api/graphs/:filename/share-read-token`**). Recipients open **`/visualize?shareGraph=<filename>&shareToken=<secret>`** — the Library sidebar hides uploads/saves; **`GraphVisualization`** runs in **`readOnly`** mode (no Actions FAB / edits). The server rejects **`POST /api/graphs/save?shareToken=…`** and strips **`metadata.shareReadToken`** from save bodies so share secrets never authorize writes and cannot be set via save. See **`server/READEME.md`** §6 for the future **comments/collaboration** permission model (not implemented yet).
- **Read-only share links (GitHub #39):** Signed-in owners use the **share** control to the **left of View** on the identity banner on **`/visualize`** (mints **`POST /api/graphs/:filename/share-read-token`**). Recipients open **`/visualize?shareGraph=<filename>&shareToken=<secret>`** — the Library sidebar hides uploads/saves; **`GraphVisualization`** runs in **`readOnly`** mode (no Actions FAB / edits). The server rejects **`POST /api/graphs/save?shareToken=…`** and strips **`metadata.shareReadToken`** from save bodies so share secrets never authorize writes and cannot be set via save. **Mobile (iOS Safari, Apr 2026):** after the mint request returns, **`navigator.clipboard.writeText`** is often denied because the write is no longer considered part of the same user gesture; **`LibraryVisualize`** then opens an in-app **Share link** dialog with the URL, **Copy** (clipboard retry + selection fallback), and **Share…** (`navigator.share` when available). Follow-up polish (a11y, tests): GitHub **#85**. See **`server/READEME.md`** §6 for the future **comments/collaboration** permission model (not implemented yet).

### 5) Interactive editing + telemetry

**Goal**: allow editing graph structure and track user operations.

In `GraphVisualization` users can:

- Select **nodes** (not links—edges are hover-only) and inspect relationships in the docked tooltip; **Related concepts** shows neighbor **relationship + strength %** when present
- Add nodes and relationships
- Delete nodes/links
  - **Delete modal (Apr 2026):** **Pop (playback)** sets `deletedAt` so history can show deletions; **Purge** removes the entity entirely (no playback memory). Uses an in-app modal (not `window.confirm`) so embedded browsers don’t suppress prompts.
- **Explode subgraph (GitHub #69):** From the **selected-node** docked tooltip, **`POST /api/explode-node`** adds **2–6** new concepts (default **4**, range control in the tooltip) in a Wikipedia-backed **dense** pattern (new nodes fully connected to each other and each linked back to the **anchor**). Optional **Guidance** uses the same preset + custom text as **AI Generation** (**`generationContext`**). The **Explode** action is **not** duplicated under **Actions → AI Generation**. While the request runs, the canvas plays a short **stretch/warp** on the anchor community and reheats the community force simulation (disjoint-graph style). After success, the anchor may store **`explosionExpandedAt`** so the same node cannot be exploded again until reload. **Read-only** (e.g. share link) hides Explode. Server: **`server/READEME.md`** §5c, **`server/lib/explodeNode.js`**. Follow-ups: **`docs/github-backlog-issues.md`** (*Explode subgraph (#69)*).
- Use **AI Generation** (Actions → open the generate form) to request AI expansion (**#37** server budgets / **`dryRun`**, **#62** expansion modes):
  - **Guidance for this run:** preset dropdown + optional custom text (same UX as the library **Generate Graph** modal); sent as **`generationContext`** on **`POST /api/generate-node`**. Server injects the same **tone + concept selection** framing as analyze (**`server/READEME.md`** §5).
  - In the Generate modal, **Expansion algorithm** selects **Manual** (default), **Community evolution**, or **extrapolate branch** (dropdown on the Actions row) (**#82**).
  - **Manual:** one `POST /api/generate-node` call; each new node must link to every highlighted node (existing server validation). The client blocks **Apply** with an inline error if manual mode was opened without at least one highlighted node.
  - **Community evolution:** the client runs **N cycles**; each cycle is one `POST /api/generate-node` with `expansionAlgorithm: "randomizedGrowth"`, `connectionsPerNewNode`, `existingGraphNodeIds` (all current graph node ids), **`existingGraphLinks`** (current link pairs for clustering-aware strategies), and **`anchorStrategy`** (**Random** / **Low local clustering** / **High local clustering** — UI maps to `random` / `lowCommunity` / `highCommunity`). The server still calls the model once per request, then **replaces** model links with random attachment to the **eligible pool** (degree-weighted when strategy is **Random**; biased by **local clustering coefficient** when low/high). Optional **Prune before new nodes** toggles **`enableDeletions`** with **`deletionsPerCycle`**; the server returns **`deletedNodeIds`** and the client merges removals before applying new nodes (**`mergeGenerateResult`**). The client blocks **Apply** if the graph has fewer nodes than **connections per new node**, or if prune would exceed safe bounds. Use **Stop after this cycle** on the **on-canvas chip** to stop before the next request; the chip shows **Cycle *k* of *N*** and a **determinate** progress bar across cycles. **GitHub #68** tracks further algorithm work; **#62** covered the first multi-cycle UX slice.
  - **Extrapolate branch (#82):** highlight **at least two nodes in click order** along existing edges (path from root toward tip). One **`POST /api/generate-branch`** runs all **iterations** on the server (indeterminate chip until done). Parameters: **nodes per iteration**, **iterations**, **memory window** (**memoryK** path nodes). Topology: new nodes attach **only to the current frontier** (latest node on the path); the server ignores model-proposed links. Response is merged with **`mergeGenerateNodeResponse`** like other generate flows. Not available in read-only share mode (no Actions menu).
  - **Apply** runs the full flow (same OpenAI model env as analyze: `OPENAI_ANALYZE_MODEL` on the server). On a valid **Apply**, the modal **closes immediately**; the bottom **`graph-edit-mode-chip`** shows **Generating (AI)** with an **animated progress bar** (**indeterminate** for manual, or while waiting for the first cycle). Multiple cycles consume multiple API calls (watch quotas).
  - The **Generate** modal does **not** currently expose **#37** **Preview budget** (**`dryRun: true`**); that remains a **server/API** capability—see **`server/READEME.md`** and backlog in **`docs/github-backlog-issues.md`**.
  - On failure, the client still surfaces errors via **`window.alert`** (follow-up: non-blocking UI—see backlog doc).

#### Manual E2E — Generate expansion modes (**#62**)

1. Start the stack (MongoDB, `server` on port **5001**, `client` on **3000** per this README / root quickstart). Ensure **`OPENAI_API_KEY`** is set on the server.
2. Open a graph in the library (analyze a file or load a saved graph) so **`GraphVisualization`** is shown.
3. Highlight at least one node, open **Actions** → **AI Generation** (✨ + algorithm dropdown) to open the Generate modal.
4. **Manual path:** leave **Expansion algorithm** on **Manual**, then **Apply**. Expect the modal to **close immediately** and the **bottom chip** to show **Generating (AI)** with an **indeterminate** (animated) progress bar until the request completes. Inspect new nodes and links (each new node should connect to every highlighted node).
5. **Validation:** open the Generate form with **no** nodes highlighted (manual) and confirm an **error** appears under the modal title and **Apply** is disabled. For **Community evolution**, set **connections per new node** higher than the current node count and confirm the inline error.
6. **Community evolution path:** choose **Community evolution**, set **AI nodes per cycle**, **Connections per new node**, **Number of cycles**, and optionally **Growth strategy** + **Prune before new nodes** / **Max nodes to remove per cycle**. **Apply** and confirm the modal closes; the chip should show **Cycle *k* of *N*** and a **filled** progress bar that advances each cycle. New links should use templated **Random expansion** relationship labels (**uniform** vs **weighted … clustering** when low/high strategy).
7. (Optional) During a community evolution run, click **Stop after this cycle** on the **chip** and verify the graph stops growing after the current request finishes.
8. (Optional) With **Prune** enabled, confirm nodes can disappear after a cycle and that playback/history still behave as expected when using **Pop** vs **Purge** elsewhere.

Key operations are logged via:

- `POST /api/operations` (includes `sessionId`, operation type, status, duration, and details)

The feedback form in **`GiveFeedbackControl`** posts to **`POST /api/feedback`**; when the session exists in Mongo, the server also records **`UserActivity`** **`FEEDBACK_SUBMIT`** (see **`server/READEME.md`**).

## API base URL

All API requests go through **`apiRequest()`**, which builds URLs with **`apiUrl('/api/...')`** from `client/src/config.js`. Do not call `fetch(apiUrl(...))` directly for JSON APIs unless there is a strong reason (keeps errors and env behavior consistent).

| Environment | Default behavior |
|---------------|------------------|
| **Development** (`npm start`) | Defaults to **`http://localhost:5001`** (direct; CORS allows the CRA origin). Override with **`REACT_APP_API_URL`**. |
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
2. Open **`http://localhost:3000`**. Confirm the landing page loads and (with DevTools → Network) **`POST /api/sessions`** succeeds. On **Visualize** as **guest**, **`GET /api/files?sessionId=…`** and **`GET /api/graphs?sessionId=…`** should include your session UUID (**#32**). When **signed in**, listing calls use **`X-Mindmap-User-Id`** without `sessionId` in the URL (**#63**); account-owned uploads must not appear after **Sign out** in the same tab.
3. **Upload:** open **Upload**, pick a small `.txt` file, submit; expect success and **`POST /api/upload`** (multipart) **200**.
4. Optional (**#34** / **#35** / **#58**): **Upload** → **Audio → transcript**. Either **Upload file** (small `.webm` / `.m4a`) or **Record** → allow the mic → **Start recording** / **Stop** (while recording, an **elapsed timer** runs next to the status line) → preview → optional **Segment timestamps** on the **Record** sub-tab only → **Transcribe** — expect **`POST /api/transcribe`** **200** — then **Upload transcript as .txt** (**`POST /api/upload`**). Try an oversized file: expect a **client-side** error before transcribe.
5. **Visualize:** go to **Visualize** (or **`/visualize`**). Confirm **`GET /api/files`** lists the upload; select the file, **Analyze Selected**; expect **`GET /api/files/:name`**, **`POST /api/analyze`**, then a graph in the visualization area.
6. Optional: **Give feedback** (FAB), **Save** graph if you want to verify **`POST /api/graphs/save`** and **`GET /api/graphs`**.
7. **Graph actions (Library → visualize a graph):** Confirm you can **pan/zoom** the graph (drag empty space, wheel or pinch). **Tap/click nodes** to change selection; **hover links** for the relationship tooltip (links are not click-selected). Open **☰ Actions** (top-right **of the graph panel** over the SVG, not the **GuestIdentityBanner** strip where the graph title lives — **#33**): the menu should appear with **Graph actions** and **×**. Try **Generate**, **Add Node**, **Add Relationship** (with two nodes highlighted), **Delete**; dismiss with **×**, **Actions** again, **outside tap**, or **Escape**. On **desktop**, **right-click** the graph should open the same menu. On **narrow screens**, open **Library** from the banner (**`LibraryUiContext`**) and confirm the overlay header **Close** sits **above** the **Actions** FAB (FAB must not cover **×**).
8. Optional: With **one or more nodes selected**, choose **Add Node** from **Actions**, complete the form, and confirm the **Connect to existing concepts** step if prompted.
9. **Discovery & graph chrome (#38; #73 slice on `issue-73-minimap-pan`):** With a graph open on **`/visualize`**, use **Search** (substring on **labels**), **Focus next** / **Enter** — the view should **pan** to each match, the node (or cluster) should show **selected** styling, and the **docked tooltip** should appear. **Minimap:** **click** to center on a region, **drag** to pan; the overview should **track** the main viewport. **Show all** resets merge/split + fit. In **`GuestIdentityBanner`** → **View**, toggle **Graph search** and **Playback strip**; reload and confirm visibility persists (**`localStorage`**: `mindmap.chrome.graphSearchBarVisible`, `mindmap.chrome.playbackStripVisible`). Automated coverage: toggles **#24**; D3/selection decoupling **#94**; a11y **#57**; semantic search / minimap zoom: **#73**.
10. **Insights (#83 v1):** **View → Insights** — confirm the **Network snapshot** panel (counts, density, components, degree summary, clustering, isolates, top nodes). **Focus** on a top node should pan/zoom and show the same focus + tooltip behavior as **Focus next**. Toggle off/on; reload and confirm **`mindmap.chrome.insightsPanelVisible`** persistence. Unit tests: **`graphInsights.test.js`**.

If the API is not running, the client surfaces **`apiRequest`** / network errors (see **`http.js`**); **`GET /api/files`** failures on the library page show the banner described in **`LibraryVisualize`**.

## Learn more

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).
You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

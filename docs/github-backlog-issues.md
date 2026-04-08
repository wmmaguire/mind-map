# GitHub backlog issues

Originally generated from the former `docs/todo.md` via `scripts/create-todo-issues.sh` (one-off). **Do not re-run the script** — it will create duplicate issues. Ongoing backlog: **GitHub Issues** + **MindMap** project.

Use **Milestones** for Gantt-style grouping and **Dependencies** sections in each issue for sequencing.

### MindMap project — roadmap dates

User project **MindMap** (`wmmaguire`, project #1) includes backlog items **#12–#40**. Custom fields **Start date** and **End date** were added so **Roadmap** can plot them.

- **Anchor:** first schedulable day = **2026-03-23**.
- **Durations:** HIGH priority = 3 calendar days, MEDIUM = 2, LOW = 1 (from issue labels).
- **Order:** parallel CPM — each item starts the day after all **Blocked by** predecessors end (\( \text{start} = \max(\text{finish}(\text{preds})) + 1 \); no preds → day 1).

In **Roadmap** settings, ensure the layout uses **Start date** / **End date** (or the project’s date fields). Older items **#1–#10** on the board were not auto-dated.

| Issue | Milestone | Title (short) |
|-------|-----------|----------------|
| #12 | M—Client | Centralize API base URL |
| #13 | M—Client | Replace `window.currentSessionId` with app state |
| #14–#20 | M—Server | CORS/baseDir → … → hybrid persistence docs |
| #21–#26 | M—Client | Merge, loading, feedback, E2E, sidebar, file list |
| #27–#30 | M—Client | GraphVisualization (modes, mobile, hierarchy, a11y) — **#27** graph actions UI implemented on branch `issue-27-graph-edit-modes` (see note below) |
| #31 | NF—Social | Epic: Accounts, profiles & BYO LLM — **foundation:** guest **`IdentityProvider`** / **`GuestIdentityBanner`**; Library **`actionsFabPlacement`** (see note; branch **`issue-31-guest-identity-foundation`**) |
| #32 | NF—Social | User-scoped file & graph listing APIs — **`GET /api/files`** / **`GET /api/graphs`** scoped by **`?sessionId=`** or **`?userId=`** / **`X-Mindmap-User-Id`**; client passes **`sessionId`** (branch **`issue-32-user-scoped-listings`**) |
| #33 | M—Client | Library + accounts UI |
| #34–#35 | NF—Input | Audio epic + FileUpload audio UI |
| #36 | NF—Persistence | Time travel epic |
| #37–#38 | NF—Graph intelligence | Growth modes + discovery epics |
| #39 | NF—Social | Sharing & collaboration epic |
| #40 | NF—Polish | Dynamic UI / UX epic |
| #41+ | — | Later items include repo hygiene/chore tickets (e.g. **#41**), Mongo index migration (**#42**), multi-file client UX (**#43**) — see GitHub **Issues** for current titles. Post–**#22** client follow-ups: **#49**–**#51**; post–**#23**: **#52** (FAB stacking); post–**#25**: **#53** (Library layout / flex vs old header pixel constant — partly addressed by **#33** graph title in banner); post–**#26**: **#54** (server docs: file delete API + CORS); post–**#28**: **#55** (optional **`.library-graph-mount`** CSS audit); post–**#29**: **#56** (optional graph Actions accordion / focus polish); post–**#30**: **#57** (D3 canvas / node screen-reader a11y); post–**#32**: **#33** (client shell + headers; server **`userId`** on upload still backlog), **#46** (**`metadata/`** vs Mongo drift under scoped-only listing); post–**#33**: real **OAuth / session tokens**, **#24** (E2E for banner + **`LibraryUiContext`**), z-index polish **#52**; post–**#34**–**#35**: **#24** (audio E2E incl. **#58** verbose UI), **#59** (speaker diarization), **#60** (transcribe HTTP integration tests), **#61** (optional persist/export). Post–**#58**: **#24**, **#59**, **#60**, **#61**; merged time+speaker contract (**#59**) — see **`server/READEME.md`** §2b follow-ups. |

**Note:** Server **#16** (database-backed user activity / `UserActivity` audit) is implemented in `server/models/userActivity.js`, `server/lib/recordUserActivity.js`, and **`server/READEME.md`** (persistence matrix). Follow-ups filed separately: **#44** (graph snapshot disk vs Mongo consistency), **#45** (`UserActivity` ops: volume / retention / indexes).

**Note:** Server **#20** (hybrid persistence / source of truth) is documented in **`server/READEME.md`** → *Data consistency (hybrid persistence)*. Optional API follow-up: **#46** (align `GET /api/files` with Mongo `File` or reconciliation).

**Note:** Epic **#34** (server **`POST /api/transcribe` shipped — branch **`issue-34-audio-transcribe-pipeline`**, tip **`5b82d63`**) — OpenAI **`audio.transcriptions.create`**, **`OPENAI_TRANSCRIBE_MODEL`** / default **`whisper-1`**, **`server/routes/transcribe.js`**, **`TRANSCRIBE_COMPLETE`**. Client path extended by **#35** (**Record** + upload). Default response is **plain `transcript`**; **#58** adds opt-in **`verbose`** / **`segments`**. **Follow-ups:** **#59** (diarization), **#60** (HTTP integration tests for the route + mocked OpenAI), async/long-audio behavior, **#24** E2E.

**Note:** **#58** — optional **`verbose`** (multipart or query) → OpenAI **`response_format: verbose_json`**; JSON adds **`segments`** `{ start, end, text }` and optional **`duration`**. FileUpload: checkbox **Request segment timings** + collapsible list. Tests: **`server/routes/transcribe.test.mjs`** (pure helpers), **`FileUpload.test.jsx`**. **Out of scope for #58:** HTTP-level route tests (**#60**), browser E2E (**#24**), persisting segment JSON with uploads, word-level timestamps / SRT export, merged **#58**+**#59** response shape (see **`server/READEME.md`** §2b).

**Note:** **#59** — optional **speaker diarization** (**`gpt-4o-transcribe-diarize`**, **`diarized_json`**); **`whisper-1`** does not identify multiple speakers — see **`server/READEME.md`** §2b. When implemented, coordinate with **#58** segment fields so clients can show **time + speaker** without conflicting contracts.

**Note:** **#37** (epic — **NF—Graph intelligence**) — first slice: **growth budgets** + **`dryRun`** on **`POST /api/generate-node`** (no OpenAI); client **Preview budget** in Generate modal. **`GENERATE_NODE_MAX_NEW_NODES`** / **`GENERATE_NODE_MAX_SELECTED`**. Tests: **`server/lib/generateNodeBudget.test.mjs`**. Full presets/autopilot still backlog.

**Note:** **#60** — HTTP integration tests for **`POST /api/transcribe`** (Express + multer + mocked **`openai.audio.transcriptions.create`**), default vs **`verbose`** branches. See **`server/READEME.md`** §2b follow-ups.

**Note:** **#61** — optional product/API: persist **segment JSON** with uploads, **word-level** timing, or **SRT/VTT** export (**#58** UI is ephemeral until upload). LOW priority.

**Note:** **#62** — **Graph expansion modes:** dropdown to choose **manual generate** (current **`/api/generate-node`**) vs **multi-cycle randomized growth** (parameterized AI nodes per cycle, connections per node, cycle count; random attachment to existing nodes). Supersedes the cancelled **#37** budget-preview experiment; see GitHub **#62** for acceptance criteria and open questions.

**Note:** Client **#35** (branch **`issue-35-fileupload-audio-recorder`**, tip **`0d6d47d`**) — **`FileUpload`** **Audio → transcript**: sub-tabs **Upload file** | **Record** (`getUserMedia`, **`MediaRecorder`**, preview, discard / record again), **`utils/audioRecording.js`** (25 MB preflight). Depends on **#34**. **#58** adds optional segment timings UI (checkbox + **details**). **Out of scope:** **#24** (Playwright/Cypress with mic + verbose path), Safari **`webm`** interop hardening, optional waveform UI, integration test mocking **`MediaRecorder`**, a11y polish for segment list (**#57**-related).

**Note:** Client **#21** — namespaced **union** of per-file analyze graphs (`client/src/utils/mergeGraphs.js`); merged view is disjoint subgraphs by default.

**Note:** **#47** — optional **fusion** into one fully connected graph and **splitting** large graphs (topics, communities, size, etc.); builds on **#21** union semantics.

**Note:** **#48** — **batch analyze** resilience (partial failures, per-file status, retry vs **#22** general error handling).

**Note:** Client **#22** (merged on branch `issue-22-unify-loading-errors`) adds **`client/src/api/http.js`** — `apiRequest()`, `ApiError`, `getApiErrorMessage()`, `isNetworkError()` — so all prior `fetch('/api/...')` call sites share **`apiUrl()`** from `config.js` and consistent JSON error bodies. Jest tests: **`client/src/api/http.test.js`**. This addresses **transport-level** loading/error consistency; UI-level work is tracked separately.

**Note:** **Repo lint** — Root **`npm run lint`** runs ESLint for **`client/src`** and **`server/`**. Server config is **`server/eslint.config.mjs`** (flat config, **`globals.node`**). **`GraphVisualization`** uses a scoped **`eslint-disable-next-line react-hooks/exhaustive-deps`** pending a proper fix tracked in **#51**.

**Note:** Client **#25** — Library **sidebar** (resizable width, persisted **Files** / **Graphs** sections), **full-viewport** overlay when the library is open on narrow screens. **Update (post–#33):** **Mobile “open library”** is a compact control in **`GuestIdentityBanner`** (**`LibraryUiContext`**) instead of a fixed **`48px`** left edge strip; **graph title** lives in the same banner (**`GraphTitleContext`**), not a separate **visualization header** row above the graph (**`VISUALIZATION_HEADER_PX`** removed from **`LibraryVisualize`**). **`GraphVisualization`** receives explicit **`width` / `height`** (full panel height under the shell). **Update (post–#28):** Legacy global mobile **`.graph-container`** rules in **`GraphVisualization.css`** were **deleted**; graph actions use the **Actions FAB** / **#graph-action-menu** only (**#27**). **Library** still uses **`.library-graph-mount`** + **`.library-visualize`** scoped overrides — **#55** optional audit. Implementation: **`LibraryVisualize.js`**, **`LibraryVisualize.css`**, **`GuestIdentityBanner.jsx`**. Follow-ups: **#53** (remaining flex/layout polish), **#52** (z-index vs FAB / banner), **#55** (optional `!important` cleanup).

**Note:** Client **#27** (graph edit modes / actions UI) — Implemented: **mutually exclusive** edit intent, **Escape** clears modals and selection; **fixed toolbar removed** in favor of **`Actions` FAB** (top-right, **`z-index: 1190`** so it stays **below** the mobile library overlay **`1200`** and does not cover the library **Close** button), **`#graph-action-menu`** with header + **×**, **right-click** on the SVG opens the same menu; **no long-press on the canvas** (avoids conflicting with pan/zoom and node/link clicks). **Menu actions** use a **snapshot** of selection at open time. **Add Node** with one or more nodes highlighted prompts for **relationship text to each** before new links are created. Tests: **`client/src/components/GraphVisualization.test.js`**. **Docs:** **`client/README.md`** (module + manual E2E steps).

**Note:** Client **#28** (mobile `.edit-controls` / toolbar CSS) — **CSS-only cleanup** post–**#27**: removed obsolete **controls-panel** / **edit-controls** / legacy mobile **`.graph-container`** positioning, unused helper/deletable styles, and duplicate rules in **`GraphVisualization.css`**. **`LibraryVisualize.css`**: mobile **`.visualization-panel`** no longer reserves **25vh** for the removed bottom sheet (uses **`safe-area-inset-bottom`**). **`npm run lint`** + client Jest pass. Manual iOS/Android smoke and validation checklist in the issue remain **out of scope** for the cleanup commit; **touch/a11y** for the Actions menu/FAB is implemented in **#30** (branch **`issue-30-touch-a11y`**). Optional follow-up: reduce **`.library-graph-mount`** **`!important`** overrides now that globals are gone — **#55**.

**Note:** Client **#29** (tool hierarchy + on-canvas feedback) — Implemented on branch **`issue-29-tool-hierarchy`**: **Actions** menu split into **Generate (AI)** vs **Edit graph** with **accordion** toggles (chevron, **`aria-expanded`**, pattern aligned with **`LibraryVisualize`** **`library-section__toggle`**); **link-flow** hint for **Add Relationship**; **Delete** kept with other edit actions; menu **`max-height`** + **scroll** for short viewports; fixed bottom **`graph-edit-mode-chip`** (`role="status"`) when generate / add / relationship / connect flows are active with **Cancel**. Tests in **`GraphVisualization.test.js`**. **Follow-ups (outside #29):** full **z-index** pass with chip **`1195`** — **#52**; browser **E2E** — **#24**; optional accordion **defaults / persistence / focus** — **#56**. **Touch targets + menu a11y** — **#30** (see note below).

**Note:** Client **#30** (touch targets + a11y for graph edit tools) — Implemented on branch **`issue-30-touch-a11y`** (commit **`ce5877b`**): **`#graph-action-menu`** uses **`role="group"`** (not **`role="menu"`**), **`aria-labelledby`** + **`aria-describedby`**; **Actions** FAB has **`aria-haspopup="true"`**; opening the menu moves focus to the **Close** control (**`setTimeout(0)`** for JSDOM/tests); decorative emoji icons in menu actions are **`aria-hidden`** with visible label text; **`.graph-action-menu__action`** and **`.graph-action-menu__close`** meet **≥44px** touch targets (mobile menu actions **48px** height at **≤768px**); pill buttons under **`.graph-visualization-container`** use **min-height 44px** on narrow viewports. Tests: **`GraphVisualization.test.js`** (focus + **group** role). **Still backlog:** D3 **SVG canvas** screen-reader / node semantics — **#57**; full stacking **#52**; **E2E** **#24**; optional menu focus polish **#56**; D3 **`useEffect`** **#51**.

**Note:** Client **#31** (accounts / identity epic — **in-progress foundation** on branch **`issue-31-guest-identity-foundation`**) — **Guest identity:** **`client/src/context/IdentityContext.jsx`** (`IdentityProvider`, **`useIdentity()`**, `identityKind: 'guest'`, `isRegistered: false`); **`GuestIdentityBanner`** in **`App.js`**; **`index.js`** wraps **`IdentityProvider`** inside **`SessionProvider`**. Commit **`2887b26`**. Tests: **`IdentityContext.test.jsx`**, **`App.test.js`**, **`criticalPath.integration.test.js`**. **Library Actions FAB placement:** **`GraphVisualization`** accepts **`actionsFabPlacement`**: **`fixedViewport`** (default: **`position: fixed`** top-right of the window, used for non-Library routes) vs **`libraryGraphMount`** (**`LibraryVisualize`** passes this): FAB stays inside **`.graph-visualization-container`** with **`position: absolute`** top-right over the **SVG** (class **`graph-actions-fab--library-graph-mount`**, scoped in **`LibraryVisualize.css`**), not in the **visualization title** bar. Commit **`22cb6ac`**. A short-lived **portal-into-header** experiment (**`bc0b3cc`**) was **reverted** in favor of graph-anchored placement. **Post–#33:** the Library **graph title** moved to **`GuestIdentityBanner`** via **`GraphTitleContext`**; **`VISUALIZATION_HEADER_PX`** was removed from **`LibraryVisualize`** (full-height graph panel). **Still backlog (outside this foundation slice):** full **sign-in / OAuth** — continues under **#33** / future epic; **`ResizeObserver`** / flex-only layout polish — **#53**; full **z-index** pass — **#52**; browser **E2E** — **#24**; **`VisualizationPage`** save payload vs server — **#49**.

**Note:** Client **#33** (Library + accounts UI — branch **`issue-33-library-accounts-ui`**, docs at **`f430bae`**) — **`apiRequest`** optional **`auth: { userId }`** → **`X-Mindmap-User-Id`** (**`http.js`**); **`IdentityProvider`** supports optional **`initialRegisteredUserId`** / **`REACT_APP_MINDMAP_USER_ID`** and dev **`setDevRegisteredUserId`**; **`LibraryVisualize`** + modal **`Library.js`** pass mindmap auth on list/analyze/save/delete paths; save adds **`metadata.userId`** when registered. **UI:** **`LibrarySidebar`** / **`LibrarySourcesPanel`** / **`LibraryAccountChip`**; **`GuestIdentityBanner`** — graph title (**`GraphTitleContext`**), sign-in / account menu (**#63**), **mobile Library** (**`LibraryUiContext`**). **Tests:** wrap **`GraphTitleProvider`** + **`LibraryUiProvider`** where needed. **Out of scope / follow-ups:** real **OAuth / bearer** tokens; dedupe **LibraryAccountChip** vs banner copy where needed; **E2E** (**#24**) for **`/visualize`** banner + library open; **a11y** review of banner **menu**.

**Note:** Server **#32** (user-scoped file & graph listing) — Implemented **`67677b4`** on branch **`issue-32-user-scoped-listings`**, extended on **`issue-63-auth-registration-login`** with **account isolation**: **`GET /api/files?sessionId=`** returns only **guest** rows (no non-empty **`File.userId`**); **`GET /api/graphs?sessionId=`** skips graph JSON with **`metadata.userId`**; **`GET/DELETE`** by filename enforce owner checks for account-owned resources (**`server/READEME.md`** §3). **`GET /api/files`**: Mongo **`File.find`** by **`sessionId`** (guest) or **`userId`** (header/query); legacy unscoped read of **`metadata/`** if no query. **`GET /api/graphs`**: filters disk JSON accordingly. **`POST /api/upload`** sets **`File.userId`** when **`X-Mindmap-User-Id`** is sent (**#63**). **Out of scope / follow-ups:** **#64** (JWT-verified owner vs **`X-Mindmap-User-Id`**), **#65** (gate legacy unscoped **`GET /api/files`**), **#66** (authorize **`POST /api/analyze`**); guest → account **migration** of legacy session files — product; automated tests — **#24**; Mongo vs **`metadata/`** reconciliation — **#46**; sharing epic — future.

**Note:** **#63** (registration / login / profile + library integration — branch **`issue-63-auth-registration-login`**) — Server: **`User`** model, **`POST/GET/PATCH /api/auth/*`**, httpOnly **`mindmap_auth`** JWT cookie, **`PATCH /api/me`** for display name; **`POST /upload`** + **`graphs/save`** attach **`userId`** from header; listing/read/delete rules above. Client: **`AuthProvider`**, **`AuthIdentityBridge`**, **`GuestIdentityBanner`** (sign-in modal, user settings, sign out), **`LibraryVisualize`** / **`Library.js`** / **`FileUpload`** pass **`auth: { userId }`**; **`LibraryAccountChip`** shows **name** when present. **Removed:** redundant **Guest** label; dev **End preview** menu item (refresh clears preview state). **Docs:** **`server/READEME.md`**, **`client/README.md`**, **`docs/status.md`**, this file. **Follow-ups outside #63:** **#64**, **#65**, **#66**; OAuth — **#33** / future epic.

**Note:** **#67** — Expand **Account settings** with more editable profile/preferences fields (e.g. bio, avatar URL, timezone); **email change** / **password change** as separate verified flows.

| Follow-up (outside #27 implementation scope) | GitHub issue / note |
|----------------------------------------------|---------------------|
| Full **z-index** audit: graph menu (**10020**), Actions FAB (**1190**; Library: **container-absolute** + **`libraryGraphMount`** — **#31**), Feedback FAB (**1000** / modal **1001**), library sidebar (**1200**), toasts (**1350**), `Modal` (**1300**) | **#52** (see issue comments post–**#30**, **#31**) |
| **Browser E2E** (Playwright/Cypress): open Actions, add node, relationship flow, dismiss menu | **#24** follow-ups |
| **`GraphVisualization`** D3 **`useEffect`** **`exhaustive-deps`** / handler stability | **#51** |
| **Scope** global **`GraphVisualization.css`** **`.graph-container`** mobile rules to standalone route only | **Superseded by #28** (globals **removed**); optional **`.library-graph-mount`** audit — **#55** |
| **Mobile graph UX** (optional pan hint, touch gestures) without breaking selection — prior **`touch-action: none`** / **`clickDistance`** experiment **reverted** | **#28** validation checklist; hierarchy/chip/accordion in **#29**; menu touch targets in **#30** |
| **Hierarchy** / on-canvas feedback (menu sections, status chip) | **#29** (implementation branch **`issue-29-tool-hierarchy`**) |
| **Touch targets + a11y** for graph Actions menu / FAB | **#30** (implemented; branch **`issue-30-touch-a11y`**) |
| **D3 canvas / node** screen-reader exposure (labels, selection announcements, keyboard graph nav) | **#57** |
| Optional: graph Actions accordion **reset-on-open**, **sessionStorage**, **roving focus** in menu | **#56** |

**Note:** Client **#26** — Library **file list** helpers in **`client/src/utils/libraryFileList.js`** (filter, sort, display name; tests: **`libraryFileList.test.js`**). **Files** section: **search**, **sort** (name / upload date), **Select all** (filtered), **Clear selection**, **loading skeleton**, empty states (**Go to home** link, no-search-match + **Clear search**). Toolbar: **+ Add new** (opens app-level **`FileUpload`** from **`App.js`**; **`fileRefreshToken`** refetches list after upload), **Delete selected** (`DELETE /api/files/:filename?sessionId=` — session-scoped; **`UserActivity`** **`FILE_DELETE`**), **Analyze Selected**. **Delete** success/error **toasts** (fixed, auto-dismiss; **`library-file-action-toast`**). Dev **CORS** must allow **`DELETE`** when the client uses **`getApiOrigin()` → `http://localhost:5001`** (cross-origin from `:3000`); implemented in **`server/server.js`**. **Modal z-index:** **`.modal-overlay`** **`1300`** so **`FileUpload`** and save dialogs sit above the mobile library sidebar (**`1200`**); upload success toast **`1350`**. Graph title row shows **`currentSource` name** only (no **“Visualization:”** prefix). **`prop-types`** direct dependency; **`LibraryVisualize.defaultProps`**. Follow-ups: **#50** (unify upload + delete toasts / shared shell), **#52** (full z-index audit incl. FAB vs modals), **#24** (integration tests for delete/upload from library), **#54** (server README for delete + CORS).

**Note:** Client **#24** — Integration baseline is in **`client/src/criticalPath.integration.test.js`** with manual E2E steps in **`client/README.md`**. Remaining automation (browser E2E, upload/analyze/feedback, feedback FAB) is **follow-up** — see issue comments and table row above.

**Note:** Client **#23** — **`GiveFeedbackControl`** (`client/src/components/GiveFeedbackControl.jsx` + `.css`): app-shell **FAB** (bottom-right, safe-area insets) and **modal** for **`POST /api/feedback`**; mounted **once** in **`App.js`**; Escape to close, focus to close button on open, focus return to FAB; inline thanks (no `alert`). **`Landing.js`** removed. Does **not** include a strict **focus trap** (Tab stays in dialog), shared **toast** for success, or automated UI tests — see table below.

| Follow-up (outside #22 scope) | GitHub issue |
|-------------------------------|--------------|
| `VisualizationPage` save body uses `data` / `filename`; server expects `graph` + `metadata` | **#49** |
| React error boundary + toast/snackbar; reduce `alert()` / ad-hoc inline only | **#50** |
| `GraphVisualization` D3 `useEffect` `exhaustive-deps` warning (telemetry / delete handlers) | **#51** |
| Batch analyze: partial success, per-file errors (`Promise.all` → `allSettled`) | **#48** (existing) |
| E2E / integration tests (mock `apiRequest` or MSW) | **#24** — baseline: **`criticalPath.integration.test.js`** (mocked `fetch`), **`resetSessionBootstrapForTests`**, **`test:ci`** / **`test:integration`**, manual E2E checklist in **`client/README.md`**. **Follow-ups:** browser automation (Playwright/Cypress), upload/analyze/feedback in tests, optional MSW — see issue **#24** comments. |
| File list skeleton + empty states (loading UX beyond API errors) | **#26** (implemented) |

| Follow-up (outside #26 scope) | GitHub issue |
|-------------------------------|--------------|
| Unify **upload** success ( **`App`**) and **delete** toasts (**`LibraryVisualize`**) into a shared notification pattern; replace **`window.confirm`** for delete with an accessible dialog | **#50** (shared shell / notifications) |
| **Z-index** audit: **Give Feedback** FAB/modal vs **Library** vs **`GraphVisualization`** after modal layer **1300** / toast **1350** | **#52** (see issue comment) |
| Integration / E2E tests: **Add new**, **Delete selected**, toast assertions (**`apiRequest`** or **MSW**) | **#24** |
| Document **`DELETE /api/files`**, session checks, and **CORS** **`DELETE`** for dev in **`server/READEME.md`** | **#54** |

| Follow-up (outside #23 scope) | GitHub issue |
|-------------------------------|--------------|
| Strict focus trap (Tab cycles only inside feedback dialog) | **#50** (shared shell / notifications) or future a11y pass |
| Success UX via shared toast/snackbar instead of inline thanks | **#50** (existing) |
| E2E or component test: open FAB → submit feedback (`apiRequest` mock) | Still **backlog** (not in **`criticalPath.integration.test.js`** yet); track under **#24** follow-ups or a future UI test pass. |
| Z-index / stacking: FAB vs `LibraryVisualize` sidebar & other modals | **#52** |

| Follow-up (outside #25 scope) | GitHub issue |
|-------------------------------|--------------|
| Scope **`GraphVisualization.css`** mobile **`.graph-container`** (embedded vs standalone) | **Done in #28** (removed legacy globals); optional **`!important`** reduction — **#55** |
| Replace **`VISUALIZATION_HEADER_PX`** with flex-only layout and/or **`ResizeObserver`** on **`.visualization-header`** so graph dimensions stay aligned with CSS | **#53** |
| Z-index: **Give Feedback** FAB vs **library rail** / overlay / **`GraphVisualization`** controls | **#52** (existing; see issue comment) |

### Follow-ups spawned from #63 / library hardening (April 2026)

These are tracked as **separate GitHub issues**:

| GitHub | Topic |
|--------|--------|
| **#64** | **JWT-verified owner for library APIs** — derive **`userId`** from **`mindmap_auth`** (or verify **`X-Mindmap-User-Id`** against **`jwt.sub`**) instead of trusting the header alone. |
| **#65** | **Gate legacy unscoped `GET /api/files`** — unscoped handler still enumerates **`metadata/`**; disable or require admin in production. |
| **#66** | **Authorize `POST /api/analyze`** — ensure **`sourceFiles`** / content cannot be analyzed from another user’s uploads without ownership. |

*Issue numbers are from the batch created in-repo (March 2026); adjust if yours differ.*

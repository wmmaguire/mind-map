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
| #27–#30 | M—Client | GraphVisualization (modes, mobile, hierarchy, a11y) |
| #31 | NF—Social | Epic: Accounts, profiles & BYO LLM |
| #32 | NF—Social | User-scoped file & graph listing APIs |
| #33 | M—Client | Library + accounts UI |
| #34–#35 | NF—Input | Audio epic + FileUpload audio UI |
| #36 | NF—Persistence | Time travel epic |
| #37–#38 | NF—Graph intelligence | Growth modes + discovery epics |
| #39 | NF—Social | Sharing & collaboration epic |
| #40 | NF—Polish | Dynamic UI / UX epic |
| #41+ | — | Later items include repo hygiene/chore tickets (e.g. **#41**), Mongo index migration (**#42**), multi-file client UX (**#43**) — see GitHub **Issues** for current titles. Post–**#22** client follow-ups: **#49**–**#51**; post–**#23**: **#52** (FAB stacking). |

**Note:** Server **#16** (database-backed user activity / `UserActivity` audit) is implemented in `server/models/userActivity.js`, `server/lib/recordUserActivity.js`, and **`server/READEME.md`** (persistence matrix). Follow-ups filed separately: **#44** (graph snapshot disk vs Mongo consistency), **#45** (`UserActivity` ops: volume / retention / indexes).

**Note:** Server **#20** (hybrid persistence / source of truth) is documented in **`server/READEME.md`** → *Data consistency (hybrid persistence)*. Optional API follow-up: **#46** (align `GET /api/files` with Mongo `File` or reconciliation).

**Note:** Client **#21** — namespaced **union** of per-file analyze graphs (`client/src/utils/mergeGraphs.js`); merged view is disjoint subgraphs by default.

**Note:** **#47** — optional **fusion** into one fully connected graph and **splitting** large graphs (topics, communities, size, etc.); builds on **#21** union semantics.

**Note:** **#48** — **batch analyze** resilience (partial failures, per-file status, retry vs **#22** general error handling).

**Note:** Client **#22** (merged on branch `issue-22-unify-loading-errors`) adds **`client/src/api/http.js`** — `apiRequest()`, `ApiError`, `getApiErrorMessage()`, `isNetworkError()` — so all prior `fetch('/api/...')` call sites share **`apiUrl()`** from `config.js` and consistent JSON error bodies. Jest tests: **`client/src/api/http.test.js`**. This addresses **transport-level** loading/error consistency; UI-level work is tracked separately.

**Note:** Client **#23** — **`GiveFeedbackControl`** (`client/src/components/GiveFeedbackControl.jsx` + `.css`): app-shell **FAB** (bottom-right, safe-area insets) and **modal** for **`POST /api/feedback`**; mounted **once** in **`App.js`**; Escape to close, focus to close button on open, focus return to FAB; inline thanks (no `alert`). **`Landing.js`** removed. Does **not** include a strict **focus trap** (Tab stays in dialog), shared **toast** for success, or automated UI tests — see table below.

| Follow-up (outside #22 scope) | GitHub issue |
|-------------------------------|--------------|
| `VisualizationPage` save body uses `data` / `filename`; server expects `graph` + `metadata` | **#49** |
| React error boundary + toast/snackbar; reduce `alert()` / ad-hoc inline only | **#50** |
| `GraphVisualization` D3 `useEffect` `exhaustive-deps` warning (telemetry / delete handlers) | **#51** |
| Batch analyze: partial success, per-file errors (`Promise.all` → `allSettled`) | **#48** (existing) |
| E2E / integration tests (mock `apiRequest` or MSW) | **#24** (existing) |
| File list skeleton + empty states (loading UX beyond API errors) | **#26** (existing) |

| Follow-up (outside #23 scope) | GitHub issue |
|-------------------------------|--------------|
| Strict focus trap (Tab cycles only inside feedback dialog) | **#50** (shared shell / notifications) or future a11y pass |
| Success UX via shared toast/snackbar instead of inline thanks | **#50** (existing) |
| E2E or component test: open FAB → submit feedback (`apiRequest` mock) | **#24** (existing) |
| Z-index / stacking: FAB vs `LibraryVisualize` sidebar & other modals | **#52** |

*Issue numbers are from the batch created in-repo (March 2026); adjust if yours differ.*

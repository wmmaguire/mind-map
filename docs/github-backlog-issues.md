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

### Landing + guest shell (Apr 2026) — shipped slice + follow-ups (outside this ticket)

**Shipped:** **`LandingPage`** in **`client/src/App.js`**: **How it works** (three numbered steps: add sources → analyze → explore), then **Get Started** → **`/visualize`** via **`useNavigate`**. Primary button uses **`landing-cta-primary--dynamic`** (soft pulse via **`@keyframes landing-cta-pulse`**; **`prefers-reduced-motion: reduce`** disables animation). Styles: **`client/src/App.css`**. **`GuestIdentityBanner`**: guest **Sign in** chip aligned to library rail dimensions (**`--auth-sign-in`**), single-line **Sign in** label; **Create account** secondary line removed from the banner (registration remains in auth modal tabs). **`max-width: 36rem`**: icon-only shell rails, tighter grid, sign-in shows **🔐** when the text label is hidden; loading state keeps **Checking…** visible. Tests: **`App.test.js`**, **`GuestIdentityBanner.test.jsx`**.

**Follow-ups (add comments on open issues below; extend GitHub #76 instead of duplicating):**

1. **E2E / RTL** — From **`/`**, assert **Get Started** navigates to **`/visualize`** and the library shell mounts (**#24**).
2. **Product copy** — Confirm users still discover **Create account** after removing the banner line (**#31** / onboarding).
3. **Visual QA** — Real devices at **~36rem** width: rail overlap, sign-in icon-only mode, animated landing CTA (**#40**).
4. **Landing polish** — Optional hero illustration, screenshot, A/B copy, analytics — tracked on **#76** (*optional value-prop cards or hero*); partial overlap now that the value loop + CTA shipped.
5. **Dev-only** — **Guest / Preview** account chip dimensions vs real **Sign in** chip (parity polish, low priority).

**Suggested GitHub comments (paste on issue):**

- **#31** — *Apr 2026: Guest Sign in banner chip restyled (`--auth-sign-in`); Create account line removed from banner (modal only). Narrow: icon-only rails + lock icon for sign-in. See `client/README.md` + this doc section.*
- **#33** — *Apr 2026: Same guest shell / narrow-layout work as #31; graph title + library rails unchanged.*
- **#40** — *Apr 2026: Landing `/` adds How it works + Get Started CTA (pulse animation, respects reduced motion). Second entry point alongside banner Visualize.*
- **#24** — *Apr 2026: Backlog — E2E/RTL: landing Get Started → `/visualize`.*
- **#76** — *Apr 2026: Value loop + Get Started CTA shipped in App. Remaining: optional illustration/screenshot, richer hero, A/B copy, analytics per original scope.*

### Password reset (Apr 2026) — shipped slice + follow-ups (outside this ticket)

**Shipped:** `POST /api/auth/forgot-password`, `POST /api/auth/reset-password` (1h token, hashed on `User`); **`GuestIdentityBanner`** forgot flow; **`/reset-password`** page; **nodemailer** + SMTP env; **`APP_PUBLIC_ORIGIN`** for email links; **`SMTP_URL`** must be `smtp(s):` or host-based vars are used; **`GET /health`** / **`GET /api/test`**; HTTP **`maxHeaderSize`**; client **`PORT=3000`** in **`npm start`**.

**Follow-ups (add comments on open issues below; file new GitHub issues if missing):**

1. **Rate limiting / abuse** — throttle **`POST /api/auth/forgot-password`** per IP / email (e.g. express-rate-limit, Redis). Relates to **#64** (auth hardening).
2. **Tests** — HTTP integration tests for forgot/reset routes (mock mail); client RTL for **`PasswordResetPage`** / banner flow (**#24** E2E).
3. **Email product** — HTML templates, i18n, branded From; align **`SMTP_FROM`** with provider **#74** link-policy work (trusted sender domain).
4. **Audit** — **`UserActivity`** or security log for **`PASSWORD_RESET_REQUESTED`** / **`PASSWORD_RESET_COMPLETED`** (**#16**).
5. **Windows dev** — **`cross-env`** for **`PORT=3000`** in **`client/package.json`** if shell env syntax is a problem.
6. **Dependency noise** — **`[DEP0060] util._extend`** from CRA/webpack stack; upgrade path when **`react-scripts`** allows.
7. **Optional** — allow password reset without **OpenAI** for local dev (split “minimal API” vs full server) — low priority; server still **exits** without **`OPENAI_API_KEY`** today.

**Suggested GitHub comments (paste on issue):**

- **#31** — *Apr 2026: Password reset shipped — forgot-password email + `/reset-password` page + `AuthContext` helpers; see `server/READEME.md` auth section and `docs/status.md`. Epic remainder (profiles, OAuth, BYO LLM) still open.*
- **#63** — *Apr 2026: Extended `/api/auth` with `forgot-password` and `reset-password`; nodemailer + `APP_PUBLIC_ORIGIN` + SMTP env; `User` reset fields. Follow-ups: rate limits, audit, integration tests — `docs/github-backlog-issues.md` (Password reset section).*
- **#74** — *Apr 2026: Account password reset is separate from read-only **graph** share links (#39). Optional future: align “link expiry / password” story for **share** links with account reset UX; this slice is email + JWT session only.*
- **#64** — *Apr 2026: Forgot-password adds another unauthenticated POST — prioritize rate limiting + JWT verification work for `X-Mindmap-User-Id` as previously planned.*
- **#24** — *Apr 2026: Backlog — E2E password reset (sign in → forgot → mail mock or staging SMTP → reset form).*
- **#16** — *Apr 2026: Backlog — optional `UserActivity` rows for password reset request/complete (privacy-preserving summaries).*

### Backlog: Password reset — rate limits + tests + mail polish — GitHub **#78**

Tracked as **`https://github.com/wmmaguire/mind-map/issues/78`** (create manually if duplicate; do not re-file).

**Note (Apr 2026 — Mongo graph snapshots + library disk hygiene):** Saved graphs are **Mongo-authoritative** (`Graph.payload`, `metadata.filename`); **`POST /api/graphs/save`** does **not** write **`server/graphs/*.json`**. **`GET /api/graphs`** / **`GET /api/graphs/:filename`** read Mongo only. **One-off import:** `server/scripts/migrate-graphs-to-mongo.js` (requires **`MONGODB_URI`**). Scoped **`GET /api/files`** hides **`File`** rows whose bytes are missing on disk (ephemeral PaaS); **`GET /api/files/:filename`** uses string **`details`** + **`FILE_MISSING_ON_DISK`**. Client: **`apiRequest`** stringifies object errors; **`LibraryVisualize`** sets **`currentSource`** after save for **SHARE**; **`GuestIdentityBanner`** z-index vs graph FAB + **SHARE** label. Docs: **`server/READEME.md`**, **`docs/status.md`**.

**Follow-ups outside this change (add or extend GitHub issues; post suggested comments on refs below):**

1. **Durable uploads on PaaS** — `uploads/` is still local disk; redeploys can strand **`File`** rows without bytes. Options: object storage (S3/R2), GridFS, or Render **persistent disk**. Relates to **#20**, **#46**.
2. **Reconcile `File` collection** — background or admin job to delete or mark **`File`** docs when **`path`** is **`ENOENT`** (complements list-only filter).
3. **#44 update** — Orphan **`graphs/*.json`** scenario is **legacy**; new failure mode is Mongo-only (document failed or partial). Refresh **#44** description / acceptance.
4. **`Graph` schema indexes** — Mongoose may warn on duplicate index defs (`metadata.sessionUuid`, `metadata.userId`, `nodes.id`); dedupe **`server/models/graph.js`** vs **`schema.index()`**.
5. **JWT-verified `X-Mindmap-User-Id`** — still **#64**; header trust for listing/share/upload paths.

**Suggested GitHub comments (paste on issue):**

- **#20** — *Apr 2026: Graph snapshots moved to Mongo (`Graph.payload`); uploads + metadata still on disk—ephemeral hosts remain a risk; see `docs/github-backlog-issues.md` ops note.*
- **#32** — *Scoped file listing now skips rows missing on disk; stale `File` docs may still exist until reconcile (backlog).*
- **#39** — *Share mint/load unchanged by filename id; token persisted on `Graph` in Mongo only (no disk write for share rotation).*
- **#44** — *New saves: no `graphs/` write; orphan JSON only from legacy. Track Mongo save failures separately.*
- **#46** — *File list vs disk: API hides missing files; full reconciliation with Mongo is still open.*
- **#52** — *GuestIdentityBanner stacking raised (z-index 1195) above graph Actions FAB (1190), below Library mobile sidebar (1200).*

### Backlog: PaaS upload durability + `File` reconcile (suggested new issue if not merged into #20 / #46)

**Title:** `Backlog: Durable upload bytes + reconcile Mongo File docs when disk is ephemeral`

**Body:**

```markdown
## Context (Apr 2026)
Graph snapshots are Mongo-only (`Graph.payload`). **Uploads** still use local `uploads/` + `File` rows. Scoped `GET /api/files` hides rows whose file is missing on disk, but **orphan `File` documents** can remain after redeploys.

## Scope
1. **Product / infra:** object storage (S3/R2), GridFS, or persistent volume for raw bytes.
2. **Data hygiene:** job or admin path to delete/mark `File` docs when `path` is gone (complements list filter).
3. **Docs:** update `server/READEME.md` hybrid table when implemented.

Refs: #20 #46 #32 #64
```

**Note:** Server **#16** (database-backed user activity / `UserActivity` audit) is implemented in `server/models/userActivity.js`, `server/lib/recordUserActivity.js`, and **`server/READEME.md`** (persistence matrix). Follow-ups filed separately: **#44** (graph snapshot disk vs Mongo consistency — **partially superseded** by Mongo-only graph saves; see note above), **#45** (`UserActivity` ops: volume / retention / indexes).

**Note:** Server **#20** (hybrid persistence / source of truth) is documented in **`server/READEME.md`** → *Data consistency (hybrid persistence)*. Optional API follow-up: **#46** (align `GET /api/files` with Mongo `File` or reconciliation).

**Note:** Epic **#34** (server **`POST /api/transcribe` shipped — branch **`issue-34-audio-transcribe-pipeline`**, tip **`5b82d63`**) — OpenAI **`audio.transcriptions.create`**, **`OPENAI_TRANSCRIBE_MODEL`** / default **`whisper-1`**, **`server/routes/transcribe.js`**, **`TRANSCRIBE_COMPLETE`**. Client path extended by **#35** (**Record** + upload). Default response is **plain `transcript`**; **#58** adds opt-in **`verbose`** / **`segments`**. **Follow-ups:** **#59** (diarization), **#60** (HTTP integration tests for the route + mocked OpenAI), async/long-audio behavior, **#24** E2E.

**Note:** **#58** — optional **`verbose`** (multipart or query) → OpenAI **`response_format: verbose_json`**; JSON adds **`segments`** `{ start, end, text }` and optional **`duration`**. **`FileUpload`**: checkbox **Segment timestamps** (Whisper verbose via **`title`**) on the **Record** sub-tab only—inlined with **Start recording** / **Stop** / preview actions; **elapsed recording timer** (`m:ss`) while **`MediaRecorder`** is active; switching to **Upload file** clears **`verbose`** client state. Collapsible **Segment timings** list. Tests: **`server/routes/transcribe.test.mjs`** (pure helpers), **`FileUpload.test.jsx`** (verbose path mocks **`getUserMedia`**, **`MediaRecorder`**, **`URL.createObjectURL`**). **Out of scope for #58:** HTTP-level route tests (**#60**), browser E2E (**#24**), persisting segment JSON with uploads, word-level timestamps / SRT export, merged **#58**+**#59** response shape (see **`server/READEME.md`** §2b).

**Note:** **#59** — optional **speaker diarization** (**`gpt-4o-transcribe-diarize`**, **`diarized_json`**); **`whisper-1`** does not identify multiple speakers — see **`server/READEME.md`** §2b. When implemented, coordinate with **#58** segment fields so clients can show **time + speaker** without conflicting contracts.

**Note:** **#37** (epic — **NF—Graph intelligence**) — first slice: **growth budgets** + **`dryRun`** on **`POST /api/generate-node`** (no OpenAI); client **Preview budget** in Generate modal. **`GENERATE_NODE_MAX_NEW_NODES`** / **`GENERATE_NODE_MAX_SELECTED`**. Tests: **`server/lib/generateNodeBudget.test.mjs`**. Full presets/autopilot still backlog.

**Note:** **#60** — HTTP integration tests for **`POST /api/transcribe`** (Express + multer + mocked **`openai.audio.transcriptions.create`**), default vs **`verbose`** branches. See **`server/READEME.md`** §2b follow-ups.

**Note:** **#61** — optional product/API: persist **segment JSON** with uploads, **word-level** timing, or **SRT/VTT** export (**#58** UI is ephemeral until upload). LOW priority.

**Note:** **#62** — **Graph expansion modes:** dropdown to choose **manual generate** (current **`/api/generate-node`**) vs **multi-cycle randomized growth** (parameterized AI nodes per cycle, connections per node, cycle count; random attachment to existing nodes). Supersedes the cancelled **#37** budget-preview experiment; see GitHub **#62** for acceptance criteria and open questions.

### Graph discovery & navigation — GitHub **#38** (shipped) / **#73** (phase 2 backlog)

**Tracked as:** `https://github.com/wmmaguire/mind-map/issues/73` — *Backlog: Graph discovery & navigation — phase 2+ (post–#38 slice)*.

**Shipped (#38, branch `issue-38-discovery-navigation`):**

- **Label search** — Substring + case-fold on **`node.label`** only (**`client/src/utils/graphDiscovery.js`**: **`normalizeGraphLabel`**, **`nodesMatchingLabelQuery`**; tests **`graphDiscovery.test.js`**). Not semantic / embeddings.
- **Focus / fit** — **Focus next** match cycles **`createFocusZoomTransform`** (**d3.zoomIdentity**); **Show all** resets zoom-driven merge/split and fits the graph (**`resetCanvasViewRef`**).
- **Minimap** — Read-only overview + viewport rectangle; **`requestAnimationFrame`** throttling with main graph zoom (**`GraphVisualization`**, **`data-testid="graph-minimap"`**).
- **Chrome UI** — **`GraphChromeUiProvider`** (**`client/src/context/GraphChromeUiContext.jsx`**) persists **`playbackStripVisible`** and **`graphSearchBarVisible`** in **`localStorage`** (`mindmap.chrome.playbackStripVisible`, `mindmap.chrome.graphSearchBarVisible`, default **on**). **View** menu in **`GuestIdentityBanner`** toggles **Playback strip** and **Graph search**; **`GraphPlaybackBanner`** and **`GraphVisualization`** consume. Provider wraps the app in **`client/src/index.js`** (inside **`SessionProvider`** / **`AuthIdentityBridge`** per current tree).

**Backlog (#73 — outside current #38 scope; add comments on refs below):**

1. **Semantic search / jump** — Embeddings or server-side search; today keyword-only on **`label`**.
2. **Neighborhood focus** — Explicit “focus **N**-hop neighborhood” (not only single-node zoom).
3. **Saved lenses / filters** — Named persisted views (subset, layout, or query).
4. **Lightweight provenance panel** — Source/evidence per node or edge where data exists.
5. **Minimap interaction** — Click/drag on minimap to **pan** viewport (display-only today).
6. **Performance & scale** — Profile **medium/large** graphs (search + minimap **rAF**, merge/split + simulation).
7. **D3 / `updateVisualization` hardening** — Stale selections after merge/split; aligns with **#51**.
8. **Docs** — This section + **`client/README.md`** module bullets (supersedes #73 checklist item “Docs”).
9. **Read-only / share (#39)** — Product policy: default on/off for discovery bar + minimap for **`readOnly`** viewers (today available unless user hides **Search** via **View**); overlap **#74** share polish.

**Suggested GitHub comments (paste on open issues):**

- **#73** — *Apr 2026: Repo docs synced — `docs/github-backlog-issues.md` section *Graph discovery & navigation (#38 shipped / #73 backlog)* + `client/README.md` (`GraphChromeUiContext`, `graphDiscovery.js`, minimap/search). Shipped scope unchanged; follow-ups remain on #73.*
- **#38** — *Apr 2026: Doc pointer — discovery slice summarized in `docs/github-backlog-issues.md` under #73 section; phase 2 items stay on #73.*
- **#33** — *Apr 2026: View menu toggles graph chrome via `GraphChromeUiContext` (playback strip + search bar visibility, localStorage).*
- **#39** — *Apr 2026: Read-only viewers still get discovery search + minimap unless hidden via View — policy follow-up on #73 item 9 / #74.*
- **#51** — *Apr 2026: #73 lists D3/updateVisualization hardening post-merge/split as part of discovery/nav phase 2.*
- **#52** — *Apr 2026: Narrow layout + playback strip + search row — continue z-index / overflow polish as discovery grows (#73 minimap interaction, etc.).*
- **#57** — *Apr 2026: Discovery search + minimap a11y (live regions, minimap controls when interactive) — #73 follow-ups.*
- **#70** — *Apr 2026: Time-travel UX may intersect discovery (e.g. search during playback); #73 neighborhood/lenses are separate product tracks.*
- **#40** — *Apr 2026: Chrome toggles and discovery UI are part of shell/graph polish; optional toasts for search “no matches” align with #50.*

### Backlog: Interactive minimap — pan/zoom from overview (suggested if split from #73)

**Title:** `Backlog: Graph minimap — click/drag to pan viewport`

**Body:**

```markdown
## Context
#73 item 5: minimap is display-only today (`GraphVisualization`).

## Scope
- Hit-testing + map minimap coordinates to d3 zoom transform (pan; optional zoom).
- Keyboard / SR labels when minimap becomes interactive (#57).

Refs: #38 #73 #51 #57 #52
```

**Note:** **#68** / **#69** — **#68 (Apr 2026, partial ship on branch `issue-68-random-growth-strategy`):** UI label **Community evolution** (API still **`expansionAlgorithm: "randomizedGrowth"`**). Shipped: **`anchorStrategy`** slider (**random** / **lowCommunity** / **highCommunity**), **`existingGraphLinks`** for clustering-aware pools, optional **prune** (**`enableDeletions`**, **`deletionsPerCycle`**), default **`deleteStrategy`** = inverse of **`anchorStrategy`**, **`deletedNodeIds`** in responses, **`mergeGenerateResult`** client merge, unit tests (**`randomExpansionLinks`**, **`randomGrowthPrune`**, **`generateNodeBudget`**). **Still on #68 or follow-on tickets:** consolidated backlog **#87** (*Community evolution phase 2* — reproducible RNG, graph-safe prune, `dryRun` UI, operations/telemetry, E2E, richer metrics). **#69 (Apr 2026, branch `issue-69-explode-node`):** **`POST /api/explode-node`** + tooltip **Explode** (Wikipedia-backed dense subgraph from one anchor); see *Explode subgraph (#69)* below and **`server/READEME.md`** §5c. Refs: `https://github.com/wmmaguire/mind-map/issues/68`, `https://github.com/wmmaguire/mind-map/issues/87`, `https://github.com/wmmaguire/mind-map/issues/69`. **Related:** *Backlog: Node image / Wikipedia thumbnail* at end of this file.

### Explode subgraph (#69) — shipped slice + follow-ups (Apr 2026, branch `issue-69-explode-node`)

**Shipped (server):** **`POST /api/explode-node`** — body **`targetNodeId`**, **`existingGraphNodes`**, optional **`numNodes`** (**2–6**, default **4**), optional **`generationContext`** (same cap as generate-node). **`runExplodeNodeCore`** (**`server/lib/explodeNode.js`**) validates new ids/labels (**`validateNewNodesAgainstExisting`**), enforces **explosion topology** (clique among new nodes + bridge edges to anchor), Wikipedia extract when **`wikiUrl`** missing (**`repairAnalyzeGraphWikiUrls`** path), **`parseGraphJsonFromCompletion`**, **`applySynthesizedRelationships`**, thumbnails, **`ensureGraphLinkStrength`**. Tests: **`server/lib/explodeNode.test.mjs`**. Related: **`generateBranch`**, **`generateBranchRequest`**, **`linkStrength`**, **`graphNodeIdValidation`**, **`fixGraphNodesIdIndex`**, Mongo index script **`drop-graph-nodes-id-unique-index.js`** as applicable to graph model.

**Shipped (client):** Primary control **Explode** on the **selected-node tooltip** (**`GraphVisualization`**); duplicate entry removed from **Actions → AI Generation**. Tooltip: **`numNodes`** range **2–6**, shared **guidance** preset + custom text (**`generationGuidance.js`**, **`GenerationGuidanceFields`**). **`mergeGenerateNodeResponse`** merges API result; anchor may get **`explosionExpandedAt`** so repeat explode is blocked until reload. While the request runs: **stretch/warp** visual + **disjoint-style** community sim reheat (**`COMMUNITY_SIM_*_EXPLODE`** tuning). **`GraphVisualization.test.js`** covers tooltip control and read-only hiding. **`pickCommunityAnchorNode`** / **`clusterAnchor.js`** support cluster-chip anchoring (#81).

**Follow-ups (outside this ticket — add comments on open issues; file new GitHub issues if missing):**

1. **E2E / RTL** — Full flow: select node → tooltip Explode → assert **`POST /api/explode-node`** and graph delta (**#24**); read-only share: assert control hidden (**#39**).
2. **Telemetry** — **`POST /api/operations`** payload consistency for **`GENERATE`** / **`expansionAlgorithm: explosion`** (duration, error shape, selected anchor id); dashboard queries (**#16**).
3. **Error UX** — Replace **`window.alert`** on explode failure with non-blocking toast/banner (**#50**, **#40**).
4. **Playback / layout** — Saved **`x`/`y`** and library scrub: optional follow-up to reduce force-layout drift or respect persisted coordinates without breaking interactive edit mode; prior **read-only sim freeze** experiment was reverted — needs a narrower design if revisited (**#36**, **#86**).
5. **Quota / cost** — Burst **OpenAI** calls (explode + branch + multi-cycle) — product limits or UI copy (**#37**, ops).
6. **`explosionExpandedAt`** — Document persistence in **`Graph.payload`** for multi-session “already expanded” semantics; optional server enforcement (**#69**).
7. **D3 lifecycle** — **`useEffect`** dependency and simulation cleanup audits (**#51**).
8. **a11y** — Tooltip explode controls (slider, preset) + busy state (**#57**).

**Suggested GitHub comments (paste on issue):**

- **#69** — *Apr 2026: Shipped on `issue-69-explode-node` — `POST /api/explode-node`, `explodeNode.js`, tooltip Explode + numNodes 2–6 + guidance; stretch animation + sim reheat; `explosionExpandedAt` gate. Docs: `server/READEME.md` §5c, `client/README.md`, `docs/github-backlog-issues.md` (Explode subgraph section). Follow-ups listed there (E2E #24, telemetry #16, error UX #50, playback #36/#86, etc.).*
- **#27** — *Apr 2026: Explode is tooltip-only (not duplicated under Actions AI Generation).*
- **#39** — *Apr 2026: Share read-only hides Explode; confirm acceptance in E2E #24.*
- **#36** — *Apr 2026: Explode merge uses same playback timestamps as other generates; optional future: calmer layout when scrubbing saved graphs (see backlog Explode follow-up #4).*
- **#51** — *Apr 2026: Explode adds sim reheat + stretch animation paths — include in D3 effect audit.*
- **#68** — *Apr 2026: #69 shipped as separate API (`/api/explode-node`); community evolution remains `randomizedGrowth` on `/api/generate-node`.*
- **#24** — *Apr 2026: Backlog — E2E/RTL: tooltip Explode happy path + read-only negative.*

### Backlog: Explode subgraph — phase 2 (suggested new issue if not merged into #69)

**Title:** `Backlog: Explode subgraph — telemetry, E2E, and layout polish`

**Body:**

```markdown
## Context (Apr 2026)
#69 shipped `POST /api/explode-node` and client tooltip Explode. Follow-ups: operations shape, browser E2E, non-blocking errors, optional playback/layout behavior when `readOnly` or scrubbing.

## Scope
1. Integration / E2E tests (#24).
2. `GraphOperation` / `UserActivity` details for explode (#16).
3. Toast vs `window.alert` on failure (#50).
4. Optional: persist or server-enforce `explosionExpandedAt`; rate limits (#37).

Refs: #69 #24 #16 #50 #36 #86 #37
```

**Note:** **#81** — **Cluster thumbnail chips** (merged community view): each cluster renders one chip near its centroid, anchored to the **most-connected node** within the cluster (within-cluster degree). Clicking the chip focuses/zooms to that anchor. Follow-ups (overlap/collision, better heuristics incl. **#80**, perf, focus semantics, overlay rendering, a11y): **#91**.

**Note:** **#36 (timestamp playback, Apr 2026)** — **Graph time travel (client slice):** replay uses **per-entity** **`createdAt`** (fallback **`timestamp`**) and **`buildGraphAtPlaybackTime`** in **`graphPlayback.js`**; **`LibraryVisualize`** keeps **`committedGraph`** + **`playbackStepIndex`**. **UI:** **`GraphPlaybackBanner`** (second strip in **`App.js`**, below **`GuestIdentityBanner`**) — **save**, **◀** / **▶**, range slider, **Play** / **Pause**, **speed** (interval **1800 ms / speed**, persisted in **`localStorage`**), **share** (**#39**). **`GraphHistoryUiContext`** exposes **`payload`**, **`sharePayload`**, **`savePayload`**. Identity banner is **title-only** (graph title **blank** when unnamed). **`graphHistory.js`** snapshot **reducer** is **not** used for this path (kept for **`normalizeGraphSnapshot`** / **`materializeGraphSnapshot`** + **`graphHistory.test.js`**). **Follow-ups:** GitHub **#70** (*Backlog: Graph time travel phase 2+*) and *Backlog: Graph playback implementation follow-ups* below. Suggested comments: **#36**, **#33**, **#39**, **#29**, **#16**, **#24** / **#52** / **#56** / **#57** / **#70**.

**Note:** **#39 (read-only share links, Apr 2026)** — **First slice:** mint **`POST /api/graphs/:filename/share-read-token`** (owner header = **`metadata.userId`**); load **`GET /api/graphs/:filename?shareToken=`** with constant-time compare; **`redactGraphMetadataForResponse`** hides **`shareReadToken`** and (for share viewers) **`dbId`**. Client: **`/visualize?shareGraph=&shareToken=`**, **`shareViewerMode`**, **`readOnly`** graph (**no Actions FAB** / edits). **Write hardening (branch `issue-39-sharing-collaboration`):** **`POST /api/graphs/save`** returns **403** if **`?shareToken=`** is present (**`SHARE_READ_ONLY`**); **`stripShareSecretFromSaveMetadata`** removes **`shareReadToken`** from save JSON so clients cannot set the secret via save. Tests: **`lib/graphShareRead.test.mjs`**, **`routes/graphs.share.integration.test.mjs`** (temp **`DATA_DIR`**, **`mongoose.bufferCommands`** toggled for fast failure without Mongo). **`server/READEME.md`** §6 documents **future graph comments** (owner / collaborator / share viewer / **`/api/feedback`** scope). **Mobile copy (Apr 2026):** **`LibraryVisualize`** share flow uses an in-app fallback when **`navigator.clipboard.writeText`** fails after the async mint (iOS Safari / some WebViews). Remaining polish: GitHub **#85**. **Epic remainder** (expiry, passwords, revoke UX, collaboration, audit, JWT-bound mint): GitHub **#74**.

### Backlog: Sharing & collaboration phase 2+ — GitHub **#74**

**Title:** `Backlog: Sharing & collaboration — phase 2+ (post–#39 read-only slice)`

**Body:**

```markdown
## Context
**#39** shipped **read-only** snapshot sharing (secret query token + owner mint route + client **`readOnly`**). Apr 2026 hardening: save rejects **`?shareToken=`** and strips **`metadata.shareReadToken`** from save bodies; integration test + permission sketch for future **comments** in **`server/READEME.md`** §6.

## Backlog (out of scope for current #39 implementation)

1. **Link policy** — Optional **expiry**, **password**, single-use links; **revoke** without rotating filename; owner UI for active links.
2. **AuthZ hardening** — Bind mint/list/revoke to **JWT-verified** identity (**#64**); rate-limit **`?shareToken=`** guesses on **`GET /api/graphs/:filename`**.
3. **Write-surface audit** — Confirm no other **`POST`/`PATCH`/`DELETE`** paths accept share secrets or leak owner-only ops to viewers (e.g. **`/api/generate-node`**, **`/api/operations`** with stolen session).
4. **Graph comments / annotations** — Threaded discussion, permissions per **`server/READEME.md`** §6 sketch (owner vs collaborator vs share viewer).
5. **Version handoff** — Pair **read-only** links with **#70** server revisions / “view at timestamp” for recipients.
6. **Telemetry / audit** — Distinguish **share** opens in **`UserActivity`** / **`GraphView`** without exposing **`shareReadToken`** in logs.
7. **E2E** — Playwright/Cypress: mint link → incognito open → assert no save/actions (**#24**).
8. **UX polish** — Clear errors for expired/invalid token; optional “exit share mode” affordance (**#40**, **#50**).
9. **Mobile share link copy** — iOS/WebView clipboard quirks after async mint; in-app **Share link** modal shipped Apr 2026—follow a11y/tests/polish on **#85**.

Refs: #39 #33 #36 #40 #50 #64 #70 #24 #85
```

### Backlog: Graph time travel phase 2+ — GitHub **#70**

**Title:** `Backlog: Graph time travel phase 2+ (persist, diff, UX)`

**Body:**

```markdown
## Context
**#36** now uses **timestamp-based** replay (**`graphPlayback.js`**) + **`GraphPlaybackBanner`** (save / scrubber / speed / share). This issue tracks durable and product follow-ons **outside** that slice.

## Backlog (out of scope for current #36 implementation)

1. **Server-persisted revisions** — Versioned graph snapshots (API list/load by revision); optional hydrate last *N* into the client scrubber.
2. **Event-log replay** — Align append-only ops with **`GraphOperation` / `UserActivity`** (**#16**) for compact history and audit.
3. **Diff / compare mode** — Side-by-side or highlighted delta between two revisions (depends on persistence).
4. **Play timing** — **Done (Apr 2026):** speed select + **`localStorage`** (`mindmap.graphHistoryPlaySpeed`). **Follow-on:** account-synced preference or custom ms input.
5. **Narrow viewport / mobile** — Playback strip density + overflow (**#33**, **#52**); optional move controls to graph chrome.
6. **Focus & a11y** — **`aria-live`** announcements on history step (**#57**); focus order when opening **/visualize** (**#56**).
7. **Tests** — RTL / integration for **`GraphPlaybackBanner`** / **`GraphHistoryBannerControls`** + **`LibraryVisualize`** registration (**#24**).
8. **Optional: pause on graph interaction** — Auto-pause **Play** when user edits the graph to avoid fighting auto-advance.
9. **`graphHistory.js` cleanup** — Document or remove unused **reducer** from the app path if tests migrate to **`graphPlayback`**-only fixtures; keep normalize/materialize if still needed.

Refs: #36 #16 #24 #33 #52 #56 #57
```

**Note:** **#71** — **Backlog: Graph save — optional server validation of entity timestamps (`createdAt`)** — optional normalize/validate on **`POST /api/graphs/save`**; complements **#70** server revisions. See `https://github.com/wmmaguire/mind-map/issues/71`.

### Suggested issue comments (#36 timestamp playback)

**On #36 — comment body:**

```markdown
**Update (Apr 2026):** Replay is **timestamp-based** (`graphPlayback.js`, per-entity `createdAt` / legacy `timestamp`), not the earlier in-memory snapshot stack. **`GraphPlaybackBanner`** (second strip below **`GuestIdentityBanner`**) hosts **save**, **Play** / scrubber / **speed** (persisted), and **share**; **`GraphHistoryUiContext`** registers `payload`, `sharePayload`, `savePayload`. Identity banner stays **title-only**; title is **blank** when no graph name. **`graphHistory.js`** reducer remains for normalize/materialize + tests only. Docs: **`docs/graph-time-travel-spike.md`**. Remaining: **#70** and implementation follow-ups in **`docs/github-backlog-issues.md`**.
```

**On #33 — comment body:**

```markdown
**Update (#36, Apr 2026):** Graph **replay / save / share** moved to **`GraphPlaybackBanner`** (dedicated second strip). **`GuestIdentityBanner`** keeps **graph title** + auth + mobile Library only—reduces crowding vs stacking history under the title. Narrow-viewport overflow for the **playback** strip is still a polish item (**#52**, **#70**).
```

**On #39 — comment body:**

```markdown
**Update (#36 / shell):** **Copy read-only link** for signed-in owners lives on **`GraphPlaybackBanner`** (alongside save + playback), using the same **`GraphHistoryUiContext`** **`sharePayload`** bridge from **`LibraryVisualize`**. Recipient URL + **`readOnly`** behavior unchanged.
```

**On #29 — comment body:**

```markdown
**Related (#36):** Graph **history** replay controls share the top shell with the existing **`graph-edit-mode-chip`** (bottom) for modal/generate flows—two different “status” surfaces; consider unified UX in a later polish pass (**#56**).
```

**On #16 — comment body:**

```markdown
**Future hook (#36):** Client replay is **timestamp-ordered** graph state (no server revision list yet). A durable **#36** phase 2 could append compact **graph edit** events (or snapshot refs) alongside existing **`UserActivity` / `GraphOperation`** telemetry for audit and optional server-side replay. Product scope for that slice: **#70**.
```

**On #70 — comment body (sync checklist with implementation):**

```markdown
**Doc sync (Apr 2026):** **#70** body in **`docs/github-backlog-issues.md`** was updated: **Play** speed is now **configurable** (client speed select + `localStorage`); items **5–9** remain (mobile strip, a11y, tests, pause-on-edit, `graphHistory.js` cleanup). Timestamp replay + **`GraphPlaybackBanner`** are tracked in **#36** / **`docs/graph-time-travel-spike.md`**.
```

**Note:** **#62 (client UX follow-on, Apr 2026)** — **Generate** modal: primary button **Apply** (loading **Applying…**); **inline validation** under the title when manual mode has no highlighted anchors at open time or when randomized mode needs at least as many graph nodes as **connections per new node**; on valid **Apply** the modal **closes immediately** and the **`graph-edit-mode-chip`** shows **Generating (AI)** with **`aria-busy`**, an **animated progress bar** (**indeterminate** for manual and before the first randomized cycle; **determinate** by cycle for multi-cycle runs), and **Stop after this cycle** on the chip for randomized mode (no **Cancel** on the chip during generate—intentional for now). **#37** **`dryRun` / Preview budget** is **not** wired in this modal anymore; caps remain enforced server-side. **Failure** paths still use **`window.alert`**. **Follow-ups:** file a new backlog issue using the template in *Suggested GitHub backlog issue (post–#62)* below, and paste the *Suggested issue comments* onto **#62**, **#29**, and **#37** (or ask a maintainer with GitHub CLI/auth).

### Suggested GitHub backlog issue (post–#62) — create manually

**Title:** `Backlog: Graph AI generate UX polish (post–#62)`

**Body:**

```markdown
## Context
Follow-ups from **#62** expansion modes and recent **Generate** modal / on-canvas chip work (Apply, inline validation, auto-close on submit, **`graph-edit-mode-chip`** progress bar, Stop after this cycle on the chip).

## Backlog (out of scope for the #62 implementation slice)

1. **Non-blocking errors** — Replace `window.alert` on generate failure with toast or inline message (align with **#50** / general **#22** error UX).
2. **Browser E2E** (**#24**) — Flow: open Generate → **Apply** → modal closes immediately → chip shows **Generating** + animated bar → multi-cycle: bar advances per cycle → **Stop after this cycle** on chip.
3. **`dryRun` / Preview budget** (**#37**) — Product decision: **re-expose** client “Preview budget” (`dryRun: true`) in the Generate modal, or document **server-only** `dryRun` and keep UI minimal.
4. **Cancel / abort in-flight manual generate** — Today only randomized mode has **Stop after this cycle**; manual has no Abort. Consider **`AbortController`** + clear UX if we allow cancel mid-request.
5. **Intra-cycle progress** — Determinate bar reflects **completed / total cycles** only; finer progress needs API/streaming changes.
6. **Unit tests** — Extend **`GraphVisualization.test.js`**: validation messages, disabled **Apply**, generating chip / **`role="progressbar"`** when applicable.
7. **Screen reader / live updates** (**#57**) — e.g. **`aria-live`** announcements when cycle advances; verify focus management after modal **auto-close** on Apply (related polish **#56**).

Refs: #62 #37 #24 #50 #57 #56
```

### Suggested issue comments (paste into GitHub)

**On #62 — comment body:**

```markdown
**Client update (Apr 2026):** Generate modal UX polish on top of expansion modes:
- Primary submit is **Apply** (shows **Applying…** while the request is in flight, though the modal now **auto-closes** on valid submit).
- **Inline validation** under the modal title when manual mode was opened without highlights, or when randomized mode needs at least as many graph nodes as **connections per new node**.
- After **Apply**, progress is on the fixed **`graph-edit-mode-chip`**: **Generating (AI)** + **animated progress bar** (indeterminate for manual / before first cycle; determinate by cycle for multi-cycle). **Stop after this cycle** moved to the chip for randomized runs.
- **Follow-ups** (alerts vs toast, E2E, optional `dryRun` UI, abort manual, tests, a11y) are listed in a dedicated backlog issue—see *Suggested GitHub backlog issue (post–#62)* in `docs/github-backlog-issues.md` (or the linked issue once filed).
```

**On #29 — comment body:**

```markdown
**Update:** The **`graph-edit-mode-chip`** is no longer only for “modal open” flows. While **`POST /api/generate-node`** runs after **Apply**, the chip shows **Generating (AI)** + progress UI even though the Generate modal has **auto-closed**, so users still get on-canvas status without the overlay. Other modal flows (add concept, relationship, connect) unchanged.
```

**On #37 — comment body:**

```markdown
**Client note:** The **Generate** modal in **`GraphVisualization`** no longer exposes **Preview budget** / **`dryRun: true`**; server-side **`dryRun`** and budget caps from **#37** remain available to API clients. If we want budget preview back in the UI, track it under the post–**#62** polish backlog (or a dedicated ticket) so product + API contract stay aligned.
```

**Note:** Client **#35** (branch **`issue-35-fileupload-audio-recorder`**, tip **`0d6d47d`**) — **`FileUpload`** **Audio → transcript**: sub-tabs **Upload file** | **Record** (`getUserMedia`, **`MediaRecorder`**, preview, discard / record again), **`utils/audioRecording.js`** (25 MB preflight). Depends on **#34**. **#58** adds optional segment timings UI (**details**); **verbose** checkbox lives on **Record** only (see **#58** note). **Out of scope:** **#24** (Playwright/Cypress with mic + verbose path), Safari **`webm`** interop hardening, optional waveform UI, a11y polish for segment list (**#57**-related). **Update:** unit tests now mock **`MediaRecorder`** for the verbose transcribe path.

**Note:** Client **#21** — namespaced **union** of per-file analyze graphs (`client/src/utils/mergeGraphs.js`); merged view is disjoint subgraphs by default. **`mergeAnalyzedGraphs`** assigns **one shared `createdAt` / `timestamp`** per **Apply** for all merged nodes and links (playback **#36**). Per-entity chronology from source text is **#72**.

**Note:** **#47** — optional **fusion** into one fully connected graph and **splitting** large graphs (topics, communities, size, etc.); builds on **#21** union semantics. **#72** may inform how time-ordered or fused graphs set **`createdAt`**.

**Note:** **#48** — **batch analyze** resilience (partial failures, per-file status, retry vs **#22** general error handling). **Update:** Library analyze still uses **`Promise.all`** — one failed file fails the whole batch; partial success remains backlog here.

**Note:** Client **#22** (merged on branch `issue-22-unify-loading-errors`) adds **`client/src/api/http.js`** — `apiRequest()`, `ApiError`, `getApiErrorMessage()`, `isNetworkError()` — so all prior `fetch('/api/...')` call sites share **`apiUrl()`** from `config.js` and consistent JSON error bodies. Jest tests: **`client/src/api/http.test.js`**. This addresses **transport-level** loading/error consistency; UI-level work is tracked separately.

**Note:** **Repo lint** — Root **`npm run lint`** runs ESLint for **`client/src`** and **`server/`**. Server config is **`server/eslint.config.mjs`** (flat config, **`globals.node`**). **`GraphVisualization`** uses a scoped **`eslint-disable-next-line react-hooks/exhaustive-deps`** pending a proper fix tracked in **#51**.

**Note:** Client **#25** — Library **sidebar** (resizable width, persisted **Files** / **Graphs** sections), **full-viewport** overlay when the library is open on narrow screens. **Update (post–#33):** **Mobile “open library”** is a compact control in **`GuestIdentityBanner`** (**`LibraryUiContext`**) instead of a fixed **`48px`** left edge strip; **graph title** lives in the same banner (**`GraphTitleContext`**), not a separate **visualization header** row above the graph (**`VISUALIZATION_HEADER_PX`** removed from **`LibraryVisualize`**). **`GraphVisualization`** receives explicit **`width` / `height`** (full panel height under the shell). **Update (post–#28):** Legacy global mobile **`.graph-container`** rules in **`GraphVisualization.css`** were **deleted**; graph actions use the **Actions FAB** / **#graph-action-menu** only (**#27**). **Library** still uses **`.library-graph-mount`** + **`.library-visualize`** scoped overrides — **#55** optional audit. Implementation: **`LibraryVisualize.js`**, **`LibraryVisualize.css`**, **`GuestIdentityBanner.jsx`**. Follow-ups: **#53** (remaining flex/layout polish), **#52** (z-index vs FAB / banner), **#55** (optional `!important` cleanup).

**Note:** Client **#27** (graph edit modes / actions UI) — Implemented: **mutually exclusive** edit intent, **Escape** clears modals and selection; **fixed toolbar removed** in favor of **`Actions` FAB** (top-right, **`z-index: 1190`** so it stays **below** the mobile library overlay **`1200`** and does not cover the library **Close** button), **`#graph-action-menu`** with header + **×**, **right-click** on the SVG opens the same menu; **no long-press on the canvas** (avoids conflicting with pan/zoom and node/link clicks). **Menu actions** use a **snapshot** of selection at open time. **Add Node** with one or more nodes highlighted prompts for **relationship text to each** before new links are created. Tests: **`client/src/components/GraphVisualization.test.js`**. **Docs:** **`client/README.md`** (module + manual E2E steps).

**Note:** Client **#28** (mobile `.edit-controls` / toolbar CSS) — **CSS-only cleanup** post–**#27**: removed obsolete **controls-panel** / **edit-controls** / legacy mobile **`.graph-container`** positioning, unused helper/deletable styles, and duplicate rules in **`GraphVisualization.css`**. **`LibraryVisualize.css`**: mobile **`.visualization-panel`** no longer reserves **25vh** for the removed bottom sheet (uses **`safe-area-inset-bottom`**). **`npm run lint`** + client Jest pass. Manual iOS/Android smoke and validation checklist in the issue remain **out of scope** for the cleanup commit; **touch/a11y** for the Actions menu/FAB is implemented in **#30** (branch **`issue-30-touch-a11y`**). Optional follow-up: reduce **`.library-graph-mount`** **`!important`** overrides now that globals are gone — **#55**.

**Note:** Client **#29** (tool hierarchy + on-canvas feedback) — Implemented on branch **`issue-29-tool-hierarchy`**: **Actions** menu split into **Generate (AI)** vs **Edit graph** with **accordion** toggles (chevron, **`aria-expanded`**, pattern aligned with **`LibraryVisualize`** **`library-section__toggle`**); **link-flow** hint for **Add Relationship**; **Delete** kept with other edit actions; menu **`max-height`** + **scroll** for short viewports; fixed bottom **`graph-edit-mode-chip`** (`role="status"`) when generate / add / relationship / connect flows are active with **Cancel**. Tests in **`GraphVisualization.test.js`**. **Follow-ups (outside #29):** full **z-index** pass with chip **`1195`** — **#52**; browser **E2E** — **#24**; optional accordion **defaults / persistence / focus** — **#56**. **Touch targets + menu a11y** — **#30** (see note below).

**Note:** Client **#30** (touch targets + a11y for graph edit tools) — Implemented on branch **`issue-30-touch-a11y`** (commit **`ce5877b`**): **`#graph-action-menu`** uses **`role="group"`** (not **`role="menu"`**), **`aria-labelledby`** + **`aria-describedby`**; **Actions** FAB has **`aria-haspopup="true"`**; opening the menu moves focus to the **Close** control (**`setTimeout(0)`** for JSDOM/tests); decorative emoji icons in menu actions are **`aria-hidden`** with visible label text; **`.graph-action-menu__action`** and **`.graph-action-menu__close`** meet **≥44px** touch targets (mobile menu actions **48px** height at **≤768px**); pill buttons under **`.graph-visualization-container`** use **min-height 44px** on narrow viewports. Tests: **`GraphVisualization.test.js`** (focus + **group** role). **Still backlog:** D3 **SVG canvas** screen-reader / node semantics — **#57**; full stacking **#52**; **E2E** **#24**; optional menu focus polish **#56**; D3 **`useEffect`** **#51**.

**Note:** Client **#31** (accounts / identity epic — **in-progress foundation** on branch **`issue-31-guest-identity-foundation`**) — **Guest identity:** **`client/src/context/IdentityContext.jsx`** (`IdentityProvider`, **`useIdentity()`**, `identityKind: 'guest'`, `isRegistered: false`); **`GuestIdentityBanner`** in **`App.js`**; **`index.js`** wraps **`IdentityProvider`** inside **`SessionProvider`**. Commit **`2887b26`**. Tests: **`IdentityContext.test.jsx`**, **`App.test.js`**, **`criticalPath.integration.test.js`**. **Library Actions FAB placement:** **`GraphVisualization`** accepts **`actionsFabPlacement`**: **`fixedViewport`** (default: **`position: fixed`** top-right of the window, used for non-Library routes) vs **`libraryGraphMount`** (**`LibraryVisualize`** passes this): FAB stays inside **`.graph-visualization-container`** with **`position: absolute`** top-right over the **SVG** (class **`graph-actions-fab--library-graph-mount`**, scoped in **`LibraryVisualize.css`**), not in the **visualization title** bar. Commit **`22cb6ac`**. A short-lived **portal-into-header** experiment (**`bc0b3cc`**) was **reverted** in favor of graph-anchored placement. **Post–#33:** the Library **graph title** moved to **`GuestIdentityBanner`** via **`GraphTitleContext`**; **`VISUALIZATION_HEADER_PX`** was removed from **`LibraryVisualize`** (full-height graph panel). **Still backlog (outside this foundation slice):** full **sign-in / OAuth** — continues under **#33** / future epic; **`ResizeObserver`** / flex-only layout polish — **#53**; full **z-index** pass — **#52**; browser **E2E** — **#24**; **`VisualizationPage`** save payload vs server — **#49**.

**Note:** Client **#33** (Library + accounts UI — branch **`issue-33-library-accounts-ui`**, docs at **`f430bae`**) — **`apiRequest`** optional **`auth: { userId }`** → **`X-Mindmap-User-Id`** (**`http.js`**); **`IdentityProvider`** supports optional **`initialRegisteredUserId`** / **`REACT_APP_MINDMAP_USER_ID`** and dev **`setDevRegisteredUserId`**; **`LibraryVisualize`** + modal **`Library.js`** pass mindmap auth on list/analyze/save/delete paths; save adds **`metadata.userId`** when registered. **UI:** **`LibrarySidebar`** / **`LibrarySourcesPanel`**; **`GuestIdentityBanner`** — graph title (**`GraphTitleContext`**), sign-in / account menu (**#63**), shell rails (**#40**), **Library** (**`LibraryUiContext`**). **`LibraryAccountChip`** removed in **#40** (account in banner only). **Tests:** wrap **`GraphTitleProvider`** + **`LibraryUiProvider`** where needed. **Out of scope / follow-ups:** real **OAuth / bearer** tokens; **E2E** (**#24**) for **`/visualize`** banner + library open; **a11y** review of banner **menu**.

**Note:** Server **#32** (user-scoped file & graph listing) — Implemented **`67677b4`** on branch **`issue-32-user-scoped-listings`**, extended on **`issue-63-auth-registration-login`** with **account isolation**: **`GET /api/files?sessionId=`** returns only **guest** rows (no non-empty **`File.userId`**); **`GET /api/graphs?sessionId=`** skips graph JSON with **`metadata.userId`**; **`GET/DELETE`** by filename enforce owner checks for account-owned resources (**`server/READEME.md`** §3). **`GET /api/files`**: Mongo **`File.find`** by **`sessionId`** (guest) or **`userId`** (header/query); legacy unscoped read of **`metadata/`** if no query. **`GET /api/graphs`**: filters disk JSON accordingly. **`POST /api/upload`** sets **`File.userId`** when **`X-Mindmap-User-Id`** is sent (**#63**). **Out of scope / follow-ups:** **#64** (JWT-verified owner vs **`X-Mindmap-User-Id`**), **#65** (gate legacy unscoped **`GET /api/files`**), **#66** (authorize **`POST /api/analyze`**); guest → account **migration** of legacy session files — product; automated tests — **#24**; Mongo vs **`metadata/`** reconciliation — **#46**; sharing epic — future.

**Note:** **#63** (registration / login / profile + library integration — branch **`issue-63-auth-registration-login`**) — Server: **`User`** model, **`POST/GET/PATCH /api/auth/*`**, httpOnly **`mindmap_auth`** JWT cookie, **`PATCH /api/me`** for display name; **`POST /upload`** + **`graphs/save`** attach **`userId`** from header; listing/read/delete rules above. Client: **`AuthProvider`**, **`AuthIdentityBridge`**, **`GuestIdentityBanner`** (sign-in modal, user settings, sign out, account rail chip — **#40**), **`LibraryVisualize`** / **`Library.js`** / **`FileUpload`** pass **`auth: { userId }`**. **`LibraryAccountChip`** removed (**#40**). **Removed:** redundant **Guest** label; dev **End preview** menu item (refresh clears preview state). **Docs:** **`server/READEME.md`**, **`client/README.md`**, **`docs/status.md`**, this file. **Follow-ups outside #63:** **#64**, **#65**, **#66**; OAuth — **#33** / future epic.

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
| **#72** | **Analyze — text-derived chronology for playback** — distinct **`createdAt` / `timestamp`** per node/link from extracted text order or dates; complements batch timestamp today. See *Suggested backlog issue #72* below. |

*Issue numbers are from the batch created in-repo (March 2026); adjust if yours differ.*

### Suggested backlog issue #72 (create on GitHub if not filed)

**Title:** `Backlog: Analyze — text-derived chronology for playback (per-entity createdAt)`

**Body:**

```markdown
## Context
Library **Apply** assigns one **batch** `createdAt`/`timestamp` to every node/link from `mergeAnalyzedGraphs` so **#36** treats the whole text-import as one playback step.

## Scope (future)
- Extract dates or narrative order from source text (or model-returned fields) and map to **distinct** playback times per node/link.
- Coordinate with **#70** / **#71** if server-persisted revisions validate timestamps.

## Related follow-ups (outside analyze quality slice)
- **Performance:** parallelize or cache Wikipedia **repairAnalyzeGraphWikiUrls** HTTP work (sequential per node today).
- **Parity:** optional second-pass **relationship synthesis** for **`POST /api/analyze`** (like generate-node) — product decision.

Refs: #21 #36 #47 #48 #66 #70 #71
```

### Suggested GitHub issue comments (analyze / guidance / playback, Apr 2026)

Paste into GitHub as needed:

**On #21 — comment body:**

```markdown
**Update (Apr 2026):** `mergeAnalyzedGraphs` still namespaces ids per file; it now sets **one shared `createdAt`/`timestamp`** per **Apply** for all merged entities. Optional **#47** fusion remains separate. **#72** tracks **per-entity** times from text later.
```

**On #36 — comment body:**

```markdown
**Update (Apr 2026):** Text-from-library analyze uses a **single playback time** for the whole batch (one scrubber step per Apply). **#72** covers **ordering inside** a batch from text-derived chronology.
```

**On #48 — comment body:**

```markdown
**Update (Apr 2026):** Analyze still uses `Promise.all` — one failed file fails the whole batch; partial success / per-file status remains in scope for this issue.
```

**On #66 — comment body:**

```markdown
**Update (Apr 2026):** `POST /api/analyze` still relies on session + file resolution; verify **mindmap_auth** / ownership vs **X-Mindmap-User-Id** for production hardening remains open (**#64** related).
```

**On #47 — comment body:**

```markdown
**Update (Apr 2026):** Disjoint union + shared batch timestamp unchanged; **#72** may inform fused or time-ordered graphs and `createdAt` assignment.
```

### GitHub **#40** — library empty graph + shell navigation (Apr 2026)

**Shipped (branch `issue-40-library-graph-empty-state`):**

- **`GraphVisualization`**: prop **`emptyStateVariant`** (`default` | `library`); when the graph has **no nodes** and **`readOnly`** is false, an accessible **empty-state** region explains how to add concepts (library copy is a short ordered list). **Share viewers** see a compact read-only empty status instead. **`LibraryVisualize`** passes **`library`** except in **`shareViewerMode`**.
- **Docked tooltip**: **`graph-canvas-tooltip`** is positioned **beside** the clicked node/link (clamped inside the graph canvas) instead of a fixed corner.
- **`GuestIdentityBanner`**: optional **`onOpenUpload`** (from **`App`**) drives a shell **Upload** chip (hidden in **`shareViewerMode`**). Leading rails: **Home** (when not on `/`), **Visualize** (on `/`), **Library** (on `/visualize`). **Share link** moved into the **View** dropdown. Account trigger restyled as a rail chip (**👤** + label). **`LibraryAccountChip`** removed from the library sidebar—identity is banner-only.
- **`LibraryUiContext`**: **`registerMobileLibraryRail(active, openFn)`** no longer exposes **`mobileRailVisible`**; **`LibraryVisualize`** registers **`active: true`** whenever mounted so the banner can show **Library** on **`/visualize`** without a separate visibility flag.
- **`LibraryVisualize`**: desktop sidebar width is **capped** so the graph viewport keeps at least **~200px**; **mobile** library drawer: persisted width (**`localStorage`**), optional maximize, drag-to-dismiss when released below **~140px**; **Graphs** list filtered/sorted with **`getFilteredSortedGraphs`** (same query/sort keys as files).
- **`LibrarySourcesPanel` / `LibrarySidebar`**: empty-state CTAs (**Home**, upload) where applicable.
- **Landing `/`**: removed the old **feature-card** grid; primary CTAs are the banner rails.
- **Tests**: **`GraphVisualization.test.js`** (empty states), **`GuestIdentityBanner.test.jsx`**, **`libraryFileList.test.js`** (graphs), **`criticalPath.integration.test.js`** tweak.

#### Follow-ups **outside** #40 (address on referenced issues or future backlog)

| Topic | Where to track |
|--------|----------------|
| Browser **E2E** for empty graph overlay, View menu (**Share**), banner rails (**Home** / **Upload**), mobile drawer drag-to-close | **#24** |
| **Z-index** / stacking: new rail chips vs **Actions** FAB vs library overlay vs modals | **#52** |
| **Focus order** / **roving focus** for **View** menu, **Upload** chip, empty-state region vs modals | **#56** |
| Screen reader: empty-state **steps** announcements; tooltip **repositioning** + SR | **#57** |
| Replace **`window.alert`** on failures with toast (**#50**); landing **marketing** copy if product wants more than banner CTAs | **#50** + optional backlog *Landing value props* below |
| Narrow-viewport **library** density / playback strip overlap | **#52**, **#70** |
| **i18n** / copy polish for empty-state strings | Future or **#50** UX pass |

### Suggested GitHub issue comments (#40 implementation, paste as needed)

**On #40 — comment body (closure / summary):**

```markdown
**Shipped (Apr 2026):** Library **empty graph** guidance in **`GraphVisualization`** (`emptyStateVariant`, `library` vs `default`, read-only share empty copy). Shell **Home** / **Visualize** / **Library** / **Upload** rails; **Share link** under **View**; **`LibraryAccountChip`** removed. Library sidebar respects **min graph width**; mobile drawer width + drag-to-dismiss; **graphs** search/sort via **`getFilteredSortedGraphs`**. Landing feature cards removed. Canvas **tooltip** anchors near selection. Follow-ups (E2E, z-index, a11y focus, SR) are listed under *GitHub #40* in `docs/github-backlog-issues.md`.
```

**On #25 — comment body:**

```markdown
**Update (#40):** Desktop library **sidebar** max width is tied to viewport so the graph keeps **≥200px**. Mobile library **drawer** adds persisted width, maximize, and drag-left to close. Worth a quick **#52** pass so new **banner** chips and the drawer still stack cleanly with the **Actions** FAB.
```

**On #27 — comment body:**

```markdown
**Update (#40):** When the graph has **no nodes**, an **empty-state** overlay covers the canvas (editable mode). Confirm **Actions** FAB / **#graph-action-menu** still feel discoverable and are not obscured on short viewports; if needed, track z-index tweaks under **#52**.
```

**On #29 — comment body:**

```markdown
**Update (#40):** **`graph-edit-mode-chip`** and modals should **suppress** the editable empty overlay (`emptyStateBlockedByModal`). If chip + empty copy ever compete visually, treat as polish under **#56** / **#52**.
```

**On #33 — comment body:**

```markdown
**Update (#40):** **`LibraryAccountChip`** was **removed** from the library chrome; signed-in identity uses the **banner** rail chip only (dedupes the old sidebar duplicate). **`GuestIdentityBanner`** takes **`onOpenUpload`** from **`App`** for the shell **Upload** button.
```

**On #39 — comment body:**

```markdown
**Update (#40):** **Copy read-only link** moved from a top-level **SHARE** button into the **View** menu (**Share link**). Recipient URL and **`readOnly`** behavior unchanged; update any manual E2E notes that still say “SHARE on the title row.”
```

**On #50 — comment body:**

```markdown
**Update (#40):** Landing **`/`** no longer shows the **feature-card** grid—navigation is via **Home** / **Visualize** in the banner. If marketing wants richer landing content again, file a small backlog issue or extend this one; optional toast/snackbar for share copy failures remains a general **#50** item.
```

**On #52 — comment body:**

```markdown
**Update (#40):** New **banner** controls (**Home**, **Visualize**, **Library**, **Upload**, **View**, account chip) reuse **`library-mobile-rail`** styling. Please verify stacking vs **Actions** FAB (**1190**), library overlay (**1200**), and modals when you next do a **z-index** audit.
```

**On #56 — comment body:**

```markdown
**Update (#40):** **View** menu now hosts **Share link** and other items; **Upload** is a separate chip. Consider focus return and **Tab** order when dismissing menus after **#40** shell changes.
```

**On #57 — comment body:**

```markdown
**Update (#40):** Empty graph uses **`role="region"`** + **`aria-label="Getting started with an empty graph"`** for the editable overlay. **Tooltip** position updates when selecting nodes—verify SR users get equivalent info (node label / wiki link) and that announcements are not noisy.
```

**On #63 — comment body:**

```markdown
**Update (#40):** Account **name/id** display moved entirely to **`GuestIdentityBanner`** (rail chip); **`LibraryAccountChip`** component was deleted. Auth flows unchanged.
```

**On #24 — comment body:**

```markdown
**Update (#40):** Good E2E candidates: empty graph **region** visible on **`/visualize`** with no graph; **View** → **Share link** for owners; **Upload** chip opens root **`FileUpload`** modal; mobile **Library** drawer drag-to-dismiss; **graphs** list obeys search/sort like files.
```

### Backlog: Landing value props / marketing grid (create manually)

**Title:** `Backlog: Landing page — optional value-prop cards or hero (post–#40)`

**Body:**

```markdown
## Context
**#40** removed the **`/`** feature-card grid in favor of **Home** / **Visualize** rails in **`GuestIdentityBanner`**.

## Scope (future)
- Product/design: restore cards, a hero, or other onboarding without duplicating navigation.
- Coordinate with **#50** (shared notifications / error UX) if CTAs trigger modals.

Refs: #40 #50 #33
```

### GitHub **#75** + guidance presets (Apr 2026)

**Branch:** `issue-75-node-thumbnails`

#### Shipped in this slice

- **Wikipedia lead thumbnails:** **`enrichGraphNodesWithThumbnails`** + **`fetchWikipediaThumbnailUrl`** (REST **page/summary** `thumbnail.source`, no HTML scraping) on **`POST /api/analyze`** and **`POST /api/generate-node`**; persisted via **`POST /api/graphs/save`** when present.
- **Load parity:** **`GET /api/graphs/:filename`** runs the same enrichment so Mongo loads get **`thumbnailUrl`** even when older **`Graph.payload`** rows omitted it (sequential fetches; first load of a large graph may be slower).
- **Client D3:** **`updateVisualization()`** + **`updateHighlighting()`** once per effect so single-node communities render **SVG `image`** thumbs on first paint and when the library viewport resizes (not only after zoom merge/split). **`<image>`** **`error`** handler falls back to **`graph-node-disc`** (network / bad URL). **`graph-node-hit`** full-disc click target; **`safeThumbnailUrl.js`** allowlist.
- **Guidance:** Presets in **`client/src/utils/generationGuidance.js`** — **Awe**, **Simpleton**, **Happy**, **Nostalgia**, **Profound**, **Sexy**, **Shock**, **Weird** — each describes **writing voice** and **which kinds of concepts to prefer**. **`server/server.js`** frames **`context`** / **`generationContext`** as **USER GUIDANCE — TONE, VOICE, AND CONCEPT CHOICES** for **`/api/analyze`** and **`/api/generate-node`**.

#### Follow-ups outside this ticket (address on referenced issues or new backlog)

| Topic | Where to track |
|--------|----------------|
| **Caching / rate limits** for sequential Wikipedia fetches on **`GET /api/graphs/:filename`** (large graphs); optional **persist enriched `thumbnailUrl` back to Mongo** on read to avoid repeat work | **#79**; **#37** if preview/`dryRun` interacts |
| **SVG `<image>`** `error` event gaps (some CORS cases); optional **timeout** fallback | **#75** or new backlog |
| **Browser E2E** for load → thumb visible, guidance preset → API payload | **#24** |
| **Relationship synthesis** (`synthesizeLinkRelationships`) still emphasizes wording; topic choice is step 1 only — align copy if product wants tone on step 2 | **#62** / small task |
| **i18n** / copy for new preset labels | Future UX |
| **Telemetry** on preset usage / thumb load failures | Product |
| **Simpleton** preset (replaces **Funny**) — moderation / brand review of literary-dialect guidance; legacy client value **`funny`** maps in **`resolveGenerationContext`** | **#75** / product |

#### Suggested GitHub issue comments (#75 implementation — paste as needed)

**On #75 — comment body:**

```markdown
**Shipped (Apr 2026, branch `issue-75-node-thumbnails`):** REST **thumbnail.source** hydration on analyze + generate-node + **GET `/api/graphs/:filename`**; D3 community path on mount/resize; SVG thumb + solid-disc fallback on image error; full-disc hit target. Docs: `client/README.md`, `server/READEME.md`, this file. Remaining backlog: caching/persist on load, E2E—see *Follow-ups* in `docs/github-backlog-issues.md` § *GitHub #75 + guidance presets*.
```

**On #37 — comment body:**

```markdown
**Update (Apr 2026):** **`GET /api/graphs/:filename`** now calls **`enrichGraphNodesWithThumbnails`** (same as analyze). If **`dryRun`** / preview ever simulates graph load, ensure it does not trigger unbounded Wikipedia traffic—consider caching or skipping enrichment in preview paths.
```

**On #21 — comment body:**

```markdown
**Update (Apr 2026):** **`mergeAnalyzedGraphs`** should preserve **`thumbnailUrl`** from per-file analyze responses when present; server-side enrichment already runs per **`POST /api/analyze`**.
```

**On #48 — comment body:**

```markdown
**Update (Apr 2026):** Per-file analyze still all-or-nothing. Thumbnail enrichment failures are non-fatal per node (logged); batch behavior unchanged.
```

**On #66 — comment body:**

```markdown
**Update (Apr 2026):** Analyze **`context`** and generate-node **`generationContext`** now explicitly bias **concept selection** (among valid Wikipedia choices) as well as **tone**—see `server/server.js` prompt blocks and `client/src/utils/generationGuidance.js`.
```

### Library graph canvas — playback highlight, link UX, guidance (**#80** branch, Apr 2026)

#### Shipped in this slice

- **Playback scrub:** Orange **delta highlight** for newly appearing nodes/links after a history step (`playbackScrubToken`, **`PLAYBACK_STEP_HIGHLIGHT_MS`** timer, `playbackStepHot*` refs); avoids clearing hot sets before paint (regression after D3 transition removal). Non-scrub **`updateVisualization`** clears the timer + hot sets so zoom merge/split does not leave stale highlights.
- **Scrub + `readOnly`:** **Node drag** uses the real D3 drag behavior when `playbackScrubToken > 0` even if `readOnly` is true for persistence—layout is **ephemeral** until the displayed snapshot changes.
- **Links:** **Click selection removed** (no `selectedLinkKeyRef` updates from edges); **hover** tooltip unchanged. Node tooltip **Related concepts** lines append **`strength`** as `n/a` or a **percent** when `link.strength` is numeric in \([0,1]\).
- **Guidance:** Preset **Funny** → **Simpleton** in **`client/src/utils/generationGuidance.js`** + **`GenerationGuidanceFields.jsx`**; **`resolveGenerationContext`** maps legacy preset string **`funny`** → **simpleton** text.

#### Follow-ups outside this ticket (track on issues or new backlog)

| Topic | Where to track |
|--------|----------------|
| **Automated tests** (client) for playback hot-highlight, rapid scrub, and tooltip **Related concepts** strength formatting | **#24** or new backlog |
| **Documentation drift:** older bullets (e.g. in **`docs/status.md`** / **#36** notes) may still describe **fade/crossfade** between playback states; reconcile with current no-transition graph paths | **#36**, **#70** |
| **Use `link.strength` on the canvas** (stroke opacity/width, filter weak edges)—data is already on payloads (**#80**) | **#80** |
| **Remove or simplify dead code** around `selectedLinkKeyRef` if nothing sets it after link deselection removal | Chore / **#80** |
| **Playback + drag:** policy for **persisting** per-step layout vs always resetting from snapshot (today: reset on scrub) | **#93** |
| **Simpleton** preset: product **moderation** / tone review; **telemetry** on preset usage | **#75** |
| **Keyboard / SR** path to inspect an edge now that links are not focus-selected | **#57** |

#### Suggested GitHub issue comments (paste on **#36**, **#75**, **#80**)

**On #36 — comment body:**

```markdown
**Update (Apr 2026, client #80 branch):** Library history scrub again **highlights newly appearing nodes and links** for ~1.3s after stepping forward (`PLAYBACK_STEP_HIGHLIGHT_MS`), fixing a regression where hot highlight refs were cleared before `updateHighlighting` ran. Timer + hot state are cleared on non-scrub redraws (e.g. zoom-driven merge/split) so orange “new step” styling does not stick incorrectly. **Node drag** remains usable during scrub (`playbackScrubToken > 0`) for **layout only**—positions still reset when the snapshot changes. *Follow-up:* add automated tests; align any remaining docs that describe **fade/crossfade** between playback roots with the current implementation.
```

**On #75 — comment body:**

```markdown
**Update (Apr 2026):** Guidance preset **Funny** was replaced by **Simpleton** (dropdown + `GUIDANCE_PRESET_TEXT.simpleton`; Steinbeck *Of Mice and Men*–style voice instructions). **`resolveGenerationContext`** still accepts legacy preset value **`funny`** and maps it to **simpleton**. *Follow-up:* moderation/brand review of preset copy; optional telemetry on preset selection.
```

**On #80 — comment body:**

```markdown
**Update (Apr 2026):** **Link click selection** was removed from **`GraphVisualization`** (edges: hover tooltip only; default cursor on drawn links). **Related concepts** in the node docked tooltip now shows each neighbor line with **relationship + strength** (`n/a` or percent from `link.strength` in [0,1]). *Follow-ups:* use **`strength`** for edge opacity/width on the canvas; prune any dead **`selectedLinkKeyRef`** styling paths if unused.
```

### Backlog: Playback — optional per-step layout memory

**Tracked as GitHub #93** — *Library playback — optional per-step layout memory for node drags*.

### Backlog: Node image / Wikipedia thumbnail — follow-up issue (create manually)

**Status (Apr 2026):** Core **#75** items (payload field, REST resolution, canvas disc, load enrich, guidance-aware prompts) are **shipped** — see *GitHub #75 + guidance presets* above. Remaining items below target **tooltip `<img>`**, alternative **MediaWiki** APIs, **caching**, and **non-Wiki** images.

**Title:** `Backlog: Optional node thumbnail (Wikipedia + graph payload + tooltip / canvas)`

**Body:**

```markdown
## Summary
Extend graph **nodes** with an optional **image URL** (or server-resolved thumbnail) so the UI can show a picture in the **docked tooltip** (`graph-canvas-tooltip`) and/or on the **node** in D3. For nodes that already have **`wikiUrl`** (e.g. “Learn more” in **`GraphVisualization.js`**), resolve a **stable thumbnail** via the **MediaWiki API** (not client-side HTML scraping—CORS and ToU).

## Context (Apr 2026)
- Today nodes carry **`wikiUrl`**; tooltip HTML includes `<a href="…" target="_blank">Learn more</a>` when set.
- D3 datum shape can already carry extra fields; persistence is graph JSON / Mongo **`Graph.payload`**—schema and migrations need a decision if the field is first-class.

## Proposed scope

1. **Data model** — Add optional **`thumbnailUrl`** / **`imageUrl`** (or nested **`media: { thumbnailUrl }`**) on nodes; document in API + client PropTypes; backward-compatible defaults for existing graphs.
2. **Resolution (Wikipedia)** — **Server-side** helper: parse **`wikiUrl`** → title + wiki host → **`action=query`** + **`prop=pageimages`** (or equivalent) → store URL on node when analyze/generate/save runs, or lazy-resolve on first open (with caching + rate limits).
3. **AI-generated nodes** — When the pipeline sets **`wikiUrl`**, optionally run the same resolver once and persist thumbnail (avoid N+1 on every client render).
4. **Client / D3** — Tooltip: safe `<img>` (allowlist `https:` only, max dimensions, `alt` from label). Optional: SVG **`<image>`** or pattern on node circles; lazy-load / decode error fallback.
5. **Non-Wiki URLs** — Out of scope or later: Open Graph / generic fetch only via **backend** (same CORS/abuse constraints).

## Acceptance criteria (draft)
- [ ] Existing graphs without the new field unchanged.
- [ ] At least one path (e.g. post-analyze or explicit refresh) populates thumbnail for en.wikipedia.org links used today.
- [ ] No client-side fetch of arbitrary Wikipedia article HTML for image scraping.

## Related
- **`GraphVisualization.js`** tooltip and node merge paths (`wikiUrl`).
- **`server`** analyze / generate routes if thumbnails are filled at ingest time.

Refs: #27 #29 #37 #62 #69 #21 #48
```

#### Suggested GitHub comments (node thumbnail backlog — paste on Refs issues)

**On #27 — comment body:**

```markdown
**Context (Apr 2026):** Saved graphs are **Mongo-authoritative** (`Graph.payload.nodes[]`). A future **optional `thumbnailUrl`** on nodes would ship in that payload and show in the **docked canvas tooltip** (now positioned **beside** the selected node) and optionally on the node glyph—see backlog *Optional node thumbnail* in `docs/github-backlog-issues.md`.
```

**On #29 — comment body:**

```markdown
**Context (Apr 2026):** If we add **node thumbnails**, the **`graph-edit-mode-chip`** and empty-state overlays should stay visually distinct from any **`<image>`** on nodes; track layout polish with tooltip + chip work.
```

**On #37 — comment body:**

```markdown
**Context (Apr 2026):** **`dryRun`** / budget caps remain server-side. If **generate-node** later persists **`thumbnailUrl`** from Wikipedia resolution, ensure **preview** paths do not hammer the MediaWiki API—may need caching or opt-in.
```

**On #62 — comment body:**

```markdown
**Context (Apr 2026):** **Generate** flows that set **`wikiUrl`** are a natural place to **resolve thumbnails once** server-side (backlog: MediaWiki **pageimages**) and store on nodes in **`Graph.payload`**—avoids N+1 client fetches.
```

**On #69 — comment body:**

```markdown
**Context (Apr 2026):** **Explosion** / Wikipedia-backed subgraph work will create many **`wikiUrl`** nodes; thumbnail resolution should be **batched + cached** server-side (same backlog as *Optional node thumbnail*). **Update:** #69 shipped (`issue-69-explode-node`) — see `docs/github-backlog-issues.md` section *Explode subgraph (#69)* for shipped scope and follow-ups (E2E #24, telemetry #16, etc.).
```

**On #21 — comment body:**

```markdown
**Context (Apr 2026):** **`mergeAnalyzedGraphs`** can carry through arbitrary node fields from the API. If the server adds **`thumbnailUrl`** per node, merged library graphs should preserve it per namespaced id; no client-side Wikipedia scraping.
```

**On #48 — comment body:**

```markdown
**Context (Apr 2026):** Batch analyze partial success remains open. If we add **per-node thumbnail hydration** after analyze, decide whether thumbnail fetch failures are **non-fatal** (skip image) so one bad URL does not fail the whole batch.
```

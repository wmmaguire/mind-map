#!/usr/bin/env bash
# ⚠️  ONE-OFF: creates ~29 GitHub issues. Do not re-run; you will get duplicates.
# Historical: mirrored former docs/todo.md — requires: gh auth, milestones M—Server/M—Client + NF—*.
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

# Usage: create "title" "body" "milestone" "label1" "label2"
# Prints created issue number to stdout (parses URL from gh issue create).
create() {
  local url
  url=$(gh issue create \
    --title "$1" \
    --body "$2" \
    --milestone "$3" \
    --label "$4" \
    --label "$5")
  echo "$url" | sed -E 's|.*/issues/([0-9]+).*|\1|'
}

# --- Layer 0: client foundation ---
N_API=$(create "[Client] Centralize API base URL" "## Problem statement

Multiple components build the backend URL separately; production uses a hardcoded host (\`talk-graph.onrender.com\`). That causes drift, painful deploys, and wide refactors for any host change.

## Proposed solution

- Add a single module (e.g. \`src/config.js\` or \`REACT_APP_*\` env) exporting API origin.
- Replace ad-hoc URL usage in Landing, FileUpload, LibraryVisualize, GraphVisualization (and any other callers).
- Document env vars in \`client/README.md\`.

## Validation steps

- [ ] No stray hardcoded production host in \`client/src\` (grep).
- [ ] Dev and production builds hit the correct API.
- [ ] Upload → analyze → visualize still works E2E.

## Dependencies

- **Blocked by:** N/A
- **Blocks:** Session state, shared fetch helper, library+accounts, and most client issues (see linked backlog)" \
  "M—Client: shell & UX" "feature upgrade" "Priority Level- HIGH")

N_SESS=$(create "[Client] Replace window.currentSessionId with app state" "## Problem statement

Session ID lives on \`window\` and is consumed by upload, analysis, and telemetry. That is hard to test, easy to desync, and blocks a clean path to auth-aware clients.

## Proposed solution

- Introduce React context or a small store for session id (and related session metadata if needed).
- Optionally persist in \`sessionStorage\` for refresh recovery.
- Remove reliance on \`window.currentSessionId\` across the client.

## Validation steps

- [ ] Session still created/restored on first visit and reused across routes.
- [ ] Upload and analyze flows still send the same session identifier to the API.
- [ ] Refresh behavior matches chosen policy (persist or not).

## Dependencies

- **Blocked by:** #${N_API}
- **Blocks:** Library + accounts UI, unified loading/error patterns that wrap authenticated fetch" \
  "M—Client: shell & UX" "feature upgrade" "Priority Level- HIGH")

# --- Server ---
N_CORS=$(create "[Server] Make CORS and baseDir configurable" "## Problem statement

CORS allowlist and production \`baseDir\` are hardcoded. Renaming hosts or changing data directories requires code changes and risks misconfiguration.

## Proposed solution

- Read CORS origins and data directory from environment (e.g. \`CORS_ORIGINS\`, \`DATA_DIR\`).
- Document required vars for local and production (e.g. Render).

## Validation steps

- [ ] App starts with env-based config in dev and staging.
- [ ] Uploads and file paths still resolve correctly.

## Dependencies

- **Blocked by:** N/A
- **Blocks:** N/A" \
  "M—Server: foundation & APIs" "feature upgrade" "Priority Level- MEDIUM")

N_DBOK=$(create "[Server] Clarify DB vs request success for uploads" "## Problem statement

Upload can log Mongo failures but still return HTTP success, so clients believe data is persisted when it may not be—silent drift between filesystem and database.

## Proposed solution

Choose one policy: fail the request when required DB writes fail, or keep best-effort with explicit response metadata and documented semantics; add optional consistency check. Align client handling.

## Validation steps

- [ ] Simulated DB failure matches chosen HTTP/status contract.
- [ ] Happy path unchanged when DB is healthy.
- [ ] Server/docs describe the contract.

## Dependencies

- **Blocked by:** N/A
- **Blocks:** Route consolidation (error semantics), user-activity logging expectations" \
  "M—Server: foundation & APIs" "feature upgrade" "Priority Level- HIGH")

N_ACTIVITY=$(create "[Server] Database-backed user activity (no silent drops)" "## Problem statement

User actions should be durable for analytics, support, and future accounts—not only server errors. Refactors risk dropping or skipping writes.

## Proposed solution

- Extend or unify logging: \`GraphOperation\`, \`Session\`, \`File\`, \`GraphTransform\`, \`Feedback\`, and/or a dedicated activity/audit collection (timestamp, \`sessionId\`, action type, payload summary).
- Document which handlers must write what; add checks in review.

## Validation steps

- [ ] Representative flows (upload, save graph, analyze, feedback) produce expected documents.
- [ ] No regression in handler performance beyond acceptable bounds.

## Dependencies

- **Blocked by:** #${N_DBOK} (policy alignment recommended)
- **Blocks:** Safe route consolidation" \
  "M—Server: foundation & APIs" "feature upgrade" "Priority Level- HIGH")

N_ROUTES=$(create "[Server] Centralize route ownership (upload / files / graphs)" "## Problem statement

Upload and file listing are split across \`server.js\` and \`server/routes/upload.js\`, inviting ordering bugs and duplicate logic.

## Proposed solution

- Consolidate so each HTTP surface has a single owner (routers mounted once).
- Preserve or improve user-activity DB writes per project rules.

## Validation steps

- [ ] All previous endpoints respond and behave as before.
- [ ] No duplicate route registration; ordering documented if sensitive.

## Dependencies

- **Blocked by:** #${N_ACTIVITY} (coordinate so writes are not dropped)
- **Blocks:** Rename/split routes module" \
  "M—Server: foundation & APIs" "feature upgrade" "Priority Level- HIGH")

N_RENAME=$(create "[Server] Rename or split routes/upload.js" "## Problem statement

The module name suggests uploads only but also implements graph save/load, confusing navigation and onboarding.

## Proposed solution

- Rename (e.g. \`filesAndGraphs.js\`) or split into \`upload.js\` and \`graphs.js\` with clear mounts.

## Validation steps

- [ ] Imports and tests updated; server boots.
- [ ] README or server docs reflect module layout.

## Dependencies

- **Blocked by:** #${N_ROUTES}
- **Blocks:** N/A" \
  "M—Server: foundation & APIs" "feature upgrade" "Priority Level- MEDIUM")

N_JSON=$(create "[Server] Harden OpenAI JSON parsing (analyze / generate-node)" "## Problem statement

Strict JSON assumptions cause 500s when the model returns markdown fences or malformed JSON.

## Proposed solution

- Strip fences, defensive parse, structured retries or structured-output API where appropriate.
- Log sanitized failures for debugging.

## Validation steps

- [ ] Fuzz / fixture tests for messy model output.
- [ ] Happy path unchanged for valid JSON.

## Dependencies

- **Blocked by:** N/A (can ship in parallel with route work)
- **Blocks:** Transcription and growth-mode features benefit indirectly" \
  "M—Server: foundation & APIs" "feature upgrade" "Priority Level- MEDIUM")

N_DOCH=$(create "[Server] Document hybrid persistence guarantees" "## Problem statement

Hybrid filesystem + Mongo behavior is intentional but not crisply documented; operators and contributors can misunderstand source of truth.

## Proposed solution

- Add a short **Data consistency** section: source of truth per entity, divergence scenarios.

## Validation steps

- [ ] Doc reviewed against actual code paths.
- [ ] Linked from server README.

## Dependencies

- **Blocked by:** N/A
- **Blocks:** N/A" \
  "M—Server: foundation & APIs" "documentation" "Priority Level- LOW")

# --- Client (depends on API / session where noted) ---
N_MERGE=$(create "[Client] Align multi-file merge with backend semantics" "## Problem statement

Library flow merges graphs only on the client; semantics may drift from server expectations and are hard to test.

## Proposed solution

- Extract merge util; document contract with backend; add unit tests.

## Validation steps

- [ ] Multi-select merge matches documented behavior.
- [ ] Tests cover edge cases (empty graph, duplicate ids).

## Dependencies

- **Blocked by:** #${N_API}
- **Blocks:** N/A" \
  "M—Client: shell & UX" "feature upgrade" "Priority Level- MEDIUM")

N_LOAD=$(create "[Client] Unify loading and error handling" "## Problem statement

Loading and API errors are inconsistent; failures can be invisible or jarring.

## Proposed solution

- Standardize patterns (flags, error boundary, toast/inline); shared wrapper around fetch using centralized config.

## Validation steps

- [ ] Major flows show loading and recoverable errors.
- [ ] No uncaught promise regressions in smoke test.

## Dependencies

- **Blocked by:** #${N_API}, #${N_SESS}
- **Blocks:** N/A" \
  "M—Client: shell & UX" "feature upgrade" "Priority Level- MEDIUM")

N_FB=$(create "[Client] Refine Give Feedback control (Landing / App shell)" "## Problem statement

Feedback UI can cover primary content; mobile safe areas and modal stacking are fragile.

## Proposed solution

- Corner/FAB pattern, safe-area insets, a11y (Escape, focus return), mount once at App shell.

## Validation steps

- [ ] Mobile + desktop: no overlap with main CTAs.
- [ ] Keyboard and screen reader sanity check.

## Dependencies

- **Blocked by:** N/A
- **Blocks:** N/A" \
  "M—Client: shell & UX" "feature upgrade" "Priority Level- MEDIUM")

N_E2E=$(create "[Client] Add or document E2E / integration tests" "## Problem statement

Only CRA unit script is documented; refactors to session/API risk silent regressions.

## Proposed solution

- Add minimal E2E or integration path (session → upload → analyze → visualize) or document how to run if added later.

## Validation steps

- [ ] CI or documented local command passes.
- [ ] Covers at least one critical path.

## Dependencies

- **Blocked by:** #${N_API}, #${N_SESS}
- **Blocks:** N/A" \
  "M—Client: shell & UX" "documentation" "Priority Level- LOW")

N_SIDEBAR=$(create "[Client] LibraryVisualize sidebar: layout & fit" "## Problem statement

Sidebar competes with the graph on small screens; hierarchy of Files vs Graphs is heavy.

## Proposed solution

- Accordion/collapsible sections, resizable width + localStorage, clearer “Library” framing, optional mobile icon rail.

## Validation steps

- [ ] Usable on narrow viewport.
- [ ] Width persists across refresh.

## Dependencies

- **Blocked by:** #${N_API}
- **Blocks:** File list navigation enhancements" \
  "M—Client: shell & UX" "feature upgrade" "Priority Level- MEDIUM")

N_FILELIST=$(create "[Client] LibraryVisualize file list: search, sort, keyboard, empty states" "## Problem statement

Large libraries are hard to navigate; selection UX is incomplete.

## Proposed solution

- Search/filter/sort, select-all/clear, richer rows, keyboard model, skeleton + empty CTA.

## Validation steps

- [ ] Keyboard and mouse flows work.
- [ ] Empty and loading states verified.

## Dependencies

- **Blocked by:** #${N_SIDEBAR}
- **Blocks:** N/A" \
  "M—Client: shell & UX" "feature upgrade" "Priority Level- MEDIUM")

N_GV1=$(create "[Client] GraphVisualization: exclusive graph edit modes + Escape" "## Problem statement

Relationship and delete modes can both be on; handler order feels arbitrary. Add Node active state can disagree with modal state.

## Proposed solution

- Mutually exclusive toggles; clear state transitions; Escape exits tool mode; align Add Node active styling.

## Validation steps

- [ ] Only one graph tool semantics apply per click.
- [ ] Escape clears mode; no stuck selections.

## Dependencies

- **Blocked by:** N/A
- **Blocks:** Mobile toolbar layout; hierarchy/canvas feedback" \
  "M—Client: shell & UX" "feature upgrade" "Priority Level- MEDIUM")

N_GV2=$(create "[Client] GraphVisualization: single home for mobile .edit-controls" "## Problem statement

CSS overlaps fixed bottom vs sheet content; z-index fights with SVG.

## Proposed solution

- Choose one pattern (peek-only toolbar vs fixed bar + safe area) and delete the other.

## Validation steps

- [ ] iOS/Android smoke: no double toolbars; graph remains interactive.

## Dependencies

- **Blocked by:** #${N_GV1}
- **Blocks:** Touch/a11y polish for same controls" \
  "M—Client: shell & UX" "feature upgrade" "Priority Level- MEDIUM")

N_GV3=$(create "[Client] GraphVisualization: tool hierarchy + on-canvas feedback" "## Problem statement

Generate vs structural edits are visually flat; link mode lacks delete-helper parity.

## Proposed solution

- Group Generate separately; link-mode helper text; optional floating chip with Done/Cancel.

## Validation steps

- [ ] Users can tell which mode is active without opening the sheet.
- [ ] Link flow discoverable on mobile.

## Dependencies

- **Blocked by:** #${N_GV1}, #${N_GV2}
- **Blocks:** N/A" \
  "M—Client: shell & UX" "feature upgrade" "Priority Level- MEDIUM")

N_GV4=$(create "[Client] GraphVisualization: touch targets + a11y for edit tools" "## Problem statement

Some mobile rules use ~36px height; modes need clearer semantics for AT.

## Proposed solution

- ≥44px targets; icons + labels; segmented styling; aria-pressed; focus when sheet opens.

## Validation steps

- [ ] VoiceOver/TalkBack spot check on toolbar.
- [ ] Tap targets meet guideline on reference devices.

## Dependencies

- **Blocked by:** #${N_GV2}
- **Blocks:** N/A" \
  "M—Client: shell & UX" "feature upgrade" "Priority Level- MEDIUM")

# --- Epics: accounts before user-scoped API + library auth UI ---
N_EP_ACCT=$(create "[Epic] Accounts, profiles & BYO LLM (NF—Social)" "## Problem statement

Guest \`sessionId\` is not enough for long-term ownership, settings, or user keys.

## Proposed solution

- Identity (guest + registered); profiles/settings; encrypted server-side keys; proxy model calls; compliance/export/delete copy.

## Validation steps

- [ ] Auth flow E2E; keys never appear in client logs.
- [ ] Guest → upgrade migration path documented.

## Dependencies

- **Blocked by:** #${N_DBOK}, #${N_ACTIVITY} (audit expectations)
- **Blocks:** User-scoped listing APIs; library accounts UI (child issues below)" \
  "NF—Social & identity" "new feature" "Priority Level- MEDIUM")

N_USERAPI=$(create "[Server] User-scoped file & graph listing APIs" "## Problem statement

When accounts exist, listing must filter by \`userId\` while preserving guest/\`sessionId\` migration semantics.

## Proposed solution

- Scope \`GET /api/files\` (and related) by authenticated user; document guest fallback.
- Plan params/routes for shared assets later (\`ownerId\`, \`sharedWith[]\`, tokens).

## Validation steps

- [ ] Guest flow still works during migration.
- [ ] Authenticated user sees only their assets (integration tests).

## Dependencies

- **Blocked by:** #${N_EP_ACCT} (auth model / \`userId\` on session)
- **Blocks:** Library “My vs shared” UI" \
  "NF—Social & identity" "new feature" "Priority Level- MEDIUM")

N_ACCTUI=$(create "[Client] LibraryVisualize + accounts in the UI" "## Problem statement

\`fetchFiles\` and related calls need auth; guests need a clear upgrade path in the shell.

## Proposed solution

- Shared API helper with auth headers; guest banner; signed-in chip/menu; extract LibrarySidebar/SourcesPanel.

## Validation steps

- [ ] Guest and signed-in states behave per design.
- [ ] No token leakage in logs.

## Dependencies

- **Blocked by:** #${N_API}, #${N_SESS}, #${N_EP_ACCT}
- **Blocks:** N/A" \
  "M—Client: shell & UX" "feature upgrade" "Priority Level- MEDIUM")

# --- Audio epic then client modal ---
N_EP_AUDIO=$(create "[Epic] Audio → transcript → graph (NF—Input expansion)" "## Problem statement

No first-class audio ingestion; users who speak ideas cannot flow into the same analyze pipeline as text.

## Proposed solution

- Server: \`POST /api/transcribe\` (or equivalent) with limits.
- Client: record/upload, preview, editable transcript, then existing analyze.
- Storage: session-linked metadata like other sources; library listing as needed.
- Ops: size/duration limits, privacy copy, optional async for long audio.

## Validation steps

- [ ] Contract documented (request/response).
- [ ] E2E: audio → graph in library.
- [ ] Abuse cases (huge file) handled.

## Dependencies

- **Blocked by:** #${N_JSON} (recommended), #${N_API}, #${N_SESS}
- **Blocks:** Client FileUpload audio modal (child issue below)" \
  "NF—Input expansion" "new feature" "Priority Level- MEDIUM")

N_AUDIOUI=$(create "[Client] FileUpload modal: audio pipeline UI" "## Problem statement

Users need a first-class path from audio capture/upload through transcript to analysis.

## Proposed solution

- Tabs/steps: text vs audio; MediaRecorder or file; preview; call transcribe API; editable transcript; then analyze; privacy copy.

## Validation steps

- [ ] End-to-end happy path on supported browsers.
- [ ] Oversize / failure paths show clear errors.

## Dependencies

- **Blocked by:** #${N_API}, #${N_SESS}, #${N_EP_AUDIO}
- **Blocks:** N/A" \
  "NF—Input expansion" "new feature" "Priority Level- MEDIUM")

# --- Remaining epics ---
N_EP_TIME=$(create "[Epic] Graph evolution timeline / time travel (NF—Persistence)" "## Problem statement

Users only see latest graph state; no replay, audit, or share of historical versions.

## Proposed solution

- Pick snapshot vs event log vs hybrid; persist versions; APIs for list/load step; UI scrubber; optional diff mode later.

## Validation steps

- [ ] Spike doc records model choice and migration.
- [ ] Minimal replay of two states works.

## Dependencies

- **Blocked by:** #${N_ACTIVITY} (operations data helps)
- **Blocks:** Version handoff in sharing epic" \
  "NF—Persistence & history" "new feature" "Priority Level- MEDIUM")

N_EP_GROW=$(create "[Epic] Graph growth modes (presets + autopilot) (NF—Graph intelligence)" "## Problem statement

One-shot generation is not enough for guided exploration; need iterative, bounded expansion.

## Proposed solution

- Presets + rules engine (budgets, stop conditions); batch JSON operations validated server-side; UX for preview/apply rounds.

## Validation steps

- [ ] Schema validated with fuzz tests.
- [ ] Dry-run or preview path prevents runaway graphs.

## Dependencies

- **Blocked by:** #${N_JSON}, solid \`/api/generate-node\` behavior
- **Blocks:** Discovery features that assume rich graph metadata" \
  "NF—Graph intelligence & scale" "new feature" "Priority Level- MEDIUM")

N_EP_DISC=$(create "[Epic] Discovery & navigation (NF—Graph intelligence)" "## Problem statement

Large graphs are hard to search, orient, and filter meaningfully.

## Proposed solution

- Semantic search / jump; mini-map; neighborhood focus; saved lenses; lightweight provenance panel.

## Validation steps

- [ ] Search returns visible highlights + performance acceptable on medium graphs.
- [ ] Mini-map syncs with viewport.

## Dependencies

- **Blocked by:** Graph rendering performance baseline (implicit)
- **Blocks:** N/A" \
  "NF—Graph intelligence & scale" "new feature" "Priority Level- MEDIUM")

N_EP_SHARE=$(create "[Epic] Sharing & collaboration (NF—Social)" "## Problem statement

Graphs are single-user silos; no read-only share, comments, or version handoff.

## Proposed solution

- Read-only links (expiry/password optional); annotations; version handoff paired with timeline epic.

## Validation steps

- [ ] Tokenized link cannot write by default.
- [ ] Comment permissions model documented.

## Dependencies

- **Blocked by:** #${N_EP_TIME} (version handoff / timeline)
- **Blocks:** N/A" \
  "NF—Social & identity" "new feature" "Priority Level- MEDIUM")

N_EP_POLISH=$(create "[Epic] Dynamic UI / UX polish (NF—Polish & power use)" "## Problem statement

Power users lack shortcuts, layout options, tours, and theming; touch targets vary across surfaces.

## Proposed solution

- Layout modes for graph; keyboard shortcuts; guided tours + empty states; dark/light; responsive gestures.
- **Note:** unify loading/errors via #${N_LOAD}; graph canvas cohesion overlaps #${N_GV1}–#${N_GV4}.

## Validation steps

- [ ] Checklist per sub-feature shipped; no duplicate loading work.

## Dependencies

- **Blocked by:** #${N_LOAD}, #${N_GV3}
- **Blocks:** N/A" \
  "NF—Polish & power use" "new feature" "Priority Level- MEDIUM")

echo "Created issues (see https://github.com/wmmaguire/mind-map/issues):"
echo "API=$N_API SESS=$N_SESS | CORS=$N_CORS DBOK=$N_DBOK ACT=$N_ACTIVITY ROUTES=$N_ROUTES RENAME=$N_RENAME JSON=$N_JSON DOCH=$N_DOCH"
echo "MERGE=$N_MERGE LOAD=$N_LOAD FB=$N_FB E2E=$N_E2E SIDEBAR=$N_SIDEBAR FILELIST=$N_FILELIST"
echo "GV1=$N_GV1 GV2=$N_GV2 GV3=$N_GV3 GV4=$N_GV4"
echo "EP_ACCT=$N_EP_ACCT USERAPI=$N_USERAPI ACCTUI=$N_ACCTUI"
echo "EP_AUDIO=$N_EP_AUDIO AUDIOUI=$N_AUDIOUI"
echo "EP_TIME=$N_EP_TIME EP_GROW=$N_EP_GROW EP_DISC=$N_EP_DISC EP_SHARE=$N_EP_SHARE EP_POLISH=$N_EP_POLISH"

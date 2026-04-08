# Graph time travel — spike (#36)

## Problem

Users need to step through how a graph was built for comparison or recovery, including after **reload** or **new session**, without requiring full server-side versioning in the first iteration.

## Model choice

### Current (Apr 2026): per-entity timestamps + playback strip

Replay is driven by **unique sorted timestamps** on each **node** and **link** (`createdAt`, with fallback to legacy `timestamp`). The committed graph in **`LibraryVisualize`** is the source of truth; the scrubber selects a **cutoff time** and **`buildGraphAtPlaybackTime`** renders entities with time ≤ cutoff (links only if both endpoints are visible).

- **New / edited entities** get monotonic times via **`mergePlaybackTimesFromEdit`** and **`ensurePlaybackTimestamps`** (legacy graphs without times get stable synthetic order).
- **Analyze (multi-file):** **`mergeAnalyzedGraphs`** assigns increasing **`createdAt`** per namespaced node/link in file order.
- **Generate / manual adds:** **`GraphVisualization`** and **`mergeGenerateResult`** set **`createdAt`** + **`timestamp`**.
- **Persistence:** saved JSON includes times so **reload** preserves replay order.

**UI**

- **`GuestIdentityBanner`**: graph **title** only (center column); title is **blank** when no graph is loaded or metadata has no non-empty name.
- **`GraphPlaybackBanner`** (`App.js`, second strip below the identity banner): **save** (`save`), **Play** / scrubber / speed, **share** (owners, #39)—styled like the shell strip. Controls register via **`GraphHistoryUiContext`** (`payload` for history, `sharePayload`, `savePayload`).
- **Save** moved from **`LibrarySourcesPanel`** into the playback strip.

**Speed:** Play interval = **1800 ms / speed multiplier**; speed options persisted in **`localStorage`** (`mindmap.graphHistoryPlaySpeed`).

### Legacy: in-memory snapshot stack (superseded for replay)

The earlier **#36 phase 1** used a bounded snapshot stack in **`graphHistory.js`** (`graphHistoryReducer`, max 30). **Library replay no longer uses that reducer**; **`graphHistory.js`** remains for **`normalizeGraphSnapshot` / `materializeGraphSnapshot`** and **unit tests** (`graphHistory.test.js`). See **follow-ups** in **`docs/github-backlog-issues.md`** (cleanup + tests).

## Longer term (not implemented)

- **Server snapshots** / revisions (API list/load by revision).
- **Event log** replay aligned with **`UserActivity` / `GraphOperation`** (**#16**).
- **Diff mode** between revisions.

## Limits

- History scrubber needs **≥2 unique playback times** to show (otherwise nothing to scrub).
- **Undo** via scrubbing does not revert server saves; **Save** persists the **full** committed graph.

## Validation

- [x] Spike doc records model and UI placement (this file).
- [x] Unit tests: **`graphPlayback.test.js`**, **`graphHistory.test.js`** (legacy reducer), **`mergeGraphs.test.js`**, **`mergeGenerateResult.test.js`**.

## Implementation map

| Piece | Role |
|-------|------|
| `client/src/utils/graphPlayback.js` | `getPlaybackTime`, `ensurePlaybackTimestamps`, `getSortedUniquePlaybackTimes`, `buildGraphAtPlaybackTime`, `mergePlaybackTimesFromEdit`, `cloneGraphForCommit` |
| `client/src/utils/graphPlayback.test.js` | Unit tests |
| `client/src/utils/graphHistory.js` | Snapshot normalize/materialize + **reducer** (tests; not used for Library replay path) |
| `LibraryVisualize.js` | `committedGraph`, `playbackStepIndex`, `displayGraph`; registers **`GraphHistoryUiContext`** payloads |
| `GraphPlaybackBanner.jsx` | Second shell strip; **`GraphHistoryBannerControls`** |
| `GraphHistoryUiContext.jsx` | `payload`, `sharePayload`, `savePayload` + setters |
| `App.js` | Renders **`GraphPlaybackBanner`** below **`GuestIdentityBanner`** |
| `GuestIdentityBanner.jsx` / `.css` | Identity + title only (playback styles shared via imports) |

## References

- GitHub **#36** (epic), **#39** (read-only share), **#70** (phase 2+ backlog)

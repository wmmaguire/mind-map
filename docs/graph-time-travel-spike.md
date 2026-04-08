# Graph time travel — spike (#36)

## Problem

Users only see the latest graph state in the Library visualization. There is no lightweight way to step backward through recent edits for comparison or recovery before we invest in full server-side versioning.

## Model choice (this spike)

**Phase 1 (shipped in this spike): client-only snapshot stack**

- While viewing a graph on **`/visualize`**, the Library shell keeps a bounded list of **normalized graph snapshots** (nodes + links with link endpoints as primitive ids).
- Each successful edit that flows through **`GraphVisualization` → `onDataUpdate`** appends a new snapshot (**redo** branch is truncated if the user had stepped backward).
- **Analyze** and **load saved graph** reset history to a single snapshot (new session for that graph).
- **UI:** when at least **two** snapshots exist, **History** controls appear in the **`GuestIdentityBanner`** (center column under the graph title): **◀** / **▶**, a **range** scrubber, position readout, and **Play** / **Pause** (auto-advance every **1.8s**, looping to the first state after the last). The graph panel no longer hosts this strip so the SVG uses the full visualization height.

**Longer term (hybrid, not implemented here)**

- **Server snapshots** (e.g. versioned rows or files keyed by graph id + revision) for durability and sharing.
- **Event log** (append-only operations, aligned with **`UserActivity` / `GraphOperation`** — see **#16**) for compact storage and selective replay.
- **Diff mode** between two revisions (separate backlog).

## Migration path

- No database or API migration in Phase 1.
- When server versioning exists: on load, fetch revision list → optionally **hydrate** the client stack from the last *N* server revisions, or replace the scrubber with server-driven steps.

## Limits

- Default **30** snapshots (`DEFAULT_GRAPH_HISTORY_MAX` in `client/src/utils/graphHistory.js`).
- History is **tab memory only**; refresh clears it.
- **Undo** from history does not revert server-side saves; “Save graph” always persists the **current** on-screen state.

## Validation (issue #36 checklist)

- [x] Spike doc records model choice and migration (this file).
- [x] Minimal replay of two states: edit the graph twice (or analyze then edit) and use **Earlier** / **Later** or the slider to move between states.

## References

- GitHub **#36** (epic)
- Implementation: `client/src/utils/graphHistory.js`, `LibraryVisualize.js`, `LibraryVisualize.css`

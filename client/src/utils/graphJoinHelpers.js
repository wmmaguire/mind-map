/**
 * Keyed D3 data-join helpers used by GraphVisualization (#103).
 *
 * These wrap d3's `selection.data(..., keyFn).join(...)` pattern with the
 * contract the graph needs to deliver "existing nodes stay put; new ones
 * fade in; removed ones fade out" behaviour across playback scrubs, zoom
 * merge/split, and community evolution:
 *
 * - `applyKeyedJoin(parentSel, selector, data, keyFn, hooks)`:
 *     Keyed join with stable ids. Returns `{ enter, update, exit, merged }`.
 *     Designed to be DOM-free-test-friendly (works under jsdom).
 *
 * - `ensureLayer(parentSel, className)`:
 *     Idempotent `<g class="..."/>` layer group — `selectAll(...).data([null]).join('g')`
 *     pattern with a fixed class attribute. Same `<g>` survives re-renders so
 *     keyed joins can find survivors inside.
 *
 * The helpers are intentionally plain (no animation here) so unit tests can
 * assert enter/update/exit counts and identity without touching transitions.
 * Transition concerns are layered on top by the caller (see GraphVisualization).
 */

/**
 * Idempotently ensure a single `<g>` layer child with the given class exists
 * under `parentSel`. Returns the d3 selection for that `<g>`.
 *
 * Uses the `.data([null]).join('g')` pattern: on first call creates the `<g>`,
 * on subsequent calls returns the existing one untouched.
 *
 * @param {d3.Selection} parentSel - parent d3 selection (one element).
 * @param {string} className - class to apply to the layer group.
 * @returns {d3.Selection}
 */
export function ensureLayer(parentSel, className) {
  if (!parentSel || typeof parentSel.selectAll !== 'function') return parentSel;
  const safeClass = cssEscapeClass(className);
  if (!safeClass) {
    // Refuse to compose selectors from untrusted class names.
    return parentSel.select(null);
  }
  // Note: we intentionally don't use `:scope > g.foo` — jsdom's SVG selector
  // engine doesn't support `:scope` consistently. The keyed-layer pattern here
  // relies on each layer having a unique class under `parentSel`, which is
  // enforced by the caller (GraphVisualization only mounts one of each layer).
  return parentSel
    .selectAll(`g.${safeClass}`)
    .data([null])
    .join('g')
    .attr('class', className);
}

/**
 * Apply a keyed data-join and return the enter/update/exit/merged selections.
 *
 * Hooks (all optional):
 *   - `onEnter(enterSel)`: called once per newly appended element. Must itself
 *     `.append(...)` the tag you want — we intentionally do not `.append` for
 *     you so callers can add cloned attrs, classes, and child structure
 *     atomically on enter.
 *   - `onUpdate(updateSel)`: called with the update selection (existing
 *     elements whose data changed). Use for cheap re-bind logic only.
 *   - `onExit(exitSel)`: called with the exit selection. If omitted, exits
 *     are `.remove()`d. If provided, caller is responsible for removal.
 *
 * @param {d3.Selection} parentSel - parent d3 selection (one element).
 * @param {string} selector - `tagname.class` CSS selector for existing children.
 * @param {Array} data - the bound data array.
 * @param {(d: any) => string|number} keyFn - stable id extractor.
 * @param {{ onEnter?: Function, onUpdate?: Function, onExit?: Function }} hooks
 * @returns {{ enter: d3.Selection, update: d3.Selection, exit: d3.Selection, merged: d3.Selection }}
 */
export function applyKeyedJoin(parentSel, selector, data, keyFn, hooks = {}) {
  if (!parentSel || typeof parentSel.selectAll !== 'function') {
    return emptyJoinResult();
  }
  const { onEnter, onUpdate, onExit } = hooks;

  const update = parentSel
    .selectAll(selector)
    .data(Array.isArray(data) ? data : [], keyFn);

  const enter = update.enter();
  const exit = update.exit();

  let enterResult = enter;
  if (typeof onEnter === 'function') {
    // Caller is expected to append and return the appended selection.
    const r = onEnter(enter);
    if (r && typeof r.merge === 'function') enterResult = r;
  }

  if (typeof onUpdate === 'function') onUpdate(update);

  if (typeof onExit === 'function') {
    onExit(exit);
  } else {
    exit.remove();
  }

  const merged =
    typeof enterResult.merge === 'function' && typeof update.merge === 'function'
      ? enterResult.merge(update)
      : update;

  return { enter: enterResult, update, exit, merged };
}

/**
 * Escape a CSS class value for safe use inside a selector.
 * Intentionally conservative: we only allow alnum, dash, underscore.
 * Anything else is rejected so we don't compose selectors from untrusted
 * strings. GraphVisualization only calls this with hard-coded class names.
 */
function cssEscapeClass(className) {
  if (typeof className !== 'string') return '';
  return /^[A-Za-z0-9_-]+$/.test(className) ? className : '';
}

function emptyJoinResult() {
  const noop = {
    merge() {
      return noop;
    },
    remove() {},
    size() {
      return 0;
    },
    data() {
      return [];
    },
    each() {
      return noop;
    },
    empty() {
      return true;
    },
  };
  return { enter: noop, update: noop, exit: noop, merged: noop };
}

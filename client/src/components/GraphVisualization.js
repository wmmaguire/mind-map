import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  useContext,
} from 'react';
import PropTypes from 'prop-types';
import * as d3 from 'd3';
import { apiRequest, getApiErrorMessage } from '../api/http';
import { useSession } from '../context/SessionContext';
import { useGraphChromeUi } from '../context/GraphChromeUiContext';
import { GraphTitleContext } from '../context/GraphTitleContext';
import { mergeGenerateNodeResponse } from '../utils/mergeGenerateResult';
import { resolveGenerationContext } from '../utils/generationGuidance';
import {
  nodesMatchingLabelQuery,
  createFocusZoomTransform,
  discoveryFocusPoint,
} from '../utils/graphDiscovery';
import {
  computeGraphInsights,
  computeInsightNotableCentralities,
  buildGraphInsightAssessPayload,
  INSIGHT_ASSESS_LENGTH_OPTIONS,
  INSIGHT_ASSESS_GUIDING_FOCUS_GROUPS,
  INSIGHT_ASSESS_REFLECTION_BALANCE_MIN,
  INSIGHT_ASSESS_REFLECTION_BALANCE_MAX,
  INSIGHT_ASSESS_REFLECTION_BALANCE_DEFAULT,
  INSIGHT_ASSESS_REFLECTION_BALANCE_STEP,
  formatInsightAssessReflectionBalance,
  INSIGHT_CENTRALITY_METRICS_HELP,
  formatInsightCentralityScore,
  getInsightAssessGuidingFocusPreview,
} from '../utils/graphInsights';
import { renderInsightMetricKatexHtml } from '../utils/insightMetricKatex';
import { isSafeThumbnailUrlForTooltip } from '../utils/safeThumbnailUrl';
import { pickCommunityAnchorNode } from '../utils/clusterAnchor';
import {
  buildCommunityIdSet,
  newCommunityIdsForPlaybackTransition,
  newLinkKeysForPlaybackTransition,
  linkKeyForProcessedCommunityLink,
} from '../utils/playbackGraphTransition';
import { seedPositionsForNewCommunities } from '../utils/graphLayoutComponents';
import GenerationGuidanceFields from './GenerationGuidanceFields';
import './GraphVisualization.css';

/** How long to keep orange “new in this step” styling after a history scrub (no D3 transition). */
const PLAYBACK_STEP_HIGHLIGHT_MS = 1300;

/** @param {string | null | undefined} graphTitle */
function buildNetworkAssessmentFilename(graphTitle) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const raw =
    typeof graphTitle === 'string' && graphTitle.trim()
      ? graphTitle.trim()
      : 'network-assessment';
  const slug = raw
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return `${slug || 'network-assessment'}-${stamp}.txt`;
}

/** Matches `forceManyBody().strength(...)` on the graph simulation in this file. */
const COMMUNITY_SIM_CHARGE_DEFAULT = -200;
/**
 * Softer forces while the target stretch warp reheats the sim (disjoint-style; see startTargetStretchAnimation).
 * https://observablehq.com/@d3/disjoint-force-directed-graph
 */
const COMMUNITY_SIM_VELOCITY_DECAY_EXPLODE = 0.86;
const COMMUNITY_SIM_CHARGE_EXPLODE = -52;
const COMMUNITY_SIM_ALPHA_TARGET_EXPLODE = 0.055;
const COMMUNITY_SIM_ALPHA_MIN_EXPLODE = 0.2;
/** `forceX` / `forceY` strength toward `width/2` & `height/2` (default D3 is 0.1). */
const COMMUNITY_SIM_XY_STRENGTH = 0.1;

/**
 * GitHub #89: gentler alpha energy when a playback scrub re-binds the sim so
 * converged positions don't get flung. Non-playback rebuilds (zoom merge/split,
 * AI generation, etc.) keep the full `0.3` reheat since the structure changes.
 */
const COMMUNITY_SIM_ALPHA_PLAYBACK_SCRUB = 0.12;
/** Reduced-motion floor: barely reheat so positions settle without drift. */
const COMMUNITY_SIM_ALPHA_REDUCED_MOTION = 0.04;
/** `forceCollide` padding added to the community's radius so neighbours don't touch. */
const COMMUNITY_SIM_COLLIDE_PADDING = 8;

function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_) {
    return false;
  }
}

/**
 * Layout coordinates for a node-like datum: missing, non-finite, or exactly (0,0) are unset.
 * Library playback and some saved graphs use 0,0 as a placeholder; otherwise forces pin everything to the SVG corner until forceX/forceY ease them toward center.
 */
function effectiveGraphCoords(node, fallbackX, fallbackY) {
  const x = node?.x;
  const y = node?.y;
  const xf = typeof x === 'number' && Number.isFinite(x);
  const yf = typeof y === 'number' && Number.isFinite(y);
  if (xf && yf && !(x === 0 && y === 0)) {
    return { x, y };
  }
  return { x: fallbackX, y: fallbackY };
}

/** GitHub #82: consecutive ids must share a link (undirected) for branch extrapolation. */
function pathHasConsecutiveGraphLinks(pathIds, links) {
  if (!Array.isArray(pathIds) || pathIds.length < 2 || !Array.isArray(links)) {
    return false;
  }
  for (let i = 0; i < pathIds.length - 1; i += 1) {
    const a = String(pathIds[i]);
    const b = String(pathIds[i + 1]);
    const ok = links.some(l => {
      const s =
        typeof l.source === 'object' && l.source != null
          ? String(l.source.id)
          : String(l.source);
      const t =
        typeof l.target === 'object' && l.target != null
          ? String(l.target.id)
          : String(l.target);
      return (s === a && t === b) || (s === b && t === a);
    });
    if (!ok) return false;
  }
  return true;
}

/** Community `d` is the anchor or contains it (single-node or merged). */
/**
 * Returns true if the community datum (or any of its member nodes for merged
 * communities) matches ANY id in the Set. Used by the target stretch animation
 * which may pulse multiple anchor nodes at once (manual AI generation,
 * community evolution, extrapolate branch, extend, explode).
 */
function communityDatumContainsAnyGraphNodeId(d, idsSet) {
  if (!d || !idsSet || idsSet.size === 0) return false;
  if (idsSet.has(String(d.id))) return true;
  return (
    Array.isArray(d.nodes) &&
    d.nodes.some((n) => n && idsSet.has(String(n.id)))
  );
}

function GraphVisualization({
  data,
  onDataUpdate,
  width: widthProp,
  height: heightProp,
  /**
   * `fixedViewport`: FAB fixed to window top-right (default).
   * `libraryGraphMount`: FAB absolutely positioned top-right of the graph container (Library + SVG).
   */
  actionsFabPlacement = 'fixedViewport',
  /** When true (shared read-only link, #39): no Actions menu, no canvas edits that call the server. */
  readOnly = false,
  /** #40: richer copy when mounted inside the library visualize layout. */
  emptyStateVariant = 'default',
  /**
   * GitHub #86: library timeline scrub token. `0` = live graph / tail; `playbackStepIndex + 1`
   * while scrubbing. Skips whole-SVG root crossfade and eases in newly visible communities/links.
   */
  playbackScrubToken = 0,
}) {
  const svgRef = useRef();
  const graphCanvasWrapRef = useRef(null);
  const selectedNodeIds = useRef(new Set());
  const selectedNodeId = useRef(null);
  /** Selected link key (for styling + tooltip). */
  const selectedLinkKeyRef = useRef(null);
  const [showGenerateForm, setShowGenerateForm] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  /**
   * GitHub #69: POST /api/explode-node (Wikipedia-backed dense subgraph from one anchor).
   * The tooltip only surfaces a button that opens `explodeModal`; all parameters
   * (guidance preset, custom text, concepts-to-add slider) live inside that modal.
   */
  const [explodeInProgress, setExplodeInProgress] = useState(false);
  const handleExplodeNodeRef = useRef(null);
  const [explodeTooltipNumNodes, setExplodeTooltipNumNodes] = useState(4);
  const [explodeModal, setExplodeModal] = useState({ open: false, nodeId: null });
  const [numNodesToAdd, setNumNodesToAdd] = useState(2);
  /** GitHub #62: manual (single call, link to all highlights) vs community evolution */
  const [expansionAlgorithm, setExpansionAlgorithm] = useState('manual');
  /**
   * Tooltip "Extend" action — per-node single-anchor generation (POST /api/generate-node
   * with `requiredAnchorId` = the tooltip node, plus ONE of `requiredRelationshipLabel`
   * or `requiredConceptHint`). Tooltip shows just a button that opens `extendModal`;
   * all parameters (constraint kind, text, guidance preset, custom text) live in the modal.
   */
  const [extendTooltipKind, setExtendTooltipKind] = useState('relationship');
  const [extendTooltipText, setExtendTooltipText] = useState('');
  const [extendInProgress, setExtendInProgress] = useState(false);
  const handleExtendNodeRef = useRef(null);
  const [extendModal, setExtendModal] = useState({ open: false, nodeId: null });
  const [rgConnectionsPerNewNode, setRgConnectionsPerNewNode] = useState(2);
  const [rgNumCycles, setRgNumCycles] = useState(2);
  /** GitHub #68: attachment bias for community evolution (-1 low-degree … +1 hub). */
  const [rgAnchorStrategy, setRgAnchorStrategy] = useState(0);
  const [rgPruneDuringGrowth, setRgPruneDuringGrowth] = useState(false);
  const [rgDeletionsPerCycle, setRgDeletionsPerCycle] = useState(1);
  /** GitHub #82 — branch extrapolation (POST /api/generate-branch). */
  const [brIterations, setBrIterations] = useState(2);
  const [brMemoryK, setBrMemoryK] = useState(3);
  /**
   * Cross-links per iteration: deterministic back-edges from newly generated
   * nodes into earlier memory-window nodes (server-side, after the LLM call).
   * 0 keeps the default "frontier-only" attachment; higher values introduce
   * topological back-references to the branch thread. Capped server-side
   * (see `getGenerateBranchCaps().maxCrossLinksPerIteration`).
   */
  const [brCrossLinksPerIteration, setBrCrossLinksPerIteration] = useState(0);
  /** Guidance preset + optional custom text (sent as generationContext; max 2000 chars server-side). */
  const [guidancePreset, setGuidancePreset] = useState('none');
  const [guidanceCustomText, setGuidanceCustomText] = useState('');
  /**
   * While any generation request is in flight (Explode, Extend, Manual,
   * Community evolution, Extrapolate branch), we pulse a random stretch on
   * the **target** node(s) — the anchors the user is generating from.
   * `nodeIds` is a Set so multiple anchors can animate in sync; the stretch
   * scale is shared across them for a coordinated wobble. Read in the sim tick.
   */
  const targetStretchRef = useRef({
    active: false,
    nodeIds: new Set(),
    sx: 1,
    sy: 1,
    tx: 1,
    ty: 1,
  });
  const targetStretchTimerStopRef = useRef(null);
  /** `updateVisualization` rebinds this; tick must run for stretch scale (sim cools and stops otherwise). */
  const communityForceSimulationRef = useRef(null);
  /** Saved simulation params while the target stretch gentle-reheat is active (velocityDecay + charge). */
  const targetStretchSimRestoreRef = useRef(null);

  const stopTargetStretchAnimation = () => {
    const st = targetStretchRef.current;
    st.active = false;
    st.nodeIds = new Set();
    st.sx = 1;
    st.sy = 1;
    st.tx = 1;
    st.ty = 1;
    const stop = targetStretchTimerStopRef.current;
    if (typeof stop === 'function') {
      stop();
      targetStretchTimerStopRef.current = null;
    }
    const sim = communityForceSimulationRef.current;
    const r = targetStretchSimRestoreRef.current;
    targetStretchSimRestoreRef.current = null;
    if (sim && r) {
      try {
        sim.velocityDecay(r.velocityDecay);
        if (r.chargeTweaked) {
          const ch = sim.force('charge');
          if (ch && typeof ch.strength === 'function') {
            ch.strength(COMMUNITY_SIM_CHARGE_DEFAULT);
          }
        }
      } catch (_) {
        /* ignore */
      }
    }
    try {
      communityForceSimulationRef.current?.alphaTarget(0);
    } catch (_) {
      /* ignore */
    }
  };

  /**
   * Starts the pulse for one OR MANY target node ids. Accepts a single id
   * (string | number) or an array of ids. Empty/nullish entries are filtered
   * out. No-ops silently if the normalized set is empty.
   */
  const startTargetStretchAnimation = (ids) => {
    stopTargetStretchAnimation();
    const list = Array.isArray(ids) ? ids : [ids];
    const normalized = list
      .filter((id) => id != null && id !== '')
      .map((id) => String(id));
    if (normalized.length === 0) return;
    const st = targetStretchRef.current;
    st.active = true;
    st.nodeIds = new Set(normalized);
    st.sx = 1;
    st.sy = 1;
    st.tx = 0.76 + Math.random() * 0.4;
    st.ty = 0.76 + Math.random() * 0.4;

    const pickTargets = () => {
      st.tx = 0.68 + Math.random() * 0.52;
      st.ty = 0.68 + Math.random() * 0.52;
    };

    const timer = d3.timer(() => {
      if (!st.active) {
        timer.stop();
        return;
      }
      const k = 0.09 + Math.sin(Date.now() / 650) * 0.04;
      st.sx += (st.tx - st.sx) * k;
      st.sy += (st.ty - st.sy) * k;
      if (Math.abs(st.sx - st.tx) < 0.03 && Math.abs(st.sy - st.ty) < 0.03) {
        pickTargets();
      }
    });
    targetStretchTimerStopRef.current = () => {
      timer.stop();
    };

    const sim = communityForceSimulationRef.current;
    if (sim) {
      try {
        targetStretchSimRestoreRef.current = {
          velocityDecay: sim.velocityDecay(),
          chargeTweaked: false,
        };
        sim.velocityDecay(COMMUNITY_SIM_VELOCITY_DECAY_EXPLODE);
        const ch = sim.force('charge');
        if (ch && typeof ch.strength === 'function') {
          ch.strength(COMMUNITY_SIM_CHARGE_EXPLODE);
          targetStretchSimRestoreRef.current.chargeTweaked = true;
        }
        sim
          .alphaTarget(COMMUNITY_SIM_ALPHA_TARGET_EXPLODE)
          .alpha(Math.max(sim.alpha(), COMMUNITY_SIM_ALPHA_MIN_EXPLODE))
          .restart();
      } catch (_) {
        targetStretchSimRestoreRef.current = null;
      }
    }
  };

  /**
   * Hide the on-canvas `.graph-canvas-tooltip` (the floating node-details popover
   * rendered via D3 inside `graphCanvasWrapRef`). Called whenever a generation or
   * edit submit fires (Extend, Explode, Apply, Add Concept, Add Relationship,
   * Add connections) so the stale popover doesn't linger over the graph while
   * the canvas redraws around the newly generated / mutated nodes. Also clears
   * the selected-link highlight so a stale link tooltip can't reopen.
   */
  const hideCanvasTooltip = () => {
    const mount = graphCanvasWrapRef.current;
    const tipNode = mount ? mount.querySelector('.graph-canvas-tooltip') : null;
    if (tipNode && tipNode.style) {
      tipNode.style.opacity = '0';
    }
    selectedLinkKeyRef.current = null;
  };

  const [generateProgress, setGenerateProgress] = useState(null);
  const randomizedGrowthCancelRef = useRef(false);
  const [showGraphActionsHelp, setShowGraphActionsHelp] = useState(false);
  /** Ids highlighted when Generate modal was opened (manual mode needs ≥1). */
  const [generateFormAnchorIds, setGenerateFormAnchorIds] = useState([]);
  const [generateSubmitError, setGenerateSubmitError] = useState(null);
  const expansionAlgorithmMeta =
    expansionAlgorithm === 'randomizedGrowth'
      ? {
        title: 'Community evolution',
        description:
          'Each cycle asks the AI for new concepts, then wires them in with random edges to your existing graph. The strategy slider nudges those edges toward peripheral or hub-like neighbors (using your graph’s links). Optional pruning removes a few non-highlighted nodes per cycle—highlighted anchors are never deleted. One API request per cycle; stop between cycles from the on-canvas chip.'
      }
      : expansionAlgorithm === 'branchExtrapolation'
        ? {
          title: 'Extrapolate branch',
          description:
            'Highlight an ordered path along edges (click in sequence from root toward the tip). The server grows from the path tip for several iterations, each time conditioning on the last memoryK nodes. One API call runs all iterations; progress shows on the chip until the response returns.'
        }
        : {
          title: 'Manual AI generate',
          description:
            'One-shot generation. The model returns nodes and links, and each new node must connect to every highlighted node.',
        };
  const [showAddForm, setShowAddForm] = useState(false);
  const [newNodeData, setNewNodeData] = useState({
    label: '',
    description: '',
    wikiUrl: ''
  });
  const [selectedNodes, setSelectedNodes] = useState([]);
  const [relationshipForm, setRelationshipForm] = useState({
    show: false,
    relationship: ''
  });
  const [deleteDecision, setDeleteDecision] = useState(null);
  /** After Add Node, prompt for one relationship per highlighted id (see connectNewNodeToIdsRef). */
  const [connectNewNodeLinksForm, setConnectNewNodeLinksForm] = useState(null);
  /** Labels-only hint on Add Concept modal (ids of nodes the new concept will link to). */
  const [pendingConnectIdsForAddForm, setPendingConnectIdsForAddForm] = useState([]);
  const [graphActionMenu, setGraphActionMenu] = useState(null);
  /** Collapsible Actions menu sections (Generate vs Edit), like Library sidebar accordions */
  const [graphActionMenuSectionsOpen, setGraphActionMenuSectionsOpen] = useState({
    generate: true,
    edit: true,
  });

  const graphActionMenuRef = useRef(null);
  const graphActionMenuCloseRef = useRef(null);
  const graphActionsFabRef = useRef(null);
  const graphActionSnapshotRef = useRef({ nodeIds: [], relationshipNodes: [] });
  const generateSourceIdsRef = useRef(null);
  /** Node ids (from menu snapshot) to connect after "Add Node" submit; cleared after use. */
  const connectNewNodeToIdsRef = useRef([]);

  /** GitHub #38: label search + minimap (refs avoid re-running the D3 effect on each keystroke). */
  const [discoveryQuery, setDiscoveryQuery] = useState('');
  const [discoveryFocusIndex, setDiscoveryFocusIndex] = useState(0);
  /** Insights panel: LLM assessment from centrality-notable nodes. */
  /**
   * Voice/tone for the Insights "Assess" LLM call. The picker UI was removed —
   * every assessment uses the Manuel DeLanda systems / assemblage-theory frame
   * (server-side `TONE_SYSTEM_HINTS.delanda`) since it pairs naturally with
   * the graph/network lens. Kept as useState (rather than a bare constant) so
   * the `handleInsightsAssess` `useCallback` deps array stays stable if the
   * tone is ever surfaced again.
   */
  const [insightsAssessTone] = useState('delanda');
  /**
   * Reflection ↔ Discovery slider (0..100, default 50). Sent as
   * `reflectionBalance` on POST /api/graph-insights-assess; the server maps
   * the numeric value into one of five directive bands (see
   * `buildReflectionBalanceDirective` in `server/lib/graphInsightsAssess.js`).
   */
  const [insightsAssessReflectionBalance, setInsightsAssessReflectionBalance] =
    useState(INSIGHT_ASSESS_REFLECTION_BALANCE_DEFAULT);
  const [insightsAssessGuidingFocus, setInsightsAssessGuidingFocus] =
    useState('all');
  const [insightsAssessLength, setInsightsAssessLength] = useState('low');
  const [insightsAssessCustomGuiding, setInsightsAssessCustomGuiding] =
    useState('');
  const [insightsAssessment, setInsightsAssessment] = useState('');
  const [insightsAssessLoading, setInsightsAssessLoading] = useState(false);
  const [insightsAssessError, setInsightsAssessError] = useState(null);
  /** Notable-by-centrality block: minimized (collapsed) by default. */
  const [insightsNotableCentralitiesExpanded, setInsightsNotableCentralitiesExpanded] =
    useState(false);
  /** Which centrality metric help dialog is open (`null` = closed). */
  const [insightsMetricHelpKey, setInsightsMetricHelpKey] = useState(null);
  /** Transient Copy / Save feedback under the assessment toolbar. */
  const [insightsAssessActionFeedback, setInsightsAssessActionFeedback] =
    useState(null);
  const discoveryQueryRef = useRef('');
  /** Set in D3 effect: `zoom.transform` must use the same zoom instance as `svg.call(zoom)`. */
  const applyProgrammaticZoomTransformRef = useRef(null);
  /** Set in D3 effect: select matched node, refresh highlights, show docked tooltip (Focus next / Enter). */
  const applyDiscoveryFocusNodeUiRef = useRef(null);
  const updateHighlightingRef = useRef(null);
  const updateMinimapRef = useRef(null);
  const graphTransformRef = useRef(null);
  const minimapRafRef = useRef(null);
  const minimapSvgRef = useRef(null);
  /** GitHub #73: last minimap world bounds (graph coords) for click/drag → pan. */
  const minimapExtentsRef = useRef(null);
  /** Pointer-drag state for minimap pan (avoids treating drags as clicks). */
  const minimapNavDragRef = useRef(null);
  /** Skip merge/split while applying programmatic fit (zoom-out would otherwise re-cluster). */
  const skipZoomClusteringRef = useRef(false);
  const resetCanvasViewRef = useRef(null);
  /** Hierarchical communities map — same datums the force sim positions on screen. */
  const communitiesRef = useRef(null);

  const { sessionId } = useSession();
  const { graphSearchBarVisible, insightsPanelVisible } = useGraphChromeUi();
  const graphTitleContext = useContext(GraphTitleContext);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  /** Clears all graph edit tool modes, modals, and node selections (Escape + mutual exclusivity). */
  const exitGraphEditModes = useCallback(() => {
    setShowAddForm(false);
    setShowGenerateForm(false);
    setRelationshipForm({ show: false, relationship: '' });
    setConnectNewNodeLinksForm(null);
    setPendingConnectIdsForAddForm([]);
    connectNewNodeToIdsRef.current = [];
    setSelectedNodes([]);
    selectedNodeIds.current.clear();
    selectedNodeId.current = null;
    selectedLinkKeyRef.current = null;
    setGraphActionMenu(null);
    generateSourceIdsRef.current = null;
    setGenerateProgress(null);
    randomizedGrowthCancelRef.current = false;
    setShowGraphActionsHelp(false);
    setGenerateFormAnchorIds([]);
    setGenerateSubmitError(null);
    setGuidancePreset('none');
    setGuidanceCustomText('');
    setDiscoveryQuery('');
    discoveryQueryRef.current = '';
    setDiscoveryFocusIndex(0);
    setInsightsMetricHelpKey(null);
  }, []);

  const captureGraphActionSnapshot = useCallback(() => {
    const ids = Array.from(selectedNodeIds.current).map(String);
    const nodesOrdered = ids
      .map(id => data.nodes.find(n => String(n.id) === id))
      .filter(Boolean);
    let linkToDelete = null;
    if (ids.length === 2) {
      const [a, b] = ids;
      linkToDelete =
        data.links.find(l => {
          const s = typeof l.source === 'object' ? String(l.source.id) : String(l.source);
          const t = typeof l.target === 'object' ? String(l.target.id) : String(l.target);
          return (s === a && t === b) || (s === b && t === a);
        }) || null;
    }
    graphActionSnapshotRef.current = {
      nodeIds: ids,
      relationshipNodes: [...selectedNodes],
      nodesOrdered,
      linkToDelete,
    };
  }, [data, selectedNodes]);

  const openGraphActionMenuAt = useCallback(
    (clientX, clientY) => {
      if (readOnly) return;
      captureGraphActionSnapshot();
      const w = 260;
      const h = 300;
      const x = Math.max(8, Math.min(clientX, window.innerWidth - w - 8));
      const y = Math.max(8, Math.min(clientY, window.innerHeight - h - 8));
      setGraphActionMenu({ x, y });
    },
    [captureGraphActionSnapshot, readOnly]
  );

  const toggleGraphActionsFromFab = useCallback(() => {
    if (readOnly) return;
    setGraphActionMenu(prev => {
      if (prev) return null;
      captureGraphActionSnapshot();
      const w = 260;
      const h = 300;
      const fab = graphActionsFabRef.current;
      if (fab) {
        const r = fab.getBoundingClientRect();
        let x = r.right - w;
        let y = r.bottom + 10;
        if (y + h > window.innerHeight - 8) {
          y = r.top - h - 10;
        }
        x = Math.max(8, Math.min(x, window.innerWidth - w - 8));
        y = Math.max(8, Math.min(y, window.innerHeight - h - 8));
        return { x, y };
      }
      return {
        x: Math.max(8, (window.innerWidth - w) / 2),
        y: 100,
      };
    });
  }, [captureGraphActionSnapshot, readOnly]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      exitGraphEditModes();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [exitGraphEditModes]);

  useEffect(() => {
    if (!graphActionMenu) return undefined;
    const onDocPointerDown = (e) => {
      const t = e.target;
      if (graphActionMenuRef.current?.contains(t)) return;
      if (graphActionsFabRef.current?.contains(t)) return;
      if (showGraphActionsHelp) return;
      setGraphActionMenu(null);
    };
    document.addEventListener('mousedown', onDocPointerDown);
    document.addEventListener('touchstart', onDocPointerDown, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onDocPointerDown);
      document.removeEventListener('touchstart', onDocPointerDown);
    };
  }, [graphActionMenu, showGraphActionsHelp]);

  /** Move focus into the panel when it opens (#30: keyboard / AT). */
  useEffect(() => {
    if (!graphActionMenu) return undefined;
    const id = window.setTimeout(() => {
      graphActionMenuCloseRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [graphActionMenu]);

  /** Right-click opens the graph actions menu (same as Actions). No long-press on the canvas. */
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const onContextMenu = (e) => {
      e.preventDefault();
      if (readOnly) return;
      openGraphActionMenuAt(e.clientX, e.clientY);
    };
    svg.addEventListener('contextmenu', onContextMenu);
    return () => svg.removeEventListener('contextmenu', onContextMenu);
  }, [openGraphActionMenuAt, readOnly]);

  const trackOperation = useCallback(
    async (operationType, details, startTime = Date.now(), error = null) => {
      try {
        const duration = Date.now() - startTime;
        const status = error ? 'FAILURE' : 'SUCCESS';

        console.log('Tracking operation:', {
          graphId: window.currentGraphId,
          sessionId: sessionIdRef.current,
          operationType,
          status,
          duration,
          details
        });

        const payload = await apiRequest('/api/operations', {
          method: 'POST',
          json: {
            graphId: window.currentGraphId,
            sessionId: sessionIdRef.current,
            operationType,
            status,
            duration,
            error: error?.message,
            details,
          },
        });
        if (!payload.success) {
          console.warn('Failed to track operation:', payload.error);
        }
      } catch (err) {
        console.warn('Error tracking operation:', err);
      }
    },
    []
  );

  /** Viewport size from parent (e.g. LibraryVisualize); defaults match prior hardcoded SVG size. */
  const width = widthProp ?? 800;
  const height = heightProp ?? 600;

  useEffect(() => {
    discoveryQueryRef.current = discoveryQuery;
    updateHighlightingRef.current?.();
  }, [discoveryQuery]);

  useEffect(() => {
    setDiscoveryFocusIndex(0);
  }, [discoveryQuery]);

  const focusNextDiscoveryMatch = useCallback(() => {
    const q = discoveryQuery.trim();
    if (!q || !data?.nodes?.length) return;
    const matches = nodesMatchingLabelQuery(data.nodes, q);
    if (!matches.length) return;
    const idx = discoveryFocusIndex % matches.length;
    const node = matches[idx];
    const fbX = width / 2;
    const fbY = height / 2;
    const { x: nx, y: ny } = discoveryFocusPoint(
      node,
      communitiesRef.current,
      fbX,
      fbY
    );
    const kCur = graphTransformRef.current?.k;
    const k =
      typeof kCur === 'number' && kCur > 0 && Number.isFinite(kCur) ? kCur : 1.2;
    const t = createFocusZoomTransform(nx, ny, width, height, k);
    applyProgrammaticZoomTransformRef.current?.(t);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        applyDiscoveryFocusNodeUiRef.current?.(node);
      });
    });
    setDiscoveryFocusIndex((idx + 1) % matches.length);
  }, [discoveryQuery, discoveryFocusIndex, data, width, height]);

  const graphInsights = useMemo(() => {
    if (!insightsPanelVisible) return null;
    return computeGraphInsights(data || { nodes: [], links: [] });
  }, [insightsPanelVisible, data]);

  const insightNotableCentralities = useMemo(() => {
    if (!insightsPanelVisible || !data?.nodes?.length) return null;
    return computeInsightNotableCentralities(data, 3);
  }, [insightsPanelVisible, data]);

  useEffect(() => {
    if (!insightsPanelVisible) {
      setInsightsMetricHelpKey(null);
    }
  }, [insightsPanelVisible]);

  useEffect(() => {
    if (!insightsMetricHelpKey) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setInsightsMetricHelpKey(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [insightsMetricHelpKey]);

  const focusInsightNodeById = useCallback(
    (nodeId) => {
      if (!data?.nodes?.length) return;
      const idStr = String(nodeId);
      const node = data.nodes.find((n) => String(n.id) === idStr);
      if (!node) return;
      const fbX = width / 2;
      const fbY = height / 2;
      const { x: nx, y: ny } = discoveryFocusPoint(
        node,
        communitiesRef.current,
        fbX,
        fbY
      );
      const kCur = graphTransformRef.current?.k;
      const k =
        typeof kCur === 'number' && kCur > 0 && Number.isFinite(kCur) ? kCur : 1.2;
      const t = createFocusZoomTransform(nx, ny, width, height, k);
      applyProgrammaticZoomTransformRef.current?.(t);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          applyDiscoveryFocusNodeUiRef.current?.(node);
        });
      });
    },
    [data, width, height]
  );

  const handleInsightsAssess = useCallback(async () => {
    if (!data?.nodes?.length) {
      setInsightsAssessError('No concepts in the graph to assess.');
      return;
    }
    if (
      insightsAssessGuidingFocus === 'custom' &&
      insightsAssessCustomGuiding.trim().length < 8
    ) {
      setInsightsAssessError('What the assessment should answer: enter at least 8 characters.');
      return;
    }
    setInsightsAssessLoading(true);
    setInsightsAssessError(null);
    setInsightsAssessActionFeedback(null);
    try {
      const payload = buildGraphInsightAssessPayload(data, 6);
      const body = {
        tone: insightsAssessTone,
        guidingFocus: insightsAssessGuidingFocus,
        assessmentLength: insightsAssessLength,
        reflectionBalance: insightsAssessReflectionBalance,
        ...payload,
      };
      if (insightsAssessGuidingFocus === 'custom') {
        body.customGuidingQuestions = insightsAssessCustomGuiding.trim();
      }
      const res = await apiRequest('/api/graph-insights-assess', {
        method: 'POST',
        json: body,
      });
      if (!res.success) {
        throw new Error(res.details || res.error || 'Assessment failed');
      }
      const text =
        typeof res.assessment === 'string' ? res.assessment.trim() : '';
      if (!text) {
        throw new Error('The server returned an empty assessment. Try again.');
      }
      setInsightsAssessment(text);
      setInsightsAssessActionFeedback(null);
    } catch (err) {
      setInsightsAssessment('');
      setInsightsAssessError(getApiErrorMessage(err));
    } finally {
      setInsightsAssessLoading(false);
    }
  }, [
    data,
    insightsAssessTone,
    insightsAssessGuidingFocus,
    insightsAssessLength,
    insightsAssessReflectionBalance,
    insightsAssessCustomGuiding,
  ]);

  const copyInsightsAssessment = useCallback(async () => {
    const text = insightsAssessment;
    if (!text) return;
    const flash = (message) => {
      setInsightsAssessActionFeedback({ message, variant: 'default' });
      window.setTimeout(() => setInsightsAssessActionFeedback(null), 2500);
    };
    const flashErr = (message) => {
      setInsightsAssessActionFeedback({ message, variant: 'error' });
      window.setTimeout(() => setInsightsAssessActionFeedback(null), 4000);
    };
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        flash('Copied to clipboard');
        return;
      }
    } catch {
      /* fallback */
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) {
        flash('Copied to clipboard');
      } else {
        flashErr('Could not copy — select the text manually');
      }
    } catch {
      flashErr('Could not copy — select the text manually');
    }
  }, [insightsAssessment]);

  const saveInsightsAssessment = useCallback(() => {
    if (!insightsAssessment) return;
    const name = buildNetworkAssessmentFilename(graphTitleContext?.graphTitle);
    const blob = new Blob([insightsAssessment], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setInsightsAssessActionFeedback({
      message: 'Download started',
      variant: 'default',
    });
    window.setTimeout(() => setInsightsAssessActionFeedback(null), 2500);
  }, [insightsAssessment, graphTitleContext?.graphTitle]);

  const closeInsightsAssessment = useCallback(() => {
    setInsightsAssessment('');
    setInsightsAssessActionFeedback(null);
  }, []);

  // Add new refs without modifying existing state
  const previousZoomRef = useRef(1);
  const MERGE_THRESHOLD = 0.8; // When to merge: current zoom is 80% of previous

  // Add new refs for tracking thresholds
  const mergeThresholdRef = useRef(0.8);  // Initial merge threshold
  const splitThresholdRef = useRef(1.2);  // Initial split threshold (1/0.8)

  /** GitHub #86: community-layer diff across playback scrubs (refs survive D3 effect re-runs). */
  const playbackPrevCommunityIdsRef = useRef(null);
  const playbackPrevLinkKeysRef = useRef(null);
  const lastPlaybackFadeTokenRef = useRef(0);
  const playbackEaseHighlightTimerRef = useRef(null);
  /** GitHub #86: highlight the delta for the current scrub step. */
  const playbackStepHotNodeIdsRef = useRef(new Set());
  const playbackStepHotLinkKeysRef = useRef(new Set());
  /**
   * GitHub #89: disjoint-force playback continuity. Snapshot of the last
   * community layout (`{ x, y, vx, vy }` by community id) captured before each
   * `updateVisualization` rebuild. Seeded back into the fresh community map so
   * unchanged nodes don't get flung when the scrub advances.
   */
  const previousCommunityPositionsRef = useRef(null);

  const defaultNodeColor = '#4a90e2';  // default node color is blue
  const highlightedColor = '#e74c3c' ; // highlighted node color is red
  const searchHighlightFill = '#f39c12';
  const searchHighlightStroke = '#d68910';

  useEffect(() => {
    if (!data || !data.nodes || !data.links) return;

    const cx = width / 2;
    const cy = height / 2;
    /** Raw graph node / simulation datum coordinates (omit, NaN, and (0,0) → viewport center). */
    const nodeXIn = (n) => effectiveGraphCoords(n, cx, cy).x;
    const nodeYIn = (n) => effectiveGraphCoords(n, cx, cy).y;
    const simX = (d) => effectiveGraphCoords(d, cx, cy).x;
    const simY = (d) => effectiveGraphCoords(d, cx, cy).y;

    for (const n of data.nodes) {
      const { x: nx, y: ny } = effectiveGraphCoords(n, cx, cy);
      if (n.x !== nx || n.y !== ny) {
        n.x = nx;
        n.y = ny;
      }
      if (typeof n.vx !== 'number' || !Number.isFinite(n.vx)) n.vx = 0;
      if (typeof n.vy !== 'number' || !Number.isFinite(n.vy)) n.vy = 0;
    }

    const svg = d3.select(svgRef.current);
    // Animations disabled (fade/ease/transition) — user preference.

    if (playbackScrubToken === 0) {
      lastPlaybackFadeTokenRef.current = 0;
      playbackPrevCommunityIdsRef.current = null;
      playbackPrevLinkKeysRef.current = null;
      playbackStepHotNodeIdsRef.current = new Set();
      playbackStepHotLinkKeysRef.current = new Set();
      // Tail of playback → live graph: drop the sim-position snapshot so the
      // live structural rebuild starts from the authored positions, not scrub
      // residue.
      previousCommunityPositionsRef.current = null;
    }

    // Rapid playback scrubs can re-render before the prior fade-out completes.
    // Ensure we don't accumulate multiple previous roots (which looks like a duplicated graph).
    svg.selectAll('g.graph-root--prev').remove();

    // Fade out the previous render root instead of hard-clearing the SVG.
    // Keep it around during playback scrubs so we can highlight removals (last-step deltas).
    const prevRoot = svg.select('g.graph-root');
    if (!prevRoot.empty()) {
      prevRoot.remove();
    }

    // Initialize hierarchical communities with individual nodes.
    // GitHub #89: when a prior simulation snapshot exists for the same id, carry
    // over its `{ x, y, vx, vy }` so playback scrubs don't re-flatten the layout
    // back to `nodeXIn/nodeYIn`. Brand-new communities still fall through to the
    // source node's coordinates (and get seeded near their component centroid
    // below once we know the links).
    const initializeCommunities = () => {
      const communities = new Map();
      const prior = previousCommunityPositionsRef.current;

      data.nodes.forEach(node => {
        const priorPos = prior ? prior.get(String(node.id)) : null;
        communities.set(node.id, {
          id: node.id,
          nodes: [{ ...node }],
          parent: null,
          children: [],
          level: 0,
          x: priorPos ? priorPos.x : nodeXIn(node),
          y: priorPos ? priorPos.y : nodeYIn(node),
          vx: priorPos ? priorPos.vx : 0,
          vy: priorPos ? priorPos.vy : 0,
          label: node.label,
          description: node.description,
          wikiUrl: node.wikiUrl,
          thumbnailUrl: node.thumbnailUrl,
          color: defaultNodeColor // All initial nodes should be blue
        });
      });
      return communities;
    };

    // Merge closest communities based on graph connectivity
    const mergeCommunities = (currentCommunities) => {
      if (currentCommunities.size <= 1) return currentCommunities;

      const communityArray = Array.from(currentCommunities.values());
      const newCommunities = new Map();
      const merged = new Set();
      const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

      for (let i = 0; i < communityArray.length; i++) {
        if (merged.has(communityArray[i].id)) continue;

        const community1 = communityArray[i];
        let closestCommunity = null;
        let minDistance = Infinity;

        for (let j = i + 1; j < communityArray.length; j++) {
          if (merged.has(communityArray[j].id)) continue;

          const community2 = communityArray[j];
          const distance = Math.sqrt(
            Math.pow(
              d3.mean(community1.nodes, n => nodeXIn(n)) -
              d3.mean(community2.nodes, n => nodeXIn(n)),
              2
            ) +
            Math.pow(
              d3.mean(community1.nodes, n => nodeYIn(n)) -
              d3.mean(community2.nodes, n => nodeYIn(n)),
              2
            )
          );

          if (distance < minDistance) {
            minDistance = distance;
            closestCommunity = community2;
          }
        }

        if (closestCommunity && minDistance < 100) {
          const mergedNodes = [...community1.nodes, ...closestCommunity.nodes];
          
          // Create merged community with new unique color
          const mergedCommunity = {
            id: `merged-${community1.id}-${closestCommunity.id}`,
            nodes: mergedNodes,
            parent: null,
            children: [community1, closestCommunity],
            level: Math.max(community1.level, closestCommunity.level) + 1,
            x: d3.mean(mergedNodes, n => nodeXIn(n)),
            y: d3.mean(mergedNodes, n => nodeYIn(n)),
            label: `Group ${i}`,
            description: `Contains ${mergedNodes.length} nodes: ${mergedNodes.map(n => n.label).join(', ')}`,
            color: colorScale(Math.random()) // Assign new unique color to merged community
          };

          merged.add(community1.id);
          merged.add(closestCommunity.id);
          newCommunities.set(mergedCommunity.id, mergedCommunity);
        } else if (!merged.has(community1.id)) {
          newCommunities.set(community1.id, community1);
        }
      }

      // Add remaining unmerged communities
      communityArray.forEach(community => {
        if (!merged.has(community.id)) {
          newCommunities.set(community.id, community);
        }
      });

      return newCommunities;
    };

    // Split communities based on their hierarchy
    const splitCommunities = (currentCommunities) => {
      const communityArray = Array.from(currentCommunities.values());
      const newCommunities = new Map();

      // Find the largest community to split
      let largestCommunity = null;
      let maxSize = 1;

      communityArray.forEach(community => {
        if (community.nodes.length > maxSize) {
          maxSize = community.nodes.length;
          largestCommunity = community;
        }
      });

      if (!largestCommunity || maxSize <= 1) {
        return currentCommunities;
      }

      console.log('Splitting community:', largestCommunity); // Debug log

      // Split the largest community back into original nodes
      largestCommunity.nodes.forEach(node => {
        const commXY = effectiveGraphCoords(largestCommunity, cx, cy);
        const splitPos = effectiveGraphCoords(node, commXY.x, commXY.y);
        // Ensure all node properties are preserved
        const restoredNode = {
          id: node.id,
          nodes: [{
            ...node,
            label: node.label || 'Unnamed Node', // Ensure label exists
            description: node.description || '',
            wikiUrl: node.wikiUrl || ''
          }],
          parent: null,
          children: [],
          level: 0,
          x: splitPos.x,
          y: splitPos.y,
          // Preserve original node properties
          label: node.label || 'Unnamed Node',
          description: node.description || '',
          wikiUrl: node.wikiUrl || '',
          color: defaultNodeColor, // All initial nodes should be blue
        };
        newCommunities.set(node.id, restoredNode);
      });

      // Keep all other communities as they are
      communityArray.forEach(community => {
        if (community.id !== largestCommunity.id) {
          newCommunities.set(community.id, community);
        }
      });

      return newCommunities;
    };

    // Initialize communities if not already done
    if (!communitiesRef.current) {
      communitiesRef.current = initializeCommunities();
    }

    // Set up the SVG dimensions
    svg.attr('width', width);
    svg.attr('height', height);
    // Always initialize communities when the component mounts or data changes
    communitiesRef.current = initializeCommunities();

    // Note: we do not hard-remove `g.graph-root` here because playback scrub keeps a
    // previous root around briefly for crossfade + removal highlighting.

    // Modify the zoom behavior
    const g = svg
      .append('g')
      .attr('class', 'graph-root')
      .style('opacity', 1);
    graphTransformRef.current = d3.zoomIdentity;

    const zoom = d3.zoom()
      .extent([[0, 0], [width, height]])
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        graphTransformRef.current = event.transform;
        g.attr('transform', event.transform);
        updateMinimapRef.current?.();
        const currentZoom = event.transform.k;
        
        console.log('Zoom event:', {
          currentZoom,
          previousZoom: previousZoomRef.current,
          mergeThreshold: mergeThresholdRef.current,
          splitThreshold: splitThresholdRef.current,
          currentCommunities: communitiesRef.current?.size || 0
        });

        // Check if we should merge or split (skipped during programmatic "Show all" fit)
        if (!skipZoomClusteringRef.current) {
          if (currentZoom < mergeThresholdRef.current) {
            console.log('Attempting merge with', communitiesRef.current.size, 'communities');
            const newCommunities = mergeCommunities(communitiesRef.current);
            if (newCommunities !== communitiesRef.current) {
              communitiesRef.current = newCommunities;
              updateVisualization();
            }
            mergeThresholdRef.current = Math.min(currentZoom * MERGE_THRESHOLD, 0.8);
            splitThresholdRef.current = currentZoom / MERGE_THRESHOLD;
          } else if (currentZoom > splitThresholdRef.current) {
            console.log('Attempting split with', communitiesRef.current.size, 'communities');
            const newCommunities = splitCommunities(communitiesRef.current);
            if (newCommunities !== communitiesRef.current) {
              communitiesRef.current = newCommunities;
              updateVisualization();
            }
            mergeThresholdRef.current = Math.min(currentZoom * MERGE_THRESHOLD, 0.8);
            splitThresholdRef.current = currentZoom / MERGE_THRESHOLD;
          }
        }

        // Update positions and visuals based on current communities
        const visibleCommunities = communitiesRef.current;
        const visibleNodeCount = visibleCommunities.size;
        const reductionRatio = Math.max(1, data.nodes.length / visibleNodeCount);
        const baseSize = Math.min(200, 20 * Math.sqrt(reductionRatio));

        // Update community positions
        visibleCommunities.forEach(community => {
          if (community.nodes.length > 1) {
            const centerX = d3.mean(community.nodes, d => nodeXIn(d));
            const centerY = d3.mean(community.nodes, d => nodeYIn(d));
            const strength = Math.min(0.95, Math.max(0, 1 - currentZoom));
            
            community.nodes.forEach(node => {
              const px = nodeXIn(node);
              const py = nodeYIn(node);
              node.x = px * (1 - strength) + centerX * strength;
              node.y = py * (1 - strength) + centerY * strength;
            });
          }
        });

        // Update node sizes and appearance
        updateHighlighting();

        // Update link visibility (no transitions)
        g.selectAll('.link')
          .style('opacity', Math.max(0.2, Math.min(0.6, currentZoom)))
          .attr('stroke-width', Math.max(1, 3 * (1 / currentZoom)));

          
        // Update labels (no transitions)
        g.selectAll('.node text')
          .attr('y', d => {
            const community = Array.from(visibleCommunities.values())
              .find(c => c.nodes.some(n => n.id === d.id));
            if (community?.nodes.length > 1) {
              const sizeMultiplier = Math.sqrt(community.nodes.length);
              const nodeSize = Math.min(200, Math.max(30, baseSize * sizeMultiplier));
              return nodeSize + 15;
            }
            return 35;
          })
          .text(d => {
            const community = Array.from(visibleCommunities.values())
              .find(c => c.nodes.some(n => n.id === d.id));
            return community?.nodes.length > 1 ? 
              `${d.label} (${community.nodes.length})` : d.label;
          })
          .attr('font-size', d => {
            const community = Array.from(visibleCommunities.values())
              .find(c => c.nodes.some(n => n.id === d.id));
            return community?.nodes.length > 1 ? 
              `${Math.max(12, baseSize/2)}px` : '12px';
          });


        previousZoomRef.current = currentZoom;
      });

    function focusOnNodeId(nodeId, k = 1.6) {
      const node = data.nodes.find((n) => String(n.id) === String(nodeId));
      if (!node) return;
      const nx = nodeXIn(node);
      const ny = nodeYIn(node);
      const t = createFocusZoomTransform(nx, ny, width, height, k);
      d3.select(svgRef.current).call(zoom.transform, t);
    }

    svg.call(zoom);
    applyProgrammaticZoomTransformRef.current = (transform) => {
      if (!svgRef.current || !transform) return;
      d3.select(svgRef.current).call(zoom.transform, transform);
    };

    // no fade-in

    // Create a map of nodes for reference
    const nodeMap = new Map(data.nodes.map(node => [node.id, node]));

    // Process links to ensure they reference actual node objects
    const processedLinks = data.links.map(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      
      return {
        ...link,
        source: nodeMap.get(sourceId),
        target: nodeMap.get(targetId)
      };
    });

    // Create the force simulation with processed data.
    // forceX + forceY (vs forceCenter) behave better for disjoint-style graphs: each component
    // eases toward the viewport center without one combined pull (Observable disjoint graph pattern).
    // GitHub #89: collide radius scales with community size (single nodes: 20,
    // merged clusters: up to ~200) instead of a fixed 50 — fixes merged-cluster
    // overlap after splits and keeps per-component spacing visually honest.
    const communityCollideRadius = (d) => {
      const nodeCount = Array.isArray(d?.nodes) ? d.nodes.length : 0;
      const base = nodeCount > 1 ? Math.min(200, Math.max(40, 20 + 3 * nodeCount)) : 20;
      return base + COMMUNITY_SIM_COLLIDE_PADDING;
    };
    const simulation = d3.forceSimulation(data.nodes)
      .force('link', d3.forceLink(processedLinks)
        .id(d => d.id)
        .distance(100))
      .force('charge', d3.forceManyBody().strength(COMMUNITY_SIM_CHARGE_DEFAULT))
      .force('x', d3.forceX(width / 2).strength(COMMUNITY_SIM_XY_STRENGTH))
      .force('y', d3.forceY(height / 2).strength(COMMUNITY_SIM_XY_STRENGTH))
      .force('collision', d3.forceCollide().radius(communityCollideRadius).iterations(2));

    // Tooltip: placed just left of the clicked node/link (clamped inside canvas)
    const tooltipMount =
      graphCanvasWrapRef.current || svgRef.current?.parentElement || null;
    const tooltip = (tooltipMount ? d3.select(tooltipMount) : d3.select('body'))
      .append('div')
      .attr('class', 'tooltip graph-canvas-tooltip')
      .attr('role', 'status')
      .attr('aria-live', 'polite')
      .style('opacity', 0);

    const TOOLTIP_CLOSE_HTML =
      '<button type="button" class="graph-tooltip-close" data-tooltip-close="1" aria-label="Close tooltip">×</button>';

    function withTooltipChrome(innerHtml) {
      return (
        '<div class="graph-tooltip-chrome">' +
        TOOLTIP_CLOSE_HTML +
        '<div class="graph-tooltip-body">' +
        innerHtml +
        '</div>' +
        '</div>'
      );
    }

    function escapeHtmlAttr(s) {
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;');
    }

    /**
     * Tooltip Extend button only. Clicking opens `extendModal` (React-rendered), where
     * the user picks constraint kind + text + guidance before submitting.
     */
    function extendTooltipFragmentHtml(fromData) {
      const safe = escapeHtmlAttr(String(fromData.id));
      return (
        '<div class="graph-tooltip-extend-wrap" data-testid="graph-tooltip-extend-wrap">' +
        '<button type="button" class="graph-tooltip-extend-btn" data-tooltip-extend="1" ' +
        'data-testid="graph-tooltip-extend-btn" ' +
        `data-node-id="${safe}" aria-label="Extend">` +
        '🌳 Extend 🌳' +
        '</button>' +
        '</div>'
      );
    }

    /**
     * Tooltip Explode button only. Clicking opens `explodeModal` (React-rendered), where
     * the user picks guidance + concepts-to-add before submitting.
     */
    function explodeTooltipActionsHtml(anchorNode) {
      if (readOnly || typeof onDataUpdate !== 'function' || !anchorNode) return '';
      const fromData = data.nodes.find((n) => String(n.id) === String(anchorNode.id));
      if (!fromData) return '';
      const extendFrag = extendTooltipFragmentHtml(fromData);
      if (fromData.explosionExpandedAt != null) {
        return (
          '<div class="graph-tooltip-explode-wrap">' +
          extendFrag +
          '<p class="graph-tooltip-explode-note">Subgraph already expanded for this concept.</p>' +
          '</div>'
        );
      }
      const safe = escapeHtmlAttr(String(fromData.id));
      return (
        '<div class="graph-tooltip-explode-wrap">' +
        extendFrag +
        '<button type="button" class="graph-tooltip-explode-btn" data-tooltip-explode="1" ' +
        'data-testid="graph-tooltip-explode-btn" ' +
        `data-node-id="${safe}" aria-label="Explode">` +
        '💥 Explode 💥' +
        '</button>' +
        '</div>'
      );
    }

    // Tooltip now renders only two buttons; parameters live in React modals.
    // Delegated click opens the matching modal — no change/input listeners needed.
    const wrapForExplode = graphCanvasWrapRef.current;
    let onTooltipWrapInteraction = null;
    if (wrapForExplode) {
      onTooltipWrapInteraction = (e) => {
        if (e.type !== 'click') return;
        const tgt = e.target;
        const closeBtn =
          tgt && typeof tgt.closest === 'function'
            ? tgt.closest('[data-tooltip-close="1"]')
            : null;
        if (closeBtn && wrapForExplode.contains(closeBtn)) {
          e.preventDefault();
          e.stopPropagation();
          tooltip.style('opacity', 0);
          selectedNodeIds.current.clear();
          selectedNodeId.current = null;
          setSelectedNodes([]);
          updateHighlighting();
          return;
        }
        const extendBtn =
          tgt && typeof tgt.closest === 'function'
            ? tgt.closest('[data-tooltip-extend="1"]')
            : null;
        if (extendBtn && wrapForExplode.contains(extendBtn)) {
          e.preventDefault();
          e.stopPropagation();
          const rawId = extendBtn.getAttribute('data-node-id');
          if (rawId != null && rawId !== '') {
            setExtendModal({ open: true, nodeId: rawId });
          }
          return;
        }
        const btn =
          tgt && typeof tgt.closest === 'function'
            ? tgt.closest('[data-tooltip-explode="1"]')
            : null;
        if (!btn || !wrapForExplode.contains(btn)) return;
        e.preventDefault();
        e.stopPropagation();
        const rawId = btn.getAttribute('data-node-id');
        if (rawId != null && rawId !== '') {
          setExplodeModal({ open: true, nodeId: rawId });
        }
      };
      wrapForExplode.addEventListener('click', onTooltipWrapInteraction);
    }

    function positionCanvasTooltipNearTarget(targetEl) {
      const mount = graphCanvasWrapRef.current;
      if (!mount || !targetEl || typeof targetEl.getBoundingClientRect !== 'function') {
        return;
      }
      const tipNode = mount.querySelector('.graph-canvas-tooltip');
      if (!tipNode) return;
      const mountRect = mount.getBoundingClientRect();
      const targetRect = targetEl.getBoundingClientRect();
      const pad = 8;
      const gap = 10;
      const tw = tipNode.offsetWidth || tipNode.getBoundingClientRect().width;
      const th = tipNode.offsetHeight || tipNode.getBoundingClientRect().height;
      let left = targetRect.left - mountRect.left - tw - gap;
      if (left < pad) {
        left = targetRect.right - mountRect.left + gap;
      }
      let top = targetRect.top - mountRect.top + (targetRect.height - th) / 2;
      top = Math.max(pad, Math.min(top, mountRect.height - th - pad));
      left = Math.max(pad, Math.min(left, mountRect.width - tw - pad));
      d3.select(tipNode)
        .style('left', `${left}px`)
        .style('top', `${top}px`)
        .style('transform', 'none')
        .style('right', 'auto')
        .style('bottom', 'auto');
    }

    function scheduleTooltipPosition(targetEl) {
      if (!targetEl) return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          positionCanvasTooltipNearTarget(targetEl);
        });
      });
    }

    // Draw the links with clickable areas
    const linkGroups = g.append('g')
      .selectAll('g')
      .data(processedLinks)
      .join('g')
      .attr('class', 'link-group');

    // Add visible lines directly to linkGroups
    linkGroups.append('line')
      .attr('class', 'link-line')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', 2);

    // Add wider invisible lines for better hover/click area
    linkGroups.append('line')
      .attr('class', 'link-hover-area')
      .attr('stroke', 'transparent')
      .attr('stroke-width', 10)
      .on('mouseover', handleLinkMouseover)
      .on('mouseout', handleLinkMouseout);

    // Add relationship labels to links
    const linkLabels = linkGroups.append('text')
      .attr('class', 'link-label')
      .text(d => d.relationship)
      .attr('text-anchor', 'middle')
      .attr('dy', -5)
      .attr('opacity', 0);

    // Add drag behavior
    const drag = d3.drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended);

    const noOpDrag = d3
      .drag()
      .on('start', () => {})
      .on('drag', () => {})
      .on('end', () => {});
    // `readOnly` turns off persistence (e.g. library history scrub) but we still allow dragging
    // for layout while scrubbing; positions reset when the displayed snapshot changes.
    const dragBehavior =
      readOnly && playbackScrubToken === 0 ? noOpDrag : drag;

    // Update node selection with click and drag handlers
    const node = g.selectAll('.node')
      .data(data.nodes)
      .join('g')
      .attr('class', 'node')
      .classed('selected', d =>
        selectedNodes.some(
          (n) =>
            String(n.id) === String(d.id) ||
            (Array.isArray(d.nodes) &&
              d.nodes.some((nn) => nn && String(nn.id) === String(n.id)))
        )
      )
      .on('click', (event, d) => {
        event.stopPropagation();
        
        // Handle both community structure and raw node data
        if (!d) {
          console.log('No data provided');
          return;
        }

        // If it's a raw node (not a community), wrap it in the community structure
        if (!d.nodes) {
          d = {
            id: d.id,
            nodes: [d],
            label: d.label,
            description: d.description,
            wikiUrl: d.wikiUrl,
            color: defaultNodeColor
          };
        }

        // Now proceed with the existing logic
        if (d.nodes.length === 1) {
          try {
            const node = d.nodes[0];
            if (!node) {
              console.log('Invalid node in single node community:', d);
              return;
            }
            handleNodeClick(event, node);
          } catch (error) {
            console.error('Error handling node click:', error);
          }
          return;
        }

        // Clear previous selection
        selectedNodeIds.current.clear();
        
        // For communities
        const selectedNode = d.nodes[0];
        if (!selectedNode) {
          console.log('No valid node found in:', d);
          return;
        }

        selectedNodeIds.current.add(selectedNode.id);
        selectedNodeId.current = selectedNode.id;

        // Find all directly connected nodes
        const connectedLinks = data.links.filter(link => {
          const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
          const targetId = typeof link.target === 'object' ? link.target.id : link.target;
          return sourceId === selectedNode.id || targetId === selectedNode.id;
        });

        updateHighlighting();

        // Show tooltip with node details
        const tooltip = d3.select('.tooltip');
        tooltip.style('opacity', 0.9);

        let tooltipContent = '';
        try {
          console.log(d);
          if (d.nodes.length > 1) {
            // For community nodes
            const communityLabel = d.label || 'Group';
            const communityDescription = d.description || `Contains ${d.nodes.length} nodes`;
            const validNodes = d.nodes.filter(node => node && typeof node === 'object');
            const nodeLabels = validNodes
              .map(node => node.label || 'Unnamed Node')
              .join(', ');

            tooltipContent = `
              <strong>${communityLabel}</strong><br/>
              <br/>
              ${communityDescription}<br/>
              <br/>
              Nodes: ${nodeLabels}
            `;
          } else if (selectedNode) {
            // For single nodes - verify all properties exist
            const nodeLabel = selectedNode.label || 'Unnamed Node';
            const nodeDescription = selectedNode.description || '';
            const nodeWikiUrl = selectedNode.wikiUrl || '';
            
            tooltipContent = `
              <strong>${nodeLabel}</strong><br/>
              ${nodeDescription ? `${nodeDescription}<br/>` : ''}
              ${nodeWikiUrl ? `<a href="${nodeWikiUrl}" target="_blank">Learn more</a><br/>` : ''}
            `;

            // Add related nodes section if there are any
            if (connectedLinks.length > 0) {
              tooltipContent += '<br/><strong>Related Concepts:</strong><br/>';
              const relatedNodesContent = connectedLinks
                .map(link => {
                  try {
                    const otherNodeId = typeof link.source === 'object' 
                      ? (link.source.id === selectedNode.id ? link.target.id : link.source.id)
                      : (link.source === selectedNode.id ? link.target : link.source);
                    
                    const otherNode = data.nodes.find(n => n.id === otherNodeId);
                    if (!otherNode) return '';
                    
                    const strengthNum =
                      typeof link.strength === 'number' && Number.isFinite(link.strength)
                        ? Math.max(0, Math.min(1, link.strength))
                        : null;
                    const strengthLabel =
                      strengthNum == null ? 'n/a' : `${Math.round(strengthNum * 100)}%`;
                    return `${otherNode.label || 'Unnamed Node'} - ${link.relationship || 'related to'} (${strengthLabel})`;
                  } catch (e) {
                    console.error('Error processing related node:', e);
                    return '';
                  }
                })
                .filter(Boolean)
                .join('<br/>');
              tooltipContent += relatedNodesContent;
            }
            tooltipContent += explodeTooltipActionsHtml(selectedNode);
          } else {
            tooltipContent = '<strong>Node information unavailable</strong>';
          }
        } catch (e) {
          console.error('Error generating tooltip:', e);
          console.log('Node data:', d);
          tooltipContent = '<strong>Error displaying node information</strong>';
        }
        
        tooltip.html(withTooltipChrome(tooltipContent));
        scheduleTooltipPosition(event.currentTarget);
      })
      .call(dragBehavior);

    // Link selection is disabled; links only show hover tooltip.
    g.selectAll('.link-group')
      .data(data.links)
      .join('g')
      .attr('class', 'link-group')
      .on('click', null);

    // Update visual states
    node.selectAll('circle')
      .data(d => [d])
      .join('circle')
      .attr('r', 20)
      .attr(
        'fill',
        d =>
          selectedNodes.some(
            (n) =>
              String(n.id) === String(d.id) ||
              (Array.isArray(d.nodes) &&
                d.nodes.some((nn) => nn && String(nn.id) === String(n.id)))
          )
            ? highlightedColor
            : defaultNodeColor
      )
      .classed('selected', d =>
        selectedNodes.some(
          (n) =>
            String(n.id) === String(d.id) ||
            (Array.isArray(d.nodes) &&
              d.nodes.some((nn) => nn && String(nn.id) === String(n.id)))
        )
      );

    // Add labels
    node.append('text')
      .text(d => d.label)
      .attr('x', 0)
      .attr('y', 30)
      .attr('text-anchor', 'middle')
      .attr('fill', '#333');

    // Interaction handlers
    function handleLinkMouseover(event, link) {
      if (!link) return;

      const sourceNode = typeof link.source === 'object' ? link.source : data.nodes.find(n => n.id === link.source);
      const targetNode = typeof link.target === 'object' ? link.target : data.nodes.find(n => n.id === link.target);

      if (!sourceNode || !targetNode) {
        console.log('Warning: Could not find source or target node for link:', link);
        return;
      }

      const tooltip = d3.select('.tooltip');
      tooltip.style('opacity', 0.9);

      const sourceLabel = sourceNode.label || 'Unnamed Node';
      const targetLabel = targetNode.label || 'Unnamed Node';
      const relationship = link.relationship || 'related to';

      const tooltipContent = `
        <strong>${sourceLabel}</strong>
        <br/>
        ${relationship}
        <br/>
        <strong>${targetLabel}</strong>
      `;

      tooltip.html(withTooltipChrome(tooltipContent));
      scheduleTooltipPosition(event.currentTarget);
    }

    function handleLinkMouseout() {
      d3.select('.tooltip')
        .style('opacity', 0);
    }

    function handleNodeClick(event, node) {
      try {
        if (!node) {
          console.log('No node provided to handleNodeClick');
          return;
        }

        // Wrap raw nodes in community structure if needed
        const wrappedNode = node.nodes ? node : {
          id: node.id,
          nodes: [{ ...node }],
          parent: null,
          children: [],
          level: 0,
          x: nodeXIn(node),
          y: nodeYIn(node),
          label: node.label,
          description: node.description,
          wikiUrl: node.wikiUrl,
          color: defaultNodeColor
        };

        // Regular node selection toggle
        if (selectedNodeIds.current.has(wrappedNode.id)) {
          selectedNodeIds.current.delete(wrappedNode.id);
          if (selectedNodeId.current === wrappedNode.id) {
            selectedNodeId.current = null;
          }
        } else {
          selectedNodeId.current = wrappedNode.id;
          selectedNodeIds.current.add(wrappedNode.id);
        }

        updateHighlighting();

        // Only show tooltip if the node is selected
        const tooltip = d3.select('.tooltip');
        
        if (!selectedNodeIds.current.has(wrappedNode.id)) {
          tooltip.style('opacity', 0);
          return;
        }

        tooltip.style('opacity', 0.9);

        // Build tooltip content based on node type
        let tooltipContent;
        if (node.nodes && node.nodes.length > 1) {
          // For community nodes
          tooltipContent = `
            <strong>${node.label || 'Group'}</strong><br/>
            ${node.description || `Contains ${node.nodes.length} nodes`}<br/>
          `;
        } else {
          // For single nodes
          const nodeToShow = node.nodes ? node.nodes[0] : node;
          const showLabel = nodeToShow.label || 'Unnamed Node';
          tooltipContent = `
            <strong>${showLabel}</strong><br/>
            ${nodeToShow.description ? `${nodeToShow.description}<br/>` : ''}
            ${nodeToShow.wikiUrl ? `<a href="${nodeToShow.wikiUrl}" target="_blank">Learn more</a><br/>` : ''}
          `;

          // Find connected links for single nodes
          const connectedLinks = data.links ? data.links.filter(link => {
            const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
            const targetId = typeof link.target === 'object' ? link.target.id : link.target;
            return sourceId === nodeToShow.id || targetId === nodeToShow.id;
          }) : [];

          // Add related nodes section if there are any
          if (connectedLinks && connectedLinks.length > 0) {
            tooltipContent += '<br/><strong>Related Concepts:</strong><br/>';
            const relatedNodes = connectedLinks
              .map(link => {
                try {
                  const otherNodeId = typeof link.source === 'object' 
                    ? (link.source.id === nodeToShow.id ? link.target.id : link.source.id)
                    : (link.source === nodeToShow.id ? link.target : link.source);
                  
                  const otherNode = data.nodes.find(n => n.id === otherNodeId);
                  if (!otherNode) return '';
                  const strengthNum =
                    typeof link.strength === 'number' && Number.isFinite(link.strength)
                      ? Math.max(0, Math.min(1, link.strength))
                      : null;
                  const strengthLabel =
                    strengthNum == null ? 'n/a' : `${Math.round(strengthNum * 100)}%`;
                  return `${otherNode.label || 'Unnamed Node'} - ${link.relationship || 'related to'} (${strengthLabel})`;
                } catch (e) {
                  return '';
                }
              })
              .filter(Boolean)
              .join('<br/>');
            tooltipContent += relatedNodes;
          }
          tooltipContent += explodeTooltipActionsHtml(nodeToShow);
        }

        tooltip.html(withTooltipChrome(tooltipContent));
        scheduleTooltipPosition(event.currentTarget);

      } catch (error) {
        console.error('Error in handleNodeClick:', error);
        console.log('Node data causing error:', node);
        console.log('Current data state:', { 
          nodes: data.nodes, 
          links: data.links,
          selectedNodeIds: selectedNodeIds.current,
          selectedNodeId: selectedNodeId.current
        });
      }
    }

    function linkEndpointIds(l) {
      const sid = typeof l.source === 'object' && l.source !== null ? l.source.id : l.source;
      const tid = typeof l.target === 'object' && l.target !== null ? l.target.id : l.target;
      return { sid, tid };
    }

    function linkKey(l) {
      const { sid, tid } = linkEndpointIds(l);
      const rel = typeof l.relationship === 'string' ? l.relationship : '';
      return `${String(sid)}__${String(tid)}__${rel}`;
    }

    function getSearchMatchIds() {
      const q = (discoveryQueryRef.current || '').trim();
      if (!q) return new Set();
      return new Set(nodesMatchingLabelQuery(data.nodes, q).map(n => n.id));
    }

    function datumMatchesSearch(d, matchIds) {
      if (!matchIds || matchIds.size === 0) return false;
      if (d && Array.isArray(d.nodes) && d.nodes.length) {
        return d.nodes.some(n => n && matchIds.has(n.id));
      }
      return matchIds.has(d.id);
    }

    function renderMinimap() {
      const el = minimapSvgRef.current;
      if (!el || !data.nodes?.length) {
        minimapExtentsRef.current = null;
        return;
      }
      const T = graphTransformRef.current || d3.zoomIdentity;
      const tw = width;
      const th = height;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      data.nodes.forEach(n => {
        const nx = nodeXIn(n);
        const ny = nodeYIn(n);
        minX = Math.min(minX, nx);
        minY = Math.min(minY, ny);
        maxX = Math.max(maxX, nx);
        maxY = Math.max(maxY, ny);
      });
      if (!Number.isFinite(minX)) {
        minX = 0;
        maxX = tw;
        minY = 0;
        maxY = th;
      } else {
        const span = Math.max(maxX - minX, maxY - minY, 1);
        const pad = span * 0.08;
        minX -= pad;
        maxX += pad;
        minY -= pad;
        maxY += pad;
      }
      const mw = 140;
      const mh = 100;
      const sx = x => ((x - minX) / (maxX - minX || 1)) * mw;
      const sy = y => ((y - minY) / (maxY - minY || 1)) * mh;
      const svgMini = d3.select(el);
      svgMini.selectAll('*').remove();
      const root = svgMini.append('g').attr('class', 'graph-minimap-content');
      data.nodes.forEach(n => {
        root
          .append('circle')
          .attr('cx', sx(nodeXIn(n)))
          .attr('cy', sy(nodeYIn(n)))
          .attr('r', 2)
          .attr('fill', '#4a90e2')
          .attr('opacity', 0.65);
      });
      const corners = [
        [0, 0],
        [tw, 0],
        [tw, th],
        [0, th],
      ].map(([px, py]) => T.invert([px, py]));
      const xs = corners.map(c => c[0]);
      const ys = corners.map(c => c[1]);
      const vx0 = Math.min(...xs);
      const vx1 = Math.max(...xs);
      const vy0 = Math.min(...ys);
      const vy1 = Math.max(...ys);
      root
        .append('rect')
        .attr('x', sx(vx0))
        .attr('y', sy(vy0))
        .attr('width', Math.max(1, sx(vx1) - sx(vx0)))
        .attr('height', Math.max(1, sy(vy1) - sy(vy0)))
        .attr('fill', 'rgba(231, 76, 60, 0.08)')
        .attr('stroke', '#e74c3c')
        .attr('stroke-width', 1.25)
        .attr('pointer-events', 'none');

      minimapExtentsRef.current = { minX, maxX, minY, maxY, mw, mh };
    }

    updateMinimapRef.current = renderMinimap;

    /** GitHub #73: map minimap SVG coords (viewBox 0–mw, 0–mh) to graph space. */
    function centerMainViewOnGraphPoint(gx, gy) {
      if (!Number.isFinite(gx) || !Number.isFinite(gy)) return;
      const T = graphTransformRef.current || d3.zoomIdentity;
      const k = T.k;
      const t = d3.zoomIdentity
        .translate(width / 2, height / 2)
        .scale(k)
        .translate(-gx, -gy);
      d3.select(svgRef.current).call(zoom.transform, t);
    }

    function panMainViewByMinimapDelta(dmx, dmy) {
      const ext = minimapExtentsRef.current;
      if (!ext || !Number.isFinite(dmx) || !Number.isFinite(dmy)) return;
      const dgx = (dmx / ext.mw) * (ext.maxX - ext.minX);
      const dgy = (dmy / ext.mh) * (ext.maxY - ext.minY);
      const T = graphTransformRef.current || d3.zoomIdentity;
      const newT = d3.zoomIdentity
        .translate(T.x - T.k * dgx, T.y - T.k * dgy)
        .scale(T.k);
      d3.select(svgRef.current).call(zoom.transform, newT);
    }

    function setupMinimapNavigation() {
      const el = minimapSvgRef.current;
      if (!el) return;
      const sel = d3.select(el);
      sel
        .style('cursor', 'grab')
        .style('touch-action', 'none')
        .on('pointerdown.minimapNav', (event) => {
          if (event.button !== 0) return;
          const pt = d3.pointer(event, el);
          minimapNavDragRef.current = {
            pointerId: event.pointerId,
            lastM: pt,
            didDrag: false,
          };
          sel.style('cursor', 'grabbing');
          try {
            el.setPointerCapture(event.pointerId);
          } catch {
            /* ignore */
          }
        })
        .on('pointermove.minimapNav', (event) => {
          const st = minimapNavDragRef.current;
          if (!st || event.pointerId !== st.pointerId) return;
          const pt = d3.pointer(event, el);
          const dmx = pt[0] - st.lastM[0];
          const dmy = pt[1] - st.lastM[1];
          if (Math.abs(dmx) < 0.5 && Math.abs(dmy) < 0.5) return;
          st.didDrag = true;
          st.lastM = pt;
          panMainViewByMinimapDelta(dmx, dmy);
        });

      function endMinimapPointer(event) {
        const st = minimapNavDragRef.current;
        if (!st || event.pointerId !== st.pointerId) return;
        try {
          el.releasePointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
        minimapNavDragRef.current = null;
        sel.style('cursor', 'grab');
        const clickToCenter = event.type === 'pointerup' && !st.didDrag;
        if (!clickToCenter) return;
        const ext = minimapExtentsRef.current;
        if (!ext) return;
        const [mx, my] = st.lastM;
        const gx = ext.minX + (mx / ext.mw) * (ext.maxX - ext.minX);
        const gy = ext.minY + (my / ext.mh) * (ext.maxY - ext.minY);
        centerMainViewOnGraphPoint(gx, gy);
      }

      sel
        .on('pointerup.minimapNav', endMinimapPointer)
        .on('pointercancel.minimapNav', endMinimapPointer);
    }

    setupMinimapNavigation();

    /** Matches unselected radii used before first `updateHighlighting` pass. */
    function initialCommunityRadius(d) {
      if (!d || !d.nodes) return 20;
      if (d.nodes.length > 1) {
        return Math.min(200, Math.max(40, 20 + 3 * d.nodes.length));
      }
      return 20;
    }

    function updateHighlighting() {
      const matchIds = getSearchMatchIds();

      const datumMatchesSelectedGraphNode = (d) => {
        if (!d) return false;
        const sel = selectedNodeIds.current;
        if (sel.has(String(d.id))) return true;
        if (Array.isArray(d.nodes)) {
          return d.nodes.some((n) => n && sel.has(String(n.id)));
        }
        return false;
      };

      const radiusForNode = d => {
        const hot = playbackStepHotNodeIdsRef.current;
        const isHot = hot && hot.size && hot.has(String(d.id));
        if (datumMatchesSelectedGraphNode(d)) return 25;
        const mergedR =
          d && d.nodes && d.nodes.length > 1
            ? Math.min(40, Math.max(30, 20 + 3 * d.nodes.length))
            : 20;
        const bigMergedR =
          d && d.nodes && d.nodes.length > 1
            ? Math.min(200, Math.max(40, 20 + 3 * d.nodes.length))
            : 20;
        if (datumMatchesSearch(d, matchIds)) {
          return Math.min((d && d.nodes && d.nodes.length > 1 ? mergedR : 20) + 3, 45);
        }
        if (isHot) {
          return Math.min((d && d.nodes && d.nodes.length > 1 ? bigMergedR : 20) + 4, 55);
        }
        return d && d.nodes && d.nodes.length > 1 ? bigMergedR : 20;
      };

      const strokeForNode = d => {
        if (datumMatchesSelectedGraphNode(d)) return '#f1c40f';
        if (datumMatchesSearch(d, matchIds)) return searchHighlightStroke;
        const hot = playbackStepHotNodeIdsRef.current;
        if (hot && hot.size && hot.has(String(d.id))) return '#f39c12';
        return '#fff';
      };

      const strokeWidthForNode = d => {
        if (datumMatchesSelectedGraphNode(d)) return 4;
        if (datumMatchesSearch(d, matchIds)) return 3;
        const hot = playbackStepHotNodeIdsRef.current;
        if (hot && hot.size && hot.has(String(d.id))) return 4;
        return 2;
      };

      g.selectAll('.node circle.graph-node-disc')
        .style('fill', d => {
          if (datumMatchesSelectedGraphNode(d)) return highlightedColor;
          if (datumMatchesSearch(d, matchIds)) return searchHighlightFill;
          return d.color || defaultNodeColor;
        })
        .style('stroke', strokeForNode)
        .style('stroke-width', strokeWidthForNode)
        .style('r', radiusForNode);

      g.selectAll('.node circle.graph-node-ring')
        .style('fill', 'none')
        .style('stroke', strokeForNode)
        .style('stroke-width', strokeWidthForNode)
        .style('r', radiusForNode);

      // Thumbnail nodes use an invisible hit circle for click targets; when selected/hot/search,
      // give it the same stroke as the ring so the highlight is visible even if the ring is
      // occluded or missed during inspection.
      g.selectAll('.node circle.graph-node-hit')
        .style('stroke', strokeForNode)
        .style('stroke-width', strokeWidthForNode)
        .style('r', radiusForNode);

      g.selectAll('.node').each(function forEachThumbNode(d) {
        const nodeG = d3.select(this);
        if (nodeG.select('image.graph-node-thumb').empty()) return;
        const r = radiusForNode(d);
        nodeG.select('defs clipPath circle').attr('r', r);
        nodeG.select('circle.graph-node-hit').attr('r', r);
        nodeG
          .select('image.graph-node-thumb')
          .attr('x', -r)
          .attr('y', -r)
          .attr('width', r * 2)
          .attr('height', r * 2);
      });

      const applyLinkStyle = (sel) => {
        sel
          .style('stroke-opacity', l => {
            const picked = selectedLinkKeyRef.current;
            if (picked && linkKey(l) === picked) return 1;
            const hot = playbackStepHotLinkKeysRef.current;
            if (hot && hot.size && hot.has(linkKeyForProcessedCommunityLink(l))) return 1;
            const { sid, tid } = linkEndpointIds(l);
            const selHit =
              selectedNodeIds.current.has(sid) || selectedNodeIds.current.has(tid);
            const searchHit =
              matchIds.size > 0 && (matchIds.has(sid) || matchIds.has(tid));
            if (selHit || searchHit) return 1;
            return 0.6;
          })
          .style('stroke', l => {
            const picked = selectedLinkKeyRef.current;
            if (picked && linkKey(l) === picked) return highlightedColor;
            const hot = playbackStepHotLinkKeysRef.current;
            if (hot && hot.size && hot.has(linkKeyForProcessedCommunityLink(l))) return '#f39c12';
            const { sid, tid } = linkEndpointIds(l);
            const selHit =
              selectedNodeIds.current.has(sid) || selectedNodeIds.current.has(tid);
            if (selHit) return highlightedColor;
            const searchHit =
              matchIds.size > 0 && (matchIds.has(sid) || matchIds.has(tid));
            if (searchHit) return searchHighlightFill;
            return '#999';
          })
          .style('stroke-width', l => {
            const picked = selectedLinkKeyRef.current;
            if (picked && linkKey(l) === picked) return 5;
            const hot = playbackStepHotLinkKeysRef.current;
            if (hot && hot.size && hot.has(linkKeyForProcessedCommunityLink(l))) return 4;
            const { sid, tid } = linkEndpointIds(l);
            const selHit =
              selectedNodeIds.current.has(sid) || selectedNodeIds.current.has(tid);
            const searchHit =
              matchIds.size > 0 && (matchIds.has(sid) || matchIds.has(tid));
            if (selHit || searchHit) return 3;
            return 1;
          });
      };

      applyLinkStyle(g.selectAll('.link, .link-line'));
    }

    updateHighlightingRef.current = updateHighlighting;

    function findCommunityOwningGraphNodeId(nodeId) {
      const map = communitiesRef.current;
      if (!map) return null;
      for (const c of map.values()) {
        if (c?.nodes?.some((n) => n && String(n.id) === String(nodeId))) return c;
      }
      return null;
    }

    function buildTooltipHtmlForDiscoveryFocus(rawNode) {
      if (!rawNode) return '<strong>No node</strong>';
      const comm = findCommunityOwningGraphNodeId(rawNode.id);
      if (comm && comm.nodes && comm.nodes.length > 1) {
        const communityLabel = comm.label || 'Group';
        const communityDescription =
          comm.description || `Contains ${comm.nodes.length} nodes`;
        const validNodes = comm.nodes.filter(
          (node) => node && typeof node === 'object'
        );
        const nodeLabels = validNodes
          .map((node) => node.label || 'Unnamed Node')
          .join(', ');
        return (
          `<strong>${communityLabel}</strong><br/><br/>${communityDescription}<br/><br/>` +
          `Nodes: ${nodeLabels}`
        );
      }
      const nodeToShow = rawNode;
      const showLabel = nodeToShow.label || 'Unnamed Node';
      let html =
        `<strong>${showLabel}</strong><br/>` +
        (nodeToShow.description ? `${nodeToShow.description}<br/>` : '') +
        (nodeToShow.wikiUrl
          ? `<a href="${nodeToShow.wikiUrl}" target="_blank">Learn more</a><br/>`
          : '');
      const connectedLinks = data.links
        ? data.links.filter((link) => {
          const sourceId =
            typeof link.source === 'object' ? link.source.id : link.source;
          const targetId =
            typeof link.target === 'object' ? link.target.id : link.target;
          return sourceId === nodeToShow.id || targetId === nodeToShow.id;
        })
        : [];
      if (connectedLinks.length > 0) {
        html += '<br/><strong>Related Concepts:</strong><br/>';
        html += connectedLinks
          .map((link) => {
            try {
              const otherNodeId =
                typeof link.source === 'object'
                  ? link.source.id === nodeToShow.id
                    ? link.target.id
                    : link.source.id
                  : link.source === nodeToShow.id
                    ? link.target
                    : link.source;
              const otherNode = data.nodes.find((n) => n.id === otherNodeId);
              if (!otherNode) return '';
              const strengthNum =
                typeof link.strength === 'number' && Number.isFinite(link.strength)
                  ? Math.max(0, Math.min(1, link.strength))
                  : null;
              const strengthLabel =
                strengthNum == null ? 'n/a' : `${Math.round(strengthNum * 100)}%`;
              return `${otherNode.label || 'Unnamed Node'} - ${link.relationship || 'related to'} (${strengthLabel})`;
            } catch (e) {
              return '';
            }
          })
          .filter(Boolean)
          .join('<br/>');
      }
      html += explodeTooltipActionsHtml(nodeToShow);
      return html;
    }

    function applyDiscoveryFocusNodeUi(rawNode) {
      if (!rawNode) return;
      selectedLinkKeyRef.current = null;
      selectedNodeIds.current.clear();
      selectedNodeId.current = rawNode.id;
      selectedNodeIds.current.add(rawNode.id);
      // Do not call setSelectedNodes here: it is in the D3 effect deps, so updating it tears
      // down the graph (cleanup removes the tooltip SVG mount) and clears this UI. Matches
      // handleNodeClick, which only uses refs + updateHighlighting.
      updateHighlighting();
      tooltip
        .html(buildTooltipHtmlForDiscoveryFocus(rawNode))
        .style('opacity', 0.9);
      const el = g
        .selectAll('.node')
        .filter((d) => {
          if (!d) return false;
          if (String(d.id) === String(rawNode.id)) return true;
          return (
            Array.isArray(d.nodes) &&
            d.nodes.some((n) => n && String(n.id) === String(rawNode.id))
          );
        })
        .node();
      if (el) scheduleTooltipPosition(el);
    }

    applyDiscoveryFocusNodeUiRef.current = applyDiscoveryFocusNodeUi;

    // Add click handler to svg to deselect
    svg.on('click', () => {
      const hadSelection =
        selectedNodeId.current != null ||
        (selectedNodeIds.current && selectedNodeIds.current.size > 0) ||
        selectedLinkKeyRef.current != null;
      if (!hadSelection) return;

      selectedNodeId.current = null;
      selectedNodeIds.current.clear();
      selectedLinkKeyRef.current = null;
      setSelectedNodes([]);
      updateHighlighting();
      tooltip.style('opacity', 0);
    });

    // Drag event handlers
    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    // Update positions on each tick
    simulation.on('tick', () => {
      if (!minimapRafRef.current) {
        minimapRafRef.current = requestAnimationFrame(() => {
          minimapRafRef.current = null;
          updateMinimapRef.current?.();
        });
      }
      // Update link positions
      linkGroups.selectAll('line')
        .attr('x1', d => simX(d.source))
        .attr('y1', d => simY(d.source))
        .attr('x2', d => simX(d.target))
        .attr('y2', d => simY(d.target));

      // Update link label positions
      linkLabels
        .attr('x', d => (simX(d.source) + simX(d.target)) / 2)
        .attr('y', d => (simY(d.source) + simY(d.target)) / 2);

      // Update node positions
      node.attr('transform', d => `translate(${simX(d)},${simY(d)})`);
    });

    // Update the visualization function to handle all node cases properly
    const updateVisualization = () => {
      const isNewPlaybackScrub =
        playbackScrubToken > 0 &&
        playbackScrubToken !== lastPlaybackFadeTokenRef.current;

      if (!isNewPlaybackScrub) {
        if (playbackEaseHighlightTimerRef.current) {
          window.clearTimeout(playbackEaseHighlightTimerRef.current);
          playbackEaseHighlightTimerRef.current = null;
        }
        playbackStepHotNodeIdsRef.current = new Set();
        playbackStepHotLinkKeysRef.current = new Set();
      }

      // Get visible communities
      const visibleCommunities = communitiesRef.current;
      const visibleElements = Array.from(visibleCommunities.values());
      const prevCommIds = playbackPrevCommunityIdsRef.current;
      const prevLinkKeys = playbackPrevLinkKeysRef.current;

      // GitHub #89: snapshot the current sim positions before we stop and rebind
      // so the next `initializeCommunities()` can reuse them (keeps the mental
      // map stable across playback step advances + zoom merge/split).
      if (simulation && Array.isArray(simulation.nodes())) {
        const snap = new Map();
        for (const d of simulation.nodes()) {
          if (!d || d.id == null) continue;
          if (typeof d.x !== 'number' || !Number.isFinite(d.x)) continue;
          if (typeof d.y !== 'number' || !Number.isFinite(d.y)) continue;
          snap.set(String(d.id), {
            x: d.x,
            y: d.y,
            vx: Number.isFinite(d.vx) ? d.vx : 0,
            vy: Number.isFinite(d.vy) ? d.vy : 0,
          });
        }
        if (snap.size > 0) previousCommunityPositionsRef.current = snap;
      }

      // Stop the current simulation
      if (simulation) {
        simulation.stop();
      }

      // Clear ALL existing elements before processing new ones
      g.selectAll('*').remove();

      // Process links between communities
      const processedLinks = data.links.map(link => {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;
        
        const sourceCommunity = visibleElements.find(c => c.nodes.some(n => n.id === sourceId));
        const targetCommunity = visibleElements.find(c => c.nodes.some(n => n.id === targetId));
        
        if (!sourceCommunity || !targetCommunity) return null;
        
        return {
          source: sourceCommunity,
          target: targetCommunity,
          sourceCommunity,
          targetCommunity,
          relationship: link.relationship,
          originalLink: link
        };
      }).filter(link => 
        link && 
        link.source.id !== link.target.id && 
        link.source && 
        link.target
      );

      // Draw new links
      const links = g.selectAll('.link')
        .data(processedLinks)
        .enter()
        .append('line')
        .attr('class', 'link')
        .attr('stroke', '#999')
        .attr('stroke-width', 1)
        .attr('stroke-opacity', 0.6)
        .style('cursor', 'default');

      // Draw nodes using visible elements but preserve original node data
      const nodes = g.selectAll('.node')
        .data(visibleElements, d => d.id)
        .enter()
        .append('g')
        .attr('class', 'node')
        .call(dragBehavior)
        .on('click', (event, d) => {
          event.stopPropagation();
          
          // Handle both community structure and raw node data
          if (!d) {
            console.log('No data provided');
            return;
          }

          // If it's a raw node (not a community), wrap it in the community structure
          if (!d.nodes) {
            d = {
              id: d.id,
              nodes: [d],
              label: d.label,
              description: d.description,
              wikiUrl: d.wikiUrl,
              thumbnailUrl: d.thumbnailUrl,
              color: defaultNodeColor
            };
          }

          // Now proceed with the existing logic
          if (d.nodes.length === 1) {
            try {
              const node = d.nodes[0];
              if (!node) {
                console.log('Invalid node in single node community:', d);
                return;
              }
              handleNodeClick(event, node);
            } catch (error) {
              console.error('Error handling node click:', error);
            }
            return;
          }

          // Clear previous selection
          selectedNodeIds.current.clear();
          
          // For communities
          const selectedNode = d.nodes[0];
          if (!selectedNode) {
            console.log('No valid node found in:', d);
            return;
          }

          selectedNodeIds.current.add(selectedNode.id);
          selectedNodeId.current = selectedNode.id;

          // Find all directly connected nodes
          const connectedLinks = data.links.filter(link => {
            const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
            const targetId = typeof link.target === 'object' ? link.target.id : link.target;
            return sourceId === selectedNode.id || targetId === selectedNode.id;
          });

          updateHighlighting();

          // Show tooltip with node details
          const tooltip = d3.select('.tooltip');
          tooltip.style('opacity', 0.9);

          let tooltipContent = '';
          try {
            if (d.nodes.length > 1) {
              // For community nodes
              const communityLabel = d.label || 'Group';
              const validNodes = d.nodes.filter(node => node && typeof node === 'object');
              const nodeLabels = validNodes
                .map(node => node.label || 'Unnamed Node')
                .join(', ');

              tooltipContent = `
                <strong>${communityLabel}</strong><br/>
                <br/>
                Number of nodes: ${validNodes.length}<br/>
                <br/>
                Nodes: ${nodeLabels}
              `;
            } else if (selectedNode) {
              // For single nodes - verify all properties exist
              const nodeLabel = selectedNode.label || 'Unnamed Node';
              const nodeDescription = selectedNode.description || '';
              const nodeWikiUrl = selectedNode.wikiUrl || '';
              
              tooltipContent = `
                <strong>${nodeLabel}</strong><br/>
                ${nodeDescription ? `${nodeDescription}<br/>` : ''}
                ${nodeWikiUrl ? `<a href="${nodeWikiUrl}" target="_blank">Learn more</a><br/>` : ''}
              `;

              // Add related nodes section if there are any
              if (connectedLinks.length > 0) {
                tooltipContent += '<br/><strong>Related Concepts:</strong><br/>';
                const relatedNodesContent = connectedLinks
                  .map(link => {
                    try {
                      const otherNodeId = typeof link.source === 'object' 
                        ? (link.source.id === selectedNode.id ? link.target.id : link.source.id)
                        : (link.source === selectedNode.id ? link.target : link.source);
                        
                      const otherNode = data.nodes.find(n => n.id === otherNodeId);
                      if (!otherNode) return '';

                      const strengthNum =
                        typeof link.strength === 'number' && Number.isFinite(link.strength)
                          ? Math.max(0, Math.min(1, link.strength))
                          : null;
                      const strengthLabel =
                        strengthNum == null ? 'n/a' : `${Math.round(strengthNum * 100)}%`;
                      return `${otherNode.label || 'Unnamed Node'} - ${link.relationship || 'related to'} (${strengthLabel})`;
                    } catch (e) {
                      console.error('Error processing related node:', e);
                      return '';
                    }
                  })
                  .filter(Boolean)
                  .join('<br/>');
                tooltipContent += relatedNodesContent;
              }
              tooltipContent += explodeTooltipActionsHtml(selectedNode);
            } else {
              tooltipContent = '<strong>Node information unavailable</strong>';
            }
          } catch (e) {
            console.error('Error generating tooltip:', e);
            console.log('Node data:', d);
            tooltipContent = '<strong>Error displaying node information</strong>';
          }
          
          tooltip.html(withTooltipChrome(tooltipContent));
          scheduleTooltipPosition(event.currentTarget);
        });

      // Circles or clipped Wikipedia thumbnails (single-node communities only, #75)
      nodes.each(function renderNodeDiscOrThumb(d) {
        const nodeG = d3.select(this);
        const r0 = initialCommunityRadius(d);
        const single = d.nodes?.length === 1 ? d.nodes[0] : null;
        const thumbUrl =
          single &&
          d.nodes.length === 1 &&
          isSafeThumbnailUrlForTooltip(single.thumbnailUrl)
            ? single.thumbnailUrl
            : null;

        if (thumbUrl) {
          const clipId = `node-thumb-clip-${String(d.id).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
          nodeG
            .append('defs')
            .append('clipPath')
            .attr('id', clipId)
            .append('circle')
            .attr('cx', 0)
            .attr('cy', 0)
            .attr('r', r0);

          // Full-disc hit target: ring has fill none (only stroke hits) and image uses
          // pointer-events none — without this, only the stroke perimeter was clickable.
          nodeG
            .append('circle')
            .attr('class', 'graph-node-hit')
            .attr('r', r0)
            .attr('fill', 'rgba(0,0,0,0)')
            .attr('stroke', 'none')
            .attr('pointer-events', 'all');

          nodeG
            .append('image')
            .attr('class', 'graph-node-thumb')
            .attr('href', thumbUrl)
            .attr('x', -r0)
            .attr('y', -r0)
            .attr('width', r0 * 2)
            .attr('height', r0 * 2)
            .attr('clip-path', `url(#${clipId})`)
            .attr('preserveAspectRatio', 'xMidYMid slice')
            .attr('pointer-events', 'none')
            .on('error', function onThumbImageError() {
              d3.select(this).on('error', null);
              const parent = d3.select(this.parentNode);
              parent.select('defs').remove();
              parent.select('circle.graph-node-hit').remove();
              parent.select('circle.graph-node-ring').remove();
              d3.select(this).remove();
              const dd = parent.datum();
              const rr = initialCommunityRadius(dd);
              const fill =
                dd.nodes && dd.nodes.length > 1 ? dd.color : defaultNodeColor;
              if (parent.select('circle.graph-node-disc').empty()) {
                const before =
                  parent.select('text').empty() ? null : 'text';
                const disc = before
                  ? parent.insert('circle', before)
                  : parent.append('circle');
                disc
                  .attr('class', 'graph-node-disc')
                  .attr('r', rr)
                  .attr('fill', fill)
                  .attr('stroke', '#fff')
                  .attr('stroke-width', 1.5);
              }
              updateHighlightingRef.current?.();
            });

          nodeG
            .append('circle')
            .attr('class', 'graph-node-ring')
            .attr('r', r0)
            .attr('fill', 'none')
            .attr('stroke', '#fff')
            .attr('stroke-width', 2);
        } else {
          nodeG
            .append('circle')
            .attr('class', 'graph-node-disc')
            .attr('r', r0)
            .attr('fill', d.nodes.length > 1 ? d.color : defaultNodeColor)
            .attr('stroke', '#fff')
            .attr('stroke-width', 1.5);
        }
      });

      // Add labels with proper text
      nodes.append('text')
        .attr('dy', d => {
          if (!d || !d.nodes) return 25;
          return d.nodes.length > 1 
            ? Math.min(100, Math.max(30, 20 * Math.sqrt(d.nodes.length))) + 15
            : 25;
        })
        .attr('text-anchor', 'middle')
        .text(d => {
          if (!d || !d.nodes) return 'Unknown';
          if (d.nodes.length > 1) return '';
          return d.nodes[0]?.label || 'Unknown';
        });

      // GitHub #81: cluster/community thumbnail chip anchored to most-connected node.
      const clusterThumbs = visibleElements.filter((c) => Array.isArray(c.nodes) && c.nodes.length > 1);
      let chips = null;
      if (clusterThumbs.length) {
        chips = g
          .append('g')
          .attr('class', 'cluster-thumb-layer')
          .selectAll('g.cluster-thumb')
          .data(clusterThumbs, (d) => d.id)
          .enter()
          .append('g')
          .attr('class', 'cluster-thumb')
          .attr('transform', (d) => `translate(${simX(d)},${simY(d)})`)
          .style('cursor', 'pointer')
          .on('click', (event, d) => {
            event.stopPropagation();
            const { node: anchor } = pickCommunityAnchorNode(d, data.links);
            if (anchor?.id != null) focusOnNodeId(anchor.id, 1.75);
          });

        chips.each(function renderChip(d) {
          const chip = d3.select(this);
          const { node: anchor } = pickCommunityAnchorNode(d, data.links);
          const label = String(anchor?.label || d.label || 'Cluster');
          const thumbUrl =
            anchor && isSafeThumbnailUrlForTooltip(anchor.thumbnailUrl)
              ? anchor.thumbnailUrl
              : null;

          const padX = 8;
          const textX = thumbUrl ? 26 : 8;
          const approxW = Math.min(190, Math.max(90, textX + label.length * 6.2));
          const h = 28;

          // Background
          chip
            .append('rect')
            .attr('x', -approxW / 2)
            .attr('y', -h / 2)
            .attr('rx', 10)
            .attr('ry', 10)
            .attr('width', approxW)
            .attr('height', h)
            .attr('fill', 'rgba(15, 23, 42, 0.75)')
            .attr('stroke', 'rgba(148, 163, 184, 0.6)')
            .attr('stroke-width', 1);

          if (thumbUrl) {
            const clipId = `cluster-chip-clip-${String(d.id).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
            chip
              .append('defs')
              .append('clipPath')
              .attr('id', clipId)
              .append('circle')
              .attr('cx', -approxW / 2 + padX + 9)
              .attr('cy', 0)
              .attr('r', 9);

            chip
              .append('image')
              .attr('href', thumbUrl)
              .attr('x', -approxW / 2 + padX)
              .attr('y', -9)
              .attr('width', 18)
              .attr('height', 18)
              .attr('clip-path', `url(#${clipId})`)
              .attr('preserveAspectRatio', 'xMidYMid slice')
              .attr('pointer-events', 'none');
          }

          chip
            .append('text')
            .attr('x', -approxW / 2 + textX)
            .attr('y', 4)
            .attr('fill', '#e2e8f0')
            .attr('font-size', 12)
            .attr('font-weight', 650)
            .text(label.length > 24 ? `${label.slice(0, 24)}…` : label);
        });
      }

      // GitHub #89: seed any newly-visible community with a position biased
      // toward its connected component's centroid so they don't all materialise
      // at the viewport center and scatter (disjoint-force pattern). Existing
      // communities already carry positions from the pre-rebuild snapshot via
      // `initializeCommunities`, so this is a no-op for them.
      seedPositionsForNewCommunities(
        visibleElements,
        processedLinks,
        { x: width / 2, y: height / 2 }
      );

      // Update simulation with proper handling of both single nodes and communities
      simulation
        .nodes(visibleElements)
        .force('link', d3.forceLink(processedLinks)
          .id(d => d.id))
        .on('tick', () => {
          if (!minimapRafRef.current) {
            minimapRafRef.current = requestAnimationFrame(() => {
              minimapRafRef.current = null;
              updateMinimapRef.current?.();
            });
          }
          links
            .attr('x1', d => simX(d.source))
            .attr('y1', d => simY(d.source))
            .attr('x2', d => simX(d.target))
            .attr('y2', d => simY(d.target));

          nodes.attr('transform', (d) => {
            const tx = simX(d);
            const ty = simY(d);
            const ex = targetStretchRef.current;
            if (
              ex &&
              ex.active &&
              ex.nodeIds &&
              ex.nodeIds.size > 0 &&
              communityDatumContainsAnyGraphNodeId(d, ex.nodeIds)
            ) {
              return `translate(${tx},${ty}) scale(${ex.sx},${ex.sy})`;
            }
            return `translate(${tx},${ty})`;
          });

          // Keep cluster chips anchored to the live community centroid as forces run.
          if (chips) {
            chips.attr('transform', (d) => `translate(${simX(d)},${simY(d)})`);
          }
        });

      communityForceSimulationRef.current = simulation;
      // GitHub #89: pick a gentler reheat when the structural delta is a
      // playback scrub (most nodes unchanged — we just want new ones to ease
      // in without flinging the rest). `prefers-reduced-motion` clamps further.
      const reducedMotion = prefersReducedMotion();
      let reheatAlpha;
      if (reducedMotion) {
        reheatAlpha = COMMUNITY_SIM_ALPHA_REDUCED_MOTION;
      } else if (isNewPlaybackScrub) {
        reheatAlpha = COMMUNITY_SIM_ALPHA_PLAYBACK_SCRUB;
      } else {
        reheatAlpha = 0.3;
      }
      simulation.alphaTarget(0).alpha(reheatAlpha).restart();

      playbackPrevCommunityIdsRef.current = buildCommunityIdSet(visibleElements);
      playbackPrevLinkKeysRef.current = new Set(
        processedLinks.map(linkKeyForProcessedCommunityLink)
      );

      if (isNewPlaybackScrub) {
        lastPlaybackFadeTokenRef.current = playbackScrubToken;
        {
          const removedComm = prevCommIds
            ? new Set(
              Array.from(prevCommIds).filter((id) => !buildCommunityIdSet(visibleElements).has(id))
            )
            : new Set();
          const currLinkKeys = new Set(processedLinks.map(linkKeyForProcessedCommunityLink));
          const removedLk = prevLinkKeys
            ? new Set(Array.from(prevLinkKeys).filter((k) => !currLinkKeys.has(k)))
            : new Set();

          const newComm = newCommunityIdsForPlaybackTransition(
            prevCommIds,
            visibleElements
          );
          const newLk = newLinkKeysForPlaybackTransition(
            prevLinkKeys,
            processedLinks
          );
          if (newComm.size || newLk.size || removedComm.size || removedLk.size) {
            // Flash the delta for this playback step: newly visible communities/links.
            playbackStepHotNodeIdsRef.current = new Set(
              Array.from(newComm).map(String)
            );
            playbackStepHotLinkKeysRef.current = new Set(Array.from(newLk));
            // Also hot-highlight endpoints of newly visible links.
            processedLinks.forEach((pl) => {
              const k = linkKeyForProcessedCommunityLink(pl);
              if (!newLk.has(k)) return;
              if (pl?.source?.id != null) {
                playbackStepHotNodeIdsRef.current.add(String(pl.source.id));
              }
              if (pl?.target?.id != null) {
                playbackStepHotNodeIdsRef.current.add(String(pl.target.id));
              }
            });

            // If this step removes nodes/links, highlight them on the previous root while it fades.
            const prevLayer = svg.select('g.graph-root--prev');
            if (!prevLayer.empty() && (removedComm.size || removedLk.size)) {
              prevLayer.selectAll('.node').each(function highlightRemovedNode(d) {
                if (!d || !removedComm.has(String(d.id))) return;
                const el = d3.select(this);
                el.style('opacity', 1);
                el.selectAll('circle.graph-node-disc, circle.graph-node-ring')
                  .style('stroke', '#f39c12')
                  .style('stroke-width', 4);
              });
              prevLayer.selectAll('line.link').each(function highlightRemovedLink(d) {
                const k = linkKeyForProcessedCommunityLink(d);
                if (!removedLk.has(k)) return;
                const el = d3.select(this);
                el.style('opacity', 1)
                  .style('stroke', '#f39c12')
                  .style('stroke-width', 4);
              });
            }

            if (playbackEaseHighlightTimerRef.current) {
              window.clearTimeout(playbackEaseHighlightTimerRef.current);
              playbackEaseHighlightTimerRef.current = null;
            }
            playbackEaseHighlightTimerRef.current = window.setTimeout(() => {
              playbackEaseHighlightTimerRef.current = null;
              playbackStepHotNodeIdsRef.current = new Set();
              playbackStepHotLinkKeysRef.current = new Set();
              updateHighlightingRef.current?.();
            }, PLAYBACK_STEP_HIGHLIGHT_MS);
          } else {
            if (playbackEaseHighlightTimerRef.current) {
              window.clearTimeout(playbackEaseHighlightTimerRef.current);
              playbackEaseHighlightTimerRef.current = null;
            }
            playbackStepHotNodeIdsRef.current = new Set();
            playbackStepHotLinkKeysRef.current = new Set();
          }
        }
      }

      // no fade-out transitions
      svg.selectAll('g.graph-root--prev').remove();
    };

    function resetCanvasToFullView() {
      if (!svgRef.current || !data?.nodes?.length) return;
      communitiesRef.current = initializeCommunities();
      mergeThresholdRef.current = 0.8;
      splitThresholdRef.current = 1.2;
      previousZoomRef.current = 1;
      updateVisualization();
      updateHighlighting();

      const syncThresholdsAfterFit = () => {
        const k = graphTransformRef.current?.k ?? 1;
        mergeThresholdRef.current = Math.min(k * MERGE_THRESHOLD, 0.8);
        splitThresholdRef.current = k / MERGE_THRESHOLD;
        previousZoomRef.current = k;
      };

      const pad = 40;
      const w = width;
      const h = height;

      const runFit = () => {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        const communities = communitiesRef.current;
        if (communities?.size) {
          communities.forEach(c => {
            if (c.x == null || c.y == null) return;
            minX = Math.min(minX, c.x);
            minY = Math.min(minY, c.y);
            maxX = Math.max(maxX, c.x);
            maxY = Math.max(maxY, c.y);
          });
        }
        if (!Number.isFinite(minX)) {
          data.nodes.forEach(n => {
            if (n.x == null || n.y == null) return;
            minX = Math.min(minX, n.x);
            minY = Math.min(minY, n.y);
            maxX = Math.max(maxX, n.x);
            maxY = Math.max(maxY, n.y);
          });
        }

        const applyTransform = (t) => {
          skipZoomClusteringRef.current = true;
          d3.select(svgRef.current)
            .call(zoom.transform, t)
            .on('end', () => {
              skipZoomClusteringRef.current = false;
              syncThresholdsAfterFit();
            });
          graphTransformRef.current = t;
          updateMinimapRef.current?.();
        };

        if (!Number.isFinite(minX)) {
          applyTransform(d3.zoomIdentity);
          return;
        }
        const gw = Math.max(maxX - minX, 1);
        const gh = Math.max(maxY - minY, 1);
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const k = Math.min((w - 2 * pad) / gw, (h - 2 * pad) / gh, 4);
        const kClamped = Math.max(0.1, Math.min(4, k));
        const tx = w / 2 - kClamped * cx;
        const ty = h / 2 - kClamped * cy;
        applyTransform(d3.zoomIdentity.translate(tx, ty).scale(kClamped));
      };

      window.setTimeout(runFit, 120);
    }

    resetCanvasViewRef.current = resetCanvasToFullView;

    // First paint must use the same community DOM as merge/split (thumbnails + tick), not
    // only the legacy circle pass above—otherwise thumbnails appear only after zoom, and
    // reopening the library (width/height) cleared them until zoom again.
    updateVisualization();
    updateHighlighting();

    const minimapElForNavCleanup = minimapSvgRef.current;

    // Cleanup
    return () => {
      stopTargetStretchAnimation();
      if (playbackEaseHighlightTimerRef.current) {
        window.clearTimeout(playbackEaseHighlightTimerRef.current);
        playbackEaseHighlightTimerRef.current = null;
      }
      if (wrapForExplode && onTooltipWrapInteraction) {
        wrapForExplode.removeEventListener('click', onTooltipWrapInteraction);
      }
      if (minimapRafRef.current) {
        cancelAnimationFrame(minimapRafRef.current);
        minimapRafRef.current = null;
      }
      if (minimapElForNavCleanup) {
        d3.select(minimapElForNavCleanup)
          .on('pointerdown.minimapNav', null)
          .on('pointermove.minimapNav', null)
          .on('pointerup.minimapNav', null)
          .on('pointercancel.minimapNav', null)
          .style('cursor', null)
          .style('touch-action', null);
      }
      minimapExtentsRef.current = null;
      minimapNavDragRef.current = null;
      simulation.stop();
      communityForceSimulationRef.current = null;
      tooltip.remove();
      applyProgrammaticZoomTransformRef.current = null;
      applyDiscoveryFocusNodeUiRef.current = null;
      updateHighlightingRef.current = null;
      updateMinimapRef.current = null;
      resetCanvasViewRef.current = null;
    };
    // D3 setup uses handler closures from this render; listing handleDelete* / trackOperation
    // would re-run the full simulation on every render where those identities change.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: deps above drive graph rebuild
  }, [data, selectedNodes, width, height, readOnly, playbackScrubToken]);

  const handleGenerate = async (event) => {
    event.preventDefault();
    const sourceIdSnapshot =
      generateSourceIdsRef.current != null
        ? [...generateSourceIdsRef.current]
        : Array.from(selectedNodeIds.current).map(String);
    const selectedNodesPayload = sourceIdSnapshot
      .map(id => data.nodes.find(node => String(node.id) === String(id)))
      .filter(Boolean);

    if (expansionAlgorithm === 'manual' && selectedNodesPayload.length === 0) {
      setGenerateSubmitError(
        'Manual generation needs at least one highlighted node. Close this form, highlight one or more nodes, then open AI Generation again.'
      );
      return;
    }
    if (
      expansionAlgorithm === 'randomizedGrowth' &&
      data.nodes.length < rgConnectionsPerNewNode
    ) {
      setGenerateSubmitError(
        `Community evolution needs at least ${rgConnectionsPerNewNode} node(s) on the graph for random attachment (current: ${data.nodes.length}). Add nodes or lower connections per new node.`
      );
      return;
    }
    if (expansionAlgorithm === 'branchExtrapolation') {
      if (sourceIdSnapshot.length < 2) {
        setGenerateSubmitError(
          'Extrapolate branch needs at least two highlighted nodes in click order along edges (tip last).'
        );
        return;
      }
      if (!pathHasConsecutiveGraphLinks(sourceIdSnapshot, data.links)) {
        setGenerateSubmitError(
          'Each consecutive highlighted pair must be linked on the graph. Click nodes in path order from root toward the tip, then try again.'
        );
        return;
      }
    }

    setGenerateSubmitError(null);
    setIsGenerating(true);
    setGenerateProgress(null);
    randomizedGrowthCancelRef.current = false;
    // Close the modal immediately once Apply is valid; progress is shown via on-canvas chip.
    setShowGenerateForm(false);
    // Also dismiss any lingering on-canvas node/link tooltip so the popover
    // doesn't hover over nodes while the graph rebuilds around new content.
    hideCanvasTooltip();
    // Pulse the highlighted anchors (the "target" nodes the user is generating from)
    // for the entire duration of the request. Works across all three AI Generation
    // algorithms (manual, community evolution, extrapolate branch); if no nodes are
    // highlighted (possible with community evolution), the helper silently no-ops.
    startTargetStretchAnimation(sourceIdSnapshot);
    const startTime = Date.now();
    let operationStatus = 'SUCCESS';
    let operationError = null;
    let generatedNodes = [];
    let cyclesCompleted = 0;
    let selectAfterGenerateIds = [];

    try {
      console.log(
        'Selected nodes for generation:',
        selectedNodesPayload.map(n => `${n.label} (${n.id})`)
      );

      const runOneGenerateRequest = async (graphPayload) => {
        const nodesSnapshot = graphPayload?.nodes || graphPayload || [];
        const linksSnapshot = graphPayload?.links || [];
        const existingGraphNodeIds = (nodesSnapshot || []).map(n => String(n.id));
        const json = {
          selectedNodes: selectedNodesPayload,
          numNodes: numNodesToAdd,
          existingGraphNodes: (nodesSnapshot || []).map(n => ({
            id: n.id,
            label: n.label,
            description: n.description,
            wikiUrl: n.wikiUrl || ''
          }))
        };
        if (expansionAlgorithm === 'randomizedGrowth') {
          json.expansionAlgorithm = 'randomizedGrowth';
          json.connectionsPerNewNode = rgConnectionsPerNewNode;
          json.existingGraphNodeIds = existingGraphNodeIds;
          json.anchorStrategy = rgAnchorStrategy;
          json.existingGraphLinks = linksSnapshot.map(l => ({
            source: typeof l.source === 'object' ? l.source.id : l.source,
            target: typeof l.target === 'object' ? l.target.id : l.target,
          }));
          if (rgPruneDuringGrowth) {
            json.enableDeletions = true;
            json.deletionsPerCycle = rgDeletionsPerCycle;
          }
        }
        const g = resolveGenerationContext(guidancePreset, guidanceCustomText);
        if (g) {
          json.generationContext = g;
        }
        return apiRequest('/api/generate-node', {
          method: 'POST',
          json
        });
      };

      if (expansionAlgorithm === 'branchExtrapolation') {
        const g = resolveGenerationContext(guidancePreset, guidanceCustomText);
        const result = await apiRequest('/api/generate-branch', {
          method: 'POST',
          json: {
            existingGraphNodes: data.nodes.map(n => ({
              id: n.id,
              label: n.label,
              description: n.description,
              wikiUrl: n.wikiUrl || ''
            })),
            existingGraphLinks: data.links.map(l => ({
              source: typeof l.source === 'object' ? l.source.id : l.source,
              target: typeof l.target === 'object' ? l.target.id : l.target
            })),
            branch: { pathNodeIds: sourceIdSnapshot.map(String) },
            iterations: brIterations,
            memoryK: brMemoryK,
            crossLinksPerIteration: brCrossLinksPerIteration,
            nodesPerIteration: numNodesToAdd,
            ...(g ? { generationContext: g } : {})
          }
        });

        if (!result.success) {
          operationStatus = 'FAILURE';
          operationError =
            result.details || result.error || 'Request failed';
          throw new Error(operationError);
        }

        generatedNodes = result.data.nodes;
        cyclesCompleted = brIterations;

        const newData = mergeGenerateNodeResponse(
          data,
          result.data,
          width,
          height
        );

        selectAfterGenerateIds = generatedNodes.map(n => String(n.id));
        selectedNodeIds.current = new Set(selectAfterGenerateIds);
        selectedNodeId.current = selectAfterGenerateIds[0] ?? null;
        setSelectedNodes(
          newData.nodes.filter(n => selectedNodeIds.current.has(String(n.id)))
        );

        if (onDataUpdate) {
          onDataUpdate(newData);
        }
      } else if (expansionAlgorithm === 'manual') {
        const result = await runOneGenerateRequest({
          nodes: data.nodes,
          links: data.links,
        });

        if (!result.success) {
          operationStatus = 'FAILURE';
          operationError =
            result.details || result.error || 'Request failed';
          throw new Error(operationError);
        }

        generatedNodes = result.data.nodes;
        cyclesCompleted = 1;

        const newData = mergeGenerateNodeResponse(
          data,
          result.data,
          width,
          height
        );

        selectAfterGenerateIds = generatedNodes.map(n => String(n.id));
        selectedNodeIds.current = new Set(selectAfterGenerateIds);
        selectedNodeId.current = selectAfterGenerateIds[0] ?? null;
        setSelectedNodes(
          newData.nodes.filter(n => selectedNodeIds.current.has(String(n.id)))
        );

        console.log('Final data validation:', {
          totalNodes: newData.nodes.length,
          totalLinks: newData.links.length
        });

        if (onDataUpdate) {
          onDataUpdate(newData);
        }
      } else {
        let working = data;
        const totalCycles = rgNumCycles;

        for (let c = 1; c <= totalCycles; c += 1) {
          if (randomizedGrowthCancelRef.current) {
            break;
          }
          setGenerateProgress({ current: c, total: totalCycles });

          const result = await runOneGenerateRequest(working);

          if (!result.success) {
            operationStatus = 'FAILURE';
            operationError =
              result.details || result.error || 'Request failed';
            throw new Error(operationError);
          }

          generatedNodes = generatedNodes.concat(result.data.nodes);
          cyclesCompleted += 1;

          working = mergeGenerateNodeResponse(
            working,
            result.data,
            width,
            height,
            {
              deletedNodeIds: Array.isArray(result.deletedNodeIds)
                ? result.deletedNodeIds
                : [],
            }
          );

          if (onDataUpdate) {
            onDataUpdate(working);
          }
        }

        selectAfterGenerateIds = generatedNodes.map(n => String(n.id));
        selectedNodeIds.current = new Set(selectAfterGenerateIds);
        selectedNodeId.current = selectAfterGenerateIds[0] ?? null;
        setSelectedNodes(
          working.nodes.filter(n => selectedNodeIds.current.has(String(n.id)))
        );
      }

      // Keep the newly generated nodes highlighted after AI operations.
      // (Selection refs + selectedNodes state are updated above per algorithm.)
    } catch (error) {
      console.error('Error generating nodes:', error);
      operationStatus = 'FAILURE';
      operationError = getApiErrorMessage(error);
      alert('Error generating nodes: ' + getApiErrorMessage(error));
    } finally {
      stopTargetStretchAnimation();
      generateSourceIdsRef.current = null;
      setIsGenerating(false);
      setGenerateProgress(null);

      await trackOperation(
        'GENERATE',
        {
          expansionAlgorithm,
          numNodesRequested: numNodesToAdd,
          numCyclesRequested:
            expansionAlgorithm === 'randomizedGrowth'
              ? rgNumCycles
              : expansionAlgorithm === 'branchExtrapolation'
                ? brIterations
                : 1,
          numCyclesCompleted: cyclesCompleted,
          branchMemoryK:
            expansionAlgorithm === 'branchExtrapolation' ? brMemoryK : undefined,
          branchCrossLinksPerIteration:
            expansionAlgorithm === 'branchExtrapolation'
              ? brCrossLinksPerIteration
              : undefined,
          connectionsPerNewNode:
            expansionAlgorithm === 'randomizedGrowth'
              ? rgConnectionsPerNewNode
              : undefined,
          anchorStrategy:
            expansionAlgorithm === 'randomizedGrowth'
              ? rgAnchorStrategy
              : undefined,
          pruneDuringGrowth:
            expansionAlgorithm === 'randomizedGrowth'
              ? rgPruneDuringGrowth
              : undefined,
          deletionsPerCycle:
            expansionAlgorithm === 'randomizedGrowth' && rgPruneDuringGrowth
              ? rgDeletionsPerCycle
              : undefined,
          selectedNodes: sourceIdSnapshot.map(id => {
            const node = data.nodes.find(n => String(n.id) === String(id));
            return {
              id: node?.id || id,
              label: node?.label || 'Unknown Node'
            };
          }),
          generatedNodes: generatedNodes.map(node => ({
            id: node.id,
            label: node.label
          }))
        },
        startTime,
        operationStatus === 'FAILURE' ? new Error(operationError) : null
      );
    }
  };

  const handleExplodeNode = async (targetIdStr) => {
    if (readOnly || !onDataUpdate) return;
    const targetNode = data.nodes.find((n) => String(n.id) === String(targetIdStr));
    if (!targetNode) return;
    setExplodeInProgress(true);
    startTargetStretchAnimation(targetIdStr);
    const startTime = Date.now();
    let operationStatus = 'SUCCESS';
    let operationError = null;
    let generatedNodes = [];
    let rewiredLinkCount = 0;
    const numNodes = Math.min(
      6,
      Math.max(2, Math.round(Number(explodeTooltipNumNodes)) || 4)
    );
    try {
      const g = resolveGenerationContext(guidancePreset, guidanceCustomText);
      const json = {
        targetNodeId: String(targetIdStr),
        numNodes,
        existingGraphNodes: data.nodes.map((n) => ({
          id: n.id,
          label: n.label,
          description: n.description || '',
          wikiUrl: n.wikiUrl || n.wikipediaUrl || '',
        })),
      };
      if (g) json.generationContext = g;
      json.guidancePreset = guidancePreset;
      const result = await apiRequest('/api/explode-node', { method: 'POST', json });
      if (!result.success) {
        operationStatus = 'FAILURE';
        operationError = result.details || result.error || 'Explode failed';
        throw new Error(operationError);
      }
      generatedNodes = result.data?.nodes || [];

      /**
       * Purge-in-place: the exploded node is **replaced** by the freshly
       * generated cluster. We (1) snapshot every external edge that touched
       * the target in the original graph, (2) drop the target node via the
       * merge's `deletedNodeIds` (which also filters both old edges on the
       * target and the server's "bridge" edges from new nodes → anchor,
       * since the anchor no longer exists), and (3) rewire each broken
       * external edge by reattaching it to one of the new generated nodes
       * round-robin, preserving the original relationship label + strength
       * so the surrounding graph keeps its semantic wiring.
       */
      const targetIdSnapshot = String(targetIdStr);
      const externalBrokenEdges = data.links
        .map((l) => ({
          source:
            typeof l.source === 'object'
              ? String(l.source.id)
              : String(l.source),
          target:
            typeof l.target === 'object'
              ? String(l.target.id)
              : String(l.target),
          relationship: l.relationship,
          strength: l.strength,
        }))
        .filter(
          (l) =>
            (l.source === targetIdSnapshot || l.target === targetIdSnapshot) &&
            !(l.source === targetIdSnapshot && l.target === targetIdSnapshot)
        );

      const merged = mergeGenerateNodeResponse(data, result.data, width, height, {
        deletedNodeIds: [targetIdSnapshot],
      });

      const newNodeIds = generatedNodes.map((n) => String(n.id));
      const rewiredLinks = [];
      if (newNodeIds.length > 0 && externalBrokenEdges.length > 0) {
        const tsBase = Date.now();
        externalBrokenEdges.forEach((el, idx) => {
          const externalId =
            el.source === targetIdSnapshot ? el.target : el.source;
          const pickId = newNodeIds[idx % newNodeIds.length];
          const srcNode = merged.nodes.find((n) => String(n.id) === externalId);
          const tgtNode = merged.nodes.find((n) => String(n.id) === pickId);
          if (!srcNode || !tgtNode) return;
          const ts = tsBase + idx + 1;
          rewiredLinks.push({
            source: srcNode,
            target: tgtNode,
            relationship: el.relationship || 'related',
            ...(typeof el.strength === 'number' && Number.isFinite(el.strength)
              ? { strength: Math.max(0, Math.min(1, el.strength)) }
              : {}),
            createdAt: ts,
            timestamp: ts,
          });
        });
      }
      rewiredLinkCount = rewiredLinks.length;

      onDataUpdate({
        nodes: merged.nodes,
        links: [...merged.links, ...rewiredLinks],
      });

      /**
       * After purge-in-place, highlight the freshly generated cluster so the
       * user can immediately see what replaced the anchor. We (a) drop the
       * now-gone anchor from the ref + state selection sets, and (b) add the
       * new node ids / node objects. `setSelectedNodes` triggers a D3
       * re-render, but since `data` also just changed the effect was going
       * to rebuild anyway — React batches the two updates into one rebuild.
       */
      selectedNodeIds.current.delete(targetIdSnapshot);
      if (selectedNodeId.current != null && String(selectedNodeId.current) === targetIdSnapshot) {
        selectedNodeId.current = null;
      }
      const newSelectionNodes = [];
      newNodeIds.forEach((nid) => {
        selectedNodeIds.current.add(nid);
        const n = merged.nodes.find((x) => String(x.id) === nid);
        if (n) newSelectionNodes.push(n);
      });
      setSelectedNodes((prev) => {
        const kept = prev.filter((n) => String(n.id) !== targetIdSnapshot);
        const keptIds = new Set(kept.map((n) => String(n.id)));
        const additions = newSelectionNodes.filter((n) => !keptIds.has(String(n.id)));
        return [...kept, ...additions];
      });
    } catch (e) {
      console.error(e);
      operationStatus = 'FAILURE';
      operationError = getApiErrorMessage(e);
      window.alert(`Explode subgraph failed: ${getApiErrorMessage(e)}`);
    } finally {
      stopTargetStretchAnimation();
      setExplodeInProgress(false);
      await trackOperation(
        'GENERATE',
        {
          expansionAlgorithm: 'explosion',
          numNodesRequested: numNodes,
          numCyclesRequested: 1,
          numCyclesCompleted: 1,
          selectedNodes: [
            {
              id: targetNode.id,
              label: targetNode.label || String(targetNode.id),
            },
          ],
          generatedNodes: generatedNodes.map((node) => ({
            id: node.id,
            label: node.label,
          })),
          deletedNodeIds: [String(targetNode.id)],
          rewiredLinkCount,
          guidancePreset,
        },
        startTime,
        operationStatus === 'FAILURE' ? new Error(operationError) : null
      );
    }
  };
  handleExplodeNodeRef.current = handleExplodeNode;

  /**
   * Extend: per-node single-anchor POST /api/generate-node. The tooltip node becomes
   * `requiredAnchorId`, and at most ONE of `requiredRelationshipLabel` or
   * `requiredConceptHint` is sent (mutual exclusivity enforced server-side). Reuses the
   * shared guidance preset so tone stays consistent with Explode. Silent no-op if the
   * target is missing; errors surface via window.alert (parity with Explode).
   */
  const handleExtendNode = async (targetIdStr) => {
    if (readOnly || !onDataUpdate) return;
    if (extendInProgress) return;
    const targetNode = data.nodes.find((n) => String(n.id) === String(targetIdStr));
    if (!targetNode) return;
    const kind = extendTooltipKind === 'concept' ? 'concept' : 'relationship';
    const textRaw = String(extendTooltipText || '').trim().slice(0, 200);
    // Extend always adds exactly one concept — the tight, surgical counterpart to Explode.
    const numNodes = 1;
    setExtendInProgress(true);
    startTargetStretchAnimation(targetNode.id);
    const startTime = Date.now();
    let operationStatus = 'SUCCESS';
    let operationError = null;
    let generatedNodes = [];
    try {
      const json = {
        expansionAlgorithm: 'manual',
        numNodes,
        selectedNodes: [
          {
            id: targetNode.id,
            label: targetNode.label || String(targetNode.id),
            description: targetNode.description || '',
            wikiUrl: targetNode.wikiUrl || targetNode.wikipediaUrl || '',
          },
        ],
        existingGraphNodes: data.nodes.map((n) => ({
          id: n.id,
          label: n.label,
          description: n.description || '',
          wikiUrl: n.wikiUrl || n.wikipediaUrl || '',
        })),
        requiredAnchorId: targetNode.id,
      };
      if (textRaw) {
        if (kind === 'concept') {
          json.requiredConceptHint = textRaw;
        } else {
          json.requiredRelationshipLabel = textRaw;
        }
      }
      const g = resolveGenerationContext(guidancePreset, guidanceCustomText);
      if (g) json.generationContext = g;
      json.guidancePreset = guidancePreset;
      const result = await apiRequest('/api/generate-node', { method: 'POST', json });
      if (!result.success) {
        operationStatus = 'FAILURE';
        operationError = result.details || result.error || 'Extend failed';
        throw new Error(operationError);
      }
      generatedNodes = result.data?.nodes || [];
      const merged = mergeGenerateNodeResponse(data, result.data, width, height);
      onDataUpdate(merged);
      // Clear the constraint text after a successful extend so the next click starts fresh.
      setExtendTooltipText('');
    } catch (e) {
      console.error(e);
      operationStatus = 'FAILURE';
      operationError = getApiErrorMessage(e);
      window.alert(`Extend failed: ${getApiErrorMessage(e)}`);
    } finally {
      stopTargetStretchAnimation();
      setExtendInProgress(false);
      await trackOperation(
        'GENERATE',
        {
          expansionAlgorithm: 'manual',
          numNodesRequested: numNodes,
          numCyclesRequested: 1,
          numCyclesCompleted: 1,
          selectedNodes: [
            {
              id: targetNode.id,
              label: targetNode.label || String(targetNode.id),
            },
          ],
          generatedNodes: generatedNodes.map((node) => ({
            id: node.id,
            label: node.label,
          })),
          guidancePreset,
          requiredAnchorId: String(targetNode.id),
          requiredConstraintKind: textRaw ? kind : 'none',
        },
        startTime,
        operationStatus === 'FAILURE' ? new Error(operationError) : null
      );
    }
  };
  handleExtendNodeRef.current = handleExtendNode;

  const handleAddNodeSubmit = async (e) => {
    e.preventDefault();
    const startTime = Date.now();

    const createdAt = Date.now();
    const newNode = {
      id: `node_${Date.now()}`,
      label: newNodeData.label,
      description: newNodeData.description,
      wikiUrl: newNodeData.wikiUrl,
      createdAt,
      timestamp: createdAt,
      x: width / 2,
      y: height / 2,
      vx: 0,
      vy: 0
    };

    const newData = {
      nodes: [...data.nodes, newNode],
      links: [...data.links]
    };

    const idsToConnect = [...connectNewNodeToIdsRef.current];
    connectNewNodeToIdsRef.current = [];
    setPendingConnectIdsForAddForm([]);

    const targets = idsToConnect
      .map(id => newData.nodes.find(n => String(n.id) === String(id)))
      .filter(Boolean);

    onDataUpdate(newData);
    setShowAddForm(false);
    setNewNodeData({ label: '', description: '', wikiUrl: '' });
    hideCanvasTooltip();

    await trackOperation('ADD_NODE', {
      addedNode: {
        id: newNode.id,
        label: newNode.label,
        description: newNode.description,
        wikiUrl: newNode.wikiUrl
      }
    }, startTime);

    if (targets.length > 0) {
      setConnectNewNodeLinksForm({
        newNode,
        targets,
        relationshipInputs: targets.map(() => ''),
      });
    }
  };

  const handleConnectNewNodeLinksSubmit = async (e) => {
    e.preventDefault();
    if (!connectNewNodeLinksForm) return;
    const { newNode, targets, relationshipInputs } = connectNewNodeLinksForm;
    for (let i = 0; i < relationshipInputs.length; i++) {
      if (!relationshipInputs[i]?.trim()) {
        window.alert('Please describe the relationship for each highlighted concept.');
        return;
      }
    }
    const newNodeObj = data.nodes.find(n => String(n.id) === String(newNode.id));
    if (!newNodeObj) {
      window.alert('Could not find the new concept in the graph.');
      setConnectNewNodeLinksForm(null);
      return;
    }
    let linkSeq = Date.now();
    const newLinks = targets.map((t, i) => {
      const targetObj = data.nodes.find(n => String(n.id) === String(t.id));
      linkSeq += 1;
      return {
        source: newNodeObj,
        target: targetObj,
        relationship: relationshipInputs[i].trim(),
        createdAt: linkSeq,
        timestamp: linkSeq,
      };
    }).filter(l => l.target);

    onDataUpdate({
      nodes: [...data.nodes],
      links: [...data.links, ...newLinks],
    });
    setConnectNewNodeLinksForm(null);
    hideCanvasTooltip();

    for (let i = 0; i < newLinks.length; i++) {
      const link = newLinks[i];
      const opStart = Date.now();
      await trackOperation(
        'ADD_RELATIONSHIP',
        {
          relationship: {
            sourceNode: {
              id: link.source.id,
              label: link.source.label,
            },
            targetNode: {
              id: link.target.id,
              label: link.target.label,
            },
            relationshipType: link.relationship,
          },
        },
        opStart
      );
    }
  };

  const updateConnectNewNodeRelationshipInput = (index, value) => {
    setConnectNewNodeLinksForm(prev => {
      if (!prev) return prev;
      const next = [...prev.relationshipInputs];
      next[index] = value;
      return { ...prev, relationshipInputs: next };
    });
  };

  const handleAddRelationship = async (e) => {
    e.preventDefault();
    const startTime = Date.now();
    
    const createdAt = Date.now();
    const newLink = {
      source: selectedNodes[0],
      target: selectedNodes[1],
      relationship: relationshipForm.relationship,
      createdAt,
      timestamp: createdAt,
    };

    const newData = {
      nodes: [...data.nodes],
      links: [...data.links, newLink]
    };

    onDataUpdate(newData);
    
    // Reset states
    setRelationshipForm({ show: false, relationship: '' });
    setSelectedNodes([]);
    hideCanvasTooltip();

    await trackOperation('ADD_RELATIONSHIP', {
      relationship: {
        sourceNode: {
          id: selectedNodes[0].id,
          label: selectedNodes[0].label
        },
        targetNode: {
          id: selectedNodes[1].id,
          label: selectedNodes[1].label
        },
        relationshipType: relationshipForm.relationship
      }
    }, startTime);
  };

  const handleDeleteNode = (node) => {
    // Find all connected relationships
    const connectedLinks = data.links.filter(l => 
      l.source.id === node.id || l.target.id === node.id
    );
  
    setDeleteDecision({
      kind: 'node',
      node,
      connectedCount: connectedLinks.length,
    });
  };

  const handleDeleteLink = (link) => {
    setDeleteDecision({
      kind: 'link',
      link,
    });
  };

  const closeDeleteDecision = () => setDeleteDecision(null);

  const applyDeleteDecision = (mode) => {
    if (!deleteDecision) return;
    const { kind } = deleteDecision;

    if (kind === 'node') {
      const node = deleteDecision.node;
      if (!node) return closeDeleteDecision();
      const nodeId = node.id;
      if (mode === 'purge') {
        const newNodes = data.nodes.filter((n) => n.id !== nodeId);
        const newLinks = data.links.filter(
          (l) => l.source.id !== nodeId && l.target.id !== nodeId
        );
        onDataUpdate({ nodes: newNodes, links: newLinks });
      } else if (mode === 'pop') {
        const deletedAt = Date.now();
        const newNodes = data.nodes.map((n) =>
          n.id === nodeId ? { ...n, deletedAt } : n
        );
        const newLinks = data.links.map((l) =>
          l.source.id === nodeId || l.target.id === nodeId
            ? { ...l, deletedAt: l.deletedAt ?? deletedAt }
            : l
        );
        onDataUpdate({ nodes: newNodes, links: newLinks });
      }
    }

    if (kind === 'link') {
      const link = deleteDecision.link;
      if (!link) return closeDeleteDecision();
      const match = (l) =>
        l.source.id === link.source.id &&
        l.target.id === link.target.id &&
        String(l.relationship ?? '') === String(link.relationship ?? '');

      if (mode === 'purge') {
        const newLinks = data.links.filter((l) => !match(l));
        onDataUpdate({ nodes: [...data.nodes], links: newLinks });
      } else if (mode === 'pop') {
        const deletedAt = Date.now();
        const newLinks = data.links.map((l) => {
          if (!match(l)) return l;
          if (l.deletedAt != null) return l;
          return { ...l, deletedAt };
        });
        onDataUpdate({ nodes: [...data.nodes], links: newLinks });
      }
    }

    selectedNodeIds.current.clear();
    selectedNodeId.current = null;
    closeDeleteDecision();
  };

  const onMenuPickGenerate = () => {
    const snap = graphActionSnapshotRef.current;
    generateSourceIdsRef.current = [...snap.nodeIds];
    setGenerateFormAnchorIds([...snap.nodeIds]);
    setGenerateSubmitError(null);
    connectNewNodeToIdsRef.current = [];
    setPendingConnectIdsForAddForm([]);
    setGraphActionMenu(null);
    setShowAddForm(false);
    setRelationshipForm({ show: false, relationship: '' });
    randomizedGrowthCancelRef.current = false;
    setGenerateProgress(null);
    setShowGenerateForm(true);
  };

  const onMenuPickGenerateWithAlgorithm = (algorithm) => {
    setExpansionAlgorithm(algorithm);
    onMenuPickGenerate();
  };

  const onMenuPickAddNode = () => {
    const snap = graphActionSnapshotRef.current;
    const ids = snap.nodeIds.length ? [...snap.nodeIds] : [];
    connectNewNodeToIdsRef.current = ids;
    setPendingConnectIdsForAddForm(ids);
    setGraphActionMenu(null);
    setShowGenerateForm(false);
    setRelationshipForm({ show: false, relationship: '' });
    setShowAddForm(true);
  };

  const onMenuPickAddRelationship = () => {
    const snap = graphActionSnapshotRef.current;
    const pair = snap.nodesOrdered.length >= 2 ? snap.nodesOrdered.slice(0, 2) : [];
    if (pair.length < 2) {
      window.alert(
        'Highlight exactly two nodes (click to select) before adding a relationship.'
      );
      setGraphActionMenu(null);
      return;
    }
    setSelectedNodes(pair);
    setRelationshipForm({ show: true, relationship: '' });
    setGraphActionMenu(null);
  };

  const onMenuPickDelete = () => {
    const snap = graphActionSnapshotRef.current;
    setGraphActionMenu(null);
    if (snap.linkToDelete) {
      handleDeleteLink(snap.linkToDelete);
      return;
    }
    if (snap.nodeIds.length === 1) {
      const node = data.nodes.find(n => String(n.id) === String(snap.nodeIds[0]));
      if (node) handleDeleteNode(node);
      return;
    }
    setDeleteDecision({ kind: 'none' });
  };

  const actionsFabButton = readOnly ? null : (
    <button
      ref={graphActionsFabRef}
      type="button"
      className={`graph-actions-fab${
        actionsFabPlacement === 'libraryGraphMount'
          ? ' graph-actions-fab--library-graph-mount'
          : ''
      }`}
      onClick={e => {
        e.stopPropagation();
        toggleGraphActionsFromFab();
      }}
      aria-expanded={Boolean(graphActionMenu)}
      aria-haspopup="true"
      aria-controls="graph-action-menu"
      aria-label="Open graph actions menu"
    >
      <span className="graph-actions-fab-icon" aria-hidden>
        ☰
      </span>
      <span className="graph-actions-fab-label">Actions</span>
    </button>
  );

  const nodeCount = (data?.nodes ?? []).length;
  const emptyStateBlockedByModal =
    showGenerateForm ||
    showAddForm ||
    relationshipForm.show ||
    Boolean(connectNewNodeLinksForm) ||
    isGenerating ||
    explodeInProgress ||
    showGraphActionsHelp;
  const showEditableEmptyGuide =
    !readOnly && nodeCount === 0 && !emptyStateBlockedByModal;
  const showReadOnlyEmpty =
    readOnly && nodeCount === 0 && !emptyStateBlockedByModal;

  let activeGraphEditBanner = null;
  if (explodeInProgress) {
    const label =
      selectedNodes.length === 1
        ? selectedNodes[0]?.label || 'concept'
        : 'concept';
    activeGraphEditBanner = {
      title: 'Exploding subgraph',
      hint: `Expanding Wikipedia context for “${label}”…`,
      progressBar: { mode: 'indeterminate' },
    };
  } else if (isGenerating) {
    const baseHint =
      expansionAlgorithm === 'randomizedGrowth'
        ? 'Generating (community evolution).'
        : expansionAlgorithm === 'branchExtrapolation'
          ? 'Generating (branch extrapolation).'
          : 'Generating (manual).';
    const progressHint =
      expansionAlgorithm === 'randomizedGrowth' && generateProgress
        ? `Cycle ${generateProgress.current}/${generateProgress.total}…`
        : 'Working…';
    const progressBar =
      expansionAlgorithm === 'randomizedGrowth' && generateProgress
        ? {
          mode: 'determinate',
          current: generateProgress.current,
          total: generateProgress.total,
        }
        : { mode: 'indeterminate' };
    activeGraphEditBanner = {
      title: 'Generating (AI)',
      hint: `${baseHint} ${progressHint}`,
      progressBar,
      actions:
        expansionAlgorithm === 'randomizedGrowth'
          ? [
            {
              key: 'stop-after-cycle',
              label: 'Stop after this cycle',
              onClick: () => {
                randomizedGrowthCancelRef.current = true;
              },
            },
          ]
          : [],
    };
  } else if (showGenerateForm) {
    activeGraphEditBanner = {
      title: 'Generate (AI)',
      hint:
        expansionAlgorithm === 'manual'
          ? 'Confirm runs one generation.'
          : expansionAlgorithm === 'branchExtrapolation'
            ? 'Branch mode uses one server request for all iterations; keep the tab open until it finishes.'
            : 'Community evolution runs one API batch per cycle (rate limits apply). You can stop between cycles.',
    };
  } else if (showAddForm) {
    activeGraphEditBanner = {
      title: 'Add concept',
      hint: 'Fill in the form to add a node. Cancel returns to the graph.',
    };
  } else if (relationshipForm.show) {
    const a = selectedNodes[0]?.label || 'first concept';
    const b = selectedNodes[1]?.label || 'second concept';
    activeGraphEditBanner = {
      title: 'Add relationship',
      hint: `Describe how “${a}” connects to “${b}”. Cancel discards this link.`,
    };
  } else if (connectNewNodeLinksForm) {
    activeGraphEditBanner = {
      title: 'Connect new concept',
      hint:
        'Enter relationship text for each highlighted node, or skip connections.',
    };
  }

  let pruneValidationMessage = null;
  if (
    showGenerateForm &&
    expansionAlgorithm === 'randomizedGrowth' &&
    rgPruneDuringGrowth &&
    rgDeletionsPerCycle > 0
  ) {
    const minAfter = Math.max(rgConnectionsPerNewNode + 2, 4);
    if (data.nodes.length - rgDeletionsPerCycle < minAfter) {
      pruneValidationMessage = `Pruning would leave fewer than ${minAfter} nodes. Lower deletions per cycle or add more nodes.`;
    } else {
      const anchorSet = new Set(
        (generateFormAnchorIds || []).map((id) => String(id))
      );
      const deletable = data.nodes.filter(
        (n) => !anchorSet.has(String(n.id))
      ).length;
      if (deletable < rgDeletionsPerCycle) {
        pruneValidationMessage = `Need at least ${rgDeletionsPerCycle} deletable (non-anchor) node(s); highlighted anchors are never removed.`;
      }
    }
  }

  const generateFormValidationMessage =
    showGenerateForm &&
    expansionAlgorithm === 'manual' &&
    generateFormAnchorIds.length === 0
      ? 'Manual generation needs at least one highlighted node. Close this form, highlight one or more nodes, then open AI Generation again.'
      : showGenerateForm &&
        expansionAlgorithm === 'branchExtrapolation' &&
        generateFormAnchorIds.length < 2
        ? 'Extrapolate branch needs at least two highlighted nodes in click order along edges (tip last). Close the form, select the path, then open this action again.'
        : showGenerateForm &&
          expansionAlgorithm === 'branchExtrapolation' &&
          !pathHasConsecutiveGraphLinks(generateFormAnchorIds, data.links)
          ? 'Each consecutive highlighted pair must be linked on the graph. Click nodes in path order, then reopen Extrapolate branch.'
          : showGenerateForm &&
            expansionAlgorithm === 'randomizedGrowth' &&
            data.nodes.length < rgConnectionsPerNewNode
            ? `Community evolution needs at least ${rgConnectionsPerNewNode} node(s) on the graph for random attachment (current: ${data.nodes.length}). Add nodes or lower connections per new node.`
            : pruneValidationMessage;
  const generateFormErrorDisplay =
    generateFormValidationMessage || generateSubmitError;

  const discoveryMatchCount = nodesMatchingLabelQuery(
    data?.nodes || [],
    discoveryQuery
  ).length;

  return (
    <div className="graph-visualization-container">
      {graphSearchBarVisible ? (
        <div
          className="graph-discovery-bar"
          role="search"
          aria-label="Find concepts on the graph"
        >
          <label htmlFor="graph-discovery-search" className="graph-discovery-bar__label">
            Find
          </label>
          <input
            id="graph-discovery-search"
            data-testid="graph-discovery-search"
            type="search"
            className="graph-discovery-bar__input"
            placeholder="Search labels…"
            value={discoveryQuery}
            onChange={e => setDiscoveryQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                focusNextDiscoveryMatch();
              }
            }}
          />
          <span className="graph-discovery-bar__meta" data-testid="graph-discovery-count">
            {discoveryMatchCount} match{discoveryMatchCount === 1 ? '' : 'es'}
          </span>
          <button
            type="button"
            className="graph-discovery-bar__focus"
            data-testid="graph-discovery-focus"
            onClick={() => focusNextDiscoveryMatch()}
          >
            Focus next
          </button>
          <button
            type="button"
            className="graph-discovery-bar__reset-view"
            data-testid="graph-discovery-show-all"
            onClick={() => resetCanvasViewRef.current?.()}
            title="Zoom to fit all nodes and show each concept (no clusters)"
            aria-label="Show all nodes: zoom to fit and ungroup clusters"
          >
            Show all
          </button>
        </div>
      ) : null}

      {insightsPanelVisible && graphInsights ? (
        <div
          className="graph-insights-panel"
          role="region"
          aria-label="Graph insights"
          data-testid="graph-insights-panel"
        >
          <div className="graph-insights-panel__header-row">
            <div className="graph-insights-panel__assess-controls">
              <select
                id="insights-assess-guiding-focus"
                className="graph-insights-panel__assess-select graph-insights-panel__assess-select--guiding"
                data-testid="graph-insights-assess-guiding-focus"
                aria-label="Question"
                value={insightsAssessGuidingFocus}
                onChange={(e) => setInsightsAssessGuidingFocus(e.target.value)}
                disabled={insightsAssessLoading}
              >
                {INSIGHT_ASSESS_GUIDING_FOCUS_GROUPS.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.options.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
                <option value="custom">Custom question</option>
              </select>
              <div
                className="graph-insights-panel__assess-balance"
                data-testid="graph-insights-assess-balance-wrap"
              >
                <label
                  htmlFor="insights-assess-reflection-balance"
                  className="graph-insights-panel__assess-balance-label"
                >
                  <span className="graph-insights-panel__assess-balance-end graph-insights-panel__assess-balance-end--left">
                    Reflective
                  </span>
                  <input
                    id="insights-assess-reflection-balance"
                    type="range"
                    className="graph-insights-panel__assess-balance-range"
                    data-testid="graph-insights-assess-reflection-balance"
                    min={INSIGHT_ASSESS_REFLECTION_BALANCE_MIN}
                    max={INSIGHT_ASSESS_REFLECTION_BALANCE_MAX}
                    step={INSIGHT_ASSESS_REFLECTION_BALANCE_STEP}
                    value={insightsAssessReflectionBalance}
                    onChange={(e) => {
                      const next = parseInt(e.target.value, 10);
                      setInsightsAssessReflectionBalance(
                        Number.isFinite(next)
                          ? next
                          : INSIGHT_ASSESS_REFLECTION_BALANCE_DEFAULT
                      );
                    }}
                    disabled={insightsAssessLoading}
                    aria-label="Reflective to discovery balance"
                    aria-valuemin={INSIGHT_ASSESS_REFLECTION_BALANCE_MIN}
                    aria-valuemax={INSIGHT_ASSESS_REFLECTION_BALANCE_MAX}
                    aria-valuenow={insightsAssessReflectionBalance}
                    aria-valuetext={formatInsightAssessReflectionBalance(
                      insightsAssessReflectionBalance
                    )}
                    title="Slide left for reflective (describe what's in the graph) or right for discovery (speculate on emergent directions)."
                  />
                  <span className="graph-insights-panel__assess-balance-end graph-insights-panel__assess-balance-end--right">
                    Discovery
                  </span>
                </label>
                <div
                  className="graph-insights-panel__assess-balance-readout"
                  aria-live="polite"
                  data-testid="graph-insights-assess-reflection-balance-readout"
                >
                  {formatInsightAssessReflectionBalance(
                    insightsAssessReflectionBalance
                  )}
                </div>
              </div>
              <select
                id="insights-assess-length"
                className="graph-insights-panel__assess-select graph-insights-panel__assess-select--length"
                data-testid="graph-insights-assess-length"
                aria-label="Length"
                value={insightsAssessLength}
                onChange={(e) => setInsightsAssessLength(e.target.value)}
                disabled={insightsAssessLoading}
              >
                {INSIGHT_ASSESS_LENGTH_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="graph-insights-panel__assess-submit"
                data-testid="graph-insights-assess"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleInsightsAssess();
                }}
                disabled={insightsAssessLoading || !graphInsights?.nodeCount}
                title={
                  insightsAssessLoading
                    ? 'Assessment in progress…'
                    : !graphInsights?.nodeCount
                      ? 'Add concepts to the graph before assessing.'
                      : 'Generate an interpretive summary from notable nodes (degree, betweenness, closeness, eigenvector); uses OpenAI on the server.'
                }
              >
                {insightsAssessLoading ? 'Assessing…' : 'Assess'}
              </button>
            </div>
          </div>
          {(() => {
            const guidingPreview = getInsightAssessGuidingFocusPreview(
              insightsAssessGuidingFocus
            );
            if (!guidingPreview) return null;
            return (
              <div
                className="graph-insights-panel__guiding-preview"
                role="region"
                aria-label="Question text for this assessment"
                aria-live="polite"
                data-testid="graph-insights-guiding-preview"
              >
                <div className="graph-insights-panel__guiding-preview-label">
                  Question used
                </div>
                <div className="graph-insights-panel__guiding-preview-body">
                  {guidingPreview}
                </div>
              </div>
            );
          })()}
          {insightsAssessGuidingFocus === 'custom' ? (
            <div className="graph-insights-panel__custom-tone-wrap">
              <label
                htmlFor="insights-assess-custom-guiding"
                className="graph-insights-panel__assess-label"
              >
                What the assessment should answer
              </label>
              <textarea
                id="insights-assess-custom-guiding"
                className="graph-insights-panel__custom-tone"
                data-testid="graph-insights-assess-custom-guiding"
                rows={3}
                maxLength={4000}
                placeholder="e.g. Emphasize how the map evades a single center; or trace a motif of dependency between three named nodes…"
                value={insightsAssessCustomGuiding}
                onChange={(e) => setInsightsAssessCustomGuiding(e.target.value)}
                disabled={insightsAssessLoading}
              />
            </div>
          ) : null}
          {insightsAssessError ? (
            <div className="graph-insights-panel__assess-error" role="alert">
              {insightsAssessError}
            </div>
          ) : null}
          {insightsAssessment ? (
            <div
              className="graph-insights-panel__assessment"
              data-testid="graph-insights-assessment"
            >
              <div className="graph-insights-panel__assessment-header">
                <div className="graph-insights-panel__assessment-title">
                  Interpretive assessment
                </div>
                <div
                  className="graph-insights-panel__assessment-actions"
                  role="toolbar"
                  aria-label="Assessment actions"
                >
                  <button
                    type="button"
                    className="graph-insights-panel__assessment-action"
                    data-testid="graph-insights-assessment-copy"
                    onClick={() => copyInsightsAssessment()}
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    className="graph-insights-panel__assessment-action"
                    data-testid="graph-insights-assessment-save"
                    onClick={() => saveInsightsAssessment()}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="graph-insights-panel__assessment-action graph-insights-panel__assessment-action--close"
                    data-testid="graph-insights-assessment-close"
                    onClick={() => closeInsightsAssessment()}
                  >
                    Close
                  </button>
                </div>
              </div>
              {insightsAssessActionFeedback ? (
                <div
                  className={
                    insightsAssessActionFeedback.variant === 'error'
                      ? 'graph-insights-panel__assessment-action-msg graph-insights-panel__assessment-action-msg--error'
                      : 'graph-insights-panel__assessment-action-msg'
                  }
                  role="status"
                >
                  {insightsAssessActionFeedback.message}
                </div>
              ) : null}
              <div className="graph-insights-panel__assessment-body">
                {insightsAssessment}
              </div>
            </div>
          ) : null}
          <dl className="graph-insights-panel__stats">
            <div className="graph-insights-panel__stat">
              <dt>Nodes</dt>
              <dd>{graphInsights.nodeCount}</dd>
            </div>
            <div className="graph-insights-panel__stat">
              <dt>Edges</dt>
              <dd>{graphInsights.edgeCount}</dd>
            </div>
            <div className="graph-insights-panel__stat">
              <dt>Density</dt>
              <dd>{graphInsights.density.toFixed(4)}</dd>
            </div>
            <div className="graph-insights-panel__stat">
              <dt>Components</dt>
              <dd>
                {graphInsights.componentCount}
                <span className="graph-insights-panel__sub">
                  {' '}
                  (largest {graphInsights.largestComponentSize})
                </span>
              </dd>
            </div>
            <div className="graph-insights-panel__stat">
              <dt>Degree</dt>
              <dd>
                {graphInsights.degreeMin} / {graphInsights.degreeMedian} /{' '}
                {graphInsights.degreeMax}
                <span className="graph-insights-panel__sub"> min / med / max</span>
              </dd>
            </div>
            <div className="graph-insights-panel__stat">
              <dt>Avg clustering</dt>
              <dd>{graphInsights.averageClustering.toFixed(3)}</dd>
            </div>
            <div className="graph-insights-panel__stat">
              <dt>Isolates</dt>
              <dd>{graphInsights.isolateCount}</dd>
            </div>
          </dl>
          {graphInsights.nodeCount > 0 && insightNotableCentralities ? (
            <>
              <div
                className={`graph-insights-panel__top${
                  insightsNotableCentralitiesExpanded
                    ? ' graph-insights-panel__top--expanded'
                    : ' graph-insights-panel__top--collapsed'
                }`}
              >
                <button
                  type="button"
                  className="graph-insights-panel__top-toggle"
                  data-testid="graph-insights-notable-centralities-toggle"
                  onClick={() => setInsightsNotableCentralitiesExpanded((v) => !v)}
                  aria-expanded={insightsNotableCentralitiesExpanded}
                  aria-controls="insights-notable-centralities-body"
                  id="insights-notable-centralities-heading"
                >
                  <span className="graph-insights-panel__top-chevron" aria-hidden>
                    {insightsNotableCentralitiesExpanded ? '▼' : '▶'}
                  </span>
                  <span className="graph-insights-panel__top-title">
                    Notable by centrality
                  </span>
                  <span className="graph-insights-panel__top-meta">(top 3 each)</span>
                </button>
                {insightsNotableCentralitiesExpanded ? (
                  <div
                    id="insights-notable-centralities-body"
                    className="graph-insights-panel__cmetrics"
                    aria-labelledby="insights-notable-centralities-heading"
                  >
                    {INSIGHT_CENTRALITY_METRICS_HELP.map((meta) => {
                      const rows = insightNotableCentralities[meta.key] || [];
                      return (
                        <section
                          key={meta.key}
                          className="graph-insights-panel__cmetric"
                          aria-label={`${meta.name} (top ${rows.length})`}
                        >
                          <div className="graph-insights-panel__cmetric-head">
                            <button
                              type="button"
                              className="graph-insights-panel__cmetric-title"
                              id={`insights-cmetric-heading-${meta.key}`}
                              data-testid={`graph-insights-centrality-help-${meta.key}`}
                              aria-haspopup="dialog"
                              aria-label={`Open help: what ${meta.name} means in this list`}
                              title={`Open help — what ${meta.name} means`}
                              onClick={(e) => {
                                setInsightsMetricHelpKey(meta.key);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === ' ' || e.key === 'Spacebar') {
                                  e.preventDefault();
                                  setInsightsMetricHelpKey(meta.key);
                                }
                              }}
                            >
                              <span className="graph-insights-panel__cmetric-title-wrap">
                                <span className="graph-insights-panel__cmetric-title-text">
                                  {meta.name}
                                </span>
                                <span
                                  className="graph-insights-panel__cmetric-title-hint"
                                  aria-hidden="true"
                                >
                                  ?
                                </span>
                              </span>
                            </button>
                          </div>
                          <ul
                            className="graph-insights-panel__cmetric-list"
                            aria-labelledby={`insights-cmetric-heading-${meta.key}`}
                          >
                            {rows.map((row) => (
                              <li
                                key={`${meta.key}-${row.id}`}
                                className="graph-insights-panel__top-row-item"
                              >
                                <button
                                  type="button"
                                  className="graph-insights-panel__top-row"
                                  onClick={() => focusInsightNodeById(row.id)}
                                  aria-label={`Focus ${row.label} on graph`}
                                >
                                  <span
                                    className="graph-insights-panel__top-label"
                                    title={row.label}
                                  >
                                    {row.label}
                                  </span>
                                  <span className="graph-insights-panel__top-deg">
                                    {formatInsightCentralityScore(meta.key, row.score)}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </section>
                      );
                    })}
                  </div>
                ) : null}
              </div>
              {insightsMetricHelpKey ? (
                <div
                  className="modal-overlay graph-insights-panel__metric-help-overlay"
                  role="presentation"
                  onClick={(e) => {
                    if (e.target === e.currentTarget) {
                      setInsightsMetricHelpKey(null);
                    }
                  }}
                >
                  <div
                    className="modal-content graph-insights-panel__metric-help-dialog"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={`insights-metric-help-title-${insightsMetricHelpKey}`}
                    onClick={(ev) => ev.stopPropagation()}
                  >
                    {(() => {
                      const hm = INSIGHT_CENTRALITY_METRICS_HELP.find(
                        (m) => m.key === insightsMetricHelpKey
                      );
                      if (!hm) return null;
                      const titleId = `insights-metric-help-title-${hm.key}`;
                      return (
                        <>
                          <h2 id={titleId}>{hm.name}</h2>
                          <dl className="graph-insights-panel__metric-help-dl">
                            <div className="graph-insights-panel__metric-help-row">
                              <dt>Intuition</dt>
                              <dd>{hm.topicRoleIntuition}</dd>
                            </div>
                            <div className="graph-insights-panel__metric-help-row graph-insights-panel__metric-help-row--calc">
                              <dt>Calculation</dt>
                              <dd>
                                {/* KaTeX HTML: static writtenFormula strings from graphInsights only (no user input). */}
                                <div
                                  className="graph-insights-panel__metric-help-formula-written graph-insights-panel__metric-help-formula-written--katex"
                                  role="math"
                                  aria-label={`${hm.name} (typeset formula)`}
                                  dangerouslySetInnerHTML={{
                                    __html: renderInsightMetricKatexHtml(hm.writtenFormula),
                                  }}
                                />
                                <div className="graph-insights-panel__metric-help-prose">
                                  {hm.calculationFormula}
                                </div>
                              </dd>
                            </div>
                          </dl>
                          <div className="modal-buttons">
                            <button
                              type="button"
                              onClick={() => setInsightsMetricHelpKey(null)}
                            >
                              Close
                            </button>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {graphActionMenu && (
        <div
          id="graph-action-menu"
          ref={graphActionMenuRef}
          className="graph-action-menu"
          style={{
            position: 'fixed',
            left: graphActionMenu.x,
            top: graphActionMenu.y,
            zIndex: 10020,
          }}
          role="group"
          aria-labelledby="graph-action-menu-title"
        >
          <div className="graph-action-menu-header">
            <span className="graph-action-menu-title" id="graph-action-menu-title">
              Graph actions
            </span>
            <button
              type="button"
              className="graph-action-menu-help"
              onClick={() => setShowGraphActionsHelp(true)}
              aria-label="Open graph actions help"
              title="Help"
            >
              ?
            </button>
            <button
              ref={graphActionMenuCloseRef}
              type="button"
              className="graph-action-menu-close"
              onClick={() => setGraphActionMenu(null)}
              aria-label="Close graph actions menu"
            >
              ×
            </button>
          </div>
          {showGraphActionsHelp && (
            <div className="modal-overlay">
              <div
                className="modal-content"
                role="dialog"
                aria-modal="true"
                aria-label="Graph actions help"
              >
                <h2>Help</h2>
                <div className="graph-actions-help-body">
                  <h3>Graph actions menu</h3>
                  <p>
                    Uses your current highlight. <strong>Tap Actions</strong>{' '}
                    (top-right) to open; tap again, <strong>×</strong>, or outside
                    to close. On desktop, right-click the graph works too. Keyboard:
                    Escape.
                  </p>
                  <h3>Explode subgraph (#69)</h3>
                  <p>
                    Select one concept on the graph: the <strong>node details</strong> card
                    includes <strong>Guidance (optional)</strong> (same presets as{' '}
                    <strong>AI Generation</strong>), a slider for how many new concepts (
                    <strong>2–6</strong>, default <strong>4</strong>), and{' '}
                    <strong>Explode subgraph</strong>. The server loads Wikipedia text, returns a
                    small fully linked cluster, and bridges every new node to your anchor. Each
                    node can only be exploded once until you reload.
                  </p>
                  <h3>Add Relationship</h3>
                  <p>
                    To add a link between two ideas, select both on the graph (two
                    highlights), open Actions, then tap Add Relationship and
                    describe the connection.
                  </p>
                </div>
                <div className="modal-buttons">
                  <button
                    type="button"
                    onClick={() => setShowGraphActionsHelp(false)}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
          <section
            className="graph-action-menu-section graph-action-menu-section--collapsible"
            aria-labelledby="graph-action-menu-section-generate-label"
          >
            <h3
              className="graph-action-menu-section-heading"
              id="graph-action-menu-section-generate-label"
            >
              <button
                type="button"
                className="graph-action-menu-section-toggle"
                onClick={() =>
                  setGraphActionMenuSectionsOpen(prev => ({
                    ...prev,
                    generate: !prev.generate,
                  }))
                }
                aria-expanded={graphActionMenuSectionsOpen.generate}
                aria-controls="graph-action-menu-panel-generate"
              >
                <span className="graph-action-menu-section-chevron" aria-hidden>
                  {graphActionMenuSectionsOpen.generate ? '▼' : '▶'}
                </span>
                AI Generation
              </button>
            </h3>
            {graphActionMenuSectionsOpen.generate && (
              <div
                id="graph-action-menu-panel-generate"
                className="graph-action-menu-section-body"
                role="group"
                aria-label="AI Generation"
              >
                <button
                  type="button"
                  className="generate-button graph-action-menu__action graph-action-select-wrap"
                  aria-label="Open AI Generation form"
                  onClick={() => onMenuPickGenerateWithAlgorithm(expansionAlgorithm)}
                >
                  <span className="graph-action-menu__action-icon" aria-hidden>
                    ✨
                  </span>
                  <select
                    id="graph-expansion-algorithm"
                    className="graph-action-select"
                    aria-label="AI Generation algorithm"
                    value={expansionAlgorithm}
                    onChange={e => {
                      const next = e.target.value;
                      if (!next) return;
                      setExpansionAlgorithm(next);
                    }}
                    onClick={e => {
                      // Allow changing algorithm without opening the form.
                      e.stopPropagation();
                    }}
                  >
                    <option value="manual">manual</option>
                    <option value="randomizedGrowth">community evolution</option>
                    <option value="branchExtrapolation">extrapolate branch</option>
                  </select>
                  <span className="graph-action-select-caret" aria-hidden>
                    ▼
                  </span>
                </button>
              </div>
            )}
          </section>
          <div className="graph-action-menu-divider" aria-hidden="true" />
          <section
            className="graph-action-menu-section graph-action-menu-section--collapsible"
            aria-labelledby="graph-action-menu-section-edit-label"
          >
            <h3
              className="graph-action-menu-section-heading"
              id="graph-action-menu-section-edit-label"
            >
              <button
                type="button"
                className="graph-action-menu-section-toggle"
                onClick={() =>
                  setGraphActionMenuSectionsOpen(prev => ({
                    ...prev,
                    edit: !prev.edit,
                  }))
                }
                aria-expanded={graphActionMenuSectionsOpen.edit}
                aria-controls="graph-action-menu-panel-edit"
              >
                <span className="graph-action-menu-section-chevron" aria-hidden>
                  {graphActionMenuSectionsOpen.edit ? '▼' : '▶'}
                </span>
                Edit graph
              </button>
            </h3>
            {graphActionMenuSectionsOpen.edit && (
              <div
                id="graph-action-menu-panel-edit"
                className="graph-action-menu-section-body"
                role="group"
                aria-label="Edit graph structure"
              >
                <button
                  type="button"
                  className="add-node-button graph-action-menu__action"
                  onClick={onMenuPickAddNode}
                >
                  <span className="graph-action-menu__action-icon" aria-hidden>
                    ➕
                  </span>
                  <span className="graph-action-menu__action-label">Add Node</span>
                </button>
                <button
                  type="button"
                  className="add-relationship-button graph-action-menu__action"
                  onClick={onMenuPickAddRelationship}
                >
                  <span className="graph-action-menu__action-icon" aria-hidden>
                    🔗
                  </span>
                  <span className="graph-action-menu__action-label">
                    Add Relationship
                  </span>
                </button>
                <button
                  type="button"
                  className="delete-button graph-action-menu__action"
                  onClick={onMenuPickDelete}
                >
                  <span className="graph-action-menu__action-icon" aria-hidden>
                    🗑
                  </span>
                  <span className="graph-action-menu__action-label">Delete</span>
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      {relationshipForm.show && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Define Relationship</h2>
            <form onSubmit={handleAddRelationship}>
              <div className="form-group">
                <label>Relationship:</label>
                <input
                  type="text"
                  value={relationshipForm.relationship}
                  onChange={(e) => setRelationshipForm({
                    ...relationshipForm,
                    relationship: e.target.value
                  })}
                  placeholder="e.g., 'is part of', 'relates to'"
                  required
                  autoFocus
                />
              </div>
              <div className="relationship-preview">
                {selectedNodes[0]?.label} → {selectedNodes[1]?.label}
              </div>
              <div className="modal-buttons">
                <button type="submit">Add Relationship</button>
                <button type="button" onClick={exitGraphEditModes}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddForm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Add New Concept</h2>
            {pendingConnectIdsForAddForm.length > 0 && (
              <p className="add-node-connect-hint">
                After you save, you will define how this concept relates to each
                highlighted concept:{' '}
                <strong>
                  {pendingConnectIdsForAddForm
                    .map(
                      id =>
                        data.nodes.find(n => String(n.id) === String(id))
                          ?.label || id
                    )
                    .join(', ')}
                </strong>
              </p>
            )}
            <form onSubmit={handleAddNodeSubmit}>
              <div className="form-group">
                <label>Label:</label>
                <input
                  type="text"
                  value={newNodeData.label}
                  onChange={(e) => setNewNodeData({...newNodeData, label: e.target.value})}
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Description:</label>
                <textarea
                  value={newNodeData.description}
                  onChange={(e) => setNewNodeData({...newNodeData, description: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label>URL:</label>
                <input
                  type="url"
                  value={newNodeData.wikiUrl}
                  onChange={(e) => setNewNodeData({...newNodeData, wikiUrl: e.target.value})}
                  placeholder="https://"
                />
              </div>
              <div className="modal-buttons">
                <button type="submit">Add Concept</button>
                <button type="button" onClick={exitGraphEditModes}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {connectNewNodeLinksForm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Connect to existing concepts</h2>
            <p className="connect-new-node-lead">
              New concept:{' '}
              <strong>{connectNewNodeLinksForm.newNode.label}</strong>
            </p>
            <p className="connect-new-node-lead">
              Enter the relationship from this new concept to each node below.
            </p>
            <form onSubmit={handleConnectNewNodeLinksSubmit}>
              {connectNewNodeLinksForm.targets.map((t, i) => (
                <div className="form-group" key={String(t.id)}>
                  <label>
                    Relationship to &quot;{t.label || 'Unnamed'}&quot;:
                  </label>
                  <input
                    type="text"
                    value={connectNewNodeLinksForm.relationshipInputs[i]}
                    onChange={e =>
                      updateConnectNewNodeRelationshipInput(i, e.target.value)
                    }
                    placeholder="e.g. supports, contrasts with, part of"
                    required
                    autoFocus={i === 0}
                  />
                </div>
              ))}
              <div className="modal-buttons">
                <button type="submit">Add connections</button>
                <button
                  type="button"
                  onClick={() => setConnectNewNodeLinksForm(null)}
                >
                  Skip connections
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {extendModal.open && (() => {
        const anchor = data.nodes.find(
          (n) => String(n.id) === String(extendModal.nodeId)
        );
        const anchorLabel = anchor?.label || String(extendModal.nodeId || '');
        const submit = (e) => {
          if (e && typeof e.preventDefault === 'function') e.preventDefault();
          const nodeId = extendModal.nodeId;
          setExtendModal({ open: false, nodeId: null });
          hideCanvasTooltip();
          if (nodeId != null && nodeId !== '') {
            void handleExtendNodeRef.current?.(nodeId);
          }
        };
        const cancel = () => setExtendModal({ open: false, nodeId: null });
        const busy = extendInProgress;
        return (
          <div className="modal-overlay" onMouseDown={cancel}>
            <div
              className="modal-content graph-tooltip-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="graph-extend-modal-title"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <h2 id="graph-extend-modal-title">
                Extend from: <span className="graph-tooltip-modal__anchor">{anchorLabel}</span>
              </h2>
              <p className="graph-tooltip-modal__desc">
                Add one new concept linked to this anchor. Optionally pin the link label
                (<em>Relationship</em>) or hint at the subject (<em>Concept</em>).
              </p>
              <form onSubmit={submit} className="graph-tooltip-modal__form">
                <fieldset
                  className="form-group graph-tooltip-modal__kind"
                  aria-label="Extend constraint type"
                >
                  <legend>Constraint</legend>
                  <label className="graph-tooltip-modal__kind-opt">
                    <input
                      type="radio"
                      name="graph-extend-modal-kind"
                      value="relationship"
                      checked={extendTooltipKind === 'relationship'}
                      onChange={() => setExtendTooltipKind('relationship')}
                      data-testid="graph-extend-modal-kind-relationship"
                    />
                    <span>Relationship</span>
                  </label>
                  <label className="graph-tooltip-modal__kind-opt">
                    <input
                      type="radio"
                      name="graph-extend-modal-kind"
                      value="concept"
                      checked={extendTooltipKind === 'concept'}
                      onChange={() => setExtendTooltipKind('concept')}
                      data-testid="graph-extend-modal-kind-concept"
                    />
                    <span>Concept</span>
                  </label>
                </fieldset>
                <div className="form-group">
                  <label htmlFor="graph-extend-modal-text">
                    {extendTooltipKind === 'concept'
                      ? 'Concept hint (optional)'
                      : 'Relationship label (optional)'}
                  </label>
                  <input
                    id="graph-extend-modal-text"
                    type="text"
                    maxLength={200}
                    value={extendTooltipText}
                    onChange={(e) =>
                      setExtendTooltipText(String(e.target.value).slice(0, 200))
                    }
                    placeholder={
                      extendTooltipKind === 'concept'
                        ? 'e.g. "chaos theory in biology"'
                        : 'e.g. "is an example of", "contradicts"'
                    }
                    data-testid="graph-extend-modal-text"
                  />
                </div>
                <GenerationGuidanceFields
                  idPrefix="graph-extend-modal"
                  label="Guidance"
                  showOptionalHint
                  preset={guidancePreset}
                  onPresetChange={setGuidancePreset}
                  customText={guidanceCustomText}
                  onCustomTextChange={setGuidanceCustomText}
                  helpText="Shapes tone & focus for this generation."
                />
                <div className="modal-buttons">
                  <button
                    type="submit"
                    className="graph-tooltip-extend-btn graph-tooltip-modal__primary"
                    disabled={busy}
                    data-testid="graph-extend-modal-submit"
                  >
                    {busy ? 'Extending…' : '🌳 Extend 🌳'}
                  </button>
                  <button type="button" onClick={cancel} disabled={busy}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {explodeModal.open && (() => {
        const anchor = data.nodes.find(
          (n) => String(n.id) === String(explodeModal.nodeId)
        );
        const anchorLabel = anchor?.label || String(explodeModal.nodeId || '');
        const alreadyExpanded = anchor?.explosionExpandedAt != null;
        const submit = (e) => {
          if (e && typeof e.preventDefault === 'function') e.preventDefault();
          const nodeId = explodeModal.nodeId;
          setExplodeModal({ open: false, nodeId: null });
          hideCanvasTooltip();
          if (nodeId != null && nodeId !== '') {
            void handleExplodeNodeRef.current?.(nodeId);
          }
        };
        const cancel = () => setExplodeModal({ open: false, nodeId: null });
        const busy = explodeInProgress;
        return (
          <div className="modal-overlay" onMouseDown={cancel}>
            <div
              className="modal-content graph-tooltip-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="graph-explode-modal-title"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <h2 id="graph-explode-modal-title">
                Explode from: <span className="graph-tooltip-modal__anchor">{anchorLabel}</span>
              </h2>
              {alreadyExpanded ? (
                <p className="graph-tooltip-modal__desc">
                  Subgraph already expanded for this concept. Close and pick a different node.
                </p>
              ) : (
                <p className="graph-tooltip-modal__desc">
                  Wikipedia-grounded burst of 2–6 related concepts, all bridged back to this anchor.
                </p>
              )}
              <form onSubmit={submit} className="graph-tooltip-modal__form">
                <GenerationGuidanceFields
                  idPrefix="graph-explode-modal"
                  label="Guidance"
                  showOptionalHint
                  preset={guidancePreset}
                  onPresetChange={setGuidancePreset}
                  customText={guidanceCustomText}
                  onCustomTextChange={setGuidanceCustomText}
                  helpText="Shapes tone & focus for this explosion."
                />
                <div className="form-group">
                  <label htmlFor="graph-explode-modal-count">
                    Concepts to add: <strong>{explodeTooltipNumNodes}</strong>
                  </label>
                  <input
                    id="graph-explode-modal-count"
                    type="range"
                    min="2"
                    max="6"
                    step="1"
                    value={explodeTooltipNumNodes}
                    onChange={(e) => {
                      const n = Math.min(
                        6,
                        Math.max(2, Math.round(Number(e.target.value)) || 4)
                      );
                      setExplodeTooltipNumNodes(n);
                    }}
                    aria-valuemin={2}
                    aria-valuemax={6}
                    aria-valuenow={explodeTooltipNumNodes}
                    data-testid="graph-explode-modal-count"
                  />
                </div>
                <div className="modal-buttons">
                  <button
                    type="submit"
                    className="graph-tooltip-explode-btn graph-tooltip-modal__primary"
                    disabled={busy || alreadyExpanded}
                    data-testid="graph-explode-modal-submit"
                  >
                    {busy ? 'Exploding…' : '💥 Explode 💥'}
                  </button>
                  <button type="button" onClick={cancel} disabled={busy}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {deleteDecision && (
        <div className="modal-overlay" onMouseDown={closeDeleteDecision}>
          <div
            className="modal-content"
            role="dialog"
            aria-label="Delete graph element"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2>Delete</h2>
            {deleteDecision.kind === 'none' ? (
              <div className="form-group" role="status">
                Select one node to delete it, or click a relationship line (or select both endpoints) to delete that relationship.
              </div>
            ) : deleteDecision.kind === 'node' ? (
              <div className="form-group" role="status">
                Delete node <strong>{deleteDecision.node?.label || '—'}</strong>
                {typeof deleteDecision.connectedCount === 'number' && deleteDecision.connectedCount > 0
                  ? ` and ${deleteDecision.connectedCount} connected relationship${deleteDecision.connectedCount === 1 ? '' : 's'}.`
                  : '.'}
              </div>
            ) : (
              <div className="form-group" role="status">
                Delete relationship <strong>{deleteDecision.link?.relationship || '—'}</strong> between{' '}
                <strong>{deleteDecision.link?.source?.label || '—'}</strong> and{' '}
                <strong>{deleteDecision.link?.target?.label || '—'}</strong>.
              </div>
            )}

            {deleteDecision.kind !== 'none' ? (
              <div className="modal-buttons">
                <button
                  type="button"
                  className="delete-button"
                  onClick={() => applyDeleteDecision('purge')}
                >
                  Purge (no memory)
                </button>
                <button
                  type="button"
                  className="delete-button"
                  onClick={() => applyDeleteDecision('pop')}
                >
                  Pop (playback)
                </button>
                <button type="button" onClick={closeDeleteDecision}>
                  Cancel
                </button>
              </div>
            ) : (
              <div className="modal-buttons">
                <button type="button" onClick={closeDeleteDecision}>
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showGenerateForm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 id="graph-generate-modal-title">
              {expansionAlgorithmMeta.title}
            </h2>
            {generateFormErrorDisplay && (
              <p
                className="graph-generate-form-error"
                role="alert"
                id="graph-generate-form-error"
              >
                {generateFormErrorDisplay}
              </p>
            )}
            <p className="graph-generate-algorithm-description">
              {expansionAlgorithmMeta.description}
            </p>
            <form
              onSubmit={handleGenerate}
              aria-labelledby="graph-generate-modal-title"
              aria-describedby={
                generateFormErrorDisplay ? 'graph-generate-form-error' : undefined
              }
            >
              <label>
                {expansionAlgorithm === 'manual'
                  ? 'Number of nodes to generate'
                  : expansionAlgorithm === 'branchExtrapolation'
                    ? 'Nodes per iteration'
                    : 'AI nodes per cycle'}
                :
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={numNodesToAdd}
                  onChange={e => {
                    setNumNodesToAdd(parseInt(e.target.value, 10) || 1);
                    setGenerateSubmitError(null);
                  }}
                />
              </label>
              {expansionAlgorithm === 'randomizedGrowth' && (
                <>
                  <label>
                    Connections per new node:
                    <input
                      type="number"
                      min="1"
                      max="12"
                      value={rgConnectionsPerNewNode}
                      onChange={e => {
                        setRgConnectionsPerNewNode(parseInt(e.target.value, 10) || 1);
                        setGenerateSubmitError(null);
                      }}
                    />
                  </label>
                  <label>
                    Number of cycles:
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={rgNumCycles}
                      onChange={e => {
                        setRgNumCycles(parseInt(e.target.value, 10) || 1);
                        setGenerateSubmitError(null);
                      }}
                    />
                  </label>
                  <label className="graph-generate-strategy">
                    <span className="graph-generate-strategy__label">
                      Attachment strategy (degree bias)
                    </span>
                    <span className="graph-generate-strategy__ticks">
                      <span>Low-degree</span>
                      <span>Uniform</span>
                      <span>Hub / high-degree</span>
                    </span>
                    <input
                      type="range"
                      min="-1"
                      max="1"
                      step="0.05"
                      value={rgAnchorStrategy}
                      onChange={e => {
                        setRgAnchorStrategy(parseFloat(e.target.value) || 0);
                        setGenerateSubmitError(null);
                      }}
                      disabled={isGenerating}
                      aria-valuemin={-1}
                      aria-valuemax={1}
                      aria-valuenow={rgAnchorStrategy}
                      aria-label="Random attachment degree bias"
                    />
                    <span className="graph-generate-strategy__value">
                      {rgAnchorStrategy === 0
                        ? '0 (uniform)'
                        : rgAnchorStrategy.toFixed(2)}
                    </span>
                  </label>
                  <label className="graph-generate-prune-check">
                    <input
                      type="checkbox"
                      checked={rgPruneDuringGrowth}
                      onChange={e => {
                        setRgPruneDuringGrowth(e.target.checked);
                        setGenerateSubmitError(null);
                      }}
                      disabled={isGenerating}
                    />
                    Prune during growth (remove non-anchor nodes between cycles)
                  </label>
                  {rgPruneDuringGrowth && (
                    <label>
                      Deletions per cycle:
                      <input
                        type="number"
                        min="1"
                        max="8"
                        value={rgDeletionsPerCycle}
                        onChange={e => {
                          setRgDeletionsPerCycle(
                            Math.min(
                              8,
                              Math.max(1, parseInt(e.target.value, 10) || 1)
                            )
                          );
                          setGenerateSubmitError(null);
                        }}
                        disabled={isGenerating}
                      />
                    </label>
                  )}
                </>
              )}
              {expansionAlgorithm === 'branchExtrapolation' && (
                <>
                  <label>
                    Iterations (growth cycles):
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={brIterations}
                      onChange={e => {
                        setBrIterations(
                          Math.min(
                            20,
                            Math.max(1, parseInt(e.target.value, 10) || 1)
                          )
                        );
                        setGenerateSubmitError(null);
                      }}
                    />
                  </label>
                  <label>
                    Memory window (prompt context, nodes along path):
                    <input
                      type="number"
                      min="1"
                      max="40"
                      value={brMemoryK}
                      onChange={e => {
                        setBrMemoryK(
                          Math.min(
                            40,
                            Math.max(1, parseInt(e.target.value, 10) || 1)
                          )
                        );
                        setGenerateSubmitError(null);
                      }}
                    />
                  </label>
                  <label>
                    Cross-links per iteration (back-edges into memory):
                    <input
                      type="number"
                      min="0"
                      max="6"
                      value={brCrossLinksPerIteration}
                      onChange={e => {
                        setBrCrossLinksPerIteration(
                          Math.min(
                            6,
                            Math.max(0, parseInt(e.target.value, 10) || 0)
                          )
                        );
                        setGenerateSubmitError(null);
                      }}
                    />
                  </label>
                </>
              )}
              {generateProgress && expansionAlgorithm === 'randomizedGrowth' && (
                <p className="graph-generate-progress" role="status">
                  Cycle {generateProgress.current} of {generateProgress.total}…
                </p>
              )}
              {isGenerating && expansionAlgorithm === 'randomizedGrowth' && (
                <div className="form-buttons">
                  <button
                    type="button"
                    onClick={() => {
                      randomizedGrowthCancelRef.current = true;
                    }}
                  >
                    Stop after this cycle
                  </button>
                </div>
              )}
              <GenerationGuidanceFields
                idPrefix="graph-generate"
                preset={guidancePreset}
                onPresetChange={value => {
                  setGuidancePreset(value);
                  setGenerateSubmitError(null);
                }}
                customText={guidanceCustomText}
                onCustomTextChange={value => {
                  setGuidanceCustomText(value);
                  setGenerateSubmitError(null);
                }}
                disabled={isGenerating}
                helpText="Biases concept fit and how relationships read. Presets use fixed copy; Custom is your text (max 2000 characters). Does not change required links or node IDs."
              />
              <div className="form-buttons">
                <button
                  type="submit"
                  disabled={isGenerating || Boolean(generateFormErrorDisplay)}
                >
                  {isGenerating ? 'Applying…' : 'Apply'}
                </button>
                <button type="button" onClick={exitGraphEditModes}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeGraphEditBanner && (
        <div
          className={`graph-edit-mode-chip${
            activeGraphEditBanner.progressBar ? ' graph-edit-mode-chip--generating' : ''
          }`}
          role="status"
          aria-busy={Boolean(activeGraphEditBanner.progressBar)}
          aria-live="polite"
          aria-label={`${activeGraphEditBanner.title}. ${activeGraphEditBanner.hint}`}
        >
          <div className="graph-edit-mode-chip__text">
            <strong className="graph-edit-mode-chip__title">
              {activeGraphEditBanner.title}
            </strong>
            <p className="graph-edit-mode-chip__hint">
              {activeGraphEditBanner.hint}
            </p>
            {activeGraphEditBanner.progressBar && (
              <div className="graph-edit-mode-chip__progress">
                {activeGraphEditBanner.progressBar.mode === 'determinate' ? (
                  <div
                    className="graph-edit-mode-chip__progress-track"
                    role="progressbar"
                    aria-valuemin={1}
                    aria-valuemax={activeGraphEditBanner.progressBar.total}
                    aria-valuenow={activeGraphEditBanner.progressBar.current}
                    aria-valuetext={`Cycle ${activeGraphEditBanner.progressBar.current} of ${activeGraphEditBanner.progressBar.total}`}
                  >
                    <div
                      className="graph-edit-mode-chip__progress-fill"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.max(
                            0,
                            (100 * activeGraphEditBanner.progressBar.current) /
                              activeGraphEditBanner.progressBar.total
                          )
                        )}%`,
                      }}
                    />
                  </div>
                ) : (
                  <div
                    className="graph-edit-mode-chip__progress-track graph-edit-mode-chip__progress-track--indeterminate"
                    role="progressbar"
                    aria-valuetext="Working"
                  >
                    <div className="graph-edit-mode-chip__progress-indeterminate" />
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="graph-edit-mode-chip__actions">
            {Array.isArray(activeGraphEditBanner.actions) ? (
              activeGraphEditBanner.actions.length > 0 ? (
                activeGraphEditBanner.actions.map(action => (
                  <button
                    key={action.key}
                    type="button"
                    className="graph-edit-mode-chip__cancel"
                    onClick={action.onClick}
                  >
                    {action.label}
                  </button>
                ))
              ) : null
            ) : (
              <button
                type="button"
                className="graph-edit-mode-chip__cancel"
                onClick={exitGraphEditModes}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      <div className="graph-canvas-wrap" ref={graphCanvasWrapRef}>
        <svg ref={svgRef} className="graph-visualization" data-testid="graph-main-svg" />
        {showEditableEmptyGuide && (
          <div
            className="graph-empty-state graph-empty-state--editable"
            role="region"
            aria-label="Getting started with an empty graph"
          >
            <div className="graph-empty-state__inner">
              <h2 className="graph-empty-state__title">No concepts yet</h2>
              {emptyStateVariant === 'library' ? (
                <ol className="graph-empty-state__steps">
                  <li>
                    Select files in the library sidebar, then choose{' '}
                    <strong>Analyze</strong> to build a graph from your sources.
                  </li>
                  <li>
                    Or open a <strong>saved graph</strong> from the sidebar.
                  </li>
                  <li>
                    Or tap <strong>Actions</strong> (top-right) to add a concept by hand.
                  </li>
                </ol>
              ) : (
                <p className="graph-empty-state__lead">
                  Open the <strong>Actions</strong> menu (top-right) to add a concept or run AI
                  generation.
                </p>
              )}
            </div>
          </div>
        )}
        {showReadOnlyEmpty && (
          <div className="graph-empty-state graph-empty-state--readonly" role="status" aria-live="polite">
            <div className="graph-empty-state__inner">
              <p>This graph has no concepts to display.</p>
            </div>
          </div>
        )}
        <svg
          ref={minimapSvgRef}
          className="graph-minimap"
          width={140}
          height={100}
          viewBox="0 0 140 100"
          role="img"
          aria-label="Graph overview. Click to center the view on a region. Drag to pan."
          data-testid="graph-minimap"
        />
        {actionsFabButton || null}
      </div>
    </div>
  );
}

GraphVisualization.propTypes = {
  data: PropTypes.shape({
    nodes: PropTypes.arrayOf(
      PropTypes.shape({
        id: PropTypes.string.isRequired,
        label: PropTypes.string.isRequired,
        description: PropTypes.string,
        wikiUrl: PropTypes.string,
        thumbnailUrl: PropTypes.string,
        createdAt: PropTypes.number,
        timestamp: PropTypes.number,
        x: PropTypes.number,
        y: PropTypes.number,
        vx: PropTypes.number,
        vy: PropTypes.number,
        index: PropTypes.number
      })
    ).isRequired,
    links: PropTypes.arrayOf(
      PropTypes.shape({
        source: PropTypes.oneOfType([
          PropTypes.string,
          PropTypes.object
        ]).isRequired,
        target: PropTypes.oneOfType([
          PropTypes.string,
          PropTypes.object
        ]).isRequired,
        relationship: PropTypes.string,
        createdAt: PropTypes.number,
        timestamp: PropTypes.number
      })
    ).isRequired
  }),
  onDataUpdate: PropTypes.func,
  width: PropTypes.number,
  height: PropTypes.number,
  actionsFabPlacement: PropTypes.oneOf(['fixedViewport', 'libraryGraphMount']),
  readOnly: PropTypes.bool,
  emptyStateVariant: PropTypes.oneOf(['default', 'library']),
  playbackScrubToken: PropTypes.number,
};

GraphVisualization.defaultProps = {
  readOnly: false,
  emptyStateVariant: 'default',
  playbackScrubToken: 0,
};

export default GraphVisualization; 
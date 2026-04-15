import { useEffect, useRef, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import * as d3 from 'd3';
import { apiRequest, getApiErrorMessage } from '../api/http';
import { useSession } from '../context/SessionContext';
import { useGraphChromeUi } from '../context/GraphChromeUiContext';
import { mergeGenerateNodeResponse } from '../utils/mergeGenerateResult';
import { resolveGenerationContext } from '../utils/generationGuidance';
import {
  nodesMatchingLabelQuery,
  createFocusZoomTransform,
} from '../utils/graphDiscovery';
import { isSafeThumbnailUrlForTooltip } from '../utils/safeThumbnailUrl';
import { pickCommunityAnchorNode } from '../utils/clusterAnchor';
import {
  buildCommunityIdSet,
  newCommunityIdsForPlaybackTransition,
  newLinkKeysForPlaybackTransition,
  linkKeyForProcessedCommunityLink,
} from '../utils/playbackGraphTransition';
import GenerationGuidanceFields from './GenerationGuidanceFields';
import './GraphVisualization.css';

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
  const [showGenerateForm, setShowGenerateForm] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [numNodesToAdd, setNumNodesToAdd] = useState(2);
  /** GitHub #62: manual (single call, link to all highlights) vs community evolution */
  const [expansionAlgorithm, setExpansionAlgorithm] = useState('manual');
  const [rgConnectionsPerNewNode, setRgConnectionsPerNewNode] = useState(2);
  const [rgNumCycles, setRgNumCycles] = useState(2);
  /** GitHub #68: attachment bias for community evolution (-1 low-degree … +1 hub). */
  const [rgAnchorStrategy, setRgAnchorStrategy] = useState(0);
  const [rgPruneDuringGrowth, setRgPruneDuringGrowth] = useState(false);
  const [rgDeletionsPerCycle, setRgDeletionsPerCycle] = useState(1);
  /** GitHub #82 — branch extrapolation (POST /api/generate-branch). */
  const [brIterations, setBrIterations] = useState(2);
  const [brMemoryK, setBrMemoryK] = useState(3);
  /** Guidance preset + optional custom text (sent as generationContext; max 2000 chars server-side). */
  const [guidancePreset, setGuidancePreset] = useState('none');
  const [guidanceCustomText, setGuidanceCustomText] = useState('');
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
            'One-shot generation. The model returns nodes and links, and each new node must connect to every highlighted node.'
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
  const discoveryQueryRef = useRef('');
  const zoomBehaviorRef = useRef(null);
  const updateHighlightingRef = useRef(null);
  const updateMinimapRef = useRef(null);
  const graphTransformRef = useRef(null);
  const minimapRafRef = useRef(null);
  const minimapSvgRef = useRef(null);
  /** Skip merge/split while applying programmatic fit (zoom-out would otherwise re-cluster). */
  const skipZoomClusteringRef = useRef(false);
  const resetCanvasViewRef = useRef(null);

  const { sessionId } = useSession();
  const { graphSearchBarVisible } = useGraphChromeUi();
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
    const nx = node.x != null ? node.x : width / 2;
    const ny = node.y != null ? node.y : height / 2;
    const t = createFocusZoomTransform(nx, ny, width, height, 1.2);
    const svg = d3.select(svgRef.current);
    const zoom = zoomBehaviorRef.current;
    if (svg.node() && zoom) {
      svg.transition().duration(400).call(zoom.transform, t);
    }
    setDiscoveryFocusIndex((idx + 1) % matches.length);
  }, [discoveryQuery, discoveryFocusIndex, data, width, height]);

  // Add new refs without modifying existing state
  const previousZoomRef = useRef(1);
  const MERGE_THRESHOLD = 0.8; // When to merge: current zoom is 80% of previous
  const communitiesRef = useRef(null);

  // Add new refs for tracking thresholds
  const mergeThresholdRef = useRef(0.8);  // Initial merge threshold
  const splitThresholdRef = useRef(1.2);  // Initial split threshold (1/0.8)

  /** GitHub #86: community-layer diff across playback scrubs (refs survive D3 effect re-runs). */
  const playbackPrevCommunityIdsRef = useRef(null);
  const playbackPrevLinkKeysRef = useRef(null);
  const lastPlaybackFadeTokenRef = useRef(0);
  const playbackEaseHighlightTimerRef = useRef(null);

  const defaultNodeColor = '#4a90e2';  // default node color is blue
  const highlightedColor = '#e74c3c' ; // highlighted node color is red
  const searchHighlightFill = '#f39c12';
  const searchHighlightStroke = '#d68910';

  useEffect(() => {
    if (!data || !data.nodes || !data.links) return;

    const svg = d3.select(svgRef.current);
    const reduceMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const FADE_MS = reduceMotion ? 0 : 220;
    /** Observable-style enter easing duration for new communities/links during scrub (#86). */
    const EASE_SCRUB_MS = reduceMotion ? 0 : 280;
    const skipPlaybackRootCrossfade = playbackScrubToken > 0;

    if (playbackScrubToken === 0) {
      lastPlaybackFadeTokenRef.current = 0;
      playbackPrevCommunityIdsRef.current = null;
      playbackPrevLinkKeysRef.current = null;
    }

    // Fade out the previous render root instead of hard-clearing the SVG.
    const prevRoot = svg.select('g.graph-root');
    if (!prevRoot.empty()) {
      if (FADE_MS > 0 && !skipPlaybackRootCrossfade) {
        prevRoot.transition().duration(FADE_MS).style('opacity', 0).remove();
      } else {
        prevRoot.remove();
      }
    }

    // Initialize hierarchical communities with individual nodes
    const initializeCommunities = () => {
      const communities = new Map();
      
      data.nodes.forEach(node => {
        communities.set(node.id, {
          id: node.id,
          nodes: [{ ...node }],
          parent: null,
          children: [],
          level: 0,
          x: node.x || width/2,
          y: node.y || height/2,
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
              d3.mean(community1.nodes, n => n.x || 0) - 
              d3.mean(community2.nodes, n => n.x || 0), 2
            ) +
            Math.pow(
              d3.mean(community1.nodes, n => n.y || 0) - 
              d3.mean(community2.nodes, n => n.y || 0), 2
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
            x: d3.mean(mergedNodes, n => n.x || 0),
            y: d3.mean(mergedNodes, n => n.y || 0),
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
          x: node.x || largestCommunity.x || width/2,
          y: node.y || largestCommunity.y || height/2,
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

    // This effect can re-run (e.g. Escape clears selection). Ensure we don't append a
    // second graph layer on top of the previous one.
    svg.selectAll('g.graph-root').remove();

    // Modify the zoom behavior
    const g = svg
      .append('g')
      .attr('class', 'graph-root')
      .style('opacity', FADE_MS > 0 && !skipPlaybackRootCrossfade ? 0 : 1);
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
            const centerX = d3.mean(community.nodes, d => d.x);
            const centerY = d3.mean(community.nodes, d => d.y);
            const strength = Math.min(0.95, Math.max(0, 1 - currentZoom));
            
            community.nodes.forEach(node => {
              node.x = node.x * (1 - strength) + centerX * strength;
              node.y = node.y * (1 - strength) + centerY * strength;
            });
          }
        });

        // Update node sizes and appearance
        updateHighlighting();

        // Update link visibility
        g.selectAll('.link')
          .transition()
          .duration(300)
          .style('opacity', Math.max(0.2, Math.min(0.6, currentZoom)))
          .attr('stroke-width', Math.max(1, 3 * (1 / currentZoom)));

          
        // Update labels
        g.selectAll('.node text')
          .transition()
          .duration(300)
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
      const nx = node.x != null ? node.x : width / 2;
      const ny = node.y != null ? node.y : height / 2;
      const t = createFocusZoomTransform(nx, ny, width, height, k);
      d3.select(svgRef.current).transition().duration(450).call(zoom.transform, t);
    }

    svg.call(zoom);
    zoomBehaviorRef.current = zoom;

    if (FADE_MS > 0 && !skipPlaybackRootCrossfade) {
      g.transition().duration(FADE_MS).style('opacity', 1);
    }

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

    // Create the force simulation with processed data
    const simulation = d3.forceSimulation(data.nodes)
      .force('link', d3.forceLink(processedLinks)
        .id(d => d.id)
        .distance(100))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(50));

    // Tooltip: placed just left of the clicked node/link (clamped inside canvas)
    const tooltipMount =
      graphCanvasWrapRef.current || svgRef.current?.parentElement || null;
    const tooltip = (tooltipMount ? d3.select(tooltipMount) : d3.select('body'))
      .append('div')
      .attr('class', 'tooltip graph-canvas-tooltip')
      .attr('role', 'status')
      .attr('aria-live', 'polite')
      .style('opacity', 0);

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
      .on('mouseout', handleLinkMouseout)
      .on('click', handleLinkClick);

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
    const dragBehavior = readOnly ? noOpDrag : drag;

    // Update node selection with click and drag handlers
    const node = g.selectAll('.node')
      .data(data.nodes)
      .join('g')
      .attr('class', 'node')
      .classed('selected', d => selectedNodes.some(n => n.id === d.id))
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
        tooltip.transition()
          .duration(200)
          .style('opacity', .9);

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
                    
                    return `${otherNode.label || 'Unnamed Node'} - ${link.relationship || 'related to'}`;
                  } catch (e) {
                    console.error('Error processing related node:', e);
                    return '';
                  }
                })
                .filter(Boolean)
                .join('<br/>');
              tooltipContent += relatedNodesContent;
            }
          } else {
            tooltipContent = '<strong>Node information unavailable</strong>';
          }
        } catch (e) {
          console.error('Error generating tooltip:', e);
          console.log('Node data:', d);
          tooltipContent = '<strong>Error displaying node information</strong>';
        }
        
        tooltip.html(tooltipContent);
        scheduleTooltipPosition(event.currentTarget);
      })
      .call(dragBehavior);

    // Update link selection with click handler
    g.selectAll('.link-group')
      .data(data.links)
      .join('g')
      .attr('class', 'link-group')
      .on('click', (event, d) => handleLinkClick(event, d));

    // Update visual states
    node.selectAll('circle')
      .data(d => [d])
      .join('circle')
      .attr('r', 20)
      .attr('fill', d => selectedNodes.some(n => n.id === d.id) ? highlightedColor : defaultNodeColor)
      .classed('selected', d => selectedNodes.some(n => n.id === d.id));

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
      tooltip.transition()
        .duration(200)
        .style('opacity', .9);

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

      tooltip.html(tooltipContent);
      scheduleTooltipPosition(event.currentTarget);
    }

    function handleLinkMouseout() {
      d3.select('.tooltip')
        .transition()
        .duration(500)
        .style('opacity', 0);
    }

    function handleLinkClick(event, link) {
      selectedNodeIds.current.add(link.source.id);
      selectedNodeIds.current.add(link.target.id);
      updateHighlighting();

      const sourceLabel = link.source.label || 'Unnamed Node';
      const targetLabel = link.target.label || 'Unnamed Node';
      const relationship = link.relationship || 'related to';
  
      const tooltipContent = `
        <strong>${sourceLabel}</strong>
        <br/>
        ${relationship}
        <br/>
        <strong>${targetLabel}</strong>
      `;
  
      d3.select('.tooltip')
        .transition()
        .duration(200)
        .style('opacity', 0.9);
      tooltip.html(tooltipContent);
      scheduleTooltipPosition(event.currentTarget);
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
          x: node.x || width/2,
          y: node.y || height/2,
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
          tooltip.transition()
            .duration(200)
            .style('opacity', 0);
          return;
        }

        tooltip.transition()
          .duration(200)
          .style('opacity', .9);

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
                  return otherNode 
                    ? `${otherNode.label || 'Unnamed Node'} - ${link.relationship || 'related to'}`
                    : '';
                } catch (e) {
                  return '';
                }
              })
              .filter(Boolean)
              .join('<br/>');
            tooltipContent += relatedNodes;
          }
        }

        tooltip.html(tooltipContent);
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
      if (!el || !data.nodes?.length) return;
      const T = graphTransformRef.current || d3.zoomIdentity;
      const tw = width;
      const th = height;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      data.nodes.forEach(n => {
        if (n.x == null || n.y == null) return;
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x);
        maxY = Math.max(maxY, n.y);
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
        if (n.x == null || n.y == null) return;
        root
          .append('circle')
          .attr('cx', sx(n.x))
          .attr('cy', sy(n.y))
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
    }

    updateMinimapRef.current = renderMinimap;

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

      const radiusForNode = d => {
        if (selectedNodeIds.current.has(d.id)) return 25;
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
        return d && d.nodes && d.nodes.length > 1 ? bigMergedR : 20;
      };

      const strokeForNode = d => {
        if (selectedNodeIds.current.has(d.id)) return '#f1c40f';
        if (datumMatchesSearch(d, matchIds)) return searchHighlightStroke;
        return '#fff';
      };

      const strokeWidthForNode = d => {
        if (selectedNodeIds.current.has(d.id)) return 4;
        if (datumMatchesSearch(d, matchIds)) return 3;
        return 2;
      };

      g.selectAll('.node circle.graph-node-disc')
        .style('fill', d => {
          if (selectedNodeIds.current.has(d.id)) return highlightedColor;
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
            const { sid, tid } = linkEndpointIds(l);
            const selHit =
              selectedNodeIds.current.has(sid) || selectedNodeIds.current.has(tid);
            const searchHit =
              matchIds.size > 0 && (matchIds.has(sid) || matchIds.has(tid));
            if (selHit || searchHit) return 1;
            return 0.6;
          })
          .style('stroke', l => {
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

    // Add click handler to svg to deselect
    svg.on('click', () => {
      if (selectedNodeId.current) {
        selectedNodeId.current = null;
        selectedNodeIds.current.clear();
        updateHighlighting();
        tooltip.transition().duration(200).style('opacity', 0);
      }
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
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      // Update link label positions
      linkLabels
        .attr('x', d => (d.source.x + d.target.x) / 2)
        .attr('y', d => (d.source.y + d.target.y) / 2);

      // Update node positions
      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // Update the visualization function to handle all node cases properly
    const updateVisualization = () => {
      // Get visible communities
      const visibleCommunities = communitiesRef.current;
      const visibleElements = Array.from(visibleCommunities.values());
      const prevCommIds = playbackPrevCommunityIdsRef.current;
      const prevLinkKeys = playbackPrevLinkKeysRef.current;

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
        .attr('stroke-opacity', 0.6);

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
          tooltip.transition()
            .duration(200)
            .style('opacity', .9);

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
                      
                      return `${otherNode.label || 'Unnamed Node'} - ${link.relationship || 'related to'}`;
                    } catch (e) {
                      console.error('Error processing related node:', e);
                      return '';
                    }
                  })
                  .filter(Boolean)
                  .join('<br/>');
                tooltipContent += relatedNodesContent;
              }
            } else {
              tooltipContent = '<strong>Node information unavailable</strong>';
            }
          } catch (e) {
            console.error('Error generating tooltip:', e);
            console.log('Node data:', d);
            tooltipContent = '<strong>Error displaying node information</strong>';
          }
          
          tooltip.html(tooltipContent);
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
          .attr('transform', (d) => `translate(${d.x || 0},${d.y || 0})`)
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
            .attr('x1', d => d.source.x || 0)
            .attr('y1', d => d.source.y || 0)
            .attr('x2', d => d.target.x || 0)
            .attr('y2', d => d.target.y || 0);

          nodes
            .attr('transform', d => `translate(${d.x || 0},${d.y || 0})`);

          // Keep cluster chips anchored to the live community centroid as forces run.
          if (chips) {
            chips.attr('transform', (d) => `translate(${d.x || 0},${d.y || 0})`);
          }
        });

      simulation.alpha(0.3).restart();

      playbackPrevCommunityIdsRef.current = buildCommunityIdSet(visibleElements);
      playbackPrevLinkKeysRef.current = new Set(
        processedLinks.map(linkKeyForProcessedCommunityLink)
      );

      if (
        playbackScrubToken > 0 &&
        playbackScrubToken !== lastPlaybackFadeTokenRef.current
      ) {
        lastPlaybackFadeTokenRef.current = playbackScrubToken;
        if (EASE_SCRUB_MS > 0) {
          const newComm = newCommunityIdsForPlaybackTransition(
            prevCommIds,
            visibleElements
          );
          const newLk = newLinkKeysForPlaybackTransition(
            prevLinkKeys,
            processedLinks
          );
          if (newComm.size || newLk.size) {
            nodes.each(function easeNewCommunity(d) {
              if (!newComm.has(String(d.id))) return;
              const el = d3.select(this);
              el.style('opacity', 0);
              el.transition()
                .duration(EASE_SCRUB_MS)
                .ease(d3.easeCubicOut)
                .style('opacity', 1);
            });
            links.each(function easeNewLink(d) {
              const k = linkKeyForProcessedCommunityLink(d);
              if (!newLk.has(k)) return;
              const el = d3.select(this);
              el.style('opacity', 0);
              el.transition()
                .duration(EASE_SCRUB_MS)
                .ease(d3.easeCubicOut)
                .style('opacity', 1);
            });
            if (playbackEaseHighlightTimerRef.current) {
              window.clearTimeout(playbackEaseHighlightTimerRef.current);
            }
            playbackEaseHighlightTimerRef.current = window.setTimeout(() => {
              playbackEaseHighlightTimerRef.current = null;
              updateHighlighting();
            }, EASE_SCRUB_MS + 24);
          }
        }
      }
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
            .transition()
            .duration(450)
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

    // Cleanup
    return () => {
      if (playbackEaseHighlightTimerRef.current) {
        window.clearTimeout(playbackEaseHighlightTimerRef.current);
        playbackEaseHighlightTimerRef.current = null;
      }
      if (minimapRafRef.current) {
        cancelAnimationFrame(minimapRafRef.current);
        minimapRafRef.current = null;
      }
      simulation.stop();
      tooltip.remove();
      zoomBehaviorRef.current = null;
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
    showGraphActionsHelp;
  const showEditableEmptyGuide =
    !readOnly && nodeCount === 0 && !emptyStateBlockedByModal;
  const showReadOnlyEmpty =
    readOnly && nodeCount === 0 && !emptyStateBlockedByModal;

  let activeGraphEditBanner = null;
  if (isGenerating) {
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
                    Memory window (nodes along path):
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
          aria-hidden
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
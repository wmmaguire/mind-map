import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import PropTypes from 'prop-types';
import GraphVisualization from './GraphVisualization';
import { useSession } from '../context/SessionContext';
import { useIdentity } from '../context/IdentityContext';
import { useGraphTitle } from '../context/GraphTitleContext';
import { useLibraryUi } from '../context/LibraryUiContext';
import LibrarySidebar from './LibrarySidebar';
import { apiRequest, getApiErrorMessage } from '../api/http';
import { buildAnalyzeNamespace, mergeAnalyzedGraphs } from '../utils/mergeGraphs';
import {
  getFilteredSortedFiles,
  getFilteredSortedGraphs,
  FILE_SORT_NAME_ASC,
} from '../utils/libraryFileList';
import {
  cloneGraphForCommit,
  ensurePlaybackTimestamps,
  getSortedUniquePlaybackTimes,
  buildGraphAtPlaybackTime,
  mergePlaybackTimesFromEdit,
} from '../utils/graphPlayback';
import { useGraphHistoryUi } from '../context/GraphHistoryUiContext';
import { resolveGenerationContext } from '../utils/generationGuidance';
import GenerationGuidanceFields from './GenerationGuidanceFields';
import './LibraryVisualize.css';

const SIDEBAR_WIDTH_KEY = 'mindmap.librarySidebarWidth';
const MOBILE_LIBRARY_DRAWER_WIDTH_KEY = 'mindmap.mobileLibraryDrawerWidth';
const SECTIONS_KEY = 'mindmap.librarySections';
const MIN_SIDEBAR_WIDTH = 240;
const MIN_GRAPH_VIEWPORT_PX = 200;
const DEFAULT_SIDEBAR_WIDTH = 300;
const RESIZE_HANDLE_PX = 6;

const MIN_MOBILE_LIBRARY_DRAWER_WIDTH = 220;
/** Release width below this (after dragging left) closes the drawer. */
const MOBILE_LIBRARY_DRAWER_CLOSE_BELOW_PX = 140;

function maxMobileLibraryDrawerWidth(viewportWidth) {
  return Math.max(
    MIN_MOBILE_LIBRARY_DRAWER_WIDTH,
    Math.min(Math.floor(viewportWidth * 0.96), viewportWidth - 16)
  );
}

function defaultMobileLibraryDrawerWidth(viewportWidth) {
  return Math.min(352, maxMobileLibraryDrawerWidth(viewportWidth));
}

function readStoredMobileLibraryDrawerWidth(viewportWidth) {
  const cap = maxMobileLibraryDrawerWidth(viewportWidth);
  try {
    const raw = localStorage.getItem(MOBILE_LIBRARY_DRAWER_WIDTH_KEY);
    const w = parseInt(raw, 10);
    if (Number.isFinite(w) && w >= MIN_MOBILE_LIBRARY_DRAWER_WIDTH && w <= cap) {
      return w;
    }
    if (Number.isFinite(w) && w >= MIN_MOBILE_LIBRARY_DRAWER_WIDTH) {
      return Math.min(w, cap);
    }
  } catch {
    /* ignore */
  }
  return defaultMobileLibraryDrawerWidth(viewportWidth);
}

function maxSidebarWidthForViewport(viewportWidth) {
  const maxAllowed = viewportWidth - RESIZE_HANDLE_PX - MIN_GRAPH_VIEWPORT_PX;
  return Math.max(MIN_SIDEBAR_WIDTH, maxAllowed);
}

function readStoredSidebarWidth() {
  const vw =
    typeof window !== 'undefined' ? window.innerWidth : 1200;
  const cap = maxSidebarWidthForViewport(vw);
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    const w = parseInt(raw, 10);
    if (Number.isFinite(w) && w >= MIN_SIDEBAR_WIDTH && w <= cap) {
      return w;
    }
    if (Number.isFinite(w) && w >= MIN_SIDEBAR_WIDTH) {
      return Math.min(w, cap);
    }
  } catch {
    /* ignore */
  }
  return Math.min(DEFAULT_SIDEBAR_WIDTH, cap);
}

function readStoredSections() {
  try {
    const raw = localStorage.getItem(SECTIONS_KEY);
    if (!raw) return { files: true, graphs: true };
    const o = JSON.parse(raw);
    return {
      files: typeof o.files === 'boolean' ? o.files : true,
      graphs: typeof o.graphs === 'boolean' ? o.graphs : true,
    };
  } catch {
    return { files: true, graphs: true };
  }
}

function LibraryVisualize({ fileRefreshToken }) {
  const [searchParams] = useSearchParams();
  const shareGraph = searchParams.get('shareGraph');
  const shareToken = searchParams.get('shareToken');

  const { sessionId } = useSession();
  const { userId } = useIdentity();
  const { setGraphTitle } = useGraphTitle();
  const { registerMobileLibraryRail } = useLibraryUi();
  const [files, setFiles] = useState([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [deletingFiles, setDeletingFiles] = useState(false);
  /** Fixed toast after delete (mirrors App upload success banner). */
  const [deleteToast, setDeleteToast] = useState(null);
  const [fileSearchQuery, setFileSearchQuery] = useState('');
  const [fileSort, setFileSort] = useState(FILE_SORT_NAME_ASC);
  const [savedGraphs, setSavedGraphs] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  /** Full graph (persisted ordering via per-entity createdAt / legacy timestamp). */
  const [committedGraph, setCommittedGraph] = useState(null);
  /** Index into {@link getSortedUniquePlaybackTimes}(committedGraph). */
  const [playbackStepIndex, setPlaybackStepIndex] = useState(0);
  /** Placeholder so stale HMR / `[historyOpts]` hook deps cannot throw ReferenceError. */
  const historyOpts = useMemo(() => ({}), []);
  void historyOpts;
  const {
    setPayload: setGraphHistoryBannerPayload,
    setSharePayload: setGraphShareBannerPayload,
    setSavePayload: setGraphSaveBannerPayload,
  } = useGraphHistoryUi();

  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [currentSource, setCurrentSource] = useState(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [graphName, setGraphName] = useState('');
  const [graphDescription, setGraphDescription] = useState('');
  const [showContextModal, setShowContextModal] = useState(false);
  const [analysisGuidancePreset, setAnalysisGuidancePreset] = useState('none');
  const [analysisGuidanceCustomText, setAnalysisGuidanceCustomText] =
    useState('');
  const [showSidebar, setShowSidebar] = useState(false);

  const [sidebarWidth, setSidebarWidth] = useState(readStoredSidebarWidth);
  const [mobileLibraryDrawerWidth, setMobileLibraryDrawerWidth] = useState(
    () =>
      readStoredMobileLibraryDrawerWidth(
        typeof window !== 'undefined' ? window.innerWidth : 768
      )
  );
  /** Mobile: drawer spans full library-visualize width (covers graph canvas). */
  const [mobileLibraryDrawerMaximized, setMobileLibraryDrawerMaximized] =
    useState(false);
  const [filesSectionOpen, setFilesSectionOpen] = useState(
    () => readStoredSections().files
  );
  const [graphsSectionOpen, setGraphsSectionOpen] = useState(
    () => readStoredSections().graphs
  );
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  /** GitHub #39: opened via ?shareGraph=&shareToken= */
  const [shareViewerMode, setShareViewerMode] = useState(false);
  const [shareLinkToast, setShareLinkToast] = useState(null);

  /** Stable noop so GraphVisualization is not handed a new callback every render in share mode. */
  const noopGraphDataUpdate = useCallback(() => {}, []);

  const playbackTimes = useMemo(
    () => getSortedUniquePlaybackTimes(committedGraph),
    [committedGraph]
  );

  const displayGraph = useMemo(() => {
    if (!committedGraph) return { nodes: [], links: [] };
    const times = playbackTimes;
    if (times.length === 0) return committedGraph;
    const maxIdx = times.length - 1;
    const idx = Math.min(Math.max(0, playbackStepIndex), maxIdx);
    const cutoff = times[idx];
    return buildGraphAtPlaybackTime(committedGraph, cutoff);
  }, [committedGraph, playbackTimes, playbackStepIndex]);

  const maxPlaybackIdx = Math.max(0, playbackTimes.length - 1);
  const playbackAtEnd =
    !committedGraph ||
    playbackTimes.length === 0 ||
    playbackStepIndex >= maxPlaybackIdx;

  // Add responsive width calculation
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });

  const displayFiles = useMemo(
    () => getFilteredSortedFiles(files, fileSearchQuery, fileSort),
    [files, fileSearchQuery, fileSort]
  );

  const displayGraphs = useMemo(
    () => getFilteredSortedGraphs(savedGraphs, fileSearchQuery, fileSort),
    [savedGraphs, fileSearchQuery, fileSort]
  );

  const defaultNodeColor = '#4a90e2'; // default node color is blue
  // Add resize handler
  useEffect(() => {
    function handleResize() {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      });
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const listingAuth = useMemo(
    () => (userId ? { auth: { userId } } : {}),
    [userId]
  );

  const applyLoadedGraphFromApi = useCallback(
    (data, filename, { viaShare }) => {
      const graphPayload = data.data.graph;
      const nodeMap = new Map();
      graphPayload.nodes.forEach((node) => {
        nodeMap.set(node.id, node);
      });

      const reconstructedLinks = graphPayload.links.map((link) => ({
        ...link,
        source: nodeMap.get(
          typeof link.source === 'object' ? link.source.id : link.source
        ),
        target: nodeMap.get(
          typeof link.target === 'object' ? link.target.id : link.target
        ),
      }));

      const loaded = {
        nodes: graphPayload.nodes,
        links: reconstructedLinks.filter((l) => l.source && l.target),
      };
      const cloned = cloneGraphForCommit(loaded);
      if (cloned) ensurePlaybackTimestamps(cloned);
      setCommittedGraph(cloned);
      const times = getSortedUniquePlaybackTimes(cloned);
      setPlaybackStepIndex(times.length > 0 ? times.length - 1 : 0);

      setSelectedFiles(new Set());
      setCurrentSource({
        ...data.data.metadata,
        sourceFile: filename,
      });
      setShareViewerMode(Boolean(viaShare));
    },
    []
  );

  const fetchFiles = useCallback(async () => {
    if (!sessionId) return;
    setFilesLoading(true);
    try {
      const path = userId
        ? '/api/files'
        : `/api/files?sessionId=${encodeURIComponent(sessionId)}`;
      const data = await apiRequest(path, listingAuth);
      if (data && data.files) {
        setFiles(data.files);
      }
    } catch (error) {
      console.error('Error fetching files:', error);
      const msg = getApiErrorMessage(error);
      setError(`Failed to fetch files: ${msg}`);
    } finally {
      setFilesLoading(false);
    }
  }, [sessionId, userId, listingAuth]);

  const fetchSavedGraphs = useCallback(async () => {
    if (!sessionId) return;
    try {
      const path = userId
        ? '/api/graphs'
        : `/api/graphs?sessionId=${encodeURIComponent(sessionId)}`;
      const data = await apiRequest(path, listingAuth);
      if (data && data.graphs) {
        setSavedGraphs(data.graphs);
      }
    } catch (error) {
      console.warn('Error fetching saved graphs:', error);
      setSavedGraphs([]);
    }
  }, [sessionId, userId, listingAuth]);

  useEffect(() => {
    if (!sessionId) {
      setFilesLoading(false);
      return;
    }
    fetchFiles();
    fetchSavedGraphs();
  }, [sessionId, fetchFiles, fetchSavedGraphs]);

  useEffect(() => {
    if (fileRefreshToken === 0) return;
    if (!sessionId) return;
    fetchFiles();
  }, [fileRefreshToken, fetchFiles, sessionId]);

  useEffect(() => {
    if (!deleteToast) return;
    const id = setTimeout(() => setDeleteToast(null), 3000);
    return () => clearTimeout(id);
  }, [deleteToast]);

  useEffect(() => {
    if (!shareLinkToast) return;
    const id = setTimeout(() => setShareLinkToast(null), 4000);
    return () => clearTimeout(id);
  }, [shareLinkToast]);

  useEffect(() => {
    const g = shareGraph?.trim();
    const t = shareToken?.trim();
    if (!sessionId || !g || !t) return undefined;

    let cancelled = false;
    (async () => {
      try {
        setError(null);
        const path = `/api/graphs/${encodeURIComponent(g)}?shareToken=${encodeURIComponent(t)}`;
        const data = await apiRequest(path, {});
        if (cancelled) return;
        if (data.success) {
          applyLoadedGraphFromApi(data, g, { viaShare: true });
        } else {
          throw new Error(data.error || 'Failed to load shared graph');
        }
      } catch (e) {
        if (!cancelled) {
          setError(`Failed to open shared graph: ${getApiErrorMessage(e)}`);
          setShareViewerMode(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId, shareGraph, shareToken, applyLoadedGraphFromApi]);

  /** Leave share mode when query params are gone (e.g. “Open your library” / edited URL). */
  useEffect(() => {
    const g = shareGraph?.trim();
    const t = shareToken?.trim();
    if (!g || !t) {
      setShareViewerMode(false);
    }
  }, [shareGraph, shareToken]);

  useEffect(() => {
    try {
      localStorage.setItem(
        SIDEBAR_WIDTH_KEY,
        String(sidebarWidth)
      );
    } catch {
      /* ignore */
    }
  }, [sidebarWidth]);

  useEffect(() => {
    try {
      localStorage.setItem(
        MOBILE_LIBRARY_DRAWER_WIDTH_KEY,
        String(mobileLibraryDrawerWidth)
      );
    } catch {
      /* ignore */
    }
  }, [mobileLibraryDrawerWidth]);

  useEffect(() => {
    const cap = maxMobileLibraryDrawerWidth(dimensions.width);
    setMobileLibraryDrawerWidth((w) => Math.min(w, cap));
  }, [dimensions.width]);

  useEffect(() => {
    try {
      localStorage.setItem(
        SECTIONS_KEY,
        JSON.stringify({ files: filesSectionOpen, graphs: graphsSectionOpen })
      );
    } catch {
      /* ignore */
    }
  }, [filesSectionOpen, graphsSectionOpen]);

  const openLibrarySidebar = useCallback(() => {
    setShowSidebar(true);
  }, []);

  const handleMobileLibraryDrawerDragEnd = useCallback(
    (finalWidth) => {
      if (finalWidth < MOBILE_LIBRARY_DRAWER_CLOSE_BELOW_PX) {
        setShowSidebar(false);
        setMobileLibraryDrawerMaximized(false);
        setMobileLibraryDrawerWidth(
          defaultMobileLibraryDrawerWidth(dimensions.width)
        );
      }
    },
    [dimensions.width]
  );

  const handleMobileLibraryDrawerWidthChange = useCallback((value) => {
    setMobileLibraryDrawerMaximized(false);
    setMobileLibraryDrawerWidth(value);
  }, []);

  const toggleMobileLibraryDrawerMaximized = useCallback(() => {
    setMobileLibraryDrawerMaximized((v) => !v);
  }, []);

  useEffect(() => {
    if (!showSidebar) {
      setMobileLibraryDrawerMaximized(false);
    }
  }, [showSidebar]);

  const desktopSidebarMaxWidth = useMemo(
    () => maxSidebarWidthForViewport(dimensions.width),
    [dimensions.width]
  );

  useEffect(() => {
    setSidebarWidth((sw) => Math.min(sw, desktopSidebarMaxWidth));
  }, [desktopSidebarMaxWidth]);

  useLayoutEffect(() => {
    registerMobileLibraryRail(true, openLibrarySidebar);
    return () => registerMobileLibraryRail(false, null);
  }, [openLibrarySidebar, registerMobileLibraryRail]);

  useEffect(() => {
    const raw = currentSource?.name;
    const title =
      typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
    setGraphTitle(currentSource ? title : null);
    return () => setGraphTitle(null);
  }, [currentSource, setGraphTitle]);

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    setIsResizingSidebar(true);
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onMove = (moveEvent) => {
      const delta = moveEvent.clientX - startX;
      const cap = maxSidebarWidthForViewport(dimensions.width);
      const next = Math.min(
        cap,
        Math.max(MIN_SIDEBAR_WIDTH, startWidth + delta)
      );
      setSidebarWidth(next);
    };

    const onUp = () => {
      setIsResizingSidebar(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [sidebarWidth, dimensions.width]);

  const handleResizeKeyDown = useCallback(
    (e) => {
      const cap = maxSidebarWidthForViewport(dimensions.width);
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setSidebarWidth((w) =>
          Math.max(MIN_SIDEBAR_WIDTH, w - 16)
        );
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setSidebarWidth((w) =>
          Math.min(cap, w + 16)
        );
      }
    },
    [dimensions.width]
  );

  const handleErrorBannerAction = () => {
    const wasFetchError =
      error?.startsWith('Failed to fetch files') ||
      error?.includes('Cannot reach the API server');
    setError(null);
    if (wasFetchError) {
      fetchFiles();
      fetchSavedGraphs();
    }
  };

  const handleSelectAllFiltered = useCallback(() => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      displayFiles.forEach((f) => next.add(f));
      return next;
    });
  }, [displayFiles]);

  const handleClearFileSelection = useCallback(() => {
    setSelectedFiles(new Set());
  }, []);

  const graphHistoryBannerPayload = useMemo(() => {
    if (!committedGraph || playbackTimes.length < 2) return null;
    const n = playbackTimes.length;
    const idx = Math.min(Math.max(0, playbackStepIndex), n - 1);
    return {
      entryCount: n,
      index: idx,
      goEarlier: () => setPlaybackStepIndex((i) => Math.max(0, i - 1)),
      goLater: () => setPlaybackStepIndex((i) => Math.min(n - 1, i + 1)),
      goToIndex: (i) =>
        setPlaybackStepIndex(Math.min(Math.max(0, Number(i)), n - 1)),
    };
  }, [committedGraph, playbackTimes, playbackStepIndex]);

  const handleDeleteSelected = useCallback(async () => {
    if (selectedFiles.size === 0 || !sessionId) return;
    if (
      !window.confirm(
        `Delete ${selectedFiles.size} file(s) from your library? This cannot be undone.`
      )
    ) {
      return;
    }
    setDeletingFiles(true);
    try {
      const list = Array.from(selectedFiles);
      const n = list.length;
      for (const file of list) {
        const path = `/api/files/${encodeURIComponent(file.filename)}?sessionId=${encodeURIComponent(sessionId)}`;
        await apiRequest(path, { method: 'DELETE', ...listingAuth });
      }
      setSelectedFiles(new Set());
      setCommittedGraph(null);
      setPlaybackStepIndex(0);
      setCurrentSource(null);
      await fetchFiles();
      setDeleteToast({
        type: 'success',
        message:
          n === 1
            ? 'File deleted successfully.'
            : `${n} files deleted successfully.`,
      });
    } catch (error) {
      console.error('Delete files:', error);
      setDeleteToast({
        type: 'error',
        message: `Could not delete file(s): ${getApiErrorMessage(error)}`,
      });
      await fetchFiles();
    } finally {
      setDeletingFiles(false);
    }
  }, [selectedFiles, sessionId, fetchFiles, listingAuth]);

  const handleFileListKeyDown = useCallback((e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const root = e.currentTarget;
    const boxes = root.querySelectorAll('.file-item-checkbox');
    if (!boxes.length) return;
    const active = document.activeElement;
    const i = Array.from(boxes).indexOf(active);
    if (i < 0) return;
    e.preventDefault();
    const nextIndex =
      e.key === 'ArrowDown'
        ? Math.min(i + 1, boxes.length - 1)
        : Math.max(i - 1, 0);
    boxes[nextIndex]?.focus();
  }, []);

  const handleSaveClick = useCallback(() => {
    const defaultName = Array.from(selectedFiles)
      .map(f => f.customName || f.originalName.replace(/\.[^/.]+$/, ''))
      .join(' + ');
    
    setGraphName(defaultName);
    setGraphDescription(`Graph generated from ${selectedFiles.size} source${selectedFiles.size > 1 ? 's' : ''}`);
    setShowSaveDialog(true);
  }, [selectedFiles]);

  const handleSaveGraph = async () => {
    if (!committedGraph || !graphName.trim()) return;

    try {
      setSaving(true);
      
      const graphToSave = {
        nodes: committedGraph.nodes,
        links: committedGraph.links.map(link => ({
          ...link,
          source: typeof link.source === 'object' ? link.source.id : link.source,
          target: typeof link.target === 'object' ? link.target.id : link.target
        }))
      };

      const metadata = {
        name: graphName.trim(),
        description: graphDescription.trim(),
        sessionId,
        sourceFiles: Array.from(selectedFiles).map(f => f.originalName),
        generatedAt: new Date().toISOString(),
        nodeCount: committedGraph.nodes.length,
        edgeCount: committedGraph.links.length,
        ...(userId ? { userId } : {}),
      };

      const data = await apiRequest('/api/graphs/save', {
        method: 'POST',
        json: {
          graph: graphToSave,
          metadata,
        },
        ...listingAuth,
      });

      if (data.success) {
        fetchSavedGraphs();
        const savedName = graphName.trim();
        const savedDescription = graphDescription.trim();
        setShowSaveDialog(false);
        setGraphName('');
        setGraphDescription('');
        if (data.filename && userId) {
          setCurrentSource((prev) => ({
            ...(prev || {}),
            name: savedName,
            description: savedDescription,
            sourceFile: data.filename,
            userId,
            sessionId,
            generatedAt: metadata.generatedAt,
            nodeCount: committedGraph.nodes.length,
            edgeCount: committedGraph.links.length,
            sourceFiles: metadata.sourceFiles,
          }));
        }
      } else {
        throw new Error(data.error || 'Failed to save graph');
      }
    } catch (error) {
      console.error('Error saving graph:', error);
      setError(getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleLoadGraph = async (filename) => {
    try {
      const data = await apiRequest(
        `/api/graphs/${encodeURIComponent(filename)}`,
        listingAuth
      );

      if (data.success) {
        applyLoadedGraphFromApi(data, filename, { viaShare: false });

        if (data.data.metadata.dbId) {
          try {
            await apiRequest(
              `/api/graphs/${data.data.metadata.dbId}/views`,
              listingAuth
            );
          } catch (statsError) {
            console.warn('Failed to fetch view stats:', statsError);
          }
        }
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Error loading graph:', error);
      setError(`Failed to load graph: ${getApiErrorMessage(error)}`);
    }
  };

  const canMintShareReadLink = Boolean(
    userId &&
      committedGraph &&
      currentSource?.sourceFile &&
      !shareViewerMode &&
      String(currentSource?.userId ?? '').trim() === String(userId).trim()
  );

  const handleCopyShareReadLink = useCallback(async () => {
    const fn = currentSource?.sourceFile;
    if (!fn || !userId) return;
    try {
      const data = await apiRequest(
        `/api/graphs/${encodeURIComponent(fn)}/share-read-token`,
        { method: 'POST', ...listingAuth }
      );
      if (!data.success) {
        throw new Error(data.error || 'Could not create share link');
      }
      const { shareReadToken: token } = data;
      const u = new URL(window.location.href);
      const shareUrl = `${u.origin}/visualize?shareGraph=${encodeURIComponent(fn)}&shareToken=${encodeURIComponent(token)}`;
      await navigator.clipboard.writeText(shareUrl);
      setShareLinkToast({
        type: 'success',
        message:
          'Read-only link copied. Recipients can view this graph but cannot save or use graph actions here.',
      });
    } catch (e) {
      setShareLinkToast({
        type: 'error',
        message: getApiErrorMessage(e),
      });
    }
  }, [currentSource?.sourceFile, userId, listingAuth]);

  const libraryShareBannerPayload = useMemo(() => {
    if (!canMintShareReadLink) return null;
    return { onShareClick: handleCopyShareReadLink };
  }, [canMintShareReadLink, handleCopyShareReadLink]);

  const librarySaveBannerPayload = useMemo(() => {
    if (!committedGraph || shareViewerMode) return null;
    return {
      onSaveClick: handleSaveClick,
      saving,
    };
  }, [committedGraph, shareViewerMode, handleSaveClick, saving]);

  useLayoutEffect(() => {
    setGraphHistoryBannerPayload(graphHistoryBannerPayload);
  }, [graphHistoryBannerPayload, setGraphHistoryBannerPayload]);

  useLayoutEffect(() => {
    setGraphShareBannerPayload(libraryShareBannerPayload);
  }, [libraryShareBannerPayload, setGraphShareBannerPayload]);

  useLayoutEffect(() => {
    setGraphSaveBannerPayload(librarySaveBannerPayload);
  }, [librarySaveBannerPayload, setGraphSaveBannerPayload]);

  useLayoutEffect(
    () => () => {
      setGraphHistoryBannerPayload(null);
      setGraphShareBannerPayload(null);
      setGraphSaveBannerPayload(null);
    },
    [
      setGraphHistoryBannerPayload,
      setGraphShareBannerPayload,
      setGraphSaveBannerPayload,
    ]
  );

  const handleFileSelect = (file) => {
    setSelectedFiles(prev => {
      const newSelection = new Set(prev);
      if (newSelection.has(file)) {
        newSelection.delete(file);
      } else {
        newSelection.add(file);
      }
      return newSelection;
    });
  };

  const handleAnalyzeMultiple = async (context = '') => {
    if (selectedFiles.size === 0) return;

    try {
      setAnalyzing(true);
      setError(null);
      
      const fileResults = await Promise.all(
        Array.from(selectedFiles).map(async (file) => {
          const fileData = await apiRequest(
            `/api/files/${encodeURIComponent(file.filename)}`,
            listingAuth
          );
          if (!fileData.success || !fileData.content) {
            throw new Error(`Failed to read file: ${file.originalName}`);
          }

          const analysisData = await apiRequest('/api/analyze', {
            method: 'POST',
            json: {
              content: fileData.content,
              context,
              sessionId,
              sourceFiles: [file._id || file.filename],
            },
            ...listingAuth,
          });

          if (!analysisData.success || !analysisData.data) {
            throw new Error(`Analysis failed for: ${file.originalName}`);
          }

          return {
            file,
            filename: file.originalName,
            data: analysisData.data
          };
        })
      );

      const combinedGraph = mergeAnalyzedGraphs(
        fileResults.map((r) => ({
          namespace: buildAnalyzeNamespace(r.file),
          graph: r.data,
        }))
      );
      const nextGraph = {
        ...combinedGraph,
        nodes: combinedGraph.nodes.map((n) => ({
          ...n,
          size: 20,
          color: defaultNodeColor,
        })),
      };
      const cloned = cloneGraphForCommit(nextGraph);
      if (cloned) ensurePlaybackTimestamps(cloned);
      setCommittedGraph(cloned);
      const times = getSortedUniquePlaybackTimes(cloned);
      setPlaybackStepIndex(times.length > 0 ? times.length - 1 : 0);

      if (userId) {
        const label = fileResults
          .map(
            (r) =>
              r.file.customName ||
              r.filename.replace(/\.[^/.]+$/, '')
          )
          .join(' + ');
        setCurrentSource((prev) => ({
          ...(prev || {}),
          name: label || prev?.name,
          userId,
        }));
      }
    } catch (error) {
      console.error('Analysis error:', error);
      setError(`Failed to analyze files: ${getApiErrorMessage(error)}`);
      setCommittedGraph(null);
      setPlaybackStepIndex(0);
    } finally {
      setAnalyzing(false);
      setShowContextModal(false);
      setAnalysisGuidancePreset('none');
      setAnalysisGuidanceCustomText('');
    }
  };

  const handleAnalyzeClick = () => {
    if (selectedFiles.size === 0) return;
    setShowContextModal(true);
  };

  const handleAnalyzeWithGuidance = () => {
    handleAnalyzeMultiple(
      resolveGenerationContext(
        analysisGuidancePreset,
        analysisGuidanceCustomText
      )
    );
  };

  const handleGraphDataUpdate = useCallback(
    (newData) => {
      if (shareViewerMode) return;
      const times = getSortedUniquePlaybackTimes(committedGraph);
      const lastIdx = Math.max(0, times.length - 1);
      if (committedGraph && times.length > 0 && playbackStepIndex < lastIdx) {
        return;
      }

      const nodeMap = new Map();
      newData.nodes.forEach((node) => {
        nodeMap.set(node.id, node);
      });

      const processedLinks = newData.links
        .map((link) => {
          const sourceId =
            typeof link.source === 'object' ? link.source.id : link.source;
          const targetId =
            typeof link.target === 'object' ? link.target.id : link.target;

          const sourceNode = nodeMap.get(sourceId);
          const targetNode = nodeMap.get(targetId);

          if (!sourceNode || !targetNode) {
            console.error('Missing node reference:', { sourceId, targetId, link });
            return null;
          }

          return {
            ...link,
            source: sourceNode,
            target: targetNode,
            relationship: link.relationship,
          };
        })
        .filter((link) => link !== null);

      const processedData = {
        nodes: newData.nodes,
        links: processedLinks,
      };

      const merged = mergePlaybackTimesFromEdit(processedData, committedGraph);
      ensurePlaybackTimestamps(merged);
      setCommittedGraph(merged);
      const nextTimes = getSortedUniquePlaybackTimes(merged);
      setPlaybackStepIndex(nextTimes.length > 0 ? nextTimes.length - 1 : 0);

      setCurrentSource((prev) => ({
        ...prev,
        nodeCount: merged.nodes.length,
        edgeCount: merged.links.length,
        lastModified: new Date().toISOString(),
      }));
    },
    [shareViewerMode, committedGraph, playbackStepIndex]
  );

  const isMobile = dimensions.width <= 768;
  let graphViewportWidth;
  if (isMobile) {
    graphViewportWidth = showSidebar
      ? dimensions.width
      : Math.max(200, dimensions.width - 48);
  } else if (showSidebar) {
    graphViewportWidth = Math.max(
      MIN_GRAPH_VIEWPORT_PX,
      dimensions.width - sidebarWidth - RESIZE_HANDLE_PX
    );
  } else {
    graphViewportWidth = Math.max(MIN_GRAPH_VIEWPORT_PX, dimensions.width);
  }

  const graphViewportHeight = Math.max(200, dimensions.height);

  return (
    <div className="library-visualize">
      {deleteToast && (
        <div
          className={`library-file-action-toast library-file-action-toast--${deleteToast.type}`}
          role={deleteToast.type === 'error' ? 'alert' : 'status'}
        >
          {deleteToast.message}
        </div>
      )}
      {shareLinkToast && (
        <div
          className={`library-file-action-toast library-file-action-toast--${shareLinkToast.type}`}
          role={shareLinkToast.type === 'error' ? 'alert' : 'status'}
        >
          {shareLinkToast.message}
        </div>
      )}
      <LibrarySidebar
        isMobile={isMobile}
        showSidebar={showSidebar}
        setShowSidebar={setShowSidebar}
        sidebarWidth={sidebarWidth}
        mobileLibraryDrawerWidth={
          isMobile
            ? mobileLibraryDrawerMaximized
              ? dimensions.width
              : mobileLibraryDrawerWidth
            : undefined
        }
        onMobileLibraryDrawerWidthChange={
          isMobile ? handleMobileLibraryDrawerWidthChange : undefined
        }
        mobileLibraryDrawerMinWidth={MIN_MOBILE_LIBRARY_DRAWER_WIDTH}
        mobileLibraryDrawerMaxWidth={
          isMobile
            ? mobileLibraryDrawerMaximized
              ? dimensions.width
              : maxMobileLibraryDrawerWidth(dimensions.width)
            : undefined
        }
        onMobileLibraryDrawerDragEnd={
          isMobile ? handleMobileLibraryDrawerDragEnd : undefined
        }
        mobileLibraryDrawerMaximized={
          isMobile ? mobileLibraryDrawerMaximized : false
        }
        onToggleMobileLibraryDrawerMaximized={
          isMobile ? toggleMobileLibraryDrawerMaximized : undefined
        }
        error={error}
        onErrorBannerAction={handleErrorBannerAction}
        sourcesPanelProps={{
          filesSectionOpen,
          setFilesSectionOpen,
          graphsSectionOpen,
          setGraphsSectionOpen,
          files,
          filesLoading,
          error,
          displayFiles,
          displayGraphs,
          fileSearchQuery,
          setFileSearchQuery,
          fileSort,
          setFileSort,
          selectedFiles,
          analyzing,
          deletingFiles,
          savedGraphs,
          graphData: committedGraph,
          onSelectAllFiltered: handleSelectAllFiltered,
          onClearFileSelection: handleClearFileSelection,
          onDeleteSelected: handleDeleteSelected,
          onFileSelect: handleFileSelect,
          onFileListKeyDown: handleFileListKeyDown,
          onAnalyzeClick: () => {
            if (isMobile) setShowSidebar(false);
            handleAnalyzeClick();
          },
          onLoadGraph: filename => {
            if (isMobile) setShowSidebar(false);
            void handleLoadGraph(filename);
          },
          shareViewerMode,
        }}
      />

      {!isMobile && showSidebar && (
        <div
          className={`sidebar-resize-handle${isResizingSidebar ? ' is-active' : ''}`}
          onMouseDown={handleResizeStart}
          onKeyDown={handleResizeKeyDown}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize library panel"
          tabIndex={0}
        />
      )}

      <div className="visualization-panel">
        {shareViewerMode && (
          <div className="library-share-viewer-banner" role="status">
            Viewing a shared graph (read-only). Graph actions and library saves are
            disabled.
          </div>
        )}
        <div className="graph-container library-graph-mount">
          <GraphVisualization
            actionsFabPlacement="libraryGraphMount"
            data={displayGraph}
            onDataUpdate={
              shareViewerMode || !playbackAtEnd
                ? noopGraphDataUpdate
                : handleGraphDataUpdate
            }
            readOnly={shareViewerMode || !playbackAtEnd}
            emptyStateVariant={shareViewerMode ? 'default' : 'library'}
            width={graphViewportWidth}
            height={graphViewportHeight}
          />
        </div>
      </div>

      {showSaveDialog && (
        <div className="modal-overlay" onClick={() => !saving && setShowSaveDialog(false)}>
          <div className="save-dialog" onClick={e => e.stopPropagation()}>
            <div className="save-dialog-header">
              <h3>Save Graph</h3>
              {!saving && (
                <button 
                  className="close-button" 
                  onClick={() => setShowSaveDialog(false)}
                  aria-label="Close"
                >
                  ×
                </button>
              )}
            </div>

            <div className="save-dialog-content">
              <div className="form-group">
                <label htmlFor="graphName">Graph Name <span className="required">*</span></label>
                <input
                  id="graphName"
                  type="text"
                  value={graphName}
                  onChange={(e) => setGraphName(e.target.value)}
                  placeholder="Enter a name for your graph"
                  disabled={saving}
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label htmlFor="graphDescription">Description</label>
                <textarea
                  id="graphDescription"
                  value={graphDescription}
                  onChange={(e) => setGraphDescription(e.target.value)}
                  placeholder="Add a description to help identify this graph later"
                  rows="3"
                  disabled={saving}
                />
              </div>

              <div className="graph-metadata">
                <h4>Graph Details</h4>
                <div className="metadata-grid">
                  <div className="metadata-item">
                    <span className="metadata-label">Nodes</span>
                    <span className="metadata-value">{committedGraph?.nodes.length || 0}</span>
                  </div>
                  <div className="metadata-item">
                    <span className="metadata-label">Edges</span>
                    <span className="metadata-value">{committedGraph?.links.length || 0}</span>
                  </div>
                  <div className="metadata-item">
                    <span className="metadata-label">Sources</span>
                    <span className="metadata-value">{selectedFiles.size}</span>
                  </div>
                </div>
              </div>

              {error && (
                <div className="dialog-error">
                  <span className="error-icon">⚠️</span>
                  {error}
                </div>
              )}
            </div>

            <div className="save-dialog-footer">
              <div className="dialog-buttons">
                <button 
                  onClick={() => setShowSaveDialog(false)}
                  className="cancel-button"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveGraph}
                  className={`save-button ${saving ? 'loading' : ''}`}
                  disabled={saving || !graphName.trim()}
                >
                  {saving ? (
                    <>
                      <span className="spinner"></span>
                      Saving...
                    </>
                  ) : 'Save Graph'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showContextModal && (
        <div className="modal-overlay" onClick={() => !analyzing && setShowContextModal(false)}>
          <div className="save-dialog" onClick={e => e.stopPropagation()}>
            <div className="save-dialog-header">
              <h3>Generate Graph</h3>
              {!analyzing && (
                <button 
                  className="close-button" 
                  onClick={() => setShowContextModal(false)}
                  aria-label="Close"
                >
                  ×
                </button>
              )}
            </div>

            <div className="save-dialog-content">
              <GenerationGuidanceFields
                idPrefix="analysis-guidance"
                preset={analysisGuidancePreset}
                onPresetChange={setAnalysisGuidancePreset}
                customText={analysisGuidanceCustomText}
                onCustomTextChange={setAnalysisGuidanceCustomText}
                disabled={analyzing}
                helpText={
                  <>
                    Applies when analyzing your files into a graph. Presets send fixed
                    instructions; Custom uses your text. Max 2000 characters for custom.
                  </>
                }
              />

              <div className="graph-metadata">
                <h4>Analysis Details</h4>
                <div className="metadata-grid">
                  <div className="metadata-item">
                    <span className="metadata-label">Files Selected</span>
                    <span className="metadata-value">{selectedFiles.size}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="save-dialog-footer">
              <div className="dialog-buttons">
                <button
                  onClick={handleAnalyzeWithGuidance}
                  className={`save-button ${analyzing ? 'loading' : ''}`}
                  disabled={analyzing}
                >
                  {analyzing ? (
                    <>
                      <span className="spinner"></span>
                      Analyzing...
                    </>
                  ) : (
                    'Apply'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

LibraryVisualize.propTypes = {
  fileRefreshToken: PropTypes.number,
};

LibraryVisualize.defaultProps = {
  fileRefreshToken: 0,
};

export default LibraryVisualize;
import { useState, useEffect, useCallback, useMemo } from 'react';
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
  FILE_SORT_NAME_ASC,
} from '../utils/libraryFileList';
import {
  graphHistoryReducer,
  initialGraphHistoryState,
  materializeGraphSnapshot,
  DEFAULT_GRAPH_HISTORY_MAX,
} from '../utils/graphHistory';
import { useGraphHistoryUi } from '../context/GraphHistoryUiContext';
import './LibraryVisualize.css';

const SIDEBAR_WIDTH_KEY = 'mindmap.librarySidebarWidth';
const SECTIONS_KEY = 'mindmap.librarySections';
const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 480;
const DEFAULT_SIDEBAR_WIDTH = 300;
const RESIZE_HANDLE_PX = 6;
function readStoredSidebarWidth() {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    const w = parseInt(raw, 10);
    if (Number.isFinite(w) && w >= MIN_SIDEBAR_WIDTH && w <= MAX_SIDEBAR_WIDTH) {
      return w;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_SIDEBAR_WIDTH;
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

function LibraryVisualize({ onOpenUpload, fileRefreshToken }) {
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
  const [graphData, setGraphData] = useState(null);
  const [graphHistory, setGraphHistory] = useState(initialGraphHistoryState);
  const historyOpts = useMemo(
    () => ({ maxDepth: DEFAULT_GRAPH_HISTORY_MAX }),
    []
  );
  const { setPayload: setGraphHistoryBannerPayload } = useGraphHistoryUi();

  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [currentSource, setCurrentSource] = useState(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [graphName, setGraphName] = useState('');
  const [graphDescription, setGraphDescription] = useState('');
  const [showContextModal, setShowContextModal] = useState(false);
  const [additionalContext, setAdditionalContext] = useState('');
  const [showSidebar, setShowSidebar] = useState(false);

  const [sidebarWidth, setSidebarWidth] = useState(readStoredSidebarWidth);
  const [filesSectionOpen, setFilesSectionOpen] = useState(
    () => readStoredSections().files
  );
  const [graphsSectionOpen, setGraphsSectionOpen] = useState(
    () => readStoredSections().graphs
  );
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);

  // Add responsive width calculation
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });

  const displayFiles = useMemo(
    () => getFilteredSortedFiles(files, fileSearchQuery, fileSort),
    [files, fileSearchQuery, fileSort]
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

  useEffect(() => {
    const mobile = dimensions.width <= 768;
    registerMobileLibraryRail(
      mobile && !showSidebar,
      openLibrarySidebar
    );
    return () => registerMobileLibraryRail(false, null);
  }, [
    dimensions.width,
    showSidebar,
    openLibrarySidebar,
    registerMobileLibraryRail,
  ]);

  useEffect(() => {
    setGraphTitle(currentSource?.name || 'Unnamed Graph');
    return () => setGraphTitle(null);
  }, [currentSource?.name, setGraphTitle]);

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    setIsResizingSidebar(true);
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onMove = (moveEvent) => {
      const delta = moveEvent.clientX - startX;
      const next = Math.min(
        MAX_SIDEBAR_WIDTH,
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
  }, [sidebarWidth]);

  const handleResizeKeyDown = useCallback(
    (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setSidebarWidth((w) =>
          Math.max(MIN_SIDEBAR_WIDTH, w - 16)
        );
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setSidebarWidth((w) =>
          Math.min(MAX_SIDEBAR_WIDTH, w + 16)
        );
      }
    },
    []
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

  const goToHistoryIndex = useCallback(
    (nextIndex) => {
      setGraphHistory((prev) => {
        if (nextIndex < 0 || nextIndex >= prev.entries.length) return prev;
        const g = materializeGraphSnapshot(prev.entries[nextIndex]);
        setGraphData(g);
        setCurrentSource((p) =>
          p
            ? {
              ...p,
              nodeCount: g.nodes.length,
              edgeCount: g.links.length,
            }
            : p
        );
        return graphHistoryReducer(
          prev,
          { type: 'GOTO', index: nextIndex },
          historyOpts
        );
      });
    },
    [historyOpts]
  );

  const graphHistoryBannerPayload = useMemo(() => {
    if (graphHistory.entries.length < 2 || !graphData) return null;
    const n = graphHistory.entries.length;
    const idx = graphHistory.index;
    return {
      entryCount: n,
      index: idx,
      goEarlier: () => goToHistoryIndex(Math.max(0, idx - 1)),
      goLater: () => goToHistoryIndex(Math.min(n - 1, idx + 1)),
      goToIndex: goToHistoryIndex,
    };
  }, [graphHistory.entries, graphHistory.index, graphData, goToHistoryIndex]);

  useEffect(() => {
    setGraphHistoryBannerPayload(graphHistoryBannerPayload);
  }, [graphHistoryBannerPayload, setGraphHistoryBannerPayload]);

  useEffect(
    () => () => {
      setGraphHistoryBannerPayload(null);
    },
    [setGraphHistoryBannerPayload]
  );

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
      setGraphData(null);
      setCurrentSource(null);
      setGraphHistory(
        graphHistoryReducer(
          initialGraphHistoryState,
          { type: 'RESET', graph: { nodes: [], links: [] } },
          historyOpts
        )
      );
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
  }, [selectedFiles, sessionId, fetchFiles, listingAuth, historyOpts]);

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

  const handleSaveClick = () => {
    const defaultName = Array.from(selectedFiles)
      .map(f => f.customName || f.originalName.replace(/\.[^/.]+$/, ''))
      .join(' + ');
    
    setGraphName(defaultName);
    setGraphDescription(`Graph generated from ${selectedFiles.size} source${selectedFiles.size > 1 ? 's' : ''}`);
    setShowSaveDialog(true);
  };

  const handleSaveGraph = async () => {
    if (!graphData || !graphName.trim()) return;

    try {
      setSaving(true);
      
      const graphToSave = {
        nodes: graphData.nodes,
        links: graphData.links.map(link => ({
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
        nodeCount: graphData.nodes.length,
        edgeCount: graphData.links.length,
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
        setShowSaveDialog(false);
        setGraphName('');
        setGraphDescription('');
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
      const data = await apiRequest(`/api/graphs/${filename}`, listingAuth);

      if (data.success) {
        const graphData = data.data.graph;
        const nodeMap = new Map();
        graphData.nodes.forEach(node => {
          nodeMap.set(node.id, node);
        });

        const reconstructedLinks = graphData.links.map(link => ({
          ...link,
          source: nodeMap.get(typeof link.source === 'object' ? link.source.id : link.source),
          target: nodeMap.get(typeof link.target === 'object' ? link.target.id : link.target)
        }));

        const loaded = {
          nodes: graphData.nodes,
          links: reconstructedLinks,
        };
        setGraphData(loaded);
        setGraphHistory(
          graphHistoryReducer(
            initialGraphHistoryState,
            { type: 'RESET', graph: loaded },
            historyOpts
          )
        );

        setSelectedFiles(new Set());
        setCurrentSource({
          ...data.data.metadata,
          sourceFile: filename
        });

        // If there's a dbId in the metadata, fetch view stats
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
      setGraphData(nextGraph);
      setGraphHistory(
        graphHistoryReducer(
          initialGraphHistoryState,
          { type: 'RESET', graph: nextGraph },
          historyOpts
        )
      );

    } catch (error) {
      console.error('Analysis error:', error);
      setError(`Failed to analyze files: ${getApiErrorMessage(error)}`);
      setGraphData(null);
      setGraphHistory(
        graphHistoryReducer(
          initialGraphHistoryState,
          { type: 'RESET', graph: { nodes: [], links: [] } },
          historyOpts
        )
      );
    } finally {
      setAnalyzing(false);
      setShowContextModal(false);
      setAdditionalContext('');
    }
  };

  const handleAnalyzeClick = () => {
    if (selectedFiles.size === 0) return;
    setShowContextModal(true);
  };

  const handleGraphDataUpdate = (newData) => {
    // Create a map of all nodes for reference
    const nodeMap = new Map();
    newData.nodes.forEach(node => {
      nodeMap.set(node.id, node);
    });

    // Process links to ensure they reference actual node objects
    const processedLinks = newData.links.map(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      
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
        relationship: link.relationship
      };
    }).filter(link => link !== null);

    // Update graph data with processed links
    const processedData = {
      nodes: newData.nodes,
      links: processedLinks
    };

    setGraphData(processedData);
    setGraphHistory((prev) =>
      graphHistoryReducer(prev, { type: 'COMMIT', graph: processedData }, historyOpts)
    );

    // Update metadata
    setCurrentSource(prev => ({
      ...prev,
      nodeCount: processedData.nodes.length,
      edgeCount: processedData.links.length,
      lastModified: new Date().toISOString()
    }));
  };

  const isMobile = dimensions.width <= 768;
  let graphViewportWidth;
  if (isMobile) {
    graphViewportWidth = showSidebar
      ? dimensions.width
      : Math.max(200, dimensions.width - 48);
  } else {
    graphViewportWidth = Math.max(
      200,
      dimensions.width - sidebarWidth - RESIZE_HANDLE_PX
    );
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
      <LibrarySidebar
        isMobile={isMobile}
        showSidebar={showSidebar}
        setShowSidebar={setShowSidebar}
        sidebarWidth={sidebarWidth}
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
          fileSearchQuery,
          setFileSearchQuery,
          fileSort,
          setFileSort,
          selectedFiles,
          analyzing,
          deletingFiles,
          savedGraphs,
          graphData,
          saving,
          onOpenUpload,
          onSelectAllFiltered: handleSelectAllFiltered,
          onClearFileSelection: handleClearFileSelection,
          onDeleteSelected: handleDeleteSelected,
          onFileSelect: handleFileSelect,
          onFileListKeyDown: handleFileListKeyDown,
          onAnalyzeClick: handleAnalyzeClick,
          onSaveClick: handleSaveClick,
          onLoadGraph: handleLoadGraph,
        }}
      />

      {!isMobile && (
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
        <div className="graph-container library-graph-mount">
          <GraphVisualization
            actionsFabPlacement="libraryGraphMount"
            data={graphData || { nodes: [], links: [] }}
            onDataUpdate={handleGraphDataUpdate}
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
                    <span className="metadata-value">{graphData?.nodes.length || 0}</span>
                  </div>
                  <div className="metadata-item">
                    <span className="metadata-label">Edges</span>
                    <span className="metadata-value">{graphData?.links.length || 0}</span>
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
              <h3>Add Analysis Context</h3>
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
              <div className="form-group">
                <label htmlFor="analysisContext">Additional Context (Optional)</label>
                <textarea
                  id="analysisContext"
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                  placeholder="Enter any additional context to guide the analysis..."
                  rows="4"
                  disabled={analyzing}
                />
              </div>

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
                  onClick={() => handleAnalyzeMultiple()}
                  className="cancel-button"
                  disabled={analyzing}
                >
                  Skip Context
                </button>
                <button
                  onClick={() => handleAnalyzeMultiple(additionalContext)}
                  className={`save-button ${analyzing ? 'loading' : ''}`}
                  disabled={analyzing}
                >
                  {analyzing ? (
                    <>
                      <span className="spinner"></span>
                      Analyzing...
                    </>
                  ) : 'Analyze with Context'}
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
  onOpenUpload: PropTypes.func,
  fileRefreshToken: PropTypes.number,
};

LibraryVisualize.defaultProps = {
  onOpenUpload: () => {},
  fileRefreshToken: 0,
};

export default LibraryVisualize;
import { useState, useEffect, useCallback } from 'react';
import GraphVisualization from './GraphVisualization';
import { useSession } from '../context/SessionContext';
import {
  apiRequest,
  getApiErrorMessage,
  isNetworkError,
} from '../api/http';
import { buildAnalyzeNamespace, mergeAnalyzedGraphs } from '../utils/mergeGraphs';
import './LibraryVisualize.css';

const SIDEBAR_WIDTH_KEY = 'mindmap.librarySidebarWidth';
const SECTIONS_KEY = 'mindmap.librarySections';
const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 480;
const DEFAULT_SIDEBAR_WIDTH = 300;
const RESIZE_HANDLE_PX = 6;
/** Space reserved for the "Visualization: …" title row (border + text, no padding). */
const VISUALIZATION_HEADER_PX = 22;

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

function LibraryVisualize() {
  const { sessionId } = useSession();
  const [files, setFiles] = useState([]);
  const [savedGraphs, setSavedGraphs] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [graphData, setGraphData] = useState(null);
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

  useEffect(() => {
    fetchFiles();
    fetchSavedGraphs();
  }, []);

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

  const fetchFiles = async () => {
    try {
      const data = await apiRequest('/api/files');
      if (data && data.files) {
        setFiles(data.files);
      }
    } catch (error) {
      console.error('Error fetching files:', error);
      const msg = getApiErrorMessage(error);
      setError(
        `Failed to fetch files: ${msg}${isNetworkError(error) ? ' Check that the API server is running (e.g. port 5001).' : ''}`
      );
    }
  };

  const fetchSavedGraphs = async () => {
    try {
      const data = await apiRequest('/api/graphs');
      if (data && data.graphs) {
        setSavedGraphs(data.graphs);
      }
    } catch (error) {
      console.warn('Error fetching saved graphs:', error);
      setSavedGraphs([]);
    }
  };

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
        edgeCount: graphData.links.length
      };

      const data = await apiRequest('/api/graphs/save', {
        method: 'POST',
        json: {
          graph: graphToSave,
          metadata,
        },
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
      const data = await apiRequest(`/api/graphs/${filename}`);

      if (data.success) {
        console.log('Graph data:', data.data);
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

        console.log('Reconstructed nodes:', graphData.nodes);
        console.log('Reconstructed links:', reconstructedLinks);
        setGraphData({
          nodes: graphData.nodes,
          links: reconstructedLinks
        });
        
        setSelectedFiles(new Set());
        setCurrentSource({
          ...data.data.metadata,
          sourceFile: filename
        });

        // If there's a dbId in the metadata, fetch view stats
        if (data.data.metadata.dbId) {
          try {
            const viewStats = await apiRequest(
              `/api/graphs/${data.data.metadata.dbId}/views`
            );
            console.log('Graph view stats:', viewStats);
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
          const fileData = await apiRequest(`/api/files/${file.filename}`);
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
      setGraphData({
        ...combinedGraph,
        nodes: combinedGraph.nodes.map((n) => ({
          ...n,
          size: 20,
          color: defaultNodeColor,
        })),
      });

    } catch (error) {
      console.error('Analysis error:', error);
      setError(`Failed to analyze files: ${getApiErrorMessage(error)}`);
      setGraphData(null);
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
    console.log('Updating graph data in LibraryVisualize:', newData);
    
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

    console.log('Processed graph data:', processedData);
    setGraphData(processedData);
    
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

  const graphViewportHeight = Math.max(
    200,
    dimensions.height - VISUALIZATION_HEADER_PX
  );

  return (
    <div
      className={`library-visualize${isMobile && !showSidebar ? ' library-visualize--rail' : ''}`}
    >
      {isMobile && !showSidebar && (
        <button
          type="button"
          className="library-mobile-rail"
          onClick={() => setShowSidebar(true)}
          aria-label="Open Library"
        >
          <span className="library-mobile-rail__icon" aria-hidden>
            📚
          </span>
          <span className="library-mobile-rail__label">Library</span>
        </button>
      )}

      <aside
        className={`sidebar ${isMobile ? 'mobile' : 'desktop'} ${showSidebar ? 'visible' : 'hidden'}`}
        style={
          !isMobile
            ? { width: sidebarWidth, flexShrink: 0 }
            : undefined
        }
        aria-hidden={isMobile ? !showSidebar : undefined}
      >
        <div className="sidebar-header">
          <div className="sidebar-header__titles">
            <h2 className="sidebar-title">Library</h2>
            <p className="sidebar-subtitle">Sources and saved graphs</p>
          </div>
          {isMobile && (
            <button
              type="button"
              className="sidebar-close"
              onClick={() => setShowSidebar(false)}
              aria-label="Close library panel"
            >
              ×
            </button>
          )}
        </div>

        {error && (
          <div className="error sidebar-error" role="alert">
            <span className="error-text">{error}</span>
            <button
              type="button"
              className="retry-button"
              onClick={handleErrorBannerAction}
            >
              {error.startsWith('Failed to fetch files') ? 'Retry' : 'Dismiss'}
            </button>
          </div>
        )}

        <div className="sidebar-content">
          <section
            className="library-section"
            aria-labelledby="library-section-files"
          >
            <h3 id="library-section-files" className="library-section__title">
              <button
                type="button"
                className="library-section__toggle"
                onClick={() => setFilesSectionOpen((o) => !o)}
                aria-expanded={filesSectionOpen}
              >
                <span className="library-section__chevron" aria-hidden>
                  {filesSectionOpen ? '▼' : '▶'}
                </span>
                Files
                {files.length > 0 ? ` (${files.length})` : ''}
              </button>
            </h3>
            {filesSectionOpen && (
              <div className="library-section__body file-list">
                {files.length === 0 ? (
                  <p className="no-files">No files available</p>
                ) : (
                  <>
                    <div className="file-list-header">
                      <span>Selected: {selectedFiles.size} files</span>
                      <button
                        className="analyze-button"
                        onClick={handleAnalyzeClick}
                        disabled={analyzing || selectedFiles.size === 0}
                      >
                        {analyzing ? 'Analyzing...' : 'Analyze Selected'}
                      </button>
                    </div>
                    <ul>
                      {files.map((file, index) => (
                        <li
                          key={file.id || index}
                          className={`file-item ${selectedFiles.has(file) ? 'selected' : ''}`}
                        >
                          <label className="file-label">
                            <input
                              type="checkbox"
                              checked={selectedFiles.has(file)}
                              onChange={() => handleFileSelect(file)}
                            />
                            <span className="file-name">
                              {file.customName || file.originalName}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </section>

          <section
            className="library-section library-section--graphs"
            aria-labelledby="library-section-graphs"
          >
            <h3 id="library-section-graphs" className="library-section__title">
              <button
                type="button"
                className="library-section__toggle"
                onClick={() => setGraphsSectionOpen((o) => !o)}
                aria-expanded={graphsSectionOpen}
              >
                <span className="library-section__chevron" aria-hidden>
                  {graphsSectionOpen ? '▼' : '▶'}
                </span>
                Graphs
                {savedGraphs.length > 0 ? ` (${savedGraphs.length})` : ''}
              </button>
            </h3>
            {graphsSectionOpen && (
              <div className="library-section__body saved-graphs-section">
                {graphData && (
                  <button
                    onClick={handleSaveClick}
                    disabled={saving}
                    className="save-current-button"
                  >
                    {saving ? 'Saving...' : 'Save Current Graph'}
                  </button>
                )}
                <div className="saved-graphs">
                  {savedGraphs.length === 0 ? (
                    <p className="no-saved-graphs">No saved graphs yet.</p>
                  ) : (
                    savedGraphs.map((graph, index) => (
                      <div key={index} className="saved-graph-item">
                        <div className="graph-info">
                          <strong>{graph.metadata.name || 'Unnamed Graph'}</strong>
                          <small>
                            Nodes: {graph.metadata.nodeCount} |
                            Edges: {graph.metadata.edgeCount}
                          </small>
                          <small>
                            Saved:{' '}
                            {new Date(graph.metadata.generatedAt).toLocaleDateString()}
                          </small>
                        </div>
                        <button
                          onClick={() => handleLoadGraph(graph.filename)}
                          className="load-button"
                        >
                          Load
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </aside>

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
        <div className="visualization-header">
          <h3>Visualization: {currentSource?.name || 'Unnamed Graph'}</h3>
        </div>
        <div className="graph-container">
          <GraphVisualization
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

export default LibraryVisualize;
import { useState, useEffect } from 'react';
import GraphVisualization from './GraphVisualization';
import './LibraryVisualize.css';

function LibraryVisualize() {
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
  const [showSidebar, setShowSidebar] = useState(true);

  // Add responsive width calculation
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });

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

  const getBaseUrl = () => {
    if (process.env.NODE_ENV === 'development') {
      return 'http://localhost:5001';
    }
    // In production, use the full domain
    return 'https://talk-graph.onrender.com';
  };

  const handleApiRequest = async (url, options = {}) => {
    const baseUrl = getBaseUrl();
    const fullUrl = `${baseUrl}${url}`;
    
    try {
      console.log('Request details:', {
        url: fullUrl,
        method: options.method || 'GET',
        headers: options.headers,
        body: options.body ? JSON.parse(options.body) : undefined
      });

      const response = await fetch(fullUrl, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        }
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response body:', errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      try {
        const data = await response.json();
        console.log('Response data:', data);
        return data;
      } catch (jsonError) {
        console.error('JSON parsing error:', jsonError);
        throw new Error(`Invalid response from server at ${url} (${response.status})`);
      }
    } catch (error) {
      console.error(`API request failed for ${fullUrl}:`, error);
      throw error;
    }
  };

  const fetchFiles = async () => {
    try {
      const data = await handleApiRequest('/api/files');
      if (data && data.files) {
        setFiles(data.files);
      }
    } catch (error) {
      console.error('Error fetching files:', error);
      setError(`Failed to fetch files: ${error.message}`);
    }
  };

  const fetchSavedGraphs = async () => {
    try {
      const data = await handleApiRequest('/api/graphs');
      if (data && data.graphs) {
        setSavedGraphs(data.graphs);
      }
    } catch (error) {
      console.warn('Error fetching saved graphs:', error);
      setSavedGraphs([]);
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
        sourceFiles: Array.from(selectedFiles).map(f => f.originalName),
        generatedAt: new Date().toISOString(),
        nodeCount: graphData.nodes.length,
        edgeCount: graphData.links.length
      };

      const data = await handleApiRequest('/api/graphs/save', {
        method: 'POST',
        body: JSON.stringify({
          graph: graphToSave,
          metadata
        })
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
      setError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleLoadGraph = async (filename) => {
    try {
      const baseUrl = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5001';
      const response = await fetch(`${baseUrl}/api/graphs/${filename}`);
      const data = await response.json();
      
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

        setGraphData({
          nodes: graphData.nodes,
          links: reconstructedLinks
        });
        
        setSelectedFiles(new Set());
        setCurrentSource(data.data.metadata);
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Error loading graph:', error);
      setError('Failed to load graph');
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
          try {
            console.log('Fetching file:', file.filename);
            const fileData = await handleApiRequest(`/api/files/${file.filename}`);
            if (!fileData.success || !fileData.content) {
              throw new Error(`Failed to read file: ${file.originalName}`);
            }

            console.log('Analyzing file:', file.originalName);
            const analysisData = await handleApiRequest('/api/analyze', {
              method: 'POST',
              body: JSON.stringify({ 
                content: fileData.content,
                context: context
              })
            });

            if (!analysisData.success || !analysisData.data) {
              throw new Error(`Analysis failed for: ${file.originalName}`);
            }

            return {
              filename: file.originalName,
              data: analysisData.data
            };
          } catch (error) {
            console.error('Error processing file:', file.originalName, error);
            throw new Error(`Error processing ${file.originalName}: ${error.message}`);
          }
        })
      );

      const combinedGraph = combineGraphs(fileResults.map(r => r.data));
      setGraphData(combinedGraph);

    } catch (error) {
      console.error('Analysis error:', error);
      setError(`Failed to analyze files: ${error.message}`);
      setGraphData(null);
    } finally {
      setAnalyzing(false);
      setShowContextModal(false);
      setAdditionalContext('');
    }
  };

  const combineGraphs = (graphs) => {
    const nodeMap = new Map();
    const links = new Set();
    
    graphs.forEach(graph => {
      graph.nodes.forEach(node => {
        if (!nodeMap.has(node.id)) {
          nodeMap.set(node.id, {
            ...node,
            sources: new Set([node.source || 'unknown'])
          });
        } else {
          nodeMap.get(node.id).sources.add(node.source || 'unknown');
        }
      });

      graph.links.forEach(link => {
        links.add(JSON.stringify({
          ...link,
          sources: [link.source || 'unknown']
        }));
      });
    });

    const nodes = Array.from(nodeMap.values()).map(node => ({
      ...node,
      sources: Array.from(node.sources),
      size: 20 + (node.sources.length * 5),
      color: node.sources.length > 1 ? '#e74c3c' : '#69b3a2'
    }));

    const combinedLinks = Array.from(links).map(link => JSON.parse(link));

    return { nodes, links: combinedLinks };
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

  return (
    <div className="library-visualize">
      {/* Mobile-friendly layout structure */}
      <div className={`sidebar ${dimensions.width <= 768 ? 'mobile' : ''} ${showSidebar ? 'visible' : 'hidden'}`}>
        <div className="sidebar-header">
          <h2>File Library</h2>
          {dimensions.width <= 768 && (
            <button 
              className="toggle-sidebar"
              onClick={() => setShowSidebar(prev => !prev)}
            >
              {showSidebar ? '×' : '☰'}
            </button>
          )}
        </div>
        {error && (
          <div className="error">
            {error}
            <button onClick={fetchFiles} className="retry-button">
              Retry
            </button>
          </div>
        )}
        <div className="file-list">
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
        
        <div className="saved-graphs-section">
          <h2>Saved Graphs</h2>
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
            {savedGraphs.map((graph, index) => (
              <div key={index} className="saved-graph-item">
                <div className="graph-info">
                  <strong>{graph.metadata.name || 'Unnamed Graph'}</strong>
                  <small>
                    Nodes: {graph.metadata.nodeCount} | 
                    Edges: {graph.metadata.edgeCount}
                  </small>
                  <small>Saved: {new Date(graph.metadata.savedAt).toLocaleDateString()}</small>
                </div>
                <button 
                  onClick={() => handleLoadGraph(graph.filename)}
                  className="load-button"
                >
                  Load
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add floating button for mobile */}
      {dimensions.width <= 768 && !showSidebar && (
        <button 
          className="mobile-sidebar-toggle"
          onClick={() => setShowSidebar(true)}
          aria-label="Open Library"
        >
          <span className="toggle-icon">☰</span>
          <span className="toggle-text">Library</span>
        </button>
      )}

      <div className="visualization-panel">
        <div className="visualization-header">
          <h3>Visualization: {currentSource?.sourceFile || 'Unnamed Graph'}</h3>
        </div>
        <div className="graph-container">
          <GraphVisualization 
            data={graphData || { nodes: [], links: [] }}
            onDataUpdate={handleGraphDataUpdate}
            width={dimensions.width > 768 ? dimensions.width - 300 : dimensions.width}
            height={dimensions.height - 100}
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
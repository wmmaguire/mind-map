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

  useEffect(() => {
    fetchFiles();
    fetchSavedGraphs();
  }, []);

  const getBaseUrl = () => {
    return process.env.NODE_ENV === 'development' ? 'http://localhost:5001' : '';
  };

  const fetchFiles = async () => {
    try {
      const baseUrl = getBaseUrl();
      const response = await fetch(`${baseUrl}/api/files`);
      const data = await response.json();
      setFiles(data.files || []);
    } catch (error) {
      console.error('Error fetching files:', error);
      setError('Failed to fetch files');
    }
  };

  const fetchSavedGraphs = async () => {
    try {
      const baseUrl = getBaseUrl();
      const response = await fetch(`${baseUrl}/api/graphs`);
      const data = await response.json();
      setSavedGraphs(data.graphs || []);
    } catch (error) {
      console.error('Error fetching saved graphs:', error);
      setError('Failed to fetch saved graphs');
    }
  };

  const handleSaveClick = () => {
    // Generate default name from selected files
    const defaultName = Array.from(selectedFiles)
      .map(f => f.customName || f.originalName.replace(/\.[^/.]+$/, '')) // Remove file extension
      .join(' + ');
    
    setGraphName(defaultName);
    setGraphDescription(`Graph generated from ${selectedFiles.size} source${selectedFiles.size > 1 ? 's' : ''}`);
    setShowSaveDialog(true);
  };

  const handleSaveGraph = async () => {
    if (!graphData || !graphName.trim()) return;

    try {
      setSaving(true);
      const baseUrl = getBaseUrl();
      
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

      const response = await fetch(`${baseUrl}/api/graphs/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          graph: graphToSave,
          metadata
        })
      });

      const data = await response.json();
      
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

  const handleAnalyzeMultiple = async () => {
    if (selectedFiles.size === 0) return;

    try {
      setAnalyzing(true);
      setError(null);
      const baseUrl = getBaseUrl();
      
      const fileResults = await Promise.all(
        Array.from(selectedFiles).map(async (file) => {
          const response = await fetch(`${baseUrl}/api/files/${file.filename}`);
          const data = await response.json();
          
          if (!data.success) {
            throw new Error(`Failed to read file: ${file.originalName}`);
          }

          const analysisResponse = await fetch(`${baseUrl}/api/analyze`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ content: data.content })
          });

          const analysisData = await analysisResponse.json();
          if (!analysisData.success) {
            throw new Error(`Analysis failed for: ${file.originalName}`);
          }

          return {
            filename: file.originalName,
            data: analysisData.data
          };
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

  return (
    <div className="library-visualize">
      <div className="sidebar">
        <h2>File Library</h2>
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
                  onClick={handleAnalyzeMultiple}
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
        
        <h3>Saved Graphs</h3>
        <div className="saved-graphs">
          {savedGraphs.map((graph, index) => (
            <div key={index} className="saved-graph-item">
              <div className="graph-info">
                <strong>{graph.metadata.sourceFile || 'Unnamed Graph'}</strong>
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

      <div className="visualization-panel">
        {graphData && (
          <div className="visualization-controls">
            <button 
              onClick={handleSaveClick}
              disabled={saving || !graphData}
              className="save-button"
            >
              Save Graph
            </button>
          </div>
        )}
        {graphData ? (
          <>
            <div className="visualization-header">
              <h3>Visualization: {currentSource?.sourceFile || 'Unnamed Graph'}</h3>
            </div>
            <div className="graph-container">
              <GraphVisualization data={graphData} />
            </div>
          </>
        ) : (
          <div className="empty-state">
            {analyzing ? 'Analyzing file...' : 'Select a file from the library to visualize'}
          </div>
        )}
      </div>

      {/* Enhanced Save Dialog */}
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
                <label htmlFor="graphName">
                  Graph Name <span className="required">*</span>
                </label>
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
      )}
    </div>
  );
}

export default LibraryVisualize;
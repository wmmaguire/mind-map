import { useState, useEffect } from 'react';
import GraphVisualization from './GraphVisualization';
import './LibraryVisualize.css';

function LibraryVisualize() {
  const [files, setFiles] = useState([]);
  const [savedGraphs, setSavedGraphs] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [graphData, setGraphData] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchFiles();
    fetchSavedGraphs();
  }, []);

  const fetchFiles = async () => {
    try {
      const baseUrl = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5001';
      console.log('Fetching files from:', `${baseUrl}/api/files`);
      
      const response = await fetch(`${baseUrl}/api/files`);
      console.log('Response status:', response.status);
      
      const data = await response.json();
      console.log('Files response data:', data);

      // Check if data.files exists, even if success is false
      if (data.files) {
        setFiles(data.files);
        setError(null);
      } else {
        console.error('No files array in response:', data);
        setFiles([]);
        setError('No files found');
      }
    } catch (error) {
      console.error('Error fetching files:', error);
      setFiles([]);
      setError(`Failed to load files: ${error.message}`);
    }
  };

  const fetchSavedGraphs = async () => {
    try {
      const baseUrl = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5001';
      const response = await fetch(`${baseUrl}/api/graphs`);
      const data = await response.json();
      
      if (data.success) {
        setSavedGraphs(data.graphs);
      }
    } catch (error) {
      console.error('Error fetching saved graphs:', error);
    }
  };

  const handleSaveGraph = async () => {
    if (!graphData) return;

    try {
      setSaving(true);
      const baseUrl = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5001';
      
      // Prepare graph data for saving
      const graphToSave = {
        nodes: graphData.nodes,
        links: graphData.links.map(link => ({
          ...link,
          source: typeof link.source === 'object' ? link.source.id : link.source,
          target: typeof link.target === 'object' ? link.target.id : link.target
        }))
      };

      const metadata = {
        sourceFile: selectedFile?.originalName,
        generatedAt: new Date().toISOString(),
        description: 'Graph generated from text analysis',
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
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Error saving graph:', error);
      setError('Failed to save graph');
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
        // Reconstruct the graph data with proper references
        const graphData = data.data.graph;
        
        // Create a map of node IDs to node objects
        const nodeMap = new Map();
        graphData.nodes.forEach(node => {
          nodeMap.set(node.id, node);
        });

        // Reconstruct links with proper references
        const reconstructedLinks = graphData.links.map(link => ({
          ...link,
          source: nodeMap.get(typeof link.source === 'object' ? link.source.id : link.source),
          target: nodeMap.get(typeof link.target === 'object' ? link.target.id : link.target)
        }));

        // Set the reconstructed graph data
        setGraphData({
          nodes: graphData.nodes,
          links: reconstructedLinks
        });
        
        setSelectedFile(null);
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Error loading graph:', error);
      setError('Failed to load graph');
    }
  };

  const handleAnalyze = async (file) => {
    try {
      setAnalyzing(true);
      setSelectedFile(file);
      setError(null);

      const baseUrl = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5001';
      const response = await fetch(`${baseUrl}/api/files/${file.filename}`);
      const data = await response.json();

      if (data.success && data.content) {
        // Analyze the content
        const analysisResponse = await fetch(`${baseUrl}/api/analyze`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: data.content })
        });

        const analysisData = await analysisResponse.json();
        if (analysisData.success) {
          setGraphData(analysisData.data);
        } else {
          throw new Error(analysisData.error || 'Analysis failed');
        }
      } else {
        throw new Error(data.error || 'Failed to read file');
      }
    } catch (error) {
      console.error('Analysis error:', error);
      setError(`Failed to analyze file: ${error.message}`);
      setGraphData(null);
    } finally {
      setAnalyzing(false);
    }
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
            <p className="no-files">
              {error ? 'Failed to load files' : 'No files available'}
            </p>
          ) : (
            <ul>
              {files.map((file, index) => (
                <li 
                  key={file.id || index}
                  className={`file-item ${selectedFile === file ? 'selected' : ''}`}
                >
                  <span className="file-name">
                    {file.customName || file.originalName}
                  </span>
                  <button
                    className="analyze-button"
                    onClick={() => handleAnalyze(file)}
                    disabled={analyzing && selectedFile === file}
                  >
                    {analyzing && selectedFile === file ? 'Analyzing...' : 'Visualize'}
                  </button>
                </li>
              ))}
            </ul>
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
              onClick={handleSaveGraph}
              disabled={saving || !graphData}
              className="save-button"
            >
              {saving ? 'Saving...' : 'Save Graph'}
            </button>
          </div>
        )}
        {graphData ? (
          <>
            <div className="visualization-header">
              <h3>Visualization: {selectedFile?.customName || selectedFile?.originalName}</h3>
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
    </div>
  );
}

export default LibraryVisualize;
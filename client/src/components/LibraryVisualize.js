import { useState, useEffect } from 'react';
import GraphVisualization from './GraphVisualization';
import './LibraryVisualize.css';

function LibraryVisualize() {
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [graphData, setGraphData] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchFiles();
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
      </div>

      <div className="visualization-panel">
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
import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import './Modal.css';
import './Library.css';

function Library({ onClose }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [graphData, setGraphData] = useState(null);

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      const baseUrl = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5001';
      const response = await fetch(`${baseUrl}/api/files`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch files');
      }

      const data = await response.json();
      setFiles(data.files);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (file) => {
    try {
      setSelectedFile(file);
      setAnalyzing(true);
      setError(null);

      const baseUrl = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5001';
      console.log('Fetching file:', file);
      
      const filename = file.filename || file.originalName;
      const response = await fetch(`${baseUrl}/api/files/${encodeURIComponent(filename)}`, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      // First try to get the response as text to debug
      const responseText = await response.text();
      console.log('Raw response:', responseText);

      // Try to parse the text as JSON
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('JSON Parse Error:', parseError);
        console.error('Response text:', responseText);
        throw new Error('Invalid JSON response from server');
      }
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch file');
      }

      console.log('File content received, length:', data.content.length);
      await analyzeContent(data.content);
    } catch (error) {
      console.error('File fetch error:', error);
      setError('Failed to load file: ' + error.message);
      setAnalyzing(false);
    }
  };

  const analyzeContent = async (content) => {
    try {
      const baseUrl = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5001';
      console.log('Sending content for analysis, length:', content.length);
      
      const response = await fetch(`${baseUrl}/api/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ content })
      });

      // First get response as text for debugging
      const responseText = await response.text();
      console.log('Analysis raw response:', responseText);

      // Try to parse the response
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Analysis JSON Parse Error:', parseError);
        console.error('Analysis response text:', responseText);
        throw new Error('Invalid JSON response from analysis server');
      }
      
      if (!data.success) {
        throw new Error(data.error || 'Analysis failed');
      }

      setGraphData(data.data);
    } catch (error) {
      console.error('Analysis error:', error);
      setError('Failed to analyze content: ' + error.message);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>File Library</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {loading ? (
          <div className="library-loading">Loading files...</div>
        ) : error ? (
          <div className="library-error">{error}</div>
        ) : files.length === 0 ? (
          <div className="library-empty">
            <p>No files in library</p>
            <p>Upload some files to get started!</p>
          </div>
        ) : (
          <div className="library-content">
            <div className="file-list">
              {files.map((file) => (
                <div 
                  key={file.filename || file.originalName}
                  className={`file-item ${selectedFile?.filename === file.filename ? 'selected' : ''}`}
                  onClick={() => handleFileSelect(file)}
                >
                  <span className="file-icon">
                    {file.fileType?.includes('audio') ? '🎵' : '📄'}
                  </span>
                  <div className="file-details">
                    <div className="file-name">{file.customName || file.originalName}</div>
                    <div className="file-meta">
                      {new Date(file.uploadDate).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {analyzing && (
              <div className="analyzing-overlay">
                <div className="analyzing-spinner"></div>
                <p>Analyzing content...</p>
              </div>
            )}

            {graphData && !analyzing && (
              <div className="analysis-results">
                <h3>Analysis Results</h3>
                <div className="graph-data">
                  <pre>{JSON.stringify(graphData, null, 2)}</pre>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

Library.propTypes = {
  onClose: PropTypes.func.isRequired
};

export default Library; 
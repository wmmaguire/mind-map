import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { apiRequest, getApiErrorMessage } from '../api/http';
import { useSession } from '../context/SessionContext';
import './Modal.css';
import './Library.css';

function Library({ onClose }) {
  const { sessionId } = useSession();
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
      const data = await apiRequest('/api/files');
      setFiles(data.files);
    } catch (error) {
      setError(getApiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (file) => {
    try {
      setSelectedFile(file);
      setAnalyzing(true);
      setError(null);

      console.log('Fetching file:', file);
      
      const filename = file.filename || file.originalName;
      const data = await apiRequest(
        `/api/files/${encodeURIComponent(filename)}`,
        {
          headers: {
            Accept: 'application/json',
          },
        }
      );

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch file');
      }

      console.log('File content received, length:', data.content.length);
      await analyzeContent(data.content, file);
    } catch (error) {
      console.error('File fetch error:', error);
      setError('Failed to load file: ' + getApiErrorMessage(error));
      setAnalyzing(false);
    }
  };

  const analyzeContent = async (content, file) => {
    try {
      console.log('Sending content for analysis, length:', content.length);
      
      const data = await apiRequest('/api/analyze', {
        method: 'POST',
        json: {
          content,
          sessionId,
          sourceFiles: [file._id || file.filename],
        },
      });

      if (!data.success) {
        throw new Error(data.error || 'Analysis failed');
      }

      setGraphData(data.data);
    } catch (error) {
      console.error('Analysis error:', error);
      setError('Failed to analyze content: ' + getApiErrorMessage(error));
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
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { apiRequest, getApiErrorMessage } from '../api/http';
import { useSession } from '../context/SessionContext';
import { useIdentity } from '../context/IdentityContext';
import './Modal.css';
import './Library.css';

function Library({ onClose }) {
  const { sessionId } = useSession();
  const { userId } = useIdentity();
  const listingAuth = useMemo(
    () => (userId ? { auth: { userId } } : {}),
    [userId]
  );
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [graphData, setGraphData] = useState(null);

  const fetchFiles = useCallback(async () => {
    if (!sessionId) return;
    try {
      const data = await apiRequest(
        `/api/files?sessionId=${encodeURIComponent(sessionId)}`,
        listingAuth
      );
      setFiles(data.files);
    } catch (error) {
      setError(getApiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [sessionId, listingAuth]);

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      return;
    }
    fetchFiles();
  }, [sessionId, fetchFiles]);

  const handleFileSelect = async (file) => {
    try {
      setSelectedFile(file);
      setAnalyzing(true);
      setError(null);

      const filename = file.filename || file.originalName;
      const data = await apiRequest(
        `/api/files/${encodeURIComponent(filename)}`,
        {
          headers: {
            Accept: 'application/json',
          },
          ...listingAuth,
        }
      );

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch file');
      }

      await analyzeContent(data.content, file);
    } catch (error) {
      console.error('File fetch error:', error);
      setError('Failed to load file: ' + getApiErrorMessage(error));
      setAnalyzing(false);
    }
  };

  const analyzeContent = async (content, file) => {
    try {
      const data = await apiRequest('/api/analyze', {
        method: 'POST',
        json: {
          content,
          sessionId,
          sourceFiles: [file._id || file.filename],
        },
        ...listingAuth,
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
import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import './Library.css';

export default function Library({ onClose }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      const baseUrl = process.env.NODE_ENV === 'production' 
        ? window.location.origin
        : 'http://localhost:5001';
      
      console.log('Fetching files from:', `${baseUrl}/api/files`); // Debug log
      
      const response = await fetch(`${baseUrl}/api/files`, {
        headers: {
          'Accept': 'application/json'
        }
      });
      
      // Check if response is HTML instead of JSON
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        throw new Error('Received HTML response instead of JSON. API endpoint might be incorrect.');
      }

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Server error:', errorData);
        throw new Error(errorData.error || 'Failed to fetch files');
      }

      const data = await response.json();
      console.log('Received data:', data);
      setFiles(data.files);
    } catch (error) {
      console.error('Error fetching files:', error);
      setError(`Failed to load files: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="library-modal">
      <div className="library-content">
        <button className="close-button" onClick={onClose}>&times;</button>
        <h2>Your Uploads</h2>

        {loading && <div className="loading">Loading...</div>}
        
        {error && <div className="error-message">{error}</div>}

        {!loading && !error && (
          <div className="files-grid">
            {files.length === 0 ? (
              <p className="no-files">No files uploaded yet</p>
            ) : (
              files.map((metadata) => (
                <div 
                  key={metadata.filename}
                  className="file-card"
                >
                  <div className="file-icon">
                    {metadata.fileType === 'audio/mpeg' ? '🎵' : '📄'}
                  </div>
                  <div className="file-info">
                    <h3>{metadata.customName}</h3>
                    <p className="file-details">
                      <span>{formatDate(metadata.uploadDate)}</span>
                      <span>{formatFileSize(metadata.size)}</span>
                    </p>
                  </div>
                </div>
              ))
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
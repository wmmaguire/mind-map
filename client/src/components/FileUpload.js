import React, { useState } from 'react';
import PropTypes from 'prop-types';
import './Modal.css';
import './FileUpload.css';

function FileUpload({ onClose }) {
  const [file, setFile] = useState(null);
  const [customName, setCustomName] = useState('');
  const [uploadStatus, setUploadStatus] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const handleUpload = async () => {
    if (!file || !customName.trim()) {
      setUploadStatus('Please select a file and provide a name');
      return;
    }

    const currentSessionId = window.currentSessionId;
    if (!currentSessionId) {
      setUploadStatus('No active session. Please try again.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('customName', customName.trim());
    formData.append('sessionId', currentSessionId);

    try {
      setUploadStatus('Uploading...');
      const baseUrl = process.env.NODE_ENV === 'production' 
        ? window.location.origin 
        : 'http://localhost:5001';

      const response = await fetch(`${baseUrl}/api/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      setUploadStatus('File uploaded successfully!');
      setFile(null);
      setCustomName('');
      setTimeout(onClose, 1500);
    } catch (error) {
      console.error('Upload error:', error);
      setUploadStatus(`Upload failed: ${error.message}`);
    }
  };

  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      // Set default custom name as file name without extension
      setCustomName(selectedFile.name.replace(/\.[^/.]+$/, ''));
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      setFile(droppedFile);
      setCustomName(droppedFile.name.replace(/\.[^/.]+$/, ''));
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Upload File</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        
        <div 
          className={`upload-area ${isDragging ? 'dragging' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}

        >
          {file ? (
            <div className="file-info">
              <span className="file-name">{file.name}</span>
              <button className="remove-file" onClick={() => setFile(null)}>×</button>
            </div>
          ) : (
            <div className="upload-prompt">
              <span className="upload-icon">📁</span>
              <p>Drag & drop a file here or click to browse</p>
              <p className="file-types">Supported formats: .txt, .md</p>
            </div>
          )}
          <input
            type="file"
            accept=".txt,.md"
            onChange={handleFileChange}
            className="file-input"
          />
        </div>

        <div className="form-group">
          <label htmlFor="customName">Custom Name:</label>
          <input
            id="customName"
            type="text"
            placeholder="Enter a name for your file"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            className="name-input"
          />
        </div>

        {uploadStatus && (
          <div className={`upload-status ${uploadStatus.includes('failed') ? 'error' : ''}`}>
            {uploadStatus}
          </div>
        )}

        <div className="modal-actions">
          <button 
            className="upload-button" 
            onClick={handleUpload} 
            disabled={!file || !customName.trim()}
          >
            Upload File
          </button>
        </div>
      </div>
    </div>
  );
}

FileUpload.propTypes = {
  onClose: PropTypes.func.isRequired
};

export default FileUpload; 
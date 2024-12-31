import { useState } from 'react';
import PropTypes from 'prop-types';
import './FileUpload.css';

export default function FileUpload({ onClose }) {
  const [file, setFile] = useState(null);
  const [customName, setCustomName] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const droppedFile = e.dataTransfer.files[0];
    if (isValidFile(droppedFile)) {
      setFile(droppedFile);
    }
  };

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (isValidFile(selectedFile)) {
      setFile(selectedFile);
      const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, '');
      setCustomName(nameWithoutExt);
    }
  };

  const isValidFile = (file) => {
    if (!file) return false;
    const validTypes = ['audio/mpeg', 'text/plain'];
    if (!validTypes.includes(file.type)) {
      setUploadStatus('Error: Please upload an MP3 or text file');
      return false;
    }
    return true;
  };

  const handleUpload = async () => {
    if (!file || !customName.trim()) {
      setUploadStatus('Please select a file and provide a name');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('customName', customName.trim());

    try {
      setUploadStatus('Uploading...');
      const baseUrl = process.env.NODE_ENV === 'production' 
        ? window.location.origin 
        : 'http://localhost:5001';

      const response = await fetch(`${baseUrl}/api/upload`, {
        method: 'POST',
        body: formData, // Don't set Content-Type header - browser will set it with boundary
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const data = await response.json();
      console.log('Upload successful:', data);
      setUploadStatus('File uploaded successfully!');
      
      // Clear the form
      setFile(null);
      setCustomName('');
      
      if (onClose) {
        setTimeout(onClose, 1500);
      }
    } catch (error) {
      console.error('Upload error:', error);
      setUploadStatus(error.message || 'Upload failed. Please try again.');
    }
  };

  return (
    <div className="upload-modal">
      <div className="upload-content">
        <button className="close-button" onClick={onClose}>&times;</button>
        <h2>Upload File</h2>
        
        <div 
          className={`drop-zone ${dragActive ? 'active' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          {file ? (
            <div className="file-info">
              <p>{file.name}</p>
              <button 
                className="remove-file"
                onClick={() => {
                  setFile(null);
                  setCustomName('');
                }}
              >
                Remove
              </button>
            </div>
          ) : (
            <>
              <p>Drag and drop your file here or</p>
              <label className="file-input-label">
                Browse Files
                <input
                  type="file"
                  accept=".mp3,.txt"
                  onChange={handleFileSelect}
                  className="file-input"
                />
              </label>
              <p className="file-types">Supported files: MP3, TXT</p>
            </>
          )}
        </div>

        {file && (
          <div className="filename-input">
            <label htmlFor="customName">Name your file:</label>
            <input
              type="text"
              id="customName"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Enter a name for your file"
            />
          </div>
        )}

        {uploadStatus && (
          <p className={`upload-status ${uploadStatus.includes('Error') || uploadStatus.includes('failed') ? 'error' : ''}`}>
            {uploadStatus}
          </p>
        )}

        <div className="upload-actions">
          <button 
            className="button secondary"
            onClick={onClose}
          >
            Cancel
          </button>
          <button 
            className="button primary"
            onClick={handleUpload}
            disabled={!file || !customName.trim()}
          >
            Upload
          </button>
        </div>
      </div>
    </div>
  );
}

FileUpload.propTypes = {
  onClose: PropTypes.func.isRequired
}; 
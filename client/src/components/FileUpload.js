import React, { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { apiRequest, getApiErrorMessage } from '../api/http';
import { useSession } from '../context/SessionContext';
import './Modal.css';
import './FileUpload.css';

function FileUpload({ onClose, onUploadSuccess }) {
  const { sessionId } = useSession();
  const [inputMode, setInputMode] = useState('text');
  const [file, setFile] = useState(null);
  const [customName, setCustomName] = useState('');
  const [uploadStatus, setUploadStatus] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const [audioFile, setAudioFile] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [transcribeModel, setTranscribeModel] = useState('');
  const [transcribeAttempted, setTranscribeAttempted] = useState(false);

  const resetAudioState = useCallback(() => {
    setAudioFile(null);
    setTranscript('');
    setTranscribeModel('');
    setTranscribeAttempted(false);
  }, []);

  const uploadFileToServer = async (uploadFile, name) => {
    if (!sessionId) {
      setUploadStatus('No active session. Please try again.');
      return;
    }
    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('customName', name.trim());
    formData.append('sessionId', sessionId);

    setUploadStatus('Uploading...');

    await apiRequest('/api/upload', {
      method: 'POST',
      body: formData
    });

    setUploadStatus('File uploaded successfully!');
    setFile(null);
    setCustomName('');
    resetAudioState();
    if (onUploadSuccess) onUploadSuccess(true);
    setTimeout(onClose, 1500);
  };

  const handleUpload = async () => {
    if (!file || !customName.trim()) {
      setUploadStatus('Please select a file and provide a name');
      return;
    }

    if (!sessionId) {
      setUploadStatus('No active session. Please try again.');
      return;
    }

    try {
      await uploadFileToServer(file, customName);
    } catch (error) {
      console.error('Upload error:', error);
      setUploadStatus(`Upload failed: ${getApiErrorMessage(error)}`);
    }
  };

  const handleTranscribe = async () => {
    if (!audioFile) {
      setUploadStatus('Select an audio file first.');
      return;
    }
    if (!sessionId) {
      setUploadStatus('No active session. Please try again.');
      return;
    }

    const formData = new FormData();
    formData.append('audio', audioFile);
    formData.append('sessionId', sessionId);

    try {
      setUploadStatus('Transcribing...');
      const data = await apiRequest('/api/transcribe', {
        method: 'POST',
        body: formData
      });
      const text = typeof data.transcript === 'string' ? data.transcript : '';
      setTranscript(text);
      setTranscribeModel(data.model || '');
      setTranscribeAttempted(true);
      setUploadStatus(
        text.length > 0
          ? 'Transcription ready — edit below, then upload as a text source.'
          : 'Transcription returned empty text. You can still edit and upload.'
      );
      if (!customName.trim()) {
        const stamp = new Date().toISOString().slice(0, 10);
        setCustomName(`Transcript ${stamp}`);
      }
    } catch (error) {
      console.error('Transcribe error:', error);
      setUploadStatus(`Transcription failed: ${getApiErrorMessage(error)}`);
    }
  };

  const handleUploadTranscript = async () => {
    if (!customName.trim()) {
      setUploadStatus('Enter a name for this source.');
      return;
    }
    if (!transcript.trim()) {
      setUploadStatus('Nothing to upload — transcript is empty.');
      return;
    }
    if (!sessionId) {
      setUploadStatus('No active session. Please try again.');
      return;
    }

    const safeBase = customName.trim().replace(/[/\\?%*:|"<>]/g, '-');
    const textFile = new File([transcript], `${safeBase}.txt`, {
      type: 'text/plain'
    });

    try {
      await uploadFileToServer(textFile, safeBase);
    } catch (error) {
      console.error('Upload error:', error);
      setUploadStatus(`Upload failed: ${getApiErrorMessage(error)}`);
    }
  };

  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
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

  const handleAudioFileChange = (event) => {
    const selected = event.target.files[0];
    if (selected) {
      setAudioFile(selected);
      setTranscript('');
      setTranscribeModel('');
      setTranscribeAttempted(false);
      setUploadStatus('');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content file-upload-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Upload File</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="file-upload-mode-tabs" role="tablist" aria-label="Source type">
          <button
            type="button"
            role="tab"
            aria-selected={inputMode === 'text'}
            className={`file-upload-mode-tabs__btn ${inputMode === 'text' ? 'is-active' : ''}`}
            onClick={() => {
              setInputMode('text');
              resetAudioState();
              setUploadStatus('');
            }}
          >
            Text file
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={inputMode === 'audio'}
            className={`file-upload-mode-tabs__btn ${inputMode === 'audio' ? 'is-active' : ''}`}
            onClick={() => {
              setInputMode('audio');
              setFile(null);
              setUploadStatus('');
            }}
          >
            Audio → transcript
          </button>
        </div>

        {inputMode === 'text' ? (
          <div key="upload-text-mode">
            <div
              className={`upload-area ${isDragging ? 'dragging' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {file ? (
                <div className="file-info">
                  <span className="file-name">{file.name}</span>
                  <button type="button" className="remove-file" onClick={() => setFile(null)}>
                    ×
                  </button>
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
                value={customName ?? ''}
                onChange={(e) => setCustomName(e.target.value)}
                className="name-input"
              />
            </div>

            {uploadStatus && (
              <div
                className={`upload-status ${uploadStatus.includes('failed') ? 'error' : ''}`}
              >
                {uploadStatus}
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="upload-button"
                onClick={handleUpload}
                disabled={!file || !customName.trim()}
              >
                Upload File
              </button>
            </div>
          </div>
        ) : (
          <div key="upload-audio-mode">
            <p className="file-upload-audio-hint">
              Audio is sent to the server for transcription (OpenAI Whisper). Do not upload
              sensitive recordings you cannot share with the API provider.
            </p>
            <div className="form-group">
              <label htmlFor="audio-file-input">Audio file</label>
              <input
                id="audio-file-input"
                type="file"
                accept="audio/*"
                onChange={handleAudioFileChange}
                className="file-upload-audio-file"
              />
              {audioFile && (
                <div className="file-info file-info--inline">
                  <span className="file-name">{audioFile.name}</span>
                  <button
                    type="button"
                    className="remove-file"
                    onClick={() => {
                      setAudioFile(null);
                      setTranscript('');
                      setTranscribeModel('');
                      setTranscribeAttempted(false);
                    }}
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
            <div className="modal-actions modal-actions--split">
              <button
                type="button"
                className="upload-button upload-button--secondary"
                onClick={handleTranscribe}
                disabled={!audioFile}
              >
                Transcribe
              </button>
            </div>
            {transcribeAttempted ? (
              <div className="form-group">
                <label htmlFor="transcript-body">Transcript (editable)</label>
                <textarea
                  id="transcript-body"
                  className="file-upload-transcript"
                  rows={8}
                  value={transcript ?? ''}
                  onChange={(e) => setTranscript(e.target.value)}
                  spellCheck="true"
                />
                {transcribeModel ? (
                  <p className="file-upload-meta">Model: {transcribeModel}</p>
                ) : null}
              </div>
            ) : null}
            <div className="form-group">
              <label htmlFor="customName-audio">Name for saved source</label>
              <input
                id="customName-audio"
                type="text"
                placeholder="e.g. Meeting notes"
                value={customName ?? ''}
                onChange={(e) => setCustomName(e.target.value)}
                className="name-input"
              />
            </div>
            {uploadStatus && (
              <div
                className={`upload-status ${uploadStatus.includes('failed') ? 'error' : ''}`}
              >
                {uploadStatus}
              </div>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="upload-button"
                onClick={handleUploadTranscript}
                disabled={!transcript.trim() || !customName.trim()}
              >
                Upload transcript as .txt
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

FileUpload.propTypes = {
  onClose: PropTypes.func.isRequired,
  onUploadSuccess: PropTypes.func
};

export default FileUpload;

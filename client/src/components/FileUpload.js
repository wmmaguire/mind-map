import React, { useState, useCallback, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { apiRequest, getApiErrorMessage } from '../api/http';
import { useSession } from '../context/SessionContext';
import {
  validateAudioFileSizeForTranscribe,
  pickMediaRecorderMimeType
} from '../utils/audioRecording';
import './Modal.css';
import './FileUpload.css';

function FileUpload({ onClose, onUploadSuccess }) {
  const { sessionId } = useSession();
  const [inputMode, setInputMode] = useState('text');
  const [file, setFile] = useState(null);
  const [customName, setCustomName] = useState('');
  const [uploadStatus, setUploadStatus] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const [audioSubTab, setAudioSubTab] = useState('upload');
  const [audioFile, setAudioFile] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [transcribeModel, setTranscribeModel] = useState('');
  const [transcribeAttempted, setTranscribeAttempted] = useState(false);

  const [recState, setRecState] = useState('idle');
  const [recordPreviewUrl, setRecordPreviewUrl] = useState(null);

  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const skipRecorderOnStopRef = useRef(false);

  const revokeRecordPreview = useCallback(() => {
    setRecordPreviewUrl((prev) => {
      if (prev) {
        URL.revokeObjectURL(prev);
      }
      return null;
    });
  }, []);

  const abortActiveRecording = useCallback(() => {
    skipRecorderOnStopRef.current = true;
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    } catch {
      /* ignore */
    }
    mediaRecorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    chunksRef.current = [];
    skipRecorderOnStopRef.current = false;
    setRecState('idle');
  }, []);

  const resetAudioState = useCallback(() => {
    abortActiveRecording();
    revokeRecordPreview();
    setAudioSubTab('upload');
    setAudioFile(null);
    setTranscript('');
    setTranscribeModel('');
    setTranscribeAttempted(false);
  }, [abortActiveRecording, revokeRecordPreview]);

  useEffect(() => {
    return () => {
      abortActiveRecording();
      revokeRecordPreview();
    };
  }, [abortActiveRecording, revokeRecordPreview]);

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
      setUploadStatus('Select or record an audio clip first.');
      return;
    }
    const sizeCheck = validateAudioFileSizeForTranscribe(audioFile.size);
    if (!sizeCheck.ok) {
      setUploadStatus(sizeCheck.message);
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
    if (!selected) return;
    const check = validateAudioFileSizeForTranscribe(selected.size);
    if (!check.ok) {
      setUploadStatus(check.message);
      return;
    }
    setAudioFile(selected);
    setTranscript('');
    setTranscribeModel('');
    setTranscribeAttempted(false);
    setUploadStatus('');
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setUploadStatus(
        'Recording is not supported in this browser. Use Upload file or try Chrome / Firefox / Edge.'
      );
      return;
    }
    setUploadStatus('');
    revokeRecordPreview();
    setAudioFile(null);
    setTranscript('');
    setTranscribeModel('');
    setTranscribeAttempted(false);
    chunksRef.current = [];
    skipRecorderOnStopRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMediaRecorderMimeType();
      const mr = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunksRef.current.push(ev.data);
        }
      };

      mr.onstop = () => {
        if (skipRecorderOnStopRef.current) {
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
          }
          return;
        }
        const blob = new Blob(chunksRef.current, {
          type: mr.mimeType || 'audio/webm'
        });
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        mediaRecorderRef.current = null;
        chunksRef.current = [];

        const sizeCheck = validateAudioFileSizeForTranscribe(blob.size);
        if (!sizeCheck.ok) {
          setUploadStatus(sizeCheck.message);
          setRecState('idle');
          return;
        }

        const ext = blob.type.includes('mp4') ? 'm4a' : 'webm';
        const fname = `recording-${Date.now()}.${ext}`;
        const fileFromBlob = new File([blob], fname, { type: blob.type || 'audio/webm' });
        setAudioFile(fileFromBlob);
        setRecordPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
        setRecState('stopped');
        setUploadStatus('Recording ready — preview below, then Transcribe.');
      };

      mr.start(250);
      setRecState('recording');
    } catch (err) {
      console.error('getUserMedia error:', err);
      setUploadStatus(
        `Microphone access failed: ${err?.message || 'Permission denied or no microphone.'}`
      );
      streamRef.current = null;
      mediaRecorderRef.current = null;
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recState === 'recording') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const discardRecording = () => {
    revokeRecordPreview();
    setAudioFile(null);
    setRecState('idle');
    setUploadStatus('');
  };

  const setAudioSubTabSafe = (tab) => {
    if (tab === audioSubTab) return;
    if (recState === 'recording') {
      setUploadStatus('Stop recording before switching source.');
      return;
    }
    abortActiveRecording();
    revokeRecordPreview();
    setAudioSubTab(tab);
    setAudioFile(null);
    setTranscript('');
    setTranscribeModel('');
    setTranscribeAttempted(false);
    setRecState('idle');
    setUploadStatus('');
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
              Audio is sent to the server for transcription (OpenAI Whisper). Do not record or
              upload sensitive audio you cannot share with the API provider. Max size per clip:{' '}
              <strong>25 MB</strong>.
            </p>

            <div
              className="file-upload-audio-subtabs"
              role="tablist"
              aria-label="Audio source"
            >
              <button
                type="button"
                role="tab"
                aria-selected={audioSubTab === 'upload'}
                className={`file-upload-audio-subtabs__btn ${
                  audioSubTab === 'upload' ? 'is-active' : ''
                }`}
                onClick={() => setAudioSubTabSafe('upload')}
                disabled={recState === 'recording'}
              >
                Upload file
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={audioSubTab === 'record'}
                className={`file-upload-audio-subtabs__btn ${
                  audioSubTab === 'record' ? 'is-active' : ''
                }`}
                onClick={() => setAudioSubTabSafe('record')}
                disabled={recState === 'recording'}
              >
                Record
              </button>
            </div>

            {audioSubTab === 'upload' ? (
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
                        setUploadStatus('');
                      }}
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="file-upload-record-panel">
                {recState === 'recording' ? (
                  <div className="file-upload-record-active">
                    <p className="file-upload-record-indicator" role="status">
                      Recording… speak now.
                    </p>
                    <button
                      type="button"
                      className="upload-button upload-button--danger"
                      onClick={stopRecording}
                    >
                      Stop
                    </button>
                  </div>
                ) : recState === 'stopped' && recordPreviewUrl ? (
                  <div className="file-upload-record-preview">
                    <audio
                      className="file-upload-record-audio"
                      controls
                      src={recordPreviewUrl}
                      aria-label="Recording preview"
                    />
                    <div className="file-upload-record-actions">
                      <button
                        type="button"
                        className="upload-button upload-button--secondary"
                        onClick={discardRecording}
                      >
                        Discard
                      </button>
                      <button
                        type="button"
                        className="upload-button"
                        onClick={startRecording}
                      >
                        Record again
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="upload-button"
                    onClick={startRecording}
                  >
                    Start recording
                  </button>
                )}
              </div>
            )}

            <div className="modal-actions modal-actions--split">
              <button
                type="button"
                className="upload-button upload-button--secondary"
                onClick={handleTranscribe}
                disabled={!audioFile || recState === 'recording'}
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

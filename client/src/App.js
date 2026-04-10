import React, { useState, useCallback } from 'react';
import { Routes, Route } from 'react-router-dom';
import FileUpload from './components/FileUpload';
import LibraryVisualize from './components/LibraryVisualize';
import GiveFeedbackControl from './components/GiveFeedbackControl';
import GuestIdentityBanner from './components/GuestIdentityBanner';
import GraphPlaybackBanner from './components/GraphPlaybackBanner';
import PasswordResetPage from './components/PasswordResetPage';
import './App.css';

function App() {
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [fileRefreshToken, setFileRefreshToken] = useState(0);

  const handleUploadComplete = useCallback((wasSuccessful) => {
    setShowUpload(false);
    if (wasSuccessful) {
      setUploadSuccess(true);
      setFileRefreshToken((t) => t + 1);
      setTimeout(() => setUploadSuccess(false), 3000);
    }
  }, []);

  const openUploadModal = useCallback(() => setShowUpload(true), []);

  return (
    <div className="App">
      <GuestIdentityBanner onOpenUpload={openUploadModal} />
      <GraphPlaybackBanner />
      <GiveFeedbackControl />
      {showUpload && (
        <FileUpload
          onUploadSuccess={handleUploadComplete}
          onClose={() => setShowUpload(false)}
        />
      )}
      {uploadSuccess && (
        <div className="success-message app-upload-success" role="status">
          File uploaded successfully!
        </div>
      )}
      <Routes>
        <Route
          path="/"
          element={(
            <div className="landing-container">
              <div className="content">
                <h1>MindMap</h1>
                <p className="description">
                  Transform your ideas into interactive visual networks
                </p>
              </div>
            </div>
          )}
        />
        <Route
          path="/visualize"
          element={(
            <div className="app-route-visualize">
              <LibraryVisualize fileRefreshToken={fileRefreshToken} />
            </div>
          )}
        />
        <Route path="/reset-password" element={<PasswordResetPage />} />
      </Routes>
    </div>
  );
}

export default App;

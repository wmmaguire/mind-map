import React, { useState, useCallback } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import FileUpload from './components/FileUpload';
import LibraryVisualize from './components/LibraryVisualize';
import GiveFeedbackControl from './components/GiveFeedbackControl';
import GuestIdentityBanner from './components/GuestIdentityBanner';
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
      <GuestIdentityBanner />
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

                <div className="features-grid">
                  <div
                    className="feature-card"
                    onClick={openUploadModal}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openUploadModal();
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="feature-icon">📄</div>
                    <h3>Upload</h3>
                    <p>Upload your text files and let AI analyze the connections</p>
                  </div>

                  <Link
                    to="/visualize"
                    className="feature-card"
                    role="button"
                    tabIndex={0}
                  >
                    <div className="feature-icon">🔍</div>
                    <h3>Visualize</h3>
                    <p>See your content transformed into interactive network graphs</p>
                  </Link>
                </div>
              </div>
            </div>
          )}
        />
        <Route
          path="/visualize"
          element={(
            <div>
              <LibraryVisualize
                onOpenUpload={openUploadModal}
                fileRefreshToken={fileRefreshToken}
              />
            </div>
          )}
        />
      </Routes>
    </div>
  );
}

export default App;

import React, { useState, useCallback } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import FileUpload from './components/FileUpload';
import LibraryVisualize from './components/LibraryVisualize';
import GiveFeedbackControl from './components/GiveFeedbackControl';
import GuestIdentityBanner from './components/GuestIdentityBanner';
import GraphPlaybackBanner from './components/GraphPlaybackBanner';
import PasswordResetPage from './components/PasswordResetPage';
import './App.css';

function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="landing-container">
      <div className="content">
        <h1>MindMap</h1>

        <section
          className="landing-value-loop"
          aria-labelledby="landing-how-heading"
        >
          <h2 id="landing-how-heading" className="landing-value-loop-heading">
            How it works
          </h2>
          <ol className="landing-steps">
            <li className="landing-step">
              <span className="landing-step-num" aria-hidden>
                1
              </span>
              <div className="landing-step-body">
                <span className="landing-step-title">Add sources</span>
                <span className="landing-step-text">
                  Upload files or pick a saved graph from the library sidebar.
                </span>
              </div>
            </li>
            <li className="landing-step">
              <span className="landing-step-num" aria-hidden>
                2
              </span>
              <div className="landing-step-body">
                <span className="landing-step-title">Analyze</span>
                <span className="landing-step-text">
                  Run analyze on your files to build an interactive concept map.
                </span>
              </div>
            </li>
            <li className="landing-step">
              <span className="landing-step-num" aria-hidden>
                3
              </span>
              <div className="landing-step-body">
                <span className="landing-step-title">Explore</span>
                <span className="landing-step-text">
                  Pan, zoom, search, and edit nodes on the graph canvas.
                </span>
              </div>
            </li>
          </ol>
        </section>

        <div className="landing-cta landing-cta--post-steps">
          <button
            type="button"
            className="landing-cta-primary landing-cta-primary--dynamic"
            onClick={() => navigate('/visualize')}
          >
            Get Started
          </button>
        </div>
      </div>
    </div>
  );
}

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
        <Route path="/" element={<LandingPage />} />
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

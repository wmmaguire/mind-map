import React, { useState } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import FileUpload from './components/FileUpload';
import LibraryVisualize from './components/LibraryVisualize';
import './App.css';

function App() {
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  const handleUploadComplete = (wasSuccessful) => {
    setShowUpload(false); // Close the modal
    if (wasSuccessful) {
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 3000);
    }
  };

  return (
    <div className="app">
      <Routes>
        <Route 
          path="/" 
          element={
            <div className="landing-container">
              <div className="content">
                <h1>Talk Graph</h1>
                <p className="description">
                  Transform your text into interactive visual networks
                </p>
                
                <div className="features-grid">
                  <div 
                    className="feature-card" 
                    onClick={() => setShowUpload(true)}
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

                {showUpload && (
                  <FileUpload 
                    onUploadSuccess={handleUploadComplete}
                    onClose={() => setShowUpload(false)}
                  />
                )}

                {uploadSuccess && (
                  <div className="success-message">
                    File uploaded successfully!
                  </div>
                )}
              </div>
            </div>
          } 
        />
        <Route path="/visualize" element={<LibraryVisualize />} />
      </Routes>
    </div>
  );
}

export default App;
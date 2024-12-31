import React, { useState, useEffect } from 'react';
import './App.css';
import FileUpload from './components/FileUpload';
import Library from './components/Library';

function App() {
  const [showUpload, setShowUpload] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [serverError, setServerError] = useState(null);

  useEffect(() => {
    const checkServer = async () => {
      try {
        const baseUrl = process.env.NODE_ENV === 'production' 
          ? window.location.origin 
          : 'http://localhost:5001';
        
        const response = await fetch(`${baseUrl}/api/test`);
        
        if (!response.ok) {
          throw new Error('Server response was not ok');
        }
        
        await response.json();
        setServerError(null);
      } catch (error) {
        console.error('Server connection error:', error);
        setServerError('Could not connect to the server. Is it running?');
      }
    };

    checkServer();
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <h1>MemeGraph</h1>
        <div className="description">
          <h3>
            Transform content into visual insights and explore new ideas 
          </h3>
        </div>
        {serverError ? (
          <div className="error-message">{serverError}</div>
        ) : (
          <div className="button-group">
            <div className="button-wrapper">
              <button 
                className="action-button upload-button" 
                onClick={() => setShowUpload(true)}
              >
                <span className="button-icon">📤</span>
                <span className="button-text">Upload File</span>
              </button>
              <div className="tooltip">
                Click here to upload an audio (MP3, WAV) or test (TXT) file to your library.
              </div>
            </div>
            <div className="button-wrapper">
              <button 
                className="action-button library-button" 
                onClick={() => setShowLibrary(true)}
              >
                <span className="button-icon">📚</span>
                <span className="button-text">View Library</span>
              </button>
              <div className="tooltip">
                Access your files in the library to select which ones to visualization.
              </div>
            </div>
          </div>
        )}
      </header>

      {showUpload && (
        <FileUpload onClose={() => setShowUpload(false)} />
      )}

      {showLibrary && (
        <Library onClose={() => setShowLibrary(false)} />
      )}
    </div>
  );
}

export default App;
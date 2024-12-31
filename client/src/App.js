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
        
        const data = await response.json();
        console.log('Server status:', data);
        setServerError(null);
      } catch (error) {
        console.error('Server connection error:', error);
        setServerError('Could not connect to the server. Please try again later.');
      }
    };

    checkServer();
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Talk Graph</h1>
        {serverError ? (
          <div className="error-message">{serverError}</div>
        ) : (
          <>
            <button onClick={() => setShowUpload(true)}>Upload File</button>
            <button onClick={() => setShowLibrary(true)}>View Library</button>
          </>
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
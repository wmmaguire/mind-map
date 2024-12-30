import { useState, useEffect } from 'react';
import FileUpload from './components/FileUpload';
import Library from './components/Library';
import './App.css';

export default function App() {
  const [error, setError] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const baseUrl = process.env.NODE_ENV === 'production' 
          ? ''
          : 'http://localhost:5001';
        
        const response = await fetch(`${baseUrl}/api/test`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        await response.json();
      } catch (error) {
        console.error('Error details:', error);
        setError('Could not connect to the server. Is it running?');
      }
    };

    fetchData();
  }, []);

  const handleUpload = () => {
    setShowUpload(true);
  };

  const handleBrowse = () => {
    setShowLibrary(true);
  };

  return (
    <div className="app">
      <header className="header">
        <h1>Talk Graph</h1>
        <p className="subtitle">Visualize conversations through interactive graphs</p>
      </header>

      <main className="main">
        <section className="hero">
          <div className="hero-content">
            <h2>Transform Your Conversations</h2>
            <p>
              Upload audio or text files to generate interactive graph visualizations.
              Analyze patterns, track topics, and gain insights from your conversations.
            </p>
          </div>
        </section>

        <section className="actions">
          <div className="action-card">
            <h3>New Analysis</h3>
            <p>Upload an MP3 or text file to start visualizing</p>
            <button className="button primary" onClick={handleUpload}>
              Upload File
            </button>
          </div>

          <div className="action-card">
            <h3>Previous Analyses</h3>
            <p>Browse and view your past conversation graphs</p>
            <button className="button secondary" onClick={handleBrowse}>
              View Library
            </button>
          </div>
        </section>

        {error && <div className="error-message">{error}</div>}
      </main>

      <footer className="footer">
        <p>© 2024 Talk Graph. All rights reserved.</p>
      </footer>

      {showUpload && (
        <FileUpload onClose={() => setShowUpload(false)} />
      )}
      
      {showLibrary && (
        <Library onClose={() => setShowLibrary(false)} />
      )}
    </div>
  );
}
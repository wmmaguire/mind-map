import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import GraphVisualization from './GraphVisualization';
import './VisualizationPage.css';

function VisualizationPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { graphData, filename } = location.state || {};

  const handleSave = async () => {
    try {
      const baseUrl = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5001';
      const response = await fetch(`${baseUrl}/api/graphs/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: graphData,
          filename,
          metadata: {
            sessionId: window.currentSessionId,  // Use global sessionId
            createdAt: new Date().toISOString(),
            sourceFiles: [filename],
          }
        })
      });

      const data = await response.json();
      if (data.success) {
        alert('Graph saved successfully!');
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Save error:', error);
      alert('Failed to save graph: ' + error.message);
    }
  };

  if (!graphData) {
    return (
      <div className="visualization-error">
        <p>No graph data available</p>
        <button onClick={() => navigate('/library')}>Back to Library</button>
      </div>
    );
  }

  return (
    <div className="visualization-page">
      <div className="visualization-header">
        <h2>Graph Visualization</h2>
        <div className="visualization-controls">
          <button onClick={() => navigate('/library')}>Back to Library</button>
        </div>
      </div>
      <div className="visualization-content">
        <GraphVisualization 
          data={graphData} 
          onSave={handleSave}
        />
      </div>
    </div>
  );
}

export default VisualizationPage; 
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import GraphVisualization from './GraphVisualization';
import { apiRequest, getApiErrorMessage } from '../api/http';
import { useSession } from '../context/SessionContext';
import './VisualizationPage.css';

function VisualizationPage() {
  const { sessionId } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const { graphData, filename } = location.state || {};

  const handleSave = async () => {
    try {
      const data = await apiRequest('/api/graphs/save', {
        method: 'POST',
        json: {
          data: graphData,
          filename,
          metadata: {
            sessionId,
            createdAt: new Date().toISOString(),
            sourceFiles: [filename],
          },
        },
      });
      if (data.success) {
        alert('Graph saved successfully!');
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Save error:', error);
      alert('Failed to save graph: ' + getApiErrorMessage(error));
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
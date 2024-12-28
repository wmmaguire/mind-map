import { useState, useEffect } from 'react';

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('http://localhost:5001/api/test');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        setData(result);
      } catch (error) {
        console.error('Error details:', error);
        setError('Could not connect to the server. Is it running?');
      }
    };

    fetchData();
  }, []);

  return (
    <div>
      <h1>My Full Stack App</h1>
      {error ? (
        <p style={{ color: 'red' }}>{error}</p>
      ) : (
        <p>{data ? data.message : 'Loading...'}</p>
      )}
      <p>Frontend running on port 3000</p>
      <p>Backend running on port 5001</p>
    </div>
  );
}
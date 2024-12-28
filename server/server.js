import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import process from 'process';

dotenv.config();

const app = express();
const port = process.env.PORT || 5001;

// Error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// Middleware
app.use(cors());
app.use(express.json());

// Test route
app.get('/api/test', (req, res) => {
  try {
    res.json({ message: 'Hello from the backend!' });
  } catch (error) {
    console.error('Route Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Basic error handling middleware
app.use((err, req, res) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
}).on('error', (error) => {
  console.error('Server Error:', error);
});
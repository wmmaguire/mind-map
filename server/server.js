import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import process from 'process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const port = process.env.NODE_ENV === 'production' ? (process.env.PORT || 10000) : 5001;

// Error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// Configure CORS for different environments
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? false // Disable CORS in production since we're serving frontend from same domain
    : 'http://localhost:3000' // Allow React dev server in development
}));

app.use(express.json());

// Serve static files only in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
}

// Test route
app.get('/api/test', (req, res) => {
  try {
    res.json({ message: 'Hello from the backend!' });
  } catch (error) {
    console.error('Route Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve React app for all other routes in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
  });
}

// Basic error handling middleware
app.use((err, req, res) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
  console.log('Environment:', process.env.NODE_ENV);
}).on('error', (error) => {
  console.error('Server Error:', error);
});
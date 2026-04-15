#!/usr/bin/env node
/**
 * One-off: drop the mistaken unique multikey index on `graphs.nodes.id`.
 *
 * The app also runs this automatically after Mongo connects (`fixGraphNodesIdIndex.js`).
 * Use this script if you prefer a manual migration without starting the API server.
 *
 *   cd server && node scripts/drop-graph-nodes-id-unique-index.js
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { fixGraphNodesIdUniqueIndex } from '../lib/fixGraphNodesIdIndex.js';

async function main() {
  const mongoURI = process.env.MONGODB_URI;
  if (!mongoURI) {
    throw new Error('MONGODB_URI is not set');
  }
  await mongoose.connect(mongoURI);
  try {
    await fixGraphNodesIdUniqueIndex();
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

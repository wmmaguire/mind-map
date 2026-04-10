#!/usr/bin/env node
/**
 * One-off migration: import on-disk graph_*.json from graphsDir into Mongo Graph collection.
 *
 * Usage (Render shell / local):
 *   cd server
 *   node scripts/migrate-graphs-to-mongo.js
 *
 * Notes:
 * - Upserts by `metadata.filename` so re-running is safe.
 * - Preserves `metadata.shareReadToken` if present in the JSON.
 */
import 'dotenv/config';
import path from 'path';
import { promises as fs } from 'fs';
import mongoose from 'mongoose';
import { graphsDir } from '../config.js';
import Graph from '../models/graph.js';

function coerceSessionObjectId(sessionUuid) {
  if (typeof sessionUuid !== 'string' || sessionUuid.trim() === '') {
    return new mongoose.Types.ObjectId();
  }
  const s = sessionUuid.trim();
  if (!s.includes('-')) return new mongoose.Types.ObjectId();
  try {
    return new mongoose.Types.ObjectId(
      parseInt(s.replace(/-/g, '').slice(0, 12), 16)
    );
  } catch {
    return new mongoose.Types.ObjectId();
  }
}

async function main() {
  const mongoURI = process.env.MONGODB_URI;
  if (!mongoURI) {
    throw new Error('MONGODB_URI is not set');
  }

  await mongoose.connect(mongoURI, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  });

  await fs.mkdir(graphsDir, { recursive: true });
  const files = (await fs.readdir(graphsDir)).filter((f) => f.endsWith('.json'));

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const filename of files) {
    const full = path.join(graphsDir, filename);
    let data;
    try {
      const raw = await fs.readFile(full, 'utf8');
      data = JSON.parse(raw);
    } catch (e) {
      failed += 1;
      console.error('Failed to read/parse:', filename, e?.message || e);
      continue;
    }

    const meta = data?.metadata || {};
    const graph = data?.graph || {};

    if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.links)) {
      skipped += 1;
      console.warn('Skipping invalid graph shape:', filename);
      continue;
    }

    const sessionUuid =
      typeof meta.sessionId === 'string' ? meta.sessionId.trim() : '';
    const sessionObjId = coerceSessionObjectId(sessionUuid);

    const payload = {
      nodes: graph.nodes || [],
      links: graph.links || [],
    };

    const generatedAt = meta.generatedAt ? new Date(meta.generatedAt) : new Date();
    const lastModified = meta.lastModified ? new Date(meta.lastModified) : new Date(generatedAt);

    try {
      await Graph.findOneAndUpdate(
        { 'metadata.filename': filename },
        {
          $set: {
            metadata: {
              filename,
              name: meta.name || 'Untitled Graph',
              description: meta.description || '',
              sourceFiles: [],
              generatedAt,
              lastModified,
              nodeCount: meta.nodeCount ?? (payload.nodes?.length || 0),
              edgeCount: meta.edgeCount ?? (payload.links?.length || 0),
              sessionId: sessionObjId,
              sessionUuid,
              ...(meta.userId ? { userId: String(meta.userId).trim() } : {}),
              ...(meta.shareReadToken
                ? { shareReadToken: String(meta.shareReadToken).trim() }
                : {}),
            },
            payload,
            nodes: payload.nodes || [],
            links: [],
          },
        },
        { upsert: true, new: false }
      );
      imported += 1;
    } catch (e) {
      failed += 1;
      console.error('Failed to upsert:', filename, e?.message || e);
    }
  }

  console.log(
    JSON.stringify(
      {
        graphsDir,
        totalFiles: files.length,
        imported,
        skipped,
        failed,
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});


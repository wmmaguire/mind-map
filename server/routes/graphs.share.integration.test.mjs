/**
 * HTTP-level checks for read-only share links (#39). Uses an isolated DATA_DIR
 * so the suite does not touch repo server/graphs/.
 *
 * Graph snapshots are now Mongo-backed; this suite stubs the Graph model so it
 * does not require a live database.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'fs/promises';
import path from 'path';
import os from 'os';
import http from 'http';
import express from 'express';
import mongoose from 'mongoose';

const SESSION_UUID = '550e8400-e29b-41d4-a716-446655440000';
const SHARE_FIXTURE = 'graph_share_integration.json';
const SHARE_SECRET = 'a'.repeat(48);

async function listen(app) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const base = `http://127.0.0.1:${addr.port}`;
  return { server, base };
}

async function httpJson(base, method, pathname, { headers = {}, body } = {}) {
  const res = await fetch(`${base}${pathname}`, {
    method,
    headers: {
      ...headers,
      ...(body != null ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _parseError: true, raw: text };
  }
  return { status: res.status, json };
}

test('graphs #39: save rejects ?shareToken=; GET enforces token; responses redact secret', async () => {
  mongoose.set('bufferCommands', false);
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'mm-gr-share-'));
  process.env.DATA_DIR = tmp;
  let server;
  try {
    const { default: graphsRouter } = await import('./graphs.js');
    const { default: Graph } = await import('../models/graph.js');

    // Stub Mongo reads so GET /api/graphs/:filename can run without a DB.
    const fixtureDoc = {
      _id: '64b2f3e7f9c24c5c2b4a1111',
      metadata: {
        filename: SHARE_FIXTURE,
        name: 'ShareFixture',
        sessionUuid: SESSION_UUID,
        sessionId: '000000000000000000000000',
        userId: 'owner1',
        generatedAt: new Date('2020-01-01T00:00:00.000Z'),
        sourceFiles: [],
        shareReadToken: SHARE_SECRET,
      },
      payload: { nodes: [], links: [] },
    };

    const origFindOne = Graph.findOne.bind(Graph);
    Graph.findOne = (query) => ({
      lean: async () =>
        query && query['metadata.filename'] === SHARE_FIXTURE ? fixtureDoc : null,
    });
    const app = express();
    app.use(express.json());
    app.use('/api', graphsRouter);

    const listenResult = await listen(app);
    server = listenResult.server;
    const { base } = listenResult;

    const saveAttempt = await httpJson(base, 'POST', '/api/graphs/save?shareToken=nope', {
      body: {
        graph: { nodes: [], links: [] },
        metadata: { sessionId: SESSION_UUID, name: 'x' },
      },
    });
    assert.equal(saveAttempt.status, 403);
    assert.equal(saveAttempt.json?.code, 'SHARE_READ_ONLY');

    const badTok = await httpJson(
      base,
      'GET',
      `/api/graphs/${encodeURIComponent(SHARE_FIXTURE)}?shareToken=wrong`
    );
    assert.equal(badTok.status, 403);

    const good = await httpJson(
      base,
      'GET',
      `/api/graphs/${encodeURIComponent(SHARE_FIXTURE)}?shareToken=${encodeURIComponent(SHARE_SECRET)}`
    );
    assert.equal(good.status, 200);
    assert.equal(good.json?.success, true);
    assert.equal('shareReadToken' in (good.json?.data?.metadata || {}), false);
    assert.equal('dbId' in (good.json?.data?.metadata || {}), false);

    Graph.findOne = origFindOne;
  } finally {
    if (server) {
      try {
        await new Promise((resolve, reject) => {
          server.close((err) => (err ? reject(err) : resolve()));
        });
      } catch {
        /* ignore */
      }
    }
    await rm(tmp, { recursive: true, force: true });
    mongoose.set('bufferCommands', true);
  }
});

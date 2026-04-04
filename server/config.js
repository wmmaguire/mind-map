import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Root directory for `uploads/`, `metadata/`, and `graphs/` on disk.
 *
 * - **DATA_DIR** — optional absolute path, or path relative to `process.cwd()`
 *   (when you run `cd server && node server.js`, cwd is `server/`).
 * - If unset: development uses this file's directory (`server/`); production
 *   defaults to `/opt/render/project/src/server` (Render layout).
 */
export function resolveDataDir() {
  const raw = process.env.DATA_DIR?.trim();
  if (raw) {
    return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  }
  if (process.env.NODE_ENV === 'production') {
    return '/opt/render/project/src/server';
  }
  return __dirname;
}

export const dataDir = resolveDataDir();
export const uploadsDir = path.join(dataDir, 'uploads');
export const metadataDir = path.join(dataDir, 'metadata');
export const graphsDir = path.join(dataDir, 'graphs');

/**
 * Browser origins allowed by CORS (scheme + host + port).
 *
 * **CORS_ORIGINS** — comma-separated list, e.g.
 * `https://app.example.com,http://localhost:3000`
 *
 * If unset, defaults to the previous hardcoded pair (local CRA + current Render URL).
 */
export function getAllowedCorsOrigins() {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (raw) {
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [
    'https://talk-graph.onrender.com',
    'http://localhost:3000'
  ];
}

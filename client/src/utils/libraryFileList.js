/**
 * Pure helpers for Library file list search, sort, and display (#26).
 * @param {object} file — API file metadata
 * @returns {string}
 */
export function getFileDisplayName(file) {
  if (!file || typeof file !== 'object') return '';
  const name = file.customName || file.originalName || file.filename || '';
  return String(name).trim();
}

/**
 * @param {object[]} files
 * @param {string} query
 * @returns {object[]}
 */
export function filterFilesByQuery(files, query) {
  if (!Array.isArray(files)) return [];
  const q = String(query || '').trim().toLowerCase();
  if (!q) return files;
  return files.filter((f) => {
    const display = getFileDisplayName(f).toLowerCase();
    const orig = String(f.originalName || '').toLowerCase();
    return display.includes(q) || orig.includes(q);
  });
}

export const FILE_SORT_NAME_ASC = 'name-asc';
export const FILE_SORT_NAME_DESC = 'name-desc';
export const FILE_SORT_DATE_DESC = 'date-desc';
export const FILE_SORT_DATE_ASC = 'date-asc';

function parseUploadMs(file) {
  const t = Date.parse(file?.uploadDate || '');
  return Number.isFinite(t) ? t : 0;
}

/**
 * @param {object[]} files
 * @param {string} sortKey — one of FILE_SORT_*
 * @returns {object[]}
 */
export function sortFiles(files, sortKey) {
  if (!Array.isArray(files)) return [];
  const copy = [...files];
  switch (sortKey) {
  case FILE_SORT_NAME_DESC:
    return copy.sort((a, b) =>
      getFileDisplayName(b).localeCompare(getFileDisplayName(a), undefined, {
        sensitivity: 'base',
      })
    );
  case FILE_SORT_DATE_DESC:
    return copy.sort((a, b) => parseUploadMs(b) - parseUploadMs(a));
  case FILE_SORT_DATE_ASC:
    return copy.sort((a, b) => parseUploadMs(a) - parseUploadMs(b));
  case FILE_SORT_NAME_ASC:
  default:
    return copy.sort((a, b) =>
      getFileDisplayName(a).localeCompare(getFileDisplayName(b), undefined, {
        sensitivity: 'base',
      })
    );
  }
}

/**
 * @param {object[]} files
 * @param {string} query
 * @param {string} sortKey
 * @returns {object[]}
 */
export function getFilteredSortedFiles(files, query, sortKey) {
  return sortFiles(filterFilesByQuery(files, query), sortKey);
}

/**
 * @param {object} graph — saved graph row from API (metadata + filename)
 * @returns {string}
 */
export function getGraphDisplayName(graph) {
  if (!graph || typeof graph !== 'object') return '';
  const meta =
    graph.metadata && typeof graph.metadata === 'object' ? graph.metadata : {};
  const name =
    meta.name != null && String(meta.name).trim() !== ''
      ? String(meta.name).trim()
      : '';
  if (name) return name;
  const fn = graph.filename != null ? String(graph.filename).trim() : '';
  return fn || 'Unnamed Graph';
}

function parseGraphMs(graph) {
  const meta = graph?.metadata || {};
  const t = Date.parse(meta.generatedAt || '');
  return Number.isFinite(t) ? t : 0;
}

/**
 * @param {object[]} graphs
 * @param {string} query
 * @returns {object[]}
 */
export function filterGraphsByQuery(graphs, query) {
  if (!Array.isArray(graphs)) return [];
  const q = String(query || '').trim().toLowerCase();
  if (!q) return graphs;
  return graphs.filter((g) => {
    const display = getGraphDisplayName(g).toLowerCase();
    const fn = String(g.filename || '').toLowerCase();
    return display.includes(q) || fn.includes(q);
  });
}

/**
 * @param {object[]} graphs
 * @param {string} sortKey — one of FILE_SORT_*
 * @returns {object[]}
 */
export function sortGraphs(graphs, sortKey) {
  if (!Array.isArray(graphs)) return [];
  const copy = [...graphs];
  switch (sortKey) {
  case FILE_SORT_NAME_DESC:
    return copy.sort((a, b) =>
      getGraphDisplayName(b).localeCompare(getGraphDisplayName(a), undefined, {
        sensitivity: 'base',
      })
    );
  case FILE_SORT_DATE_DESC:
    return copy.sort((a, b) => parseGraphMs(b) - parseGraphMs(a));
  case FILE_SORT_DATE_ASC:
    return copy.sort((a, b) => parseGraphMs(a) - parseGraphMs(b));
  case FILE_SORT_NAME_ASC:
  default:
    return copy.sort((a, b) =>
      getGraphDisplayName(a).localeCompare(getGraphDisplayName(b), undefined, {
        sensitivity: 'base',
      })
    );
  }
}

/**
 * @param {object[]} graphs
 * @param {string} query
 * @param {string} sortKey
 * @returns {object[]}
 */
export function getFilteredSortedGraphs(graphs, query, sortKey) {
  return sortGraphs(filterGraphsByQuery(graphs, query), sortKey);
}

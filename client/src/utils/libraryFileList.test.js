import {
  getFileDisplayName,
  filterFilesByQuery,
  sortFiles,
  getFilteredSortedFiles,
  getGraphDisplayName,
  filterGraphsByQuery,
  sortGraphs,
  getFilteredSortedGraphs,
  FILE_SORT_NAME_ASC,
  FILE_SORT_NAME_DESC,
  FILE_SORT_DATE_ASC,
  FILE_SORT_DATE_DESC,
} from './libraryFileList';

describe('libraryFileList', () => {
  const f1 = {
    filename: 'a',
    originalName: 'zebra.txt',
    customName: 'Alpha',
    uploadDate: '2026-01-02T00:00:00.000Z',
  };
  const f2 = {
    filename: 'b',
    originalName: 'beta.md',
    customName: 'Beta',
    uploadDate: '2026-01-01T00:00:00.000Z',
  };

  describe('getFileDisplayName', () => {
    it('prefers customName over originalName', () => {
      expect(getFileDisplayName(f1)).toBe('Alpha');
    });

    it('falls back to originalName and filename', () => {
      expect(
        getFileDisplayName({ originalName: 'x.txt', filename: 'id' })
      ).toBe('x.txt');
      expect(getFileDisplayName({ filename: 'only' })).toBe('only');
      expect(getFileDisplayName(null)).toBe('');
    });
  });

  describe('filterFilesByQuery', () => {
    it('returns all files for empty query', () => {
      expect(filterFilesByQuery([f1, f2], '')).toEqual([f1, f2]);
      expect(filterFilesByQuery([f1, f2], '   ')).toEqual([f1, f2]);
    });

    it('filters by display name case-insensitively', () => {
      expect(filterFilesByQuery([f1, f2], 'alp')).toEqual([f1]);
      expect(filterFilesByQuery([f1, f2], 'BETA')).toEqual([f2]);
    });

    it('filters by originalName', () => {
      expect(filterFilesByQuery([f1, f2], 'zebra')).toEqual([f1]);
    });

    it('returns empty array for non-array input', () => {
      expect(filterFilesByQuery(null, 'x')).toEqual([]);
    });
  });

  describe('sortFiles', () => {
    it('sorts by name A–Z', () => {
      const out = sortFiles([f2, f1], FILE_SORT_NAME_ASC);
      expect(out.map(getFileDisplayName)).toEqual(['Alpha', 'Beta']);
    });

    it('sorts by name Z–A', () => {
      const out = sortFiles([f1, f2], FILE_SORT_NAME_DESC);
      expect(out.map(getFileDisplayName)).toEqual(['Beta', 'Alpha']);
    });

    it('sorts by upload date newest first', () => {
      const out = sortFiles([f2, f1], FILE_SORT_DATE_DESC);
      expect(out).toEqual([f1, f2]);
    });

    it('sorts by upload date oldest first', () => {
      const out = sortFiles([f1, f2], FILE_SORT_DATE_ASC);
      expect(out).toEqual([f2, f1]);
    });
  });

  describe('getFilteredSortedFiles', () => {
    it('applies filter then sort', () => {
      const files = [f1, f2];
      const out = getFilteredSortedFiles(files, 'e', FILE_SORT_NAME_DESC);
      expect(out.map(getFileDisplayName)).toEqual(['Beta', 'Alpha']);
    });
  });

  const g1 = {
    filename: 'graph-a.json',
    metadata: {
      name: 'Alpha Study',
      nodeCount: 1,
      edgeCount: 0,
      generatedAt: '2026-01-02T00:00:00.000Z',
    },
  };
  const g2 = {
    filename: 'graph-b.json',
    metadata: {
      name: 'Beta Map',
      nodeCount: 2,
      edgeCount: 1,
      generatedAt: '2026-01-01T00:00:00.000Z',
    },
  };

  describe('getGraphDisplayName', () => {
    it('prefers metadata.name over filename', () => {
      expect(getGraphDisplayName(g1)).toBe('Alpha Study');
    });

    it('falls back to filename or Unnamed Graph', () => {
      expect(
        getGraphDisplayName({
          filename: 'only.json',
          metadata: {},
        })
      ).toBe('only.json');
      expect(getGraphDisplayName({ metadata: {} })).toBe('Unnamed Graph');
    });
  });

  describe('filterGraphsByQuery', () => {
    it('filters by display name and filename', () => {
      expect(filterGraphsByQuery([g1, g2], 'beta')).toEqual([g2]);
      expect(filterGraphsByQuery([g1, g2], 'graph-a')).toEqual([g1]);
    });
  });

  describe('sortGraphs', () => {
    it('sorts by saved date newest first', () => {
      const out = sortGraphs([g2, g1], FILE_SORT_DATE_DESC);
      expect(out).toEqual([g1, g2]);
    });
  });

  describe('getFilteredSortedGraphs', () => {
    it('applies filter then sort by name', () => {
      const out = getFilteredSortedGraphs([g1, g2], 'study', FILE_SORT_NAME_DESC);
      expect(out).toEqual([g1]);
    });
  });
});

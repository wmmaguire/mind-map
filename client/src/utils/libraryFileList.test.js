import {
  getFileDisplayName,
  filterFilesByQuery,
  sortFiles,
  getFilteredSortedFiles,
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
});

import {
  isSafeThumbnailUrlForTooltip,
  tooltipThumbnailMarkup,
  escapeHtmlAttr,
} from './safeThumbnailUrl';

describe('safeThumbnailUrl', () => {
  it('allows https upload.wikimedia.org URLs', () => {
    expect(
      isSafeThumbnailUrlForTooltip(
        'https://upload.wikimedia.org/wikipedia/commons/thumb/x.png/220px-x.png'
      )
    ).toBe(true);
  });

  it('rejects non-https and non-wikimedia hosts', () => {
    expect(isSafeThumbnailUrlForTooltip('http://upload.wikimedia.org/x')).toBe(false);
    expect(isSafeThumbnailUrlForTooltip('https://evil.com/x')).toBe(false);
    expect(isSafeThumbnailUrlForTooltip('https://evil.com/x"onerror=alert(1)')).toBe(false);
  });

  it('escapeHtmlAttr escapes quotes', () => {
    expect(escapeHtmlAttr('a"b')).toBe('a&quot;b');
  });

  it('tooltipThumbnailMarkup returns empty for unsafe URL', () => {
    expect(tooltipThumbnailMarkup('https://x.com/a', 'L')).toBe('');
  });

  it('tooltipThumbnailMarkup returns img for safe URL', () => {
    const u =
      'https://upload.wikimedia.org/wikipedia/commons/thumb/a.png/220px-a.png';
    const html = tooltipThumbnailMarkup(u, 'Alpha');
    expect(html).toContain('graph-canvas-tooltip__thumb');
    expect(html).toMatch(/upload\.wikimedia\.org/);
    expect(html).toContain('Alpha');
    expect(html).not.toContain('<script');
  });
});

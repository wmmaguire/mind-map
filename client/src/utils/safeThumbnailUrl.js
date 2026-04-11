/**
 * Client-side guard for optional node {@code thumbnailUrl} before injecting into tooltip HTML.
 * Only HTTPS URLs on Wikimedia / Wikipedia hosts (matches server-resolved REST thumbnails).
 */

export function isSafeThumbnailUrlForTooltip(url) {
  if (typeof url !== 'string' || url.length > 2048) return false;
  if (/["'<>]/.test(url)) return false;
  if (!url.startsWith('https://')) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    return (
      host.endsWith('wikimedia.org') ||
      host.endsWith('wikipedia.org') ||
      host === 'upload.wikimedia.org'
    );
  } catch {
    return false;
  }
}

/** Minimal HTML escape for attribute / text snippets in tooltip markup. */
export function escapeHtmlAttr(s) {
  if (typeof s !== 'string') return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * @param {string} thumbnailUrl
 * @param {string} [label]
 * @returns {string} empty string if URL is not allowlisted
 */
export function tooltipThumbnailMarkup(thumbnailUrl, label = '') {
  if (!isSafeThumbnailUrlForTooltip(thumbnailUrl)) return '';
  const alt = escapeHtmlAttr((label || 'Concept').slice(0, 200));
  const src = escapeHtmlAttr(thumbnailUrl);
  return `<div class="graph-canvas-tooltip__thumb-wrap"><img class="graph-canvas-tooltip__thumb" src="${src}" alt="${alt}" loading="lazy" decoding="async" width="220" height="165" /></div>`;
}

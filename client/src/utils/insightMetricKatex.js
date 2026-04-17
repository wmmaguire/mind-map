/**
 * KaTeX rendering for static Insights metric formulas (trusted app strings only).
 */
import katex from 'katex';
import 'katex/dist/katex.min.css';

/**
 * @param {string} tex LaTeX math (no user input).
 * @returns {string} HTML from KaTeX (display mode).
 */
export function renderInsightMetricKatexHtml(tex) {
  return katex.renderToString(tex, {
    displayMode: true,
    throwOnError: false,
    trust: false,
    strict: 'ignore',
  });
}

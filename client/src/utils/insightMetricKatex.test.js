import { INSIGHT_CENTRALITY_METRICS_HELP } from './graphInsights';
import { renderInsightMetricKatexHtml } from './insightMetricKatex';

describe('insightMetricKatex', () => {
  it('renders each static metric formula without throwing', () => {
    for (const m of INSIGHT_CENTRALITY_METRICS_HELP) {
      const html = renderInsightMetricKatexHtml(m.writtenFormula);
      expect(typeof html).toBe('string');
      expect(html.length).toBeGreaterThan(50);
      expect(html).toContain('katex');
    }
  });
});

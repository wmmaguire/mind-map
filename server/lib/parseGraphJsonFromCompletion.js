/** OpenAI often wraps JSON in markdown fences; extract `{ nodes, links }` and parse. */
export function parseGraphJsonFromCompletion(raw) {
  if (raw == null || typeof raw !== 'string') {
    throw new Error('Empty or invalid model response');
  }
  let s = raw.trim();
  const fence = /^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```$/im.exec(s);
  if (fence) {
    s = fence[1].trim();
  } else {
    const firstBrace = s.indexOf('{');
    const lastBrace = s.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      s = s.slice(firstBrace, lastBrace + 1);
    }
  }
  const parsed = JSON.parse(s);
  if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.links)) {
    throw new Error('Model response must be JSON with nodes and links arrays');
  }
  return parsed;
}

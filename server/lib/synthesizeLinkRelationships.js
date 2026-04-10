/**
 * Replace templated randomized-growth link text with short phrases grounded in
 * node labels, descriptions, and (when available) Wikipedia extracts.
 */

import { fetchWikipediaExtract } from './wikipediaExtract.js';

function parseRelationshipsJson(raw) {
  if (raw == null || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(trimmed);
  const jsonStr = fence ? fence[1].trim() : trimmed;
  try {
    const data = JSON.parse(jsonStr);
    if (data && Array.isArray(data.relationships)) {
      return data.relationships.map(r =>
        typeof r === 'string' ? r.trim() : ''
      );
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * @param {object} opts
 * @param {import('openai').default} opts.openai
 * @param {string} opts.model
 * @param {Array<{ source: string, target: string, relationship?: string }>} opts.links
 * @param {Map<string, { label?: string, description?: string, wikiUrl?: string }>} opts.nodeById
 * @param {typeof fetch} [opts.fetchFn]
 * @param {string} [opts.generationContext] — optional user guidance (same as step 1)
 */
export async function synthesizeLinkRelationships({
  openai,
  model,
  links,
  nodeById,
  fetchFn,
  generationContext = ''
}) {
  if (!links.length) return links;

  const cache = new Map();
  const maxExtractChars = 800;

  const urls = new Set();
  for (const link of links) {
    const sn = nodeById.get(String(link.source)) || {};
    const tn = nodeById.get(String(link.target)) || {};
    if (sn.wikiUrl) urls.add(sn.wikiUrl);
    if (tn.wikiUrl) urls.add(tn.wikiUrl);
  }
  await Promise.all(
    [...urls].map(async url => {
      const { extract } = await fetchWikipediaExtract(url, fetchFn);
      const text =
        extract && extract.length > maxExtractChars
          ? `${extract.slice(0, maxExtractChars)}…`
          : extract || '';
      cache.set(url, text);
    })
  );

  const getExtract = wikiUrl =>
    (wikiUrl && cache.get(wikiUrl)) || '';

  const lines = [];
  for (let i = 0; i < links.length; i += 1) {
    const { source, target } = links[i];
    const sn = nodeById.get(String(source)) || {};
    const tn = nodeById.get(String(target)) || {};
    const targetExtract = getExtract(tn.wikiUrl || '');
    const sourceExtract = getExtract(sn.wikiUrl || '');
    lines.push({
      index: i + 1,
      newNodeLabel: sn.label || String(source),
      newNodeDescription: (sn.description || '').slice(0, 500),
      newNodeWikiUrl: sn.wikiUrl || '',
      newNodeWikiSummary: sourceExtract || '(no Wikipedia summary fetched)',
      existingLabel: tn.label || String(target),
      existingDescription: (tn.description || '').slice(0, 500),
      existingWikiUrl: tn.wikiUrl || '',
      existingWikiSummary: targetExtract || '(no Wikipedia summary fetched)'
    });
  }

  const edgeBlock = lines
    .map(
      l => `Edge ${l.index} (NEW "${l.newNodeLabel}" → EXISTING "${l.existingLabel}"):
  New concept description: ${l.newNodeDescription || '(none)'}
  New Wikipedia summary (if any): ${l.newNodeWikiSummary}
  Existing concept description: ${l.existingDescription || '(none)'}
  Existing Wikipedia summary (anchor — use this to justify the link): ${l.existingWikiSummary}`
    )
    .join('\n\n');

  const hasGuidance =
    typeof generationContext === 'string' &&
    generationContext.trim().length > 0;

  const guidancePrefix = hasGuidance
    ? `STYLISTIC GUIDANCE (required for the wording of each relationship string below—make this tone obvious; keep claims grounded in the Wikipedia summaries—do not invent facts):\n${generationContext.trim()}\n\n`
    : '';

  const userPrompt = `You will write concise relationship labels for knowledge-graph edges.

${guidancePrefix}For EACH edge below, the EXISTING node is the anchor: the relationship must be logically grounded in the "Existing Wikipedia summary" when it is not empty. Explain how the NEW concept connects to that existing topic (cause, mechanism, part-of, instance, influence, etc.). Do not write generic filler like "is related to" without substance. Avoid duplicating the same phrasing across edges unless appropriate.${
    hasGuidance
      ? ' When STYLISTIC GUIDANCE is present, prioritize that tone in every string while staying faithful to the summaries.'
      : ''
  }

${edgeBlock}

Respond with valid JSON only, exactly this shape:
{"relationships":["...","...",...]}
There must be exactly ${lines.length} strings in the array, in order Edge 1 … Edge ${lines.length}. Each string max 180 characters.`;

  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: hasGuidance
            ? 'You output only valid JSON objects with a "relationships" string array. No markdown, no commentary. When the user gives STYLISTIC GUIDANCE, each relationship string must clearly reflect that tone while remaining grounded in the provided summaries.'
            : 'You output only valid JSON objects with a "relationships" string array. No markdown, no commentary.'
        },
        { role: 'user', content: userPrompt }
      ],
      temperature: hasGuidance ? 0.42 : 0.25,
      max_tokens: Math.min(3500, 100 + lines.length * 72)
    });

    const raw = completion.choices[0]?.message?.content;
    const rels = parseRelationshipsJson(raw);
    if (!rels || rels.length !== links.length) {
      return links;
    }

    return links.map((link, i) => ({
      ...link,
      relationship:
        rels[i] && rels[i].length > 0 ? rels[i] : link.relationship
    }));
  } catch (err) {
    console.error('synthesizeLinkRelationships failed:', err);
    return links;
  }
}

/** Build a Map id -> node for lookup from arrays + new nodes from the model. */
export function buildNodeLookupMap(existingNodes, newNodes) {
  const m = new Map();
  const add = n => {
    if (!n || n.id == null) return;
    m.set(String(n.id), {
      label: n.label,
      description: n.description,
      wikiUrl: n.wikiUrl || n.wikipediaUrl || ''
    });
  };
  (existingNodes || []).forEach(add);
  (newNodes || []).forEach(add);
  return m;
}

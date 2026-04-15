/**
 * GitHub #69 — Explosion mode: Wikipedia-grounded dense subgraph from one anchor.
 * POST /api/explode-node: fetch extract + model JSON + enforced clique + bridge to anchor.
 */

import { MAX_GENERATION_CONTEXT_CHARS } from './generateNodeBudget.js';
import {
  fetchWikipediaExtract,
  normalizeConceptLabel,
  titleFromEnWikiUrl,
} from './wikipediaExtract.js';
import {
  normalizeEnWikiUrlString,
  wikipediaOpensearchFirstUrl,
} from './repairAnalyzeGraphWikiUrls.js';
import { parseGraphJsonFromCompletion } from './parseGraphJsonFromCompletion.js';
import { validateNewNodesAgainstExisting } from './validateNewNodesAgainstExisting.js';

const MIN_NODES = 4;
const MAX_NODES = 8;
const DEFAULT_NODES = 5;

function validateExistingGraphNodesArray(nodes) {
  if (!Array.isArray(nodes)) {
    return {
      ok: false,
      status: 400,
      payload: {
        success: false,
        error: 'existingGraphNodes must be an array',
        code: 'INVALID_EXISTING_GRAPH',
      },
    };
  }
  if (nodes.length > 2000) {
    return {
      ok: false,
      status: 400,
      payload: {
        success: false,
        error: 'existingGraphNodes cannot exceed 2000 entries',
        code: 'EXISTING_GRAPH_TOO_LARGE',
      },
    };
  }
  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i];
    if (!n || typeof n !== 'object') {
      return {
        ok: false,
        status: 400,
        payload: {
          success: false,
          error: `existingGraphNodes[${i}] must be an object`,
          code: 'INVALID_EXISTING_GRAPH',
        },
      };
    }
    if (n.id === undefined || n.id === null) {
      return {
        ok: false,
        status: 400,
        payload: {
          success: false,
          error: `existingGraphNodes[${i}] must have an id`,
          code: 'INVALID_EXISTING_GRAPH',
        },
      };
    }
    if (typeof n.label !== 'string') {
      return {
        ok: false,
        status: 400,
        payload: {
          success: false,
          error: `existingGraphNodes[${i}] must have a string label`,
          code: 'INVALID_EXISTING_GRAPH',
        },
      };
    }
  }
  return { ok: true };
}

/**
 * @param {object} body - POST JSON
 * @returns {{ ok: true, targetNodeId: string, numNodes: number, existingGraphNodes: object[], generationContext: string } | { ok: false, status: number, payload: object }}
 */
export function validateExplodeNodeRequest(body) {
  if (!body || typeof body !== 'object') {
    return {
      ok: false,
      status: 400,
      payload: {
        success: false,
        error: 'Request body must be a JSON object',
        code: 'INVALID_BODY',
      },
    };
  }

  const v = validateExistingGraphNodesArray(body.existingGraphNodes);
  if (!v.ok) return v;

  const tid = body.targetNodeId;
  if (tid === undefined || tid === null || String(tid).trim() === '') {
    return {
      ok: false,
      status: 400,
      payload: {
        success: false,
        error: 'targetNodeId is required',
        code: 'MISSING_TARGET_NODE',
      },
    };
  }
  const targetNodeId = String(tid);
  const target = body.existingGraphNodes.find(
    (n) => String(n.id) === targetNodeId
  );
  if (!target) {
    return {
      ok: false,
      status: 400,
      payload: {
        success: false,
        error: 'targetNodeId does not match any existingGraphNodes entry',
        code: 'UNKNOWN_TARGET_NODE',
      },
    };
  }

  let numNodes = DEFAULT_NODES;
  if (body.numNodes !== undefined && body.numNodes !== null && body.numNodes !== '') {
    const n = Number(body.numNodes);
    if (!Number.isFinite(n) || n < MIN_NODES || n > MAX_NODES) {
      return {
        ok: false,
        status: 400,
        payload: {
          success: false,
          error: `numNodes must be between ${MIN_NODES} and ${MAX_NODES}`,
          code: 'NUM_NODES_OUT_OF_RANGE',
        },
      };
    }
    numNodes = Math.round(n);
  }

  let generationContext = '';
  if (body.generationContext !== undefined && body.generationContext !== null) {
    if (typeof body.generationContext !== 'string') {
      return {
        ok: false,
        status: 400,
        payload: {
          success: false,
          error: 'generationContext must be a string when provided',
          code: 'INVALID_GENERATION_CONTEXT',
        },
      };
    }
    generationContext = body.generationContext.trim();
    if (generationContext.length > MAX_GENERATION_CONTEXT_CHARS) {
      return {
        ok: false,
        status: 400,
        payload: {
          success: false,
          error: `generationContext exceeds ${MAX_GENERATION_CONTEXT_CHARS} characters`,
          code: 'GENERATION_CONTEXT_TOO_LONG',
        },
      };
    }
  }

  return {
    ok: true,
    targetNodeId,
    numNodes,
    existingGraphNodes: body.existingGraphNodes,
    generationContext,
  };
}

/** @param {{ source: unknown, target: unknown }} l */
function linkPairKey(l) {
  const a = String(typeof l.source === 'object' && l.source ? l.source.id : l.source);
  const b = String(typeof l.target === 'object' && l.target ? l.target.id : l.target);
  return a < b ? `${a}__${b}` : `${b}__${a}`;
}

/**
 * Clique on new nodes + each new node bridges to the anchor.
 * @param {{ nodes: object[], links: object[] }} newData
 * @param {string} targetId
 * @param {number} ts
 */
export function ensureExplosionTopology(newData, targetId, ts) {
  const newIds = (newData.nodes || []).map((n) => String(n.id));
  const tid = String(targetId);
  const links = Array.isArray(newData.links) ? [...newData.links] : [];
  const seen = new Set(links.map((l) => linkPairKey(l)));

  const add = (a, b, relationship) => {
    const x = String(a);
    const y = String(b);
    const k = x < y ? `${x}__${y}` : `${y}__${x}`;
    if (seen.has(k)) return;
    seen.add(k);
    links.push({
      source: x,
      target: y,
      relationship,
      timestamp: ts,
      createdAt: ts,
    });
  };

  for (let i = 0; i < newIds.length; i += 1) {
    for (let j = i + 1; j < newIds.length; j += 1) {
      add(newIds[i], newIds[j], 'related concept cluster');
    }
  }
  for (const nid of newIds) {
    add(nid, tid, 'expands from anchor topic');
  }

  return { ...newData, links };
}

/**
 * @param {{ wikiUrl?: string, label?: string }} targetNode
 * @param {typeof fetch} fetchFn
 */
export async function resolveExplosionWikipediaContext(targetNode, fetchFn) {
  let wikiUrl = targetNode.wikiUrl || targetNode.wikipediaUrl || '';
  if (typeof wikiUrl === 'string' && wikiUrl.trim()) {
    wikiUrl = normalizeEnWikiUrlString(wikiUrl.trim());
    const res = await fetchWikipediaExtract(wikiUrl, fetchFn);
    const text = typeof res.extract === 'string' ? res.extract.trim() : '';
    if (text) {
      return { extract: text, wikiUrl };
    }
  }
  const label = (targetNode.label || '').trim();
  if (!label) return { extract: '', wikiUrl: '' };
  const resolved = await wikipediaOpensearchFirstUrl(label, fetchFn);
  if (!resolved) return { extract: '', wikiUrl: '' };
  const normalized = normalizeEnWikiUrlString(resolved);
  const res2 = await fetchWikipediaExtract(normalized, fetchFn);
  const text2 = typeof res2.extract === 'string' ? res2.extract.trim() : '';
  return { extract: text2, wikiUrl: normalized };
}

/**
 * @param {{ chat: { completions: { create: Function } } }} openai
 * @param {typeof fetch} fetchFn
 * @param {object} body
 */
export async function runExplodeNodeCore({ openai, fetchFn, body }) {
  const validated = validateExplodeNodeRequest(body);
  if (!validated.ok) return validated;

  const { targetNodeId, numNodes, existingGraphNodes, generationContext } = validated;
  const targetNode = existingGraphNodes.find(
    (n) => String(n.id) === targetNodeId
  );

  const forbidden = new Set();
  for (const n of existingGraphNodes) {
    const k = normalizeConceptLabel(n.label || '');
    if (k) forbidden.add(k);
  }

  const { extract: wikiExtract } = await resolveExplosionWikipediaContext(
    targetNode,
    fetchFn
  );

  const ts = Date.now();
  const idPrefix = `${ts}`;
  const newIds = Array.from({ length: numNodes }, (_, i) => `${idPrefix}_${i + 1}`);

  const wikiTitleHint =
    (targetNode.wikiUrl && titleFromEnWikiUrl(String(targetNode.wikiUrl))) ||
    (targetNode.label || 'concept');

  const hasGuidance = Boolean(generationContext);
  const prompt = `
You are expanding ONE anchor concept into a tight cluster of related Wikipedia-suitable ideas.

ANCHOR_NODE_ID (must not appear in "nodes" — only link TO it): "${targetNodeId}"
ANCHOR_LABEL: ${JSON.stringify(targetNode.label || '')}
WIKIPEDIA_CONTEXT (may be short or empty; stay factual):
${wikiExtract || '(no extract — infer from label only, still use real encyclopedic topics)'}

Generate exactly ${numNodes} NEW nodes. Each node MUST use this id pattern (no other ids):
${newIds.map((id) => `- ${id}`).join('\n')}

Requirements:
- Each new node: "id", "label", "description" (1–3 sentences), "wikiUrl" (valid English Wikipedia article URL when possible)
- "links" array: you MAY propose some edges among new nodes or to the anchor; the server will REBUILD topology as a full clique among new ids and add a bridge edge from EVERY new id to ANCHOR_NODE_ID, so focus on good labels/descriptions/wikiUrl.
- Do NOT duplicate labels from this forbidden normalized set (case/spacing insensitive): already on the graph.
- Return ONLY valid JSON: { "nodes": [...], "links": [...] }

${hasGuidance ? `USER GUIDANCE (tone / which subtopics — do not contradict Wikipedia facts):\n${generationContext}\n` : ''}
`.trim();

  const generateModel = process.env.OPENAI_ANALYZE_MODEL || 'gpt-4o';

  let rawMessage;
  try {
    const completion = await openai.chat.completions.create({
      model: generateModel,
      messages: [
        {
          role: 'system',
          content: `You output ONLY JSON with "nodes" and "links" arrays. 
Use the exact new node ids requested. Anchor id is only allowed as link endpoint, not as a new node.
Ground concepts in the Wikipedia context when present; never invent fake URLs.`,
        },
        { role: 'user', content: prompt },
      ],
      temperature: hasGuidance ? 0.45 : 0.35,
      max_tokens: 2800,
    });
    rawMessage = completion.choices[0]?.message?.content;
  } catch (e) {
    return {
      ok: false,
      status: 500,
      payload: {
        success: false,
        error: e.message || 'OpenAI request failed',
        code: 'EXPLODE_NODE_FAILED',
      },
    };
  }

  let newData;
  try {
    newData = parseGraphJsonFromCompletion(rawMessage);
  } catch (parseErr) {
    return {
      ok: false,
      status: 502,
      payload: {
        success: false,
        error: 'Invalid JSON response from model',
        details: parseErr.message || String(parseErr),
        code: 'INVALID_MODEL_JSON',
      },
    };
  }

  if (!Array.isArray(newData.nodes) || newData.nodes.length !== numNodes) {
    return {
      ok: false,
      status: 400,
      payload: {
        success: false,
        error: `Model must return exactly ${numNodes} new nodes`,
        code: 'WRONG_NEW_NODE_COUNT',
      },
    };
  }

  const gotIds = newData.nodes.map((n) => String(n.id)).sort().join(',');
  const expectIds = [...newIds].sort().join(',');
  if (gotIds !== expectIds) {
    return {
      ok: false,
      status: 400,
      payload: {
        success: false,
        error: `New node ids must be exactly: ${newIds.join(', ')}`,
        code: 'INVALID_NEW_NODE_IDS',
      },
    };
  }

  const dupCheck = validateNewNodesAgainstExisting(newData, forbidden);
  if (!dupCheck.ok) {
    return {
      ok: false,
      status: 200,
      payload: {
        success: false,
        error: dupCheck.error,
        code: dupCheck.code,
      },
    };
  }

  newData.nodes = newData.nodes.map((n) => ({
    ...n,
    timestamp: n.timestamp ?? ts,
    createdAt: n.createdAt ?? ts,
  }));
  newData.links = (newData.links || []).map((l) => ({
    ...l,
    timestamp: l.timestamp ?? ts,
    createdAt: l.createdAt ?? ts,
  }));

  const wired = ensureExplosionTopology(newData, targetNodeId, ts);

  return {
    ok: true,
    data: wired,
    targetNodeId,
    debug: { wikiTitleHint, numNodes },
  };
}

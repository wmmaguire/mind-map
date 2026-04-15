/**
 * Iterative branch extrapolation for POST /api/generate-branch (GitHub #82).
 */

import { parseGraphJsonFromCompletion } from './parseGraphJsonFromCompletion.js';
import { validateNewNodesAgainstExisting } from './validateNewNodesAgainstExisting.js';
import { normalizeConceptLabel } from './wikipediaExtract.js';
import {
  synthesizeLinkRelationships,
  buildNodeLookupMap
} from './synthesizeLinkRelationships.js';
import {
  isRelationshipSynthesisEnabled,
  getRelationshipSynthesisModel
} from './relationshipSynthesisConfig.js';

async function applySynthesizedRelationshipsPass(
  newData,
  existingGraphNodes,
  openai,
  generationContext = ''
) {
  if (!newData.links?.length) return newData;
  if (!isRelationshipSynthesisEnabled()) return newData;
  try {
    const nodeMap = buildNodeLookupMap(existingGraphNodes, newData.nodes);
    newData.links = await synthesizeLinkRelationships({
      openai,
      model: getRelationshipSynthesisModel(),
      links: newData.links,
      nodeById: nodeMap,
      fetchFn: globalThis.fetch,
      generationContext
    });
  } catch (synErr) {
    console.error('Relationship synthesis skipped (generate-branch):', synErr);
  }
  return newData;
}

function memoryWindowSlice(path, memoryK) {
  const k = Math.min(memoryK, path.length);
  return path.slice(path.length - k);
}

function normalizePlainLink(l) {
  return {
    source: String(
      typeof l.source === 'object' && l.source != null ? l.source.id : l.source
    ),
    target: String(
      typeof l.target === 'object' && l.target != null ? l.target.id : l.target
    ),
    relationship: l.relationship || 'related'
  };
}

function memoryContextBlock(pathSlice, nodeById, links) {
  const idSet = new Set(pathSlice.map(String));
  const lines = [];
  for (const id of pathSlice) {
    const n = nodeById.get(String(id));
    if (!n) continue;
    lines.push(
      `- id "${n.id}": ${n.label} — ${(n.description || '').slice(0, 220)}${n.wikiUrl ? ` — wiki: ${n.wikiUrl}` : ''}`
    );
  }
  const edgeLines = [];
  for (const l of links) {
    const pl = normalizePlainLink(l);
    const s = pl.source;
    const t = pl.target;
    if (idSet.has(s) && idSet.has(t)) {
      edgeLines.push(
        `  "${s}" —${(pl.relationship || 'related').slice(0, 120)}→ "${t}"`
      );
    }
  }
  return `BRANCH MEMORY (last nodes on the path — stay consistent with this thread):\n${lines.join('\n')}\n\nRelationships among these memory nodes:\n${edgeLines.length ? edgeLines.join('\n') : '  (none listed)'}`;
}

function buildCrossLinks(newNodes, frontierId, memoryIds, crossCount, ts) {
  const pool = memoryIds.map(String).filter(id => id !== String(frontierId));
  if (pool.length === 0 || crossCount <= 0) return [];
  const out = [];
  let used = 0;
  for (let i = 0; i < newNodes.length && used < crossCount; i += 1) {
    const nid = String(newNodes[i].id);
    const tgt = pool[used % pool.length];
    if (tgt === nid) {
      used += 1;
      continue;
    }
    out.push({
      source: nid,
      target: tgt,
      relationship: 'Cross-link to earlier branch context',
      timestamp: ts
    });
    used += 1;
  }
  return out;
}

function newNodesConnectToFrontier(links, newIds, frontierId) {
  const f = String(frontierId);
  for (const nid of newIds) {
    const ok = links.some(l => {
      const s =
        typeof l.source === 'object' && l.source != null
          ? String(l.source.id)
          : String(l.source);
      const t =
        typeof l.target === 'object' && l.target != null
          ? String(l.target.id)
          : String(l.target);
      return (
        (s === nid && t === f) ||
        (t === nid && s === f) ||
        (s === f && t === nid) ||
        (t === f && s === nid)
      );
    });
    if (!ok) return false;
  }
  return true;
}

/**
 * @param {import('openai').default} openai
 * @param {object} validated - output of validateGenerateBranchRequest when ok
 * @returns {Promise<{ ok: true, data: { nodes, links }, debug: object } | { ok: false, status?: number, error: string, code?: string, details?: string }>}
 */
export async function executeGenerateBranch(openai, validated) {
  const generateModel = process.env.OPENAI_ANALYZE_MODEL || 'gpt-4o';
  const hasGuidance =
    typeof validated.generationContext === 'string' &&
    validated.generationContext.trim().length > 0;
  const generationGuidanceBlock = hasGuidance
    ? `
      USER GUIDANCE — TONE, VOICE, AND CONCEPT CHOICES (apply to which new concepts you pick as well as every new node's description and every relationship string; keep facts accurate and grounded in Wikipedia/summaries—do not invent claims):
      ${validated.generationContext.trim()}

      Reflect this guidance when selecting topics: prefer new nodes whose subjects fit the spirit of the guidance among valid extensions of the branch. Reflect it in writing: descriptions and relationship labels must visibly match the requested tone.
      `
    : '';

  const nodeById = new Map(
    validated.existingGraphNodes.map(n => [String(n.id), n])
  );
  let workingLinks = (validated.existingGraphLinks || []).map(normalizePlainLink);

  let path = [...validated.pathNodeIds.map(String)];
  const forbiddenLabels = new Set();
  for (const n of validated.existingGraphNodes) {
    const k = normalizeConceptLabel(n.label || '');
    if (k) forbiddenLabels.add(k);
  }

  const accumulatedNodes = [];
  const accumulatedLinks = [];
  const debugCycles = [];

  for (let cycle = 1; cycle <= validated.iterations; cycle += 1) {
    const frontierId = path[path.length - 1];
    const frontierNode = nodeById.get(String(frontierId));
    if (!frontierNode) {
      return {
        ok: false,
        error: 'Frontier node missing from graph',
        code: 'MISSING_FRONTIER'
      };
    }

    const memSlice = memoryWindowSlice(path, validated.memoryK);
    const memoryBlock = memoryContextBlock(memSlice, nodeById, workingLinks);
    const timestamp = Date.now() + cycle;

    const forbiddenBlock =
      forbiddenLabels.size > 0
        ? `
      CRITICAL — EXISTING GRAPH CONCEPTS (normalized — do NOT add any new node whose label duplicates or trivially rephrases one of these):
      ${Array.from(forbiddenLabels).slice(0, 650).join(', ')}

      Each NEW label must be clearly distinct from every name above and from every other new node in this response.
      `
        : '';

    const prompt = `
      You are extending ONE branch of a knowledge graph forward from its FRONTIER tip.
      ${forbiddenBlock}
      ${generationGuidanceBlock}

      ${memoryBlock}

      FRONTIER (the new concepts must each connect to this node — use exact id in links):
      - id "${frontierNode.id}": ${frontierNode.label} — ${frontierNode.description || ''}${frontierNode.wikiUrl ? ` — wiki: ${frontierNode.wikiUrl}` : ''}

      Generate exactly ${validated.nodesPerIteration} new, meaningful concepts that continue this branch from the frontier.
      Each new concept must:
      1. Be a real, well-defined topic that fits naturally after the memory window
      2. Include a relevant English Wikipedia URL
      3. Have a concise description
      4. Connect to the FRONTIER with at least one link (source or target may be the new id or the frontier id)

      Response must be a valid JSON object:
      {
        "nodes": [
          {
            "id": "${timestamp}_1",
            "label": "...",
            "description": "...",
            "wikiUrl": "https://en.wikipedia.org/wiki/..."
          }
        ],
        "links": [
          { "source": "${timestamp}_1", "target": "${frontierId}", "relationship": "specific relationship to frontier topic" }
        ]
      }

      Use ids "${timestamp}_1" through "${timestamp}_${validated.nodesPerIteration}" for new nodes only.
      Return ONLY the JSON object.
    `;

    let rawMessage;
    try {
      const completion = await openai.chat.completions.create({
        model: generateModel,
        messages: [
          {
            role: 'system',
            content: `You are a knowledgeable AI expanding a knowledge graph branch. Output valid JSON only with nodes and links arrays. Every new node must connect to the frontier id "${frontierId}".${hasGuidance ? ' Apply USER GUIDANCE to concept choice and wording.' : ''}`
          },
          { role: 'user', content: prompt }
        ],
        temperature: hasGuidance ? 0.45 : 0.25,
        max_tokens: 2200
      });
      rawMessage = completion.choices[0]?.message?.content;
    } catch (apiErr) {
      const status = apiErr?.status ?? apiErr?.response?.status;
      if (status === 429) {
        return {
          ok: false,
          status: 429,
          error: 'OpenAI quota exceeded',
          code: 'OPENAI_QUOTA'
        };
      }
      if (status === 401) {
        return {
          ok: false,
          status: 401,
          error: 'OpenAI authentication failed',
          code: 'OPENAI_AUTH'
        };
      }
      return {
        ok: false,
        error: apiErr?.message || String(apiErr),
        code: 'GENERATE_BRANCH_FAILED'
      };
    }

    let newData;
    try {
      newData = parseGraphJsonFromCompletion(rawMessage);
    } catch (parseErr) {
      return {
        ok: false,
        status: 502,
        error: 'Invalid JSON response from model',
        details: parseErr.message || String(parseErr),
        code: 'INVALID_MODEL_JSON'
      };
    }

    const dupCheck = validateNewNodesAgainstExisting(newData, forbiddenLabels);
    if (!dupCheck.ok) {
      return {
        ok: false,
        error: dupCheck.error,
        code: dupCheck.code
      };
    }

    const ts = Date.now();
    newData.nodes = (newData.nodes || []).map(n => ({
      ...n,
      timestamp: n.timestamp ?? ts
    }));
    // Ignore model-proposed links: branch extrapolation should only attach to the current
    // frontier node, plus optional server-added cross-links into the memory window.
    // This prevents the model from wiring new nodes back into early path nodes.
    newData.links = [];

    const newIds = (newData.nodes || []).map(n => String(n.id));
    if (newIds.length === 0) {
      return {
        ok: false,
        error: 'Model returned no new nodes',
        code: 'EMPTY_MODEL_NODES'
      };
    }

    // Deterministic frontier attachment: each new node grows off the most recent node (frontier).
    newData.links = newIds.map((nid) => ({
      source: nid,
      target: String(frontierId),
      relationship: 'Branch extrapolation (frontier attachment)',
      timestamp: ts,
    }));

    const existingAccum = [
      ...validated.existingGraphNodes,
      ...accumulatedNodes
    ];
    await applySynthesizedRelationshipsPass(
      newData,
      existingAccum,
      openai,
      validated.generationContext || ''
    );

    const cross = buildCrossLinks(
      newData.nodes,
      frontierId,
      memSlice,
      validated.crossLinksPerIteration,
      ts
    );
    newData.links = [...(newData.links || []), ...cross];

    for (const l of newData.links) {
      workingLinks.push(normalizePlainLink(l));
    }

    for (const n of newData.nodes) {
      const k = normalizeConceptLabel(n.label || '');
      if (k) forbiddenLabels.add(k);
      nodeById.set(String(n.id), n);
    }
    accumulatedNodes.push(...newData.nodes);
    accumulatedLinks.push(...newData.links);

    debugCycles.push({
      cycle,
      frontierNodeId: String(frontierId),
      memoryWindowUsed: memSlice.map(String),
      newNodeIds: newIds
    });

    path = [...path, newIds[0]];
  }

  return {
    ok: true,
    data: { nodes: accumulatedNodes, links: accumulatedLinks },
    debug: { cycles: debugCycles }
  };
}

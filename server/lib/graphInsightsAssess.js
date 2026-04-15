/**
 * POST /api/graph-insights-assess — LLM narrative from centrality-notable nodes (GitHub #83 extension).
 */

const TONE_IDS = ['jung', 'freud', 'murakami', 'jones', 'thompson', 'custom'];

const TONE_SYSTEM_HINTS = {
  jung:
    'Adopt a reflective, symbolic voice inspired by Carl Jung: archetypes, individuation, shadow and persona as metaphors only—stay grounded in the graph data, not clinical claims.',
  freud:
    'Adopt a probing, associative voice inspired by Sigmund Freud: latent connections, tension between ideas—use as literary framing only; avoid medical or diagnostic language.',
  murakami:
    'Adopt a spare, dream-adjacent tone inspired by Haruki Murakami: quiet images, subtle uncanny links between concepts—still factual about the graph structure.',
  jones:
    'Adopt a broad satirical parody of an urgent talk-radio / broadcast style (breathless pacing, conspiratorial, dramatic pivots) inspired by Alex Jones as **voice only**—comedic exaggeration. Every substantive claim must be grounded in the map structure.',
  thompson:
    'Adopt a vivid, first-person-leaning energy inspired by Hunter S. Thompson: punchy, satirical, high-color prose—without inventing facts not supported by the node summaries.',
};

const MAX_CUSTOM_TONE_LEN = 4000;
const MAX_DESCRIPTION_LEN = 800;
const MAX_NOTABLE_PER_METRIC = 12;

/**
 * @param {unknown} body
 * @returns {{ ok: true, value: object } | { ok: false, status: number, error: string, code?: string, details?: string }}
 */
export function validateGraphInsightsAssessRequest(body) {
  if (!body || typeof body !== 'object') {
    return {
      ok: false,
      status: 400,
      error: 'Invalid request body',
      code: 'INVALID_BODY',
    };
  }

  const tone = body.tone;
  if (typeof tone !== 'string' || !TONE_IDS.includes(tone)) {
    return {
      ok: false,
      status: 400,
      error: `tone must be one of: ${TONE_IDS.join(', ')}`,
      code: 'INVALID_TONE',
    };
  }

  let customTone = '';
  if (tone === 'custom') {
    customTone =
      typeof body.customTone === 'string' ? body.customTone.trim() : '';
    if (customTone.length < 8) {
      return {
        ok: false,
        status: 400,
        error: 'customTone must be at least 8 characters when tone is custom',
        code: 'INVALID_CUSTOM_TONE',
      };
    }
    if (customTone.length > MAX_CUSTOM_TONE_LEN) {
      return {
        ok: false,
        status: 400,
        error: `customTone must be at most ${MAX_CUSTOM_TONE_LEN} characters`,
        code: 'CUSTOM_TONE_TOO_LONG',
      };
    }
  }

  const notableNodes = body.notableNodes;
  if (!notableNodes || typeof notableNodes !== 'object') {
    return {
      ok: false,
      status: 400,
      error: 'notableNodes object is required',
      code: 'INVALID_NOTABLE_NODES',
    };
  }

  const keys = ['degree', 'betweenness', 'closeness', 'eigenvector'];
  const cleaned = { degree: [], betweenness: [], closeness: [], eigenvector: [] };

  for (const k of keys) {
    const arr = notableNodes[k];
    if (!Array.isArray(arr)) {
      return {
        ok: false,
        status: 400,
        error: `notableNodes.${k} must be an array`,
        code: 'INVALID_NOTABLE_ARRAY',
      };
    }
    let i = 0;
    for (const row of arr) {
      if (i >= MAX_NOTABLE_PER_METRIC) break;
      if (!row || typeof row !== 'object') continue;
      const label = typeof row.label === 'string' ? row.label.trim() : '';
      if (!label) continue;
      const score =
        typeof row.score === 'number' && Number.isFinite(row.score)
          ? row.score
          : null;
      let description = '';
      if (typeof row.description === 'string') {
        description = row.description.trim().slice(0, MAX_DESCRIPTION_LEN);
      }
      let wikiUrl = '';
      if (typeof row.wikiUrl === 'string' && row.wikiUrl.startsWith('http')) {
        wikiUrl = row.wikiUrl.trim().slice(0, 2048);
      }
      cleaned[k].push({ label, score, description, wikiUrl });
      i += 1;
    }
  }

  const graphSummary = body.graphSummary;
  let summary = null;
  if (graphSummary && typeof graphSummary === 'object') {
    summary = {
      nodeCount: Number(graphSummary.nodeCount) || 0,
      edgeCount: Number(graphSummary.edgeCount) || 0,
      density:
        typeof graphSummary.density === 'number' && Number.isFinite(graphSummary.density)
          ? graphSummary.density
          : 0,
      componentCount: Number(graphSummary.componentCount) || 0,
    };
  }

  return {
    ok: true,
    value: {
      tone,
      customTone,
      notableNodes: cleaned,
      graphSummary: summary,
    },
  };
}

/**
 * @param {import('openai').default} openai
 * @param {Awaited<ReturnType<typeof validateGraphInsightsAssessRequest>> extends { ok: true, value: infer V } ? V : never} validated
 */
export async function runGraphInsightsAssess(openai, validated) {
  const model = process.env.OPENAI_ANALYZE_MODEL || 'gpt-4o';

  const toneInstruction =
    validated.tone === 'custom'
      ? `The user chose a custom stylistic frame. Apply it consistently:\n${validated.customTone}`
      : `Stylistic frame (voice only; do not attribute quotes or claim authorship):\n${TONE_SYSTEM_HINTS[validated.tone]}`;

  const payload = {
    graphSummary: validated.graphSummary,
    notableNodes: validated.notableNodes,
  };

  const metricGuide = `**Private reasoning aid only** — use these network science centrality metrics to decide *which* topics matter and *how* they relate; **do not** lean on jargon or recite this table in the answer.

| Metric | Conversational focus | Topic-role intuition |
| Degree | Broadness | "Big umbrella" — a topic that fans out into many side-themes at once. |
| Betweenness | Synthesis | "Pivot" — the idea that lets the mind move from one cluster of concerns to a very different one. |
| Closeness | Relevance | "Core" — so central to the map's concerns that almost every train of thought can return to it quickly. |
| Eigenvector | Depth/authority | "Sophisticated neighbor" — may show up modestly in the lists, yet sits among the weightiest ideas structurally. |`;

  const userContent = `You are helping a user read a concept graph (mind map) as a **coherent psychological or thematic field**: what holds attention, what mediates between sub-themes, and what gives the whole its overarching tone or structure.

**Guiding questions (address both, in order — in plain, interpretive language):**
1. **What stands out:** Which topics *feel* load-bearing or symptomatic—carrying disproportionate weight, linking unlike areas, or anchoring the graph's "climate"? What latent patterns tie the map together (fragmentation vs unity, a dominant pole vs many equals, etc.)? You may use graphSummary (e.g. components, density) only as light texture, not as a lecture.
2. **How meaning is organized:** How do the standout topics shape the graph's overarching story or meaning—what gets foregrounded, what stays peripheral, what must pass through what to connect?

**How to use the data:** The JSON lists rank notable nodes along different *structural* roles. Those roles are **for your inference only**. Translate them into **topic names and images** (umbrella vs pivot vs gravitational core vs quietly authoritative thread). **Avoid** foregrounding technical vocabulary: do **not** name or emphasize "degree," "betweenness," "closeness," "eigenvector," or "centrality" in the prose unless a single understated mention is unavoidable. Never open sentences with metric names. Prefer psychoanalytic / thematic language: fixation, return of the same motif, bridge between two psychic or discursive worlds, horizon of concern, etc., always tied to **specific concept labels** from the data.

${metricGuide}

**Data:** JSON below (keys like degree / betweenness are for your sorting only—do not repeat those key names as headings or emphasis in the answer). Ground claims in descriptions and URLs when present; otherwise labels and structure. Do not invent facts.

${JSON.stringify(payload, null, 2)}

**Output:** **3–5 short paragraphs**, plain text (no JSON, no markdown tables). Warm, readable, concept-led; structure your reasoning using the internal table above, but the reader should experience an interpretation of **topics and themes**, not a methods recap.

${toneInstruction}`;

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content:
          'You write interpretive, theme-forward commentary on knowledge graphs. Structural rankings inform your reasoning privately; you write about topics, psychological or narrative weight, and overarching meaning—not about network metrics by name. You avoid medical diagnoses, legal advice, and false precision. You never claim a real historical figure is speaking.',
      },
      { role: 'user', content: userContent },
    ],
    temperature: 0.65,
    max_tokens: 1400,
  });

  const text = completion.choices[0]?.message?.content?.trim() || '';
  if (!text) {
    return { ok: false, status: 502, error: 'Empty model response', code: 'EMPTY_RESPONSE' };
  }

  return { ok: true, assessment: text };
}

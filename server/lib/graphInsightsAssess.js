/**
 * POST /api/graph-insights-assess — LLM narrative from centrality-notable nodes (GitHub #83 extension).
 */

const TONE_IDS = ['jung', 'freud', 'murakami', 'thompson', 'custom'];

const TONE_SYSTEM_HINTS = {
  jung:
    'Adopt a reflective, symbolic voice inspired by Carl Jung: archetypes, individuation, shadow and persona as metaphors only—stay grounded in the graph data, not clinical claims.',
  freud:
    'Adopt a probing, associative voice inspired by Sigmund Freud: latent connections, tension between ideas—use as literary framing only; avoid medical or diagnostic language.',
  murakami:
    'Adopt a spare, dream-adjacent tone inspired by Haruki Murakami: quiet images, subtle uncanny links between concepts—still factual about the graph structure.',
  thompson:
    'Adopt a vivid, first-person-leaning energy inspired by Hunter S. Thompson: punchy, satirical, high-color prose—without inventing facts not supported by the node summaries.',
};

const MAX_CUSTOM_TONE_LEN = 4000;
const MAX_CUSTOM_GUIDING_LEN = 4000;
const MAX_DESCRIPTION_LEN = 800;
const MAX_NOTABLE_PER_METRIC = 12;

/** Desired assessment length (`assessmentLength` on POST body). Defaults to `low`. */
const ASSESSMENT_LENGTH_IDS = ['low', 'medium', 'high'];

const ASSESSMENT_LENGTH_MAX_TOKENS = {
  low: 550,
  medium: 1100,
  high: 2200,
};

const GUIDING_FOCUS_IDS = [
  'all',
  'structure',
  'theme',
  'direction',
  'network_all',
  'flow',
  'resilience',
  'emergence',
  'custom',
];

/** Preset guiding-question blocks (psychoanalytic assess). */
const GUIDING_QUESTION_TEXT = {
  structure:
    '**Symptomatic structure:** What topics *feel* load-bearing—carrying weight, linking unlike areas, or anchoring the graph’s emotional or intellectual “climate”? What latent tensions or repetitions appear (splitting, fixation, a dominant pole vs many equals, bridges vs isolates)? Use graphSummary only as light texture.',
  theme:
    '**Theme and meaning:** What overarching story or unconscious preoccupation might this map *express*—what is foregrounded vs peripheral, what must be “passed through” to connect disparate concerns, and what single or few **themes** might unify the field?',
  direction:
    '**Direction and inspiration:** What is the **projected thematic direction** of this graph—where the structure seems to lean, open, or resolve—and **what might it inspire** (lines of thought, feeling-tones, or creative next steps)? **Anchor** each thread in at least one **named concept** from the data; you may then **associate or generalize**, clearly marking what is **inference** rather than something literally present in the JSON.',
};

/**
 * Network-lens presets (everyday language; no centrality metric names in the questions).
 * Keep plain-language themes aligned with `INSIGHT_NETWORK_GUIDING_QUESTION_BODY` in client `graphInsights.js`.
 */
const NETWORK_GUIDING_QUESTION_TEXT = {
  flow:
    '**Flow and spread:** Where might a shift or emphasis at one concept **travel** in this map—where would influence tend to **spread**, **stall**, or **fan out**? Which ideas sit on likely **paths** between distant concerns, and what **bottlenecks** or **open corridors** does the arrangement suggest? **Prioritize** **specific concept labels** and descriptions from the JSON for claims **about the map**; you may add **analogy or extension** when tied to those anchors and framed as inference.',
  resilience:
    '**Resilience and vulnerability:** Where does the map look **hinged** or **brittle**—ideas that, if they vanished, might **disconnect** or **rebalance** the sketch? What looks **redundant** or **backup-like** versus **single points of strain**? Where might small changes **matter most**? **Prioritize** labels and relationships **implied by** the data; you may reference **outside ideas** only as **explicit analogy** linked to those concepts.',
  emergence:
    '**Emergence and growth:** What looks **emergent**, **peripheral**, or **newly rising** versus **settled** or **central** in how topics are tied together? What **patterns of growth** or **layering** does the sketch suggest—what might **next** or **adjacent** concerns be? **Do not** present **hypothetical** topics as if they were nodes in the JSON; **hypothetical** next steps are welcome when clearly framed as **inference**.',
};

/** @param {string} focus */
function isNetworkGuidingFocus(focus) {
  return (
    focus === 'network_all' ||
    focus === 'flow' ||
    focus === 'resilience' ||
    focus === 'emergence'
  );
}

/**
 * @param {string} focus
 * @param {string} customGuiding
 */
function buildGuidingQuestionsBlock(focus, customGuiding) {
  if (focus === 'custom') {
    return `**Guiding angle (from the user — primary lens; answer in a flowing reading, not a checklist):**\n${customGuiding}`;
  }
  if (focus === 'all') {
    return `**Guiding questions (interpretive lens — answer in a flowing psychoanalytic reading, not a checklist):**\n1. ${GUIDING_QUESTION_TEXT.structure}\n2. ${GUIDING_QUESTION_TEXT.theme}\n3. ${GUIDING_QUESTION_TEXT.direction}`;
  }
  if (focus === 'network_all') {
    return `**Guiding questions (network lens — answer in a flowing reading, not a checklist):**\n1. ${NETWORK_GUIDING_QUESTION_TEXT.flow}\n2. ${NETWORK_GUIDING_QUESTION_TEXT.resilience}\n3. ${NETWORK_GUIDING_QUESTION_TEXT.emergence}`;
  }
  if (focus === 'flow') {
    return `**Guiding question (network lens — answer in a flowing reading, not a checklist):**\n${NETWORK_GUIDING_QUESTION_TEXT.flow}`;
  }
  if (focus === 'resilience') {
    return `**Guiding question (network lens — answer in a flowing reading, not a checklist):**\n${NETWORK_GUIDING_QUESTION_TEXT.resilience}`;
  }
  if (focus === 'emergence') {
    return `**Guiding question (network lens — answer in a flowing reading, not a checklist):**\n${NETWORK_GUIDING_QUESTION_TEXT.emergence}`;
  }
  if (focus === 'structure') {
    return `**Guiding question (interpretive lens — answer in a flowing psychoanalytic reading, not a checklist):**\n${GUIDING_QUESTION_TEXT.structure}`;
  }
  if (focus === 'theme') {
    return `**Guiding question (interpretive lens — answer in a flowing psychoanalytic reading, not a checklist):**\n${GUIDING_QUESTION_TEXT.theme}`;
  }
  if (focus === 'direction') {
    return `**Guiding question (interpretive lens — answer in a flowing psychoanalytic reading, not a checklist):**\n${GUIDING_QUESTION_TEXT.direction}`;
  }
  return `**Guiding question (answer in a flowing reading, not a checklist):**\n${GUIDING_QUESTION_TEXT.direction}`;
}

/**
 * @param {'low'|'medium'|'high'} length
 */
function buildOutputLengthPrefix(length) {
  if (length === 'high') {
    return '**Output:** **4–5** short paragraphs, plain text (no JSON, no markdown tables). ';
  }
  if (length === 'medium') {
    return '**Output:** **2–3** short paragraphs, plain text (no JSON, no markdown tables). ';
  }
  return '**Output:** **One** short paragraph, plain text (no JSON, no markdown tables). ';
}

/**
 * @param {string} focus
 * @param {'low'|'medium'|'high'} length
 */
function buildOutputInstructionForGuidingFocus(focus, length) {
  const base = buildOutputLengthPrefix(length);
  if (focus === 'all') {
    return (
      base +
      'Weave the three angles together: **psychoanalytic interpretation**, **speculative theme**, and **projected direction / what the map might inspire**—the reader should feel **meaning, motive, and forward possibility**, not a methods recap.'
    );
  }
  if (focus === 'structure') {
    return (
      base +
      'Center the reading on **symptomatic structure**—load-bearing topics, tensions, and how the map “holds” together—**anchoring** factual claims about the map in the data; the reader should feel a coherent psychoanalytic **field**, not a methods recap.'
    );
  }
  if (focus === 'theme') {
    return (
      base +
      'Center the reading on **theme and meaning**—foreground vs peripheral, what must be passed through, unifying themes—**anchoring** what the map **shows** in specific concept labels, then extending per the reading structure; not a methods recap.'
    );
  }
  if (focus === 'direction') {
    return (
      base +
      'Center the reading on **projected thematic direction** and **what the map might inspire**—following the two-phase reading structure; not a methods recap.'
    );
  }
  if (focus === 'network_all') {
    return (
      base +
      'Weave together **flow and spread**, **resilience and vulnerability**, and **emergence and growth**—the reader should sense how the map **moves**, **holds up**, and **evolves** as an idea system, not a methods recap.'
    );
  }
  if (focus === 'flow') {
    return (
      base +
      'Center on **how influence or attention might move** through the map—spread, stalls, corridors—grounded in specific labels; not a methods recap.'
    );
  }
  if (focus === 'resilience') {
    return (
      base +
      'Center on **what looks stable vs fragile**—hinges, strain, redundancy—grounded in specific labels; not a methods recap.'
    );
  }
  if (focus === 'emergence') {
    return (
      base +
      'Center on **what looks emerging vs settled**—growth, layering, next concerns—grounded in specific labels; not a methods recap.'
    );
  }
  return (
    base +
    'Follow the user’s guiding angle with the same interpretive depth as the preset questions; **substantively anchor** descriptions of the map itself in **specific concept labels** and the JSON, then extend per the reading structure; not a methods recap.'
  );
}

const NOTABLE_METRIC_KEYS = ['degree', 'betweenness', 'closeness', 'eigenvector'];

/**
 * Stable key for overlap: prefer `id`, else label-based fallback.
 * @param {{ id?: string, label?: string }} row
 */
function notableRowKey(row) {
  if (!row || typeof row !== 'object') return '';
  if (typeof row.id === 'string' && row.id.trim()) return row.id.trim();
  if (typeof row.label === 'string' && row.label.trim()) {
    return `label:${row.label.trim()}`;
  }
  return '';
}

/**
 * @param {Record<string, Array<{ id?: string, label?: string }>>} notableNodes
 * @returns {Map<string, string>}
 */
function buildIdLabelMapFromNotable(notableNodes) {
  const map = new Map();
  for (const k of NOTABLE_METRIC_KEYS) {
    const arr = notableNodes[k];
    if (!Array.isArray(arr)) continue;
    for (const row of arr) {
      if (!row || typeof row !== 'object') continue;
      const key = notableRowKey(row);
      if (!key || map.has(key)) continue;
      const label = typeof row.label === 'string' ? row.label.trim() : '';
      map.set(key, label || key);
    }
  }
  return map;
}

/**
 * Counts in how many distinct lists each concept key appears (at most once per list).
 * @param {Record<string, Array<{ id?: string, label?: string }>>} notableNodes
 * @returns {Map<string, number>}
 */
function countNotableIdListPresence(notableNodes) {
  const countById = new Map();
  for (const k of NOTABLE_METRIC_KEYS) {
    const arr = notableNodes[k];
    if (!Array.isArray(arr)) continue;
    const seenInList = new Set();
    for (const row of arr) {
      if (!row || typeof row !== 'object') continue;
      const key = notableRowKey(row);
      if (!key || seenInList.has(key)) continue;
      seenInList.add(key);
      countById.set(key, (countById.get(key) || 0) + 1);
    }
  }
  return countById;
}

/**
 * @param {Record<string, Array<{ id?: string, label?: string }>>} notableNodes
 */
function buildCrossMetricOverlapParagraph(notableNodes) {
  const countById = countNotableIdListPresence(notableNodes);
  const idLabel = buildIdLabelMapFromNotable(notableNodes);
  const multi = [...countById.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (multi.length === 0) {
    return '**Cross-list overlap:** No concept appears in more than one ranked list in this payload—use each list’s ordering as given.';
  }
  const labels = multi
    .slice(0, 14)
    .map(([id]) => idLabel.get(id) || id)
    .join(', ');
  return `**Cross-list overlap (private):** These concepts appear in **more than one** ranked list—treat them as **especially salient across roles** when they fit the guiding question: ${labels}. In prose, use **concept names**, not technical list labels.`;
}

/**
 * @param {string} focus
 */
function buildGuidingFocusPrivateHint(focus) {
  if (focus === 'custom') {
    return '**Lens emphasis (private):** Follow the user’s guiding text above; weight concepts that clearly support that angle when the JSON allows.';
  }
  if (focus === 'all') {
    return '**Lens emphasis (private):** Balance load-bearing structure, unifying theme, and forward/open possibility—use concepts that best serve each thread.';
  }
  if (focus === 'structure') {
    return '**Lens emphasis (private):** Weight concepts that “hold the map together,” tensions, and what links unlike regions—**without** naming internal JSON keys in the answer.';
  }
  if (focus === 'theme') {
    return '**Lens emphasis (private):** Weight concepts that suggest what the map keeps returning to, what feels central vs peripheral, and what might unify the field.';
  }
  if (focus === 'direction') {
    return '**Lens emphasis (private):** Weight concepts that suggest where the arrangement leans, what feels unfinished, and what might open next.';
  }
  if (focus === 'network_all') {
    return '**Lens emphasis (private):** Balance spread, fragility, and emergence; favor concepts that illuminate movement, hinges, or growth.';
  }
  if (focus === 'flow') {
    return '**Lens emphasis (private):** Favor concepts that clarify paths, bottlenecks, and where influence might travel.';
  }
  if (focus === 'resilience') {
    return '**Lens emphasis (private):** Favor concepts that clarify what looks redundant vs strained, or load-bearing for cohesion.';
  }
  if (focus === 'emergence') {
    return '**Lens emphasis (private):** Favor concepts that clarify what looks rising, peripheral, or newly layered vs settled.';
  }
  return '';
}

function buildDataScopeParagraph() {
  return '**What you are seeing:** This JSON is **not** the full graph—only **pre-selected candidate concepts** ranked within each list. **Order matters:** earlier rows are stronger cues than later ones (several rows may appear per list). Use **graphSummary** as light context for scale and fragmentation, not as a substitute for named concepts.';
}

function buildScoreAndOrderParagraph() {
  return '**Scores:** Use `score` only for **relative emphasis within the same list**; do not treat raw numbers as precise statistics. When in doubt, trust **order** over decimal detail.';
}

function buildEvidenceGroundingParagraph() {
  return '**Evidence:** **Descriptions** and **wikiUrl** entries are the strongest factual anchors when present. The ranked lists are a **prioritization aid**, not proof of real-world importance. Do not invent facts about real people, organizations, or events beyond what the text supports.';
}

/**
 * Two-phase reading: (A) map-grounded, (B) explicit speculative extension.
 * @param {'low'|'medium'|'high'} length
 */
function buildReadingPhasesParagraph(length) {
  if (length === 'low') {
    return '**Reading structure:** **(A)** Ground what you say **about the map itself** (structure, salient concepts, tensions) in **named labels** and text from the JSON. **(B)** You may **extend** with associations, analogies, or adjacent ideas **not** literally in the data—**clearly signal** inference or speculation. In one short paragraph, still touch **(A)** before **(B)** if you extend.';
  }
  if (length === 'high') {
    return '**Reading structure:** **(A)** Establish what the structure and labels support—keep **factual** claims about the map tied to the JSON. **(B)** You may then **develop** implications, analogies, or questions beyond the map; give **speculation** enough room but **label** it so it is not mistaken for content in the data.';
  }
  return '**Reading structure:** **(A)** First, establish what the structure and labels support—**factual** claims about the map stay tied to the JSON. **(B)** Then you may **develop** implications, analogies, or questions beyond the map; **label speculation** so it is not mistaken for content in the data.';
}

/**
 * @param {'low'|'medium'|'high'} length
 */
function buildOutputAnchoringParagraph(length) {
  if (length === 'low') {
    return '**Claims:** **Substantively anchor** the reading in **several named concept labels** from the JSON when describing the map. You may **develop** implications, analogies, or questions beyond the map when they **trace back** to those anchors—**mark** what is extrapolation.';
  }
  return '**Claims:** **Substantively anchor** the reading with **several named concept labels** from the JSON across the piece when stating what the map **shows**. Longer interpretive or associative passages are fine when they **trace back** to those anchors; **mark** what is extrapolation.';
}

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

  let guidingFocus =
    typeof body.guidingFocus === 'string' && body.guidingFocus.trim()
      ? body.guidingFocus.trim()
      : 'all';
  if (!GUIDING_FOCUS_IDS.includes(guidingFocus)) {
    return {
      ok: false,
      status: 400,
      error: `guidingFocus must be one of: ${GUIDING_FOCUS_IDS.join(', ')}`,
      code: 'INVALID_GUIDING_FOCUS',
    };
  }

  let assessmentLength =
    typeof body.assessmentLength === 'string' && body.assessmentLength.trim()
      ? body.assessmentLength.trim()
      : 'low';
  if (!ASSESSMENT_LENGTH_IDS.includes(assessmentLength)) {
    return {
      ok: false,
      status: 400,
      error: `assessmentLength must be one of: ${ASSESSMENT_LENGTH_IDS.join(', ')}`,
      code: 'INVALID_ASSESSMENT_LENGTH',
    };
  }

  let customGuidingQuestions = '';
  if (guidingFocus === 'custom') {
    customGuidingQuestions =
      typeof body.customGuidingQuestions === 'string'
        ? body.customGuidingQuestions.trim()
        : '';
    if (customGuidingQuestions.length < 8) {
      return {
        ok: false,
        status: 400,
        error:
          'customGuidingQuestions must be at least 8 characters when guidingFocus is custom',
        code: 'INVALID_CUSTOM_GUIDING',
      };
    }
    if (customGuidingQuestions.length > MAX_CUSTOM_GUIDING_LEN) {
      return {
        ok: false,
        status: 400,
        error: `customGuidingQuestions must be at most ${MAX_CUSTOM_GUIDING_LEN} characters`,
        code: 'CUSTOM_GUIDING_TOO_LONG',
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
      const id =
        typeof row.id === 'string' && row.id.trim() ? row.id.trim() : '';
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
      cleaned[k].push({ id, label, score, description, wikiUrl });
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
      guidingFocus,
      assessmentLength,
      customGuidingQuestions,
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

  // Table copy is mirrored for end users in client `INSIGHT_CENTRALITY_METRICS_HELP` (graphInsights.js).
  const metricGuide = `**Private intuition table (do not recite aloud):**

| Metric | Conversational focus | Topic-role intuition |
| Degree | Broadness | "Big umbrella" — a topic that fans out into many side-themes at once. |
| Betweenness | Synthesis | "Pivot" — the idea that lets the mind move from one cluster of concerns to a very different one. |
| Closeness | Relevance | "Core" — so central to the map's concerns that almost every train of thought can return to it quickly. |
| Eigenvector | Depth/authority | "Sophisticated neighbor" — may show up modestly in the lists, yet sits among the weightiest ideas structurally. |`;

  const guidingBlock = buildGuidingQuestionsBlock(
    validated.guidingFocus,
    validated.customGuidingQuestions
  );
  const outputBlock = buildOutputInstructionForGuidingFocus(
    validated.guidingFocus,
    validated.assessmentLength
  );

  const framingParagraph = isNetworkGuidingFocus(validated.guidingFocus)
    ? `You are helping a user read a concept graph (mind map) through a **network lens** (everyday language only): treat the map as a system of linked ideas—where influence might **spread** or **stall**, where the sketch looks **stable or fragile**, and what might **emerge or grow**. Ground **factual claims about the map** in the nodes and links; **interpretive** and **associative** extensions are welcome when clearly distinguished from what the JSON alone shows. Use everyday language, not technical graph vocabulary.`
    : `You are helping a user read a concept graph (mind map) through a **psychoanalytic lens**: treat the map as a symbolic field—what is being worked through, avoided, or returned to—and **speculate** on the **underlying theme or psychic “meaning”** the arrangement suggests. Ground **factual claims about the map** in the nodes and links; **interpretive** and **associative** extensions are welcome when clearly distinguished from what the JSON alone shows—not clinical fact about real individuals.`;

  const voiceTranslationParagraph = isNetworkGuidingFocus(validated.guidingFocus)
    ? `**Voice / translation:** Turn the lists into images of **spread**, **hinges**, **corridors**, **strain**, **redundancy**, **emergence**, and **growth**—**never** metric names in the answer. **Prioritize** **named concepts** and descriptions from the JSON for claims **about the map**; you may add **imagery or associations** that trace back to those anchors, marking extrapolation.`
    : `**Voice / translation:** Turn the ranked lists into **images and motives** (umbrella, pivot, gravitational core, quiet authority)—**never** metric names in the answer. Prefer psychoanalytic language tied to **named concepts**: desire and defense, return of the motif, object relations, shadow/splitting only as metaphor, horizon of concern, what the map *keeps circling*. You may extend beyond literal labels when the link is clear and you **signal inference**.`;

  const guidingFocusHint = buildGuidingFocusPrivateHint(validated.guidingFocus);
  const overlapParagraph = buildCrossMetricOverlapParagraph(validated.notableNodes);

  const userContent = `${framingParagraph}

${guidingBlock}

${buildReadingPhasesParagraph(validated.assessmentLength)}

${guidingFocusHint ? `${guidingFocusHint}\n\n` : ''}${buildDataScopeParagraph()}

${voiceTranslationParagraph}

${buildScoreAndOrderParagraph()}

${overlapParagraph}

${buildEvidenceGroundingParagraph()}

${metricGuide}

**Data:** JSON below. Internal keys (\`degree\`, \`betweenness\`, \`closeness\`, \`eigenvector\`) are for your sorting only—**do not** use them as section headings in your answer. **Ground factual claims about the map** in descriptions and URLs when present; otherwise labels and structure. Interpretive extension beyond the payload is allowed per the reading structure above.

${JSON.stringify(payload, null, 2)}

${outputBlock}

${buildOutputAnchoringParagraph(validated.assessmentLength)}

${toneInstruction}`;

  const maxTokens =
    ASSESSMENT_LENGTH_MAX_TOKENS[validated.assessmentLength] ??
    ASSESSMENT_LENGTH_MAX_TOKENS.low;

  const systemContent = isNetworkGuidingFocus(validated.guidingFocus)
    ? 'You write readable, theme-forward readings of knowledge graphs using a network lens: everyday metaphors of spread, hinges, fragility, and growth—no technical graph jargon in the answer. Structural rankings inform your reasoning privately; avoid naming centrality metrics unless unavoidable. Ground factual claims about the map in named concept labels from the data; interpretive or associative extensions are welcome when clearly distinguished from what is in the payload. You avoid medical diagnoses, legal advice, and false precision about real individuals. You never claim a real historical figure is speaking.'
    : 'You write psychoanalytically inflected, theme-forward readings of knowledge graphs: speculative interpretation of what the map might express, not clinical diagnosis. Structural rankings inform your reasoning privately; you avoid network jargon by name. Ground factual claims about the map in named concept labels from the data; interpretive or associative extensions are welcome when clearly distinguished from what is in the payload. You avoid medical diagnoses, legal advice, and false precision about real individuals. You never claim a real historical figure is speaking.';

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: systemContent,
      },
      { role: 'user', content: userContent },
    ],
    temperature: 0.65,
    max_tokens: maxTokens,
  });

  const text = completion.choices[0]?.message?.content?.trim() || '';
  if (!text) {
    return { ok: false, status: 502, error: 'Empty model response', code: 'EMPTY_RESPONSE' };
  }

  return { ok: true, assessment: text };
}

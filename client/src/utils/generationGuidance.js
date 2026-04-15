/** Preset dropdown: value (API / state) and label (UI). Kept in sync with `GenerationGuidanceFields`. */
export const GUIDANCE_PRESET_SELECT_OPTIONS = [
  ['none', 'None'],
  ['awe', 'Awe'],
  ['simpleton', 'Simpleton'],
  ['happy', 'Happy'],
  ['nostalgia', 'Nostalgia'],
  ['profound', 'Profound'],
  ['sexy', 'Sexy'],
  ['shock', 'Shock'],
  ['weird', 'Weird'],
  ['custom', 'Custom'],
];

/** Preset guidance strings (e.g. POST /api/generate-node `generationContext`, POST /api/analyze `context`). */

export const GUIDANCE_PRESET_TEXT = {
  awe:
    'Write every new node description and every relationship label with a sense of wonder, reverence, or the sublime where it fits the subject matter; avoid empty hype. When choosing which concepts to add or extract, prefer topics about vast scale, rare beauty, breakthrough achievement, nature, cosmos, or human creativity that evoke awe—still grounded in the anchors or source material.',
  simpleton:
    'Write every new node description and every relationship label in the voice of an adult who still behaves like a toddler: slow, dim witted, plain, big-hearted talk—short sentences, small words, honest wonder, and a thought that comes back around when it feels good (soft animals, simple dreams & emotions, yummy food). Write the grammar and vocabulary of a poorly educated 3rd grader: humble, plain, and make mistakes. Reasoning is silly, childish and easily distracted.  Every fact must match the Wikipedia-style summaries.',
  happy:
    'Write every new node description and every relationship label in an upbeat, optimistic tone; emphasize positive connections and encouraging framing where appropriate. When choosing which concepts to add or extract, prefer topics with uplifting, hopeful, or warmly positive angles (progress, kindness, celebration, resilience) that still fit the anchors or source material.',
  profound:
    'Write every new node description and every relationship label in a deeper, reflective voice that highlights significance, implications, or broader connections when supported by the Wikipedia summaries. When choosing which concepts to add or extract, prefer topics with depth—philosophy, ethics, systems, long-term consequences, or meaning—that still connect logically to the anchors or source material.',
  nostalgia:
    'Write every new node description and every relationship label in a wistful, sentimental, memory-conscious tone; do not invent personal memories or biographical facts. When choosing which concepts to add or extract, prefer topics tied to history, heritage, retro culture, bygone eras, or collective memory—still grounded in the anchors or source material.',
  weird:
    'Write every new node description and every relationship label with surprising, creative, or unconventional phrasing while staying logically grounded in the sources and not inventing facts. When choosing which concepts to add or extract, prefer unusual, counterintuitive, fringe, or mind-bending topics that remain encyclopedic and justified by the anchors or source material.',
  sexy:
    'Write every new node description and every relationship label in a tasteful, alluring, sensual, or passionately charged voice when it fits the concepts; use metaphor and mood rather than explicit content; avoid explicit sexual acts, slurs, harassment, or content involving minors. When choosing which concepts to add or extract, prefer topics where romance, desire, beauty, sensuality, or erotic art and literature (tasteful, mainstream Wikipedia) are central themes—never minors, exploitation, or pornography as topics.',
  shock:
    'Write every new node description and every relationship label with vivid, startling, high-impact phrasing where it fits; avoid gratuitous graphic violence, gore, hate, or exploitation. When choosing which concepts to add or extract, prefer topics involving dramatic turns, paradigm shifts, startling documented history, scientific surprises, or sharp contrasts—still grounded in the anchors or source material.',
};

/**
 * @param {string} preset - 'none' | 'simpleton' | ... | 'custom' (legacy 'funny' maps to simpleton)
 * @param {string} customText - used when preset === 'custom'
 * @returns {string} trimmed string to send to the API (empty = omit). Custom text may describe tone and/or preferred kinds of topics.
 */
export function resolveGenerationContext(preset, customText) {
  if (preset === 'none') return '';
  if (preset === 'custom') return (customText || '').trim();
  const key = preset === 'funny' ? 'simpleton' : preset;
  return GUIDANCE_PRESET_TEXT[key] ?? '';
}

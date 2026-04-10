/** Preset guidance strings (e.g. POST /api/generate-node `generationContext`, POST /api/analyze `context`). */

export const GUIDANCE_PRESET_TEXT = {
  funny:
    'Write every new node description and every relationship label in a witty, lighthearted voice where it fits the subject matter; avoid crass or offensive humor.',
  happy:
    'Write every new node description and every relationship label in an upbeat, optimistic tone; emphasize positive connections and encouraging framing where appropriate.',
  profound:
    'Write every new node description and every relationship label in a deeper, reflective voice that highlights significance, implications, or broader connections when supported by the Wikipedia summaries.',
  weird:
    'Write every new node description and every relationship label with surprising, creative, or unconventional phrasing while staying logically grounded in the sources and not inventing facts.',
  sexy:
    'Write every new node description and every relationship label in a tasteful, alluring, sensual, or passionately charged voice when it fits the concepts; use metaphor and mood rather than explicit content; avoid explicit sexual acts, slurs, harassment, or content involving minors.',
};

/**
 * @param {string} preset - 'none' | 'funny' | ... | 'custom'
 * @param {string} customText - used when preset === 'custom'
 * @returns {string} trimmed string to send to the API (empty = omit)
 */
export function resolveGenerationContext(preset, customText) {
  if (preset === 'none') return '';
  if (preset === 'custom') return (customText || '').trim();
  return GUIDANCE_PRESET_TEXT[preset] ?? '';
}

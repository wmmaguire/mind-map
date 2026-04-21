/** Preset dropdown: value (API / state) and label (UI). Kept in sync with `GenerationGuidanceFields`. */
export const GUIDANCE_PRESET_SELECT_OPTIONS = [
  ['none', 'None'],
  ['awe', 'Awe'],
  ['simpleton', 'Simpleton'],
  ['weird', 'Weird'],
  ['nostalgia', 'Nostalgia'],
  ['profound', 'Profound'],
  ['sexy', 'Sexy'],
  ['shock', 'Shock'],
  ['mysterious', 'Mysterious'],
  ['custom', 'Custom'],
];

/** Preset guidance strings (e.g. POST /api/generate-node `generationContext`, POST /api/analyze `context`). */

export const GUIDANCE_PRESET_TEXT = {
  awe:
    'Write every new node description and every relationship label with a sense of wonder, reverence, or the sublime where it fits the subject matter; avoid empty hype. When choosing which concepts to add or extract, prefer topics about vast scale, rare beauty, breakthrough achievement, nature, cosmos, or human creativity that evoke awe—still grounded in the anchors or source material.',
  simpleton:
    'Write every new node description and every relationship label in the plain, humble, dim-witted, easily-distracted, sincere voice of **Forrest Gump**: short sentences, small words, a gentle folksy Southern lilt, earnest matter-of-fact observation, and the occasional homespun aphorisms used sparingly and only when it fits the subject. Keep it kindhearted, non-judgmental, and literal-minded—never sarcastic, knowing, or ironic. Keep it literary flavor, not a persona claim about Forrest or the film. When choosing which concepts to add or extract, prefer everyday, human-scale topics (friendship, family, simple work, travel, small wonders, perseverance) that still fit the anchors or source material. Every fact must stay accurate and grounded in the Wikipedia-style summaries; do not invent personal memories or biographical details.',
  weird:
    'Write every new node description and every relationship label in a dialectical, contrarian, paradox-loving voice inspired by **Slavoj Žižek**: flip the obvious reading inside-out, sniff out the ideological underside of the everyday, and look for the tension or deadlock hidden beneath apparent harmony. Mix high theory with popular culture, dry humor, and the occasional philosophical aside (Hegel, Lacan, Marx as literary framing only); use signature rhetorical moves sparingly (e.g., "and so on and so on", the *parallax* flip) without caricature. Keep it literary flavor, not a persona claim about the author, and no clinical psychoanalytic diagnosis. When choosing which concepts to add or extract, prefer topics where ideology, contradiction, paradox, dialectic, cultural criticism, or the gap between appearance and reality are central—still fitting the anchors or source material. Every fact must stay accurate and grounded in the Wikipedia-style summaries; do not invent theoretical claims the sources do not support.',
  profound:
    'Write every new node description and every relationship label in a probing, associative voice inspired by **Sigmund Freud**: listen for latent connections, tension between ideas, and what a concept might *repress* or *foreground*—still as literary framing, never as clinical or diagnostic analysis (avoid medical or diagnostic language). Keep it literary flavor, not a persona claim about the author. When choosing which concepts to add or extract, prefer topics with depth—philosophy, ethics, systems, long-term consequences, myth, or meaning—that connect logically to the anchors or source material and admit associative reading. All claims must stay factual and grounded in the Wikipedia-style summaries; do not invent psychological motives or hidden meanings that the sources do not support.',
  nostalgia:
    'Write every new node description and every relationship label in a wistful, sentimental, memory-conscious tone; do not invent personal memories or biographical facts. When choosing which concepts to add or extract, prefer topics tied to history, heritage, retro culture, bygone eras, or collective memory—still grounded in the anchors or source material.',
  mysterious:
    'Write every new node description and every relationship label in a spare, dream-adjacent tone inspired by Haruki Murakami: quiet images, subtle uncanny links between ideas—still factual and grounded in Wikipedia summaries. When choosing which concepts to add or extract, prefer topics that admit understated, liminal, or obliquely connected extensions of the anchors or source material; avoid loud or gimmicky phrasing.',
  sexy:
    'Write every new node description and every relationship label in the gallant, flirtatious, silver-tongued voice of a literary **Don Juan**—charming, witty, romantic, a little roguish—inspired by Byron, Molière, Tirso de Molina, and Mozart/da Ponte; use wit, metaphor, and courtly mood rather than explicit content; keep it literary flavor, not a persona claim about the author. Avoid explicit sexual acts, slurs, harassment, or content involving minors. When choosing which concepts to add or extract, prefer topics where romance, desire, seduction, beauty, sensuality, or erotic art and literature (tasteful, mainstream Wikipedia) are central themes—never minors, exploitation, or pornography as topics. All claims must stay factual and grounded in the Wikipedia-style summaries.',
  shock:
    'Write every new node description and every relationship label with vivid, punchy, satirical, high-color energy inspired by Hunter S. Thompson: first-person-leaning, high-impact phrasing—without inventing facts that are not supported by the Wikipedia summaries. Keep it literary flavor, not a persona claim about the author. Avoid gratuitous graphic violence, gore, hate, or exploitation. When choosing which concepts to add or extract, prefer topics involving dramatic turns, paradigm shifts, startling documented history, scientific surprises, or sharp contrasts—still grounded in the anchors or source material.',
};

/**
/**
 * @param {string} preset - 'none' | 'awe' | 'simpleton' | 'weird' | 'nostalgia' | 'profound' | 'sexy' | 'shock' | 'mysterious' | 'custom' (legacy 'funny' → simpleton; legacy 'happy' → none / empty)
 * @param {string} customText - used when preset === 'custom'
 * @returns {string} trimmed string to send to the API (empty = omit). Custom text may describe tone and/or preferred kinds of topics.
 */
export function resolveGenerationContext(preset, customText) {
  if (preset === 'none') return '';
  if (preset === 'custom') return (customText || '').trim();
  const key = preset === 'funny' ? 'simpleton' : preset;
  return GUIDANCE_PRESET_TEXT[key] ?? '';
}

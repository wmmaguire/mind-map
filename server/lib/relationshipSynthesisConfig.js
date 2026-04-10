/**
 * Optional second LLM pass for relationship labels (/api/generate-node).
 *
 * Env:
 * - GENERATE_NODE_RELATIONSHIP_SYNTHESIS — set to 0/false/no to skip (faster, cheaper; keeps first-pass link text).
 * - OPENAI_RELATIONSHIP_SYNTHESIS_MODEL — model for that pass only (default: gpt-4o-mini vs primary OPENAI_ANALYZE_MODEL).
 */

export function isRelationshipSynthesisEnabled() {
  const v = process.env.GENERATE_NODE_RELATIONSHIP_SYNTHESIS;
  if (v === undefined || v === '') return true;
  const s = String(v).trim().toLowerCase();
  return s !== '0' && s !== 'false' && s !== 'no' && s !== 'off';
}

/**
 * @param {string} [primaryModel] — unused unless we need a fallback; reserved for future
 */
export function getRelationshipSynthesisModel() {
  const m = (process.env.OPENAI_RELATIONSHIP_SYNTHESIS_MODEL || '').trim();
  if (m) return m;
  return 'gpt-4o-mini';
}

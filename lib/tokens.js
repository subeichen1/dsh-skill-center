/**
 * Count CJK characters using the broad ranges that matter for the estimate:
 * CJK radicals, symbols and punctuation, kana, Hangul, full-width forms and
 * the unified ideograph blocks.
 *
 * @param {string} text
 * @returns {number}
 */
export function countCjk(text) {
  if (typeof text !== 'string' || text.length === 0) return 0
  let count = 0
  for (const character of text) {
    const code = character.codePointAt(0)
    if (
      (code >= 0x2e80 && code <= 0x2fff) ||
      (code >= 0x3000 && code <= 0x303f) ||
      (code >= 0x3040 && code <= 0x30ff) ||
      (code >= 0x3100 && code <= 0x312f) ||
      (code >= 0x31a0 && code <= 0x31bf) ||
      (code >= 0x31f0 && code <= 0x31ff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0xa960 && code <= 0xa97f) ||
      (code >= 0xac00 && code <= 0xd7af) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe4f) ||
      (code >= 0xff00 && code <= 0xffef)
    ) {
      count += 1
    }
  }
  return count
}

/**
 * Estimate one catalog row. The formula comes from the product requirement:
 * chars = name.length + 6 + min(description.length, 500); CJK is one token per
 * character and everything else is 1/3.5 token per character.
 *
 * @param {{name: string, description: string}} skill
 * @returns {{chars: number, tokens: number}}
 */
export function estimateSkillTokens(skill) {
  const name = typeof skill.name === 'string' ? skill.name : ''
  const description = typeof skill.description === 'string' ? skill.description : ''
  const visibleDescription = description.slice(0, 500)
  const chars = name.length + 6 + visibleDescription.length
  const cjk = countCjk(name) + countCjk(visibleDescription)
  return {
    chars,
    tokens: cjk + (chars - cjk) / 3.5,
  }
}

/**
 * Estimate the resident skill catalog for model-invocable skills. `150` is the
 * fixed frame overhead; the result is rounded up because providers bill whole
 * context tokens.
 *
 * @param {Array<{name: string, description: string, modelInvocable?: boolean}>} skills
 * @returns {{count: number, tokens: number}}
 */
export function estimateCatalogTokens(skills) {
  let count = 0
  let tokens = 150
  for (const skill of skills) {
    if (skill.modelInvocable === false) continue
    count += 1
    tokens += estimateSkillTokens(skill).tokens
  }
  return { count, tokens: Math.ceil(tokens) }
}

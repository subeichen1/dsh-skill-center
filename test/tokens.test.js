import assert from 'node:assert/strict'
import test from 'node:test'
import { countCjk, estimateCatalogTokens, estimateSkillTokens } from '../lib/tokens.js'

test('CJK characters count as one token and ASCII as 1/3.5', () => {
  const ascii = estimateSkillTokens({ name: 'alpha', description: 'abcdefghij' })
  assert.equal(ascii.chars, 'alpha'.length + 6 + 10)
  assert.equal(ascii.tokens, ascii.chars / 3.5)

  const chinese = estimateSkillTokens({ name: '技能', description: '中文描述' })
  assert.equal(chinese.chars, 2 + 6 + 4)
  assert.equal(chinese.tokens, 6 + 6 / 3.5)
})

test('description is capped at 500 characters for the estimate', () => {
  const skill = estimateSkillTokens({ name: 'x', description: 'a'.repeat(900) })
  assert.equal(skill.chars, 1 + 6 + 500)
})

test('catalog estimate adds the 150-token frame and skips non-model skills', () => {
  const estimate = estimateCatalogTokens([
    { name: 'a', description: 'b', modelInvocable: true },
    { name: 'c', description: 'd', modelInvocable: false },
  ])
  assert.equal(estimate.count, 1)
  assert.equal(estimate.tokens, Math.ceil(150 + (1 + 6 + 1) / 3.5))
  assert.equal(countCjk('abc中文'), 2)
})

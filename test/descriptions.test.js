import assert from 'node:assert/strict'
import test from 'node:test'
import { localizedDescriptions } from '../lib/descriptions.js'
import { buildInventory } from '../lib/inventory.js'

test('known skills get a display translation while unknown skills fall back', () => {
  const brief = localizedDescriptions('finesse-brief', 'English original')
  assert.match(brief.zh, /Workbench Spec|工作台/)
  assert.equal(brief.en, 'English original')

  const rea = localizedDescriptions('rea-video', '中文原始描述')
  assert.equal(rea.zh, '中文原始描述')
  assert.match(rea.en, /Reverse-engineer/)

  const unknown = localizedDescriptions('future-skill', 'fallback text')
  assert.deepEqual(unknown, { zh: 'fallback text', en: 'fallback text' })
})

test('inventory exposes display translations but keeps the original description for token accounting', () => {
  const inventory = buildInventory({
    snapshotSkills: [
      {
        name: 'finesse-ui',
        description: 'Build and refine high-craft web interfaces.',
        source: 'user-dsh',
        path: '/home/.dsh/skills/finesse-ui/SKILL.md',
        invocation: { modelInvocable: true, userInvocable: true },
        provider: 'filesystem',
      },
    ],
  })
  const skill = inventory.skills[0]
  assert.equal(skill.description, 'Build and refine high-craft web interfaces.')
  assert.match(skill.descriptionZh, /Web 界面/)
  assert.equal(skill.descriptionEn, 'Build and refine high-craft web interfaces.')
  assert.equal(inventory.tokenEstimate.count, 1)
})

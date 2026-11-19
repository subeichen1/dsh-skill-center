import assert from 'node:assert/strict'
import test from 'node:test'
import { buildInventory } from '../lib/inventory.js'

test('bundled skills are invisible and snapshot wins over scan', () => {
  const inventory = buildInventory({
    snapshotSkills: [
      {
        name: 'alpha',
        description: 'from registry',
        source: 'project-dsh',
        path: '/project/.dsh/skills/alpha/SKILL.md',
        invocation: { modelInvocable: true, userInvocable: true },
        provider: 'filesystem',
      },
      {
        name: 'office',
        description: 'bundled',
        source: 'bundled',
        invocation: { modelInvocable: true, userInvocable: true },
        provider: 'filesystem',
      },
    ],
    scannedSkills: [
      {
        name: 'alpha',
        description: 'from disk',
        source: 'project-dsh',
        path: '/project/.dsh/skills/alpha/SKILL.md',
        invocation: { modelInvocable: false, userInvocable: false },
      },
      {
        name: 'beta',
        description: 'scan only',
        source: 'user-agents',
        path: '/home/.agents/skills/beta/SKILL.md',
        invocation: { modelInvocable: true, userInvocable: true },
      },
    ],
  })
  assert.deepEqual(inventory.skills.map((skill) => skill.name), ['alpha', 'beta'])
  const alpha = inventory.skills.find((skill) => skill.name === 'alpha')
  assert.equal(alpha.description, 'from registry')
  assert.deepEqual(alpha.invocation, { modelInvocable: true, userInvocable: true })
  assert.equal(inventory.groups.project, 1)
  assert.equal(inventory.groups.user, 1)
  assert.equal(inventory.tokenEstimate.count, 2)
})

test('state cache keeps a phantom row and marks it as missing', () => {
  const inventory = buildInventory({
    snapshotSkills: [],
    scannedSkills: [],
    globalState: {
      version: 1,
      skills: {
        ghost: {
          state: 'off',
          description: 'deleted but remembered',
          path: '/home/.dsh/skills/ghost/SKILL.md',
          source: 'user-dsh',
        },
      },
    },
    projectState: { version: 1, skills: {} },
  })
  assert.equal(inventory.skills.length, 1)
  assert.equal(inventory.skills[0].name, 'ghost')
  assert.equal(inventory.skills[0].missingFile, true)
  assert.equal(inventory.skills[0].scope, 'user')
  assert.equal(inventory.skills[0].state, 'off')
})

test('official bundled entries never leak through the state cache', () => {
  const inventory = buildInventory({
    snapshotSkills: [],
    scannedSkills: [],
    globalState: {
      version: 1,
      skills: { office: { state: 'off', description: 'bundled', source: 'bundled' } },
    },
    projectState: { version: 1, skills: {} },
  })
  assert.equal(inventory.skills.length, 0)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { buildInventory } from '../lib/inventory.js'

function candidate(name, source) {
  return {
    name,
    description: `${name} description`,
    source,
    path: `/managed/${name}/SKILL.md`,
    invocation: { modelInvocable: true, userInvocable: true },
    provider: 'filesystem',
  }
}

test('fresh project defaults on and user defaults off, bundled never appears', () => {
  const inventory = buildInventory({
    snapshotSkills: [
      candidate('project-on', 'project-dsh'),
      candidate('project-agents-on', 'project-agents'),
      candidate('user-off', 'user-dsh'),
      candidate('user-agents-off', 'user-agents'),
      candidate('office', 'bundled'),
      candidate('dsh-badge', 'bundled'),
    ],
    scannedSkills: [],
    projectState: { version: 1, skills: {} },
    globalState: { version: 1, skills: {} },
    shadowActive: true,
  })

  const byName = new Map(inventory.skills.map((skill) => [skill.name, skill]))
  assert.equal(byName.has('office'), false)
  assert.equal(byName.has('dsh-badge'), false)
  assert.equal(byName.get('project-on').state, 'on')
  assert.equal(byName.get('project-on').enabled, true)
  assert.equal(byName.get('project-agents-on').state, 'on')
  assert.equal(byName.get('user-off').state, 'off')
  assert.equal(byName.get('user-off').enabled, false)
  assert.equal(byName.get('user-agents-off').state, 'off')
  assert.equal(byName.get('user-agents-off').enabled, false)
  assert.equal(inventory.groups.project, 2)
  assert.equal(inventory.groups.user, 2)
  assert.equal(inventory.tokenEstimate.count, 2)
})

test('explicit project and global rows override read-time defaults', () => {
  const inventory = buildInventory({
    snapshotSkills: [candidate('project-off', 'project-dsh'), candidate('user-on', 'user-dsh')],
    scannedSkills: [],
    projectState: { version: 1, skills: { 'project-off': { state: 'off' } } },
    globalState: { version: 1, skills: { 'user-on': { state: 'on' } } },
    shadowActive: true,
  })
  const byName = new Map(inventory.skills.map((skill) => [skill.name, skill]))
  assert.equal(byName.get('project-off').state, 'off')
  assert.equal(byName.get('project-off').stateSource, 'project')
  assert.equal(byName.get('project-off').enabled, false)
  assert.equal(byName.get('user-on').state, 'on')
  assert.equal(byName.get('user-on').stateSource, 'global')
  assert.equal(byName.get('user-on').enabled, true)
})

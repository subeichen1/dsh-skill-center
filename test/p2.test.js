import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { buildInventory } from '../lib/inventory.js'
import { applySkillState, resolveStateFileForScope } from '../lib/mutation.js'
import { projectStatePath } from '../lib/state.js'

test('project state overrides global state and reports its source', () => {
  const inventory = buildInventory({
    snapshotSkills: [
      {
        name: 'p-one',
        description: 'project one',
        source: 'project-dsh',
        provider: 'filesystem',
        invocation: { modelInvocable: true, userInvocable: true },
      },
      {
        name: 'u-one',
        description: 'user one',
        source: 'user-dsh',
        provider: 'filesystem',
        invocation: { modelInvocable: true, userInvocable: true },
      },
    ],
    scannedSkills: [
      {
        name: 'p-one',
        description: 'project one',
        source: 'project-dsh',
        root: '/project/.dsh/skills',
        invocation: { modelInvocable: true, userInvocable: true },
      },
      {
        name: 'u-one',
        description: 'user one',
        source: 'user-dsh',
        root: '/user/skills',
        invocation: { modelInvocable: true, userInvocable: true },
      },
    ],
    projectState: { version: 1, skills: { 'u-one': { state: 'on' } } },
    globalState: { version: 1, skills: { 'u-one': { state: 'off' } } },
    shadowActive: true,
  })
  const pOne = inventory.skills.find((skill) => skill.name === 'p-one')
  const uOne = inventory.skills.find((skill) => skill.name === 'u-one')
  assert.equal(pOne.state, 'on', 'project skills default on without an explicit record')
  assert.equal(pOne.stateSource, 'default')
  assert.equal(uOne.state, 'on', 'project state must beat global state')
  assert.equal(uOne.stateSource, 'project')
  assert.equal(uOne.explicitState, true)
})

test('project phantom rows keep the cached global description', () => {
  const inventory = buildInventory({
    projectState: { version: 1, skills: { ghost: { state: 'off', source: 'project-dsh' } } },
    globalState: {
      version: 1,
      skills: {
        ghost: {
          state: 'on',
          description: 'cached description',
          path: '/x/SKILL.md',
          source: 'project-dsh',
        },
      },
    },
    shadowActive: true,
  })
  const ghost = inventory.skills.find((skill) => skill.name === 'ghost')
  assert.equal(ghost.description, 'cached description')
  assert.equal(ghost.missingFile, true)
  assert.equal(ghost.stateSource, 'project')
})

test('applySkillState writes and removes explicit project state', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skill-center-p2-'))
  await mkdir(join(root, '.dsh'), { recursive: true })
  const file = projectStatePath(root)
  try {
    await applySkillState(file, 'p-one', 'off', {
      description: 'project one',
      path: join(root, '.dsh', 'skills', 'p-one', 'SKILL.md'),
      source: 'project-dsh',
    })
    const saved = JSON.parse(await readFile(file, 'utf8'))
    assert.equal(saved.skills['p-one'].state, 'off')
    assert.equal(saved.skills['p-one'].description, 'project one')

    await applySkillState(file, 'p-one', 'inherit', {})
    const cleared = JSON.parse(await readFile(file, 'utf8'))
    assert.equal(cleared.skills['p-one'], undefined)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('project scope resolves to the workspace state file, global to DSH_HOME', () => {
  const environment = { projectRoot: 'C:\\work\\demo', dshHome: 'C:\\Users\\me\\.dsh' }
  assert.equal(resolveStateFileForScope('project', environment), join('C:\\work\\demo', '.dsh', 'skill-center.json'))
  assert.equal(
    resolveStateFileForScope('global', environment),
    join('C:\\Users\\me\\.dsh', 'skill-center', 'state.json'),
  )
})

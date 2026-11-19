import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  effectiveState,
  globalStatePath,
  normalizeState,
  projectStatePath,
  readStateFile,
  withStateEntry,
  writeStateFile,
} from '../lib/state.js'

const EMPTY = { version: 1, skills: {} }

test('effective state is project -> global -> source default', () => {
  const project = { version: 1, skills: { alpha: { state: 'off' } } }
  const global = { version: 1, skills: { beta: { state: 'off' }, alpha: { state: 'on' } } }
  assert.equal(effectiveState('alpha', 'user-dsh', project, global), 'off')
  assert.equal(effectiveState('beta', 'user-dsh', project, global), 'off')
  assert.equal(effectiveState('gamma', 'project-dsh', project, global), 'on')
  assert.equal(effectiveState('delta', 'user-agents', project, global), 'off')
  assert.equal(effectiveState('custom-one', 'custom', project, global), 'off')
})

test('inherit deletes an explicit entry and never persists defaults', () => {
  const on = withStateEntry(EMPTY, 'alpha', 'on', { description: 'A', path: '/a', source: 'user-dsh' })
  assert.equal(on.skills.alpha.state, 'on')
  const inherited = withStateEntry(on, 'alpha', 'inherit')
  assert.equal('alpha' in inherited.skills, false)
  assert.equal(Object.keys(inherited.skills).length, 0)
})

test('normalizeState ignores corrupt entries and versions', () => {
  const state = normalizeState({
    version: 99,
    skills: {
      good: { state: 'off', extra: true },
      bad: { state: 'maybe' },
      worse: null,
    },
  })
  assert.deepEqual(state, { version: 1, skills: { good: { state: 'off' } } })
})

test('state files round-trip atomically and tolerate invalid JSON', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skill-center-state-'))
  try {
    const file = join(root, 'skill-center', 'state.json')
    await writeStateFile(file, withStateEntry(EMPTY, 'alpha', 'off', { description: 'A' }))
    const read = await readStateFile(file)
    assert.equal(read.exists, true)
    assert.equal(read.state.skills.alpha.state, 'off')
    assert.equal(read.state.skills.alpha.description, 'A')
    assert.match(await readFile(file, 'utf8'), /"version": 1/)

    const broken = join(root, 'broken.json')
    await writeFileRaw(broken, '{ not json')
    const brokenRead = await readStateFile(broken)
    assert.equal(brokenRead.exists, true)
    assert.equal(Object.keys(brokenRead.state.skills).length, 0)
    assert.match(brokenRead.warning, /JSON/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('state paths stay outside skill scan roots', () => {
  assert.equal(globalStatePath('C:/dsh'), join('C:/dsh', 'skill-center', 'state.json'))
  assert.equal(projectStatePath('C:/project'), join('C:/project', '.dsh', 'skill-center.json'))
  assert.equal(projectStatePath('C:/project').includes('skills'), false)
})

async function writeFileRaw(path, text) {
  const { writeFile } = await import('node:fs/promises')
  await writeFile(path, text, 'utf8')
}

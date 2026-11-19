import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  disabledSkillNotice,
  invokedSkillNames,
  registerPreStepNotice,
} from '../lib/notice.js'
import { globalStatePath, projectStatePath, writeStateFile } from '../lib/state.js'

async function makeSkill(root, name) {
  const dir = join(root, name)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name} description\n---\n\nBody for ${name}.\n`)
  return join(dir, 'SKILL.md')
}

async function fixture() {
  const base = await mkdtemp(join(tmpdir(), 'dsh-skill-center-notice-'))
  const projectRoot = join(base, 'project')
  const dshHome = join(base, 'dsh-home')
  const agentsHome = join(base, 'agents-home')
  await mkdir(join(projectRoot, '.git'), { recursive: true })
  await makeSkill(join(projectRoot, '.dsh', 'skills'), 'alpha')
  await makeSkill(join(dshHome, 'skills'), 'beta')
  await mkdir(join(agentsHome, 'skills'), { recursive: true })
  return { base, projectRoot, dshHome, agentsHome }
}

function capturePreStep(ctx, homeDefaults) {
  let handler
  const fake = {
    ...ctx,
    on(event, fn) {
      assert.equal(event, 'agent/pre-step')
      handler = fn
    },
  }
  registerPreStepNotice(fake, homeDefaults)
  assert.equal(typeof handler, 'function')
  return handler
}

test('invokedSkillNames only reads human-authored slash messages', () => {
  const names = invokedSkillNames([
    { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'please /beta now' }] },
    { role: 'user', source: { kind: 'skill-invocation', name: 'beta' }, content: [{ type: 'text', text: '/beta' }] },
    { role: 'assistant', content: [{ type: 'text', text: '/beta' }] },
    { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'nope beta' }] },
  ])
  assert.deepEqual(names, ['beta'])
  assert.equal(disabledSkillNotice('beta').includes('/beta 已在技能中心关闭'), true)
})

test('pre-step notice fires for an off user skill even when the registry still reports it', async () => {
  const { projectRoot, dshHome, agentsHome } = await fixture()
  const ctx = {
    get() {
      return { ensure: async () => projectRoot }
    },
    logger: { warn() {} },
  }
  const handler = capturePreStep(ctx, () => ({ dshHome, agentsHome }))
  const decision = { kind: 'continue', messages: [] }
  const result = await handler(
    {
      agent: {},
      signal: undefined,
      messages: [{ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '/beta' }] }],
    },
    async () => decision,
  )
  assert.equal(result.kind, 'continue')
  assert.equal(result.messages.length, 1)
  assert.match(result.messages[0].content[0].text, /\/beta 已在技能中心关闭/)
})

test('pre-step notice stays quiet for a default-on project skill and is not duplicated', async () => {
  const { projectRoot, dshHome, agentsHome } = await fixture()
  const ctx = {
    get() {
      return { ensure: async () => projectRoot }
    },
    logger: { warn() {} },
  }
  const handler = capturePreStep(ctx, () => ({ dshHome, agentsHome }))
  const alpha = await handler(
    {
      agent: {},
      signal: undefined,
      messages: [{ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '/alpha' }] }],
    },
    async () => ({ kind: 'continue', messages: [] }),
  )
  assert.deepEqual(alpha.messages, [])

  await writeStateFile(projectStatePath(projectRoot), {
    version: 1,
    skills: { alpha: { state: 'off', description: 'alpha description', path: 'x', source: 'project-dsh' } },
  })
  const first = await handler(
    {
      agent: {},
      signal: undefined,
      messages: [{ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '/alpha' }] }],
    },
    async () => ({ kind: 'continue', messages: [] }),
  )
  assert.equal(first.messages.length, 1)
  const second = await handler(
    {
      agent: {},
      signal: undefined,
      messages: [{ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '/alpha' }] }],
    },
    async () => ({ kind: 'continue', messages: first.messages }),
  )
  assert.equal(second.messages.length, 1)
  assert.equal(globalStatePath(dshHome).includes('skill-center'), true)
})

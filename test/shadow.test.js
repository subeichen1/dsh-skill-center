import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join, sep } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { buildShadowCandidate, createShadowProvider, SHADOW_PROVIDER_NAME, SHADOW_RANK } from '../lib/shadow.js'

/** Locate the installed @deepseek-ai package directory used by this DSH copy. */
function findDshModules() {
  const candidates = []
  if (process.env.DSH_DSH_MODULES) candidates.push(process.env.DSH_DSH_MODULES)
  const marker = ['resources', 'app', 'dsh', 'node_modules', '@deepseek-ai'].join(sep)
  const executable = process.execPath
  const index = executable.toLowerCase().indexOf(marker.toLowerCase())
  if (index >= 0) candidates.push(executable.slice(0, index + marker.length))
  if (process.env.LOCALAPPDATA) {
    candidates.push(join(process.env.LOCALAPPDATA, 'Programs', 'DeepSeek Harness', 'resources', 'app', 'dsh', 'node_modules', '@deepseek-ai'))
  }
  return candidates.find((candidate) => existsSync(join(candidate, 'dsh-skill', 'lib', 'index.js'))) ?? null
}

function filesystemCandidate(name, description, source, rank) {
  return {
    name,
    description,
    invocation: { modelInvocable: true, userInvocable: true },
    source,
    rank,
    provider: 'filesystem-fixture',
    path: `C:/skills/${name}/SKILL.md`,
  }
}

test('shadow candidate copies identity fields and is never invocable', () => {
  const candidate = buildShadowCandidate({
    name: 'alpha',
    description: 'Alpha skill',
    source: 'project-dsh',
    path: 'C:/repo/.dsh/skills/alpha/SKILL.md',
    whenToUse: 'When testing alpha',
    resourceBase: 'C:/repo/.dsh/skills/alpha',
  })
  assert.equal(candidate.name, 'alpha')
  assert.equal(candidate.description, 'Alpha skill')
  assert.equal(candidate.source, 'project-dsh')
  assert.equal(candidate.provider, SHADOW_PROVIDER_NAME)
  assert.equal(candidate.rank, SHADOW_RANK)
  assert.deepEqual(candidate.invocation, { modelInvocable: false, userInvocable: false })
  assert.equal(candidate.path, 'C:/repo/.dsh/skills/alpha/SKILL.md')
  assert.equal(candidate.whenToUse, 'When testing alpha')
  assert.equal(candidate.resourceBase, 'C:/repo/.dsh/skills/alpha')
})

test('rank-0 shadow wins inside the global layer and leaves bundled skills untouched', async (t) => {
  const modules = findDshModules()
  if (!modules) {
    t.skip('DSH installation was not found; registry integration test skipped')
    return
  }
  const { Context } = await import(pathToFileURL(join(modules, 'cordis', 'lib', 'index.js')).href)
  const { SkillRegistry } = await import(pathToFileURL(join(modules, 'dsh-skill', 'lib', 'index.js')).href)

  const ctx = new Context()
  const registry = new SkillRegistry(ctx)
  registry.registerProvider(() => ({
    name: 'filesystem-fixture',
    async list() {
      return [
        filesystemCandidate('project-alpha', 'Project alpha', 'project-dsh', 100),
        filesystemCandidate('user-beta', 'User beta', 'user-dsh', 400),
        filesystemCandidate('kept-on', 'Stays visible', 'project-agents', 200),
        filesystemCandidate('office-suite', 'Bundled office', 'bundled', 600),
      ]
    },
    get(candidate) {
      return { ...candidate, content: 'fixture body' }
    },
  }))
  registry.registerProvider(
    createShadowProvider({
      async getOffSkills() {
        return [
          { name: 'project-alpha', description: 'Project alpha', source: 'project-dsh', path: 'C:/p/a/SKILL.md' },
          { name: 'user-beta', description: 'User beta', source: 'user-dsh', path: 'C:/u/b/SKILL.md' },
        ]
      },
    }),
  )

  const { skills } = await registry.snapshot({ cwd: 'C:/repo' })
  const byName = new Map(skills.map((skill) => [skill.name, skill]))
  assert.equal(byName.get('project-alpha')?.provider, SHADOW_PROVIDER_NAME)
  assert.equal(byName.get('user-beta')?.provider, SHADOW_PROVIDER_NAME)
  assert.deepEqual(byName.get('project-alpha')?.invocation, { modelInvocable: false, userInvocable: false })
  assert.deepEqual(byName.get('user-beta')?.invocation, { modelInvocable: false, userInvocable: false })
  assert.equal(byName.get('kept-on')?.provider, 'filesystem-fixture')
  assert.equal(byName.get('office-suite')?.provider, 'filesystem-fixture')
  assert.equal((await registry.get('office-suite', { cwd: 'C:/repo' }))?.content, 'fixture body')
  assert.equal(await registry.get('user-beta', { cwd: 'C:/repo' }), undefined)
})

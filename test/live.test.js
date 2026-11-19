import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { buildSkillRoots, listOffSkills } from '../lib/live.js'

/** Create one skill folder with a minimal valid SKILL.md. */
async function createSkill(root, directory, name, description = `${name} description`) {
  await mkdir(join(root, directory), { recursive: true })
  await writeFile(
    join(root, directory, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`,
    'utf8',
  )
}

test('buildSkillRoots follows filesystem provider rank order', () => {
  const roots = buildSkillRoots({
    dshHome: 'C:/home/.dsh',
    agentsHome: 'C:/home/.agents',
    projectRoot: 'C:/work/project',
  })
  assert.deepEqual(
    roots.map((root) => root.source),
    ['project-dsh', 'project-agents', 'user-dsh', 'user-agents'],
  )
  assert.equal(roots[0].path, join('C:/work/project', '.dsh', 'skills'))
  assert.equal(roots[3].path, join('C:/home/.agents', 'skills'))
})

test('listOffSkills returns exactly the effective off skills and ignores bundled', async (t) => {
  const base = await mkdtemp(join(tmpdir(), 'skill-center-live-'))
  t.after(() => rm(base, { recursive: true, force: true }))
  const project = join(base, 'project')
  const dshHome = join(base, 'dsh-home')
  const agentsHome = join(base, 'agents-home')
  await mkdir(join(project, '.git'), { recursive: true })

  const projectDsh = join(project, '.dsh', 'skills')
  const projectAgents = join(project, '.agents', 'skills')
  const userDsh = join(dshHome, 'skills')
  const userAgents = join(agentsHome, 'skills')

  await createSkill(projectDsh, 'alpha', 'alpha')
  await createSkill(projectAgents, 'beta', 'beta')
  await createSkill(userDsh, 'gamma', 'gamma')
  await createSkill(userAgents, 'delta', 'delta')

  await mkdir(join(project, '.dsh'), { recursive: true })
  await writeFile(
    join(project, '.dsh', 'skill-center.json'),
    JSON.stringify({
      version: 1,
      skills: {
        alpha: { state: 'off', description: 'alpha', source: 'project-dsh' },
        beta: { state: 'on', description: 'beta', source: 'project-agents' },
      },
    }),
    'utf8',
  )
  await mkdir(join(dshHome, 'skill-center'), { recursive: true })
  await writeFile(
    join(dshHome, 'skill-center', 'state.json'),
    JSON.stringify({
      version: 1,
      skills: {
        gamma: { state: 'on', description: 'gamma', source: 'user-dsh' },
        delta: { state: 'off', description: 'delta', source: 'user-agents' },
      },
    }),
    'utf8',
  )

  const off = await listOffSkills({ cwd: project, dshHome, agentsHome })
  assert.deepEqual(
    off.map((skill) => `${skill.name}:${skill.source}`).sort(),
    ['alpha:project-dsh', 'delta:user-agents'],
  )
})

test('listOffSkills uses read-time defaults without a state file', async (t) => {
  const base = await mkdtemp(join(tmpdir(), 'skill-center-live-defaults-'))
  t.after(() => rm(base, { recursive: true, force: true }))
  const project = join(base, 'project')
  const dshHome = join(base, 'dsh-home')
  const agentsHome = join(base, 'agents-home')
  await mkdir(join(project, '.git'), { recursive: true })
  await createSkill(join(project, '.dsh', 'skills'), 'project-on', 'project-on')
  await createSkill(join(dshHome, 'skills'), 'user-off', 'user-off')

  const off = await listOffSkills({ cwd: project, dshHome, agentsHome })
  assert.deepEqual(
    off.map((skill) => skill.name),
    ['user-off'],
  )
})

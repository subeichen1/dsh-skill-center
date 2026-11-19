import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { parseFrontmatterYaml, scanSkillRoot, splitFrontmatter } from '../lib/scan.js'

async function makeTempRoot() {
  return mkdtemp(join(tmpdir(), 'skill-center-scan-'))
}

async function writeSkill(root, directory, frontmatter) {
  const dir = join(root, directory)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'SKILL.md'), `---\n${frontmatter}\n---\n\n# Body\n`, 'utf8')
}

test('splitFrontmatter only accepts frontmatter on the first line', () => {
  const split = splitFrontmatter('---\nname: alpha\ndescription: hello\n---\nbody')
  assert.equal(split.frontmatter.includes('name: alpha'), true)
  assert.equal(split.body.trim(), 'body')
  assert.equal(splitFrontmatter('\n---\nname: alpha\n---\n'), undefined)
})

test('frontmatter parser handles quoted, folded and boolean scalars', () => {
  const parsed = parseFrontmatterYaml(
    [
      "name: 'it''s-alpha'",
      'description: >-',
      '  First line',
      '  second line.',
      'user-invocable: false',
      'disable-model-invocation: true',
    ].join('\n'),
  )
  assert.equal(parsed.name, "it's-alpha")
  assert.equal(parsed.description, 'First line second line.')
  assert.equal(parsed['user-invocable'], 'false')
  assert.equal(parsed['disable-model-invocation'], 'true')
})

test('scanSkillRoot reads name/description and invocation without executing scripts', async () => {
  const root = await makeTempRoot()
  try {
    await writeSkill(root, 'alpha', 'name: alpha\ndescription: Alpha skill')
    await writeSkill(
      root,
      'beta',
      'name: beta\ndescription: Beta skill\ndisable-model-invocation: true\nuser-invocable: false',
    )
    await mkdir(join(root, 'broken'), { recursive: true })
    await writeFile(join(root, 'broken', 'SKILL.md'), '---\nname: broken\n---\n', 'utf8')
    await mkdir(join(root, 'not-a-skill'), { recursive: true })

    const result = await scanSkillRoot(root, 'user-dsh')
    assert.deepEqual(result.skills.map((skill) => skill.name), ['alpha', 'beta'])
    const beta = result.skills.find((skill) => skill.name === 'beta')
    assert.deepEqual(beta.invocation, { modelInvocable: false, userInvocable: false })
    assert.equal(beta.source, 'user-dsh')
    assert.equal(result.warnings.length, 1)
    assert.match(result.warnings[0].error, /description/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

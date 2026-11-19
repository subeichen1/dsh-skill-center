import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  assertManagedSkillPath,
  buildSkillText,
  duplicateSkillDirectory,
  patchFrontmatter,
  readSkillDocument,
  saveSkillDocument,
} from '../lib/editor.js'

async function makeSkill(root, name, extra = '') {
  const directory = join(root, name)
  await mkdir(directory, { recursive: true })
  const text = `---
name: ${name}
description: "A ${name} skill."
version: 1.2.3
license: MIT
metadata:
  owner: test
${extra}---

# ${name}

Original body.
`
  await writeFile(join(directory, 'SKILL.md'), text, 'utf8')
  return join(directory, 'SKILL.md')
}

test('patchFrontmatter replaces requested keys and preserves unknown metadata', () => {
  const frontmatter = `name: old-name
description: old description
version: 1.2.3
license: MIT
metadata:
  owner: test`
  const patched = patchFrontmatter(frontmatter, {
    name: 'new-name',
    description: 'new description',
  })
  assert.match(patched, /name: "new-name"/)
  assert.match(patched, /description: "new description"/)
  assert.match(patched, /version: 1\.2\.3/)
  assert.match(patched, /license: MIT/)
  assert.match(patched, /metadata:\n  owner: test/)
})

test('saveSkillDocument updates body and invocation flags without dropping unknown fields', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skill-center-editor-'))
  try {
    const file = await makeSkill(root, 'edit-me')
    const saved = await saveSkillDocument(file, {
      description: 'Updated description',
      whenToUse: 'When testing',
      modelInvocable: false,
      userInvocable: false,
      body: '# Updated\n\nNew body.',
    })
    assert.equal(saved.description, 'Updated description')
    assert.equal(saved.invocation.modelInvocable, false)
    assert.equal(saved.invocation.userInvocable, false)
    assert.equal(saved.body.includes('New body.'), true)
    const text = await readFile(file, 'utf8')
    assert.match(text, /version: 1\.2\.3/)
    assert.match(text, /metadata:\n  owner: test/)
    assert.match(text, /disable-model-invocation: "true"/)
    assert.match(text, /user-invocable: "false"/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('duplicateSkillDirectory copies resources and rewrites the name', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skill-center-copy-'))
  try {
    const file = await makeSkill(root, 'source-skill')
    await mkdir(join(root, 'source-skill', 'references'), { recursive: true })
    await writeFile(join(root, 'source-skill', 'references', 'note.txt'), 'resource', 'utf8')
    const created = await duplicateSkillDirectory(file, {
      targetRoot: root,
      targetName: 'copied-skill',
      description: 'Copied description',
    })
    const copied = await readSkillDocument(created.path)
    assert.equal(copied.name, 'copied-skill')
    assert.equal(copied.description, 'Copied description')
    assert.equal(await readFile(join(root, 'copied-skill', 'references', 'note.txt'), 'utf8'), 'resource')
    assert.match(await readFile(created.path, 'utf8'), /version: 1\.2\.3/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('assertManagedSkillPath accepts managed roots and rejects an outside directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skill-center-path-'))
  try {
    const file = await makeSkill(join(root, 'skills'), 'inside')
    const managed = await assertManagedSkillPath(file, [{ path: join(root, 'skills'), source: 'user-dsh' }])
    assert.equal(managed.root, join(root, 'skills'))
    const outside = await makeSkill(join(root, 'outside'), 'outside')
    await assert.rejects(
      () => assertManagedSkillPath(outside, [{ path: join(root, 'skills'), source: 'user-dsh' }]),
      /SKILL_OUTSIDE_MANAGED_ROOTS/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('buildSkillText keeps the frontmatter and body canonical', () => {
  const text = buildSkillText({ frontmatter: 'name: one\ndescription: "One."', body: '\n# Body\n' })
  assert.equal(text, '---\nname: one\ndescription: "One."\n---\n\n# Body\n')
})

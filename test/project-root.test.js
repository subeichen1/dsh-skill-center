import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { findProjectRoot } from '../lib/project-root.js'

test('findProjectRoot walks up to the nearest .git directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skill-center-root-'))
  try {
    const project = join(root, 'project')
    const nested = join(project, 'src', 'deep')
    await mkdir(join(project, '.git'), { recursive: true })
    await mkdir(nested, { recursive: true })
    assert.equal(await findProjectRoot(nested), project)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('findProjectRoot treats a .git file as a repository marker', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skill-center-root-'))
  try {
    const project = join(root, 'worktree')
    const nested = join(project, 'a')
    await mkdir(nested, { recursive: true })
    await writeFile(join(project, '.git'), 'gitdir: ../actual\n', 'utf8')
    assert.equal(await findProjectRoot(nested), project)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('findProjectRoot falls back to the original cwd when no .git exists', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skill-center-root-'))
  try {
    const nested = join(root, 'a', 'b')
    await mkdir(nested, { recursive: true })
    assert.equal(await findProjectRoot(nested), nested)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

import { cp, mkdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'

import { parseFrontmatterYaml, readSkillFile, splitFrontmatter } from './scan.js'

export const SKILL_FILE = 'SKILL.md'

/**
 * Validate the directory / frontmatter name used by DSH skills.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeSkillName(value) {
  const name = typeof value === 'string' ? value.trim() : ''
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    throw new Error(`invalid skill name: ${name || '(empty)'}`)
  }
  return name
}

/**
 * True when `child` is `parent` itself or lives below it. Both paths are
 * resolved first; this is the only authorization we use before touching a
 * SKILL.md or a skill directory.
 *
 * @param {string} parent
 * @param {string} child
 */
export function isInsidePath(parent, child) {
  const rel = relative(resolve(parent), resolve(child))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/**
 * Confirm a skill path is inside one of the four managed roots. We also use the
 * real path so a symlink cannot point outside a root and be edited by accident.
 *
 * @param {string} skillPath
 * @param {Array<{path: string, source?: string}>} roots
 * @returns {Promise<{ directory: string, root: string, source?: string }>}
 */
export async function assertManagedSkillPath(skillPath, roots) {
  if (typeof skillPath !== 'string' || !skillPath) throw new Error('NO_LOCAL_FILE')
  if (basename(skillPath) !== SKILL_FILE) throw new Error('INVALID_SKILL_PATH')
  const directory = dirname(resolve(skillPath))
  let realDirectory
  try {
    realDirectory = await realpath(directory)
  } catch {
    realDirectory = directory
  }
  for (const root of roots) {
    const rootPath = resolve(root.path)
    let realRoot
    try {
      realRoot = await realpath(rootPath)
    } catch {
      realRoot = rootPath
    }
    if (isInsidePath(realRoot, realDirectory)) {
      return { directory: realDirectory, root: rootPath, source: root.source }
    }
  }
  throw new Error('SKILL_OUTSIDE_MANAGED_ROOTS')
}

function topLevelKey(line) {
  const match = /^([A-Za-z0-9_-]+)[ \t]*:/.exec(line)
  return match ? match[1] : undefined
}

/**
 * Replace top-level frontmatter keys while preserving every unrelated key
 * (version, license, metadata, argument-hint, ...). New keys are appended when
 * they did not exist before. A value of `undefined` removes the key.
 *
 * @param {string} frontmatter
 * @param {Record<string, string | undefined>} updates
 * @returns {string}
 */
export function patchFrontmatter(frontmatter, updates) {
  const keys = new Set(Object.keys(updates))
  const lines = String(frontmatter ?? '').split(/\r?\n/)
  /** @type {Array<{ key?: string, lines: string[] }>} */
  const blocks = []
  /** @type {{ key?: string, lines: string[] } | undefined} */
  let current
  for (const line of lines) {
    const key = topLevelKey(line)
    if (key !== undefined) {
      current = { key, lines: [line] }
      blocks.push(current)
    } else if (current) {
      current.lines.push(line)
    } else {
      current = { lines: [line] }
      blocks.push(current)
    }
  }

  /** @type {string[]} */
  const output = []
  const written = new Set()
  for (const block of blocks) {
    if (block.key === undefined || !keys.has(block.key)) {
      output.push(...block.lines)
      continue
    }
    const value = updates[block.key]
    if (value !== undefined) {
      output.push(`${block.key}: ${serializeScalar(value)}`)
      written.add(block.key)
    }
    // `undefined` deliberately drops the block.
  }
  for (const key of keys) {
    if (written.has(key)) continue
    const value = updates[key]
    if (value !== undefined) output.push(`${key}: ${serializeScalar(value)}`)
  }
  // Collapse trailing blank lines left by removed final blocks.
  while (output.length && output[output.length - 1].trim() === '') output.pop()
  return output.join('\n')
}

/**
 * JSON double-quoted strings are valid YAML double-quoted scalars for the
 * subset read by parseFrontmatterYaml (and by DSH's own frontmatter reader).
 *
 * @param {string} value
 */
export function serializeScalar(value) {
  return JSON.stringify(String(value))
}

/**
 * Serialize a skill document in the canonical shape used by the file provider.
 *
 * @param {{ frontmatter: string, body?: string }} input
 */
export function buildSkillText({ frontmatter, body = '' }) {
  const cleanBody = String(body).replace(/\r\n/g, '\n').replace(/^\n+/, '')
  return `---\n${frontmatter}\n---\n\n${cleanBody}${cleanBody.endsWith('\n') ? '' : '\n'}`
}

/**
 * Read the editable view of a skill. Unknown frontmatter stays opaque in
 * `frontmatter`; only the fields the UI edits are lifted into the response.
 *
 * @param {string} skillPath
 */
export async function readSkillDocument(skillPath) {
  const text = await readFile(skillPath, 'utf8')
  const split = splitFrontmatter(text)
  if (!split) throw new Error('missing YAML frontmatter')
  const data = parseFrontmatterYaml(split.frontmatter)
  const name = typeof data.name === 'string' ? data.name.trim() : ''
  const description = typeof data.description === 'string' ? data.description.trim() : ''
  if (!name) throw new Error('frontmatter.name must be a non-empty string')
  if (!description) throw new Error('frontmatter.description must be a non-empty string')
  const whenToUse =
    typeof data.whenToUse === 'string'
      ? data.whenToUse
      : typeof data['when-to-use'] === 'string'
        ? data['when-to-use']
        : ''
  return {
    path: resolve(skillPath),
    name,
    description,
    whenToUse,
    invocation: {
      modelInvocable: !(data['disable-model-invocation'] === true || data['disable-model-invocation'] === 'true'),
      userInvocable: !(data['user-invocable'] === false || data['user-invocable'] === 'false'),
    },
    frontmatter: split.frontmatter,
    body: split.body.replace(/^\r?\n/, ''),
  }
}

/**
 * Write one skill document. The name is intentionally taken from the existing
 * document; renaming is a copy operation because it has to move a directory.
 *
 * @param {string} skillPath
 * @param {{ description: string, whenToUse?: string, modelInvocable?: boolean, userInvocable?: boolean, body?: string }} input
 */
export async function saveSkillDocument(skillPath, input) {
  const current = await readSkillDocument(skillPath)
  const description = typeof input.description === 'string' ? input.description.trim() : ''
  if (!description) throw new Error('description must be a non-empty string')
  const updates = {
    description,
    'when-to-use': typeof input.whenToUse === 'string' && input.whenToUse.trim() ? input.whenToUse.trim() : undefined,
    'disable-model-invocation': input.modelInvocable === false ? 'true' : undefined,
    'user-invocable': input.userInvocable === false ? 'false' : undefined,
  }
  // Keep `whenToUse` if a file used that spelling rather than `when-to-use`.
  if (current.frontmatter.includes('whenToUse:')) {
    updates.whenToUse = typeof input.whenToUse === 'string' && input.whenToUse.trim() ? input.whenToUse.trim() : undefined
    delete updates['when-to-use']
  }
  const frontmatter = patchFrontmatter(current.frontmatter, updates)
  const text = buildSkillText({ frontmatter, body: input.body === undefined ? current.body : input.body })
  const temporary = `${skillPath}.${process.pid}.${Date.now()}.tmp`
  try {
    await writeFile(temporary, text, 'utf8')
    await rename(temporary, skillPath)
  } catch (error) {
    try {
      await rm(temporary, { force: true })
    } catch {
      // Best-effort cleanup only.
    }
    throw error
  }
  return readSkillDocument(skillPath)
}

/**
 * Copy a skill directory to a sibling directory under the same managed root.
 * Resources referenced by SKILL.md are copied with the directory.
 *
 * @param {string} skillPath
 * @param {{ targetRoot: string, targetName: string, description?: string }} input
 */
export async function duplicateSkillDirectory(skillPath, input) {
  const sourceDirectory = dirname(resolve(skillPath))
  const targetName = normalizeSkillName(input.targetName)
  const targetRoot = resolve(input.targetRoot)
  const targetDirectory = join(targetRoot, targetName)
  try {
    await stat(targetDirectory)
    throw new Error('TARGET_EXISTS')
  } catch (error) {
    if (error && error.code !== 'ENOENT') throw error
  }
  await mkdir(targetRoot, { recursive: true })
  await cp(sourceDirectory, targetDirectory, { recursive: true, force: false, errorOnExist: true })
  try {
    const targetFile = join(targetDirectory, SKILL_FILE)
    const source = await readSkillDocument(skillPath)
    const description =
      typeof input.description === 'string' && input.description.trim()
        ? input.description.trim()
        : source.description
    const frontmatter = patchFrontmatter(source.frontmatter, {
      name: targetName,
      description,
    })
    await writeFile(targetFile, buildSkillText({ frontmatter, body: source.body }), 'utf8')
  } catch (error) {
    await rm(targetDirectory, { recursive: true, force: true }).catch(() => {})
    throw error
  }
  return { name: targetName, path: join(targetDirectory, SKILL_FILE), root: targetRoot }
}

/**
 * Delete one skill directory after the caller has authorized its path.
 *
 * @param {string} skillPath
 */
export async function deleteSkillDirectory(skillPath) {
  const directory = dirname(resolve(skillPath))
  if (basename(skillPath) !== SKILL_FILE) throw new Error('INVALID_SKILL_PATH')
  await rm(directory, { recursive: true, force: false })
  return { directory }
}

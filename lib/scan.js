import { readdir, readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'

/**
 * Split YAML frontmatter from a markdown file. Only frontmatter beginning on
 * the very first line is accepted, matching the built-in filesystem provider.
 *
 * @param {string} text
 * @returns {{ frontmatter: string, body: string } | undefined}
 */
export function splitFrontmatter(text) {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source)
  if (!match) return undefined
  return {
    frontmatter: match[1],
    body: source.slice(match[0].length),
  }
}

/**
 * Parse the small top-level YAML subset used by SKILL.md frontmatter. This is
 * intentionally dependency-free: the skill center must be able to scan disks
 * even when another provider is unavailable, and it never executes content.
 *
 * Supported scalar forms: plain, 'single quoted', "double quoted", and `|` /
 * `>` block scalars with the usual chomping indicators. Nested mappings are
 * ignored because the center only needs name/description/whenToUse and the two
 * invocation flags.
 *
 * @param {string} frontmatter
 * @returns {Record<string, unknown>}
 */
export function parseFrontmatterYaml(frontmatter) {
  /** @type {Record<string, unknown>} */
  const result = {}
  const lines = frontmatter.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim().length === 0 || line.trimStart().startsWith('#')) continue
    if (/^[ \t]/.test(line)) continue
    const keyMatch = /^([A-Za-z0-9_-]+)[ \t]*:[ \t]*(.*)$/.exec(line)
    if (!keyMatch) continue
    const key = keyMatch[1]
    const rawValue = keyMatch[2]

    if (/^[|>][+-]?$/.test(rawValue.trim())) {
      const style = rawValue.trim()[0]
      const chomp = rawValue.trim().slice(1)
      const block = []
      let cursor = index + 1
      let indent = undefined
      for (; cursor < lines.length; cursor += 1) {
        const next = lines[cursor]
        if (next.trim().length === 0) {
          block.push('')
          continue
        }
        const nextIndent = next.length - next.trimStart().length
        if (indent === undefined) indent = nextIndent
        if (nextIndent < indent) break
        block.push(next.slice(indent))
      }
      index = cursor - 1
      let value = style === '|' ? block.join('\n') : foldBlock(block)
      if (chomp !== '-') value += '\n'
      if (chomp === '-') value = value.replace(/\n+$/, '')
      result[key] = value
      continue
    }

    if (rawValue.startsWith('[') || rawValue.startsWith('{')) {
      // The center does not use collection values; keep them opaque.
      result[key] = rawValue.trim()
      continue
    }

    if (rawValue.startsWith("'") || rawValue.startsWith('"')) {
      const quote = rawValue[0]
      const chunks = [rawValue]
      let cursor = index + 1
      while (!isClosedQuote(chunks.join('\n'), quote) && cursor < lines.length) {
        chunks.push(lines[cursor])
        cursor += 1
      }
      index = cursor - 1
      result[key] = unquoteScalar(chunks.join('\n'), quote)
      continue
    }

    // Plain scalar: YAML permits indented continuation lines.
    const chunks = [rawValue.trim()]
    let cursor = index + 1
    for (; cursor < lines.length; cursor += 1) {
      const next = lines[cursor]
      if (next.trim().length === 0) break
      if (!/^[ \t]+/.test(next)) break
      chunks.push(next.trim())
    }
    index = cursor - 1
    result[key] = chunks.filter(Boolean).join(' ')
  }
  return result
}

/**
 * @param {string[]} lines
 * @returns {string}
 */
function foldBlock(lines) {
  let out = ''
  let previousBlank = true
  for (const line of lines) {
    if (line.length === 0) {
      out += '\n'
      previousBlank = true
      continue
    }
    if (!previousBlank) out += ' '
    out += line
    previousBlank = false
  }
  return out
}

/**
 * @param {string} text
 * @param {string} quote
 * @returns {boolean}
 */
function isClosedQuote(text, quote) {
  if (quote === "'") {
    let escaped = false
    for (let i = 1; i < text.length; i += 1) {
      if (text[i] === "'") {
        if (escaped) {
          escaped = false
          continue
        }
        if (i + 1 < text.length && text[i + 1] === "'") {
          i += 1
          continue
        }
        if (i > 0) return true
      }
    }
    return false
  }
  let backslashes = 0
  for (let i = 1; i < text.length; i += 1) {
    if (text[i] === '\\') {
      backslashes += 1
      continue
    }
    if (text[i] === '"' && backslashes % 2 === 0) return true
    backslashes = 0
  }
  return false
}

/**
 * @param {string} text
 * @param {string} quote
 * @returns {string}
 */
function unquoteScalar(text, quote) {
  const trimmed = text.trim()
  if (quote === "'") {
    const inner = trimmed.startsWith("'") ? trimmed.slice(1) : trimmed
    const end = inner.lastIndexOf("'")
    return (end >= 0 ? inner.slice(0, end) : inner).replace(/''/g, "'").trim()
  }
  try {
    return JSON.parse(trimmed)
  } catch {
    const inner = trimmed.startsWith('"') ? trimmed.slice(1) : trimmed
    const end = inner.lastIndexOf('"')
    return (end >= 0 ? inner.slice(0, end) : inner).replace(/\\"/g, '"').trim()
  }
}

/**
 * Read and validate one SKILL.md file without executing anything.
 *
 * @param {string} filePath
 * @returns {Promise<{ name: string, description: string, whenToUse?: string, invocation: {modelInvocable: boolean, userInvocable: boolean} }>}
 */
export async function readSkillFile(filePath) {
  const text = await readFile(filePath, 'utf8')
  const split = splitFrontmatter(text)
  if (!split) throw new Error('missing YAML frontmatter')
  const data = parseFrontmatterYaml(split.frontmatter)
  const name = typeof data.name === 'string' ? data.name.trim() : ''
  const description = typeof data.description === 'string' ? data.description.trim() : ''
  if (!name) throw new Error('frontmatter.name must be a non-empty string')
  if (!description) throw new Error('frontmatter.description must be a non-empty string')
  const whenToUse = typeof data.whenToUse === 'string' && data.whenToUse.trim()
    ? data.whenToUse.trim()
    : typeof data['when-to-use'] === 'string' && data['when-to-use'].trim()
      ? data['when-to-use'].trim()
      : undefined
  const disableModel = data['disable-model-invocation'] === true || data['disable-model-invocation'] === 'true'
  const disableUser = data['user-invocable'] === false || data['user-invocable'] === 'false'
  return {
    name,
    description,
    ...(whenToUse === undefined ? {} : { whenToUse }),
    invocation: {
      modelInvocable: !disableModel,
      userInvocable: !disableUser,
    },
  }
}

/**
 * Scan one skills directory. Entries are directories containing SKILL.md.
 * Invalid skills are reported as warnings and left out, matching the
 * filesystem provider's tolerance for a broken skill directory.
 *
 * @param {string} root
 * @param {string} source
 * @returns {Promise<{ skills: Array<Record<string, any>>, warnings: Array<{path: string, error: string}> }>}
 */
export async function scanSkillRoot(root, source) {
  /** @type {Array<Record<string, any>>} */
  const skills = []
  /** @type {Array<{path: string, error: string}>} */
  const warnings = []
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) return { skills, warnings }
    warnings.push({ path: root, error: String(error && error.message ? error.message : error) })
    return { skills, warnings }
  }
  entries.sort((left, right) => left.name.localeCompare(right.name))
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const filePath = join(root, entry.name, 'SKILL.md')
    try {
      const info = await stat(filePath)
      if (!info.isFile()) continue
      const parsed = await readSkillFile(filePath)
      skills.push({
        ...parsed,
        path: resolve(filePath),
        source,
        root,
        dirName: entry.name,
      })
    } catch (error) {
      if (error && error.code === 'ENOENT') continue
      warnings.push({ path: filePath, error: String(error && error.message ? error.message : error) })
    }
  }
  return { skills, warnings }
}

/**
 * Scan all four roots required by the skill center. The returned list is
 * deduplicated by name within the scan view, preserving root order (project
 * roots first, then user roots).
 *
 * @param {Array<{path: string, source: string}>} roots
 * @returns {Promise<{ skills: Array<Record<string, any>>, warnings: Array<{path: string, error: string}> }>}
 */
export async function scanSkillRoots(roots) {
  /** @type {Array<Record<string, any>>} */
  const skills = []
  /** @type {Array<{path: string, error: string}>} */
  const warnings = []
  const seen = new Set()
  for (const root of roots) {
    const result = await scanSkillRoot(root.path, root.source)
    warnings.push(...result.warnings)
    for (const skill of result.skills) {
      if (seen.has(skill.name)) continue
      seen.add(skill.name)
      skills.push(skill)
    }
  }
  return { skills, warnings }
}

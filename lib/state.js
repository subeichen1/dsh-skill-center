import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export const STATE_VERSION = 1

/**
 * Empty state shape. State files only contain entries the user explicitly
 * changed; defaults are always computed at read time and never persisted.
 *
 * @returns {{version: number, skills: Record<string, {state: 'on'|'off', description?: string, path?: string, source?: string}>}}
 */
export function emptyState() {
  return { version: STATE_VERSION, skills: {} }
}

/**
 * Normalize an on-disk object. Unknown fields are dropped, invalid entries are
 * ignored, and only explicit on/off states survive. This makes a corrupt or
 * hand-edited file harmless to the listing path.
 *
 * @param {unknown} raw
 * @returns {{version: number, skills: Record<string, {state: 'on'|'off', description?: string, path?: string, source?: string}>}}
 */
export function normalizeState(raw) {
  const state = emptyState()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return state
  const skills = /** @type {Record<string, unknown>} */ (raw).skills
  if (!skills || typeof skills !== 'object' || Array.isArray(skills)) return state
  for (const [name, value] of Object.entries(skills)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const entry = /** @type {Record<string, unknown>} */ (value)
    if (entry.state !== 'on' && entry.state !== 'off') continue
    /** @type {{state: 'on'|'off', description?: string, path?: string, source?: string}} */
    const normalized = { state: entry.state }
    if (typeof entry.description === 'string') normalized.description = entry.description
    if (typeof entry.path === 'string') normalized.path = entry.path
    if (typeof entry.source === 'string') normalized.source = entry.source
    state.skills[name] = normalized
  }
  return state
}

/**
 * Read one state file. A missing file is a normal empty state; malformed JSON
 * produces a warning but never prevents the rest of the UI from loading.
 *
 * @param {string} filePath
 * @returns {Promise<{ state: ReturnType<typeof emptyState>, exists: boolean, warning?: string }>}
 */
export async function readStateFile(filePath) {
  let text
  try {
    text = await readFile(filePath, 'utf8')
  } catch (error) {
    if (error && error.code === 'ENOENT') return { state: emptyState(), exists: false }
    return {
      state: emptyState(),
      exists: false,
      warning: `无法读取状态文件 ${filePath}: ${String(error && error.message ? error.message : error)}`,
    }
  }
  try {
    return { state: normalizeState(JSON.parse(text)), exists: true }
  } catch (error) {
    return {
      state: emptyState(),
      exists: true,
      warning: `状态文件不是合法 JSON，已按空状态处理 ${filePath}: ${String(error && error.message ? error.message : error)}`,
    }
  }
}

/**
 * Global state path under <DSH_HOME>/skill-center/state.json.
 *
 * @param {string} dshHome
 * @returns {string}
 */
export function globalStatePath(dshHome) {
  return join(dshHome, 'skill-center', 'state.json')
}

/**
 * Project state path under <projectRoot>/.dsh/skill-center.json. It is
 * deliberately outside .dsh/skills and .agents/skills so the filesystem skill
 * provider can never mistake the state file for a skill.
 *
 * @param {string} projectRoot
 * @returns {string}
 */
export function projectStatePath(projectRoot) {
  return join(projectRoot, '.dsh', 'skill-center.json')
}

/**
 * Read-time effective state. The order is project -> global -> source default:
 * project-level skills default on, user-level skills (user-dsh, user-agents,
 * custom) default off. Nothing is written while computing this.
 *
 * @param {string} name
 * @param {string} source
 * @param {{skills: Record<string, {state: 'on'|'off'}>}} projectState
 * @param {{skills: Record<string, {state: 'on'|'off'}>}} globalState
 * @returns {'on'|'off'}
 */
export function effectiveState(name, source, projectState, globalState) {
  const projectEntry = projectState && projectState.skills ? projectState.skills[name] : undefined
  if (projectEntry) return projectEntry.state
  const globalEntry = globalState && globalState.skills ? globalState.skills[name] : undefined
  if (globalEntry) return globalEntry.state
  return typeof source === 'string' && source.startsWith('project-') ? 'on' : 'off'
}

/**
 * Return a new state object with one explicit entry set, or removed for
 * `inherit`. Pure helper used by the future write API and unit tests.
 *
 * @param {ReturnType<typeof emptyState>} state
 * @param {string} name
 * @param {'on'|'off'|'inherit'} next
 * @param {{description?: string, path?: string, source?: string}} [cache]
 * @returns {ReturnType<typeof emptyState>}
 */
export function withStateEntry(state, name, next, cache = {}) {
  /** @type {ReturnType<typeof emptyState>} */
  const copy = {
    version: STATE_VERSION,
    skills: { ...(state && state.skills ? state.skills : {}) },
  }
  if (next === 'inherit') {
    delete copy.skills[name]
    return copy
  }
  /** @type {{state: 'on'|'off', description?: string, path?: string, source?: string}} */
  const entry = { state: next }
  if (typeof cache.description === 'string') entry.description = cache.description
  if (typeof cache.path === 'string') entry.path = cache.path
  if (typeof cache.source === 'string') entry.source = cache.source
  copy.skills[name] = entry
  return copy
}

/**
 * Atomically replace a JSON state file. The temporary file lives beside the
 * target so rename stays on the same volume.
 *
 * @param {string} filePath
 * @param {ReturnType<typeof emptyState>} state
 */
export async function writeStateFile(filePath, state) {
  const directory = dirname(filePath)
  await mkdir(directory, { recursive: true })
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`
  const text = `${JSON.stringify(state, null, 2)}\n`
  try {
    await writeFile(temporary, text, 'utf8')
    await rename(temporary, filePath)
  } catch (error) {
    try {
      await rm(temporary, { force: true })
    } catch {
      // Best-effort cleanup only.
    }
    throw error
  }
}

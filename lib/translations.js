/**
 * Automatic bilingual display descriptions.
 *
 * The model-facing skill catalog always keeps the original SKILL.md text. This
 * module only fills the UI's `descriptionZh` / `descriptionEn` fields, using the
 * Host translator service when it is mounted, with the active chat model as a
 * fallback. Results are cached under <DSH_HOME>/skill-center/descriptions.json
 * so a page refresh never pays for the same translation twice.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { manualDescriptions } from './descriptions.js'
import { countCjk } from './tokens.js'

const CACHE_VERSION = 1
const MAX_TEXT_CHARS = 4_000
const RETRY_AFTER_MS = 10 * 60 * 1_000

/** @type {Map<string, Promise<unknown>>} */
const inflight = new Map()
let translationWriteQueue = Promise.resolve()

/**
 * @param {string} text
 * @returns {string}
 */
export function descriptionFingerprint(text) {
  return createHash('sha256').update(String(text ?? ''), 'utf8').digest('hex')
}

/**
 * Chinese descriptions contain CJK characters; an English description does
 * not. The threshold tolerates a product name or a quoted Chinese phrase in an
 * otherwise English description.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function looksChinese(text) {
  const value = typeof text === 'string' ? text.trim() : ''
  if (!value) return false
  const total = [...value].length
  return countCjk(value) / total >= 0.2
}

/**
 * @param {string} dshHome
 * @returns {string}
 */
export function translationCachePath(dshHome) {
  return join(dshHome, 'skill-center', 'descriptions.json')
}

/** @returns {{version: number, entries: Record<string, any>}} */
export function emptyTranslationCache() {
  return { version: CACHE_VERSION, entries: {} }
}

/**
 * @param {string} filePath
 * @returns {Promise<{cache: {version: number, entries: Record<string, any>}, warning?: string}>}
 */
export async function readTranslationCache(filePath) {
  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw)
    const entries =
      parsed && parsed.entries && typeof parsed.entries === 'object' && !Array.isArray(parsed.entries)
        ? parsed.entries
        : {}
    return { cache: { version: CACHE_VERSION, entries } }
  } catch (error) {
    if (error && error.code === 'ENOENT') return { cache: emptyTranslationCache() }
    return {
      cache: emptyTranslationCache(),
      warning: `翻译缓存读取失败: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * @param {string} filePath
 * @param {{version: number, entries: Record<string, any>}} cache
 * @returns {Promise<void>}
 */
export async function writeTranslationCache(filePath, cache) {
  const run = translationWriteQueue.then(async () => {
    await mkdir(dirname(filePath), { recursive: true })
    const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`
    await writeFile(temporary, `${JSON.stringify({ version: CACHE_VERSION, entries: cache.entries }, null, 2)}\n`, 'utf8')
    await rename(temporary, filePath)
  })
  translationWriteQueue = run.catch(() => {})
  return run
}

/**
 * @param {Record<string, any> | undefined} entry
 * @param {string} original
 * @returns {boolean}
 */
function validCacheEntry(entry, original) {
  return Boolean(entry && entry.hash === descriptionFingerprint(original))
}

/**
 * @param {Record<string, any> | undefined} entry
 * @returns {boolean}
 */
function retryBlocked(entry) {
  return Boolean(entry && typeof entry.failedAt === 'number' && Date.now() - entry.failedAt < RETRY_AFTER_MS)
}

/**
 * Which UI languages need a generated translation for this skill?
 *
 * Manual translations in descriptions.js win over generated ones. An English
 * original needs a Chinese translation; a Chinese original needs an English
 * translation. A cached entry is only usable while the source text hash still
 * matches, so editing SKILL.md automatically invalidates the old translation.
 *
 * @param {{name: string, description: string}} skill
 * @param {{entries: Record<string, any>}} cache
 * @returns {{zh: boolean, en: boolean}}
 */
export function translationPlan(skill, cache) {
  const original = typeof skill?.description === 'string' ? skill.description.trim() : ''
  if (!original) return { zh: false, en: false }
  const manual = manualDescriptions(skill.name)
  const entry = cache?.entries?.[skill.name]
  const usable = validCacheEntry(entry, original)
  const blocked = usable && retryBlocked(entry)
  const chineseSource = looksChinese(original)
  return {
    zh: !chineseSource && !manual.zh && !(usable && entry.zh) && !blocked,
    en: chineseSource && !manual.en && !(usable && entry.en) && !blocked,
  }
}

/**
 * @param {any} ctx
 * @param {string} name
 * @returns {any}
 */
function service(ctx, name) {
  try {
    return typeof ctx?.get === 'function' ? ctx.get(name) : undefined
  } catch {
    return undefined
  }
}

/**
 * @param {string} text
 * @param {number} limit
 * @returns {string}
 */
function clipText(text, limit = MAX_TEXT_CHARS) {
  const value = String(text ?? '').trim()
  if (value.length <= limit) return value
  return `${value.slice(0, Math.max(1, limit - 20)).trimEnd()}…`
}

/**
 * Collect text deltas from an LLM stream and reject terminal failures.
 *
 * @param {AsyncIterable<any>} stream
 * @returns {Promise<string>}
 */
async function collectStreamText(stream) {
  let text = ''
  let finished = false
  for await (const chunk of stream) {
    if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
    if (chunk?.type === 'finish') {
      finished = true
      const kind = chunk.reason?.kind
      if (kind === 'error' || kind === 'aborted') {
        throw new Error(`LLM translation ended with ${kind}: ${chunk.reason?.failure?.message ?? 'unknown error'}`)
      }
      if (kind === 'max-tokens') throw new Error('LLM translation was truncated at the token cap')
    }
  }
  if (!finished) throw new Error('LLM translation emitted no terminal finish')
  return text.trim()
}

/**
 * Translate one description to `zh` or `en`.
 *
 * Preferred route: the Host `translator` service (anonymous Bing/Google by
 * default, no login). Fallback: the current default chat model via `llm`.
 *
 * @param {any} ctx
 * @param {string} text
 * @param {'zh' | 'en'} target
 * @param {AbortSignal | undefined} signal
 * @returns {Promise<string>}
 */
export async function translateDescription(ctx, text, target, signal) {
  const clipped = clipText(text)
  if (!clipped) return ''

  const translator = service(ctx, 'translator')
  if (translator && typeof translator.resolve === 'function' && typeof translator.translate === 'function') {
    try {
      const maxChars = Number.isFinite(translator.maxTextChars) ? Math.max(2, translator.maxTextChars) : MAX_TEXT_CHARS
      const spec = translator.resolve({
        text: clipText(clipped, maxChars),
        targetLanguage: target === 'zh' ? 'zh' : 'en',
      })
      const result = await translator.translate(spec, signal)
      if (typeof result === 'string' && result.trim()) return result.trim()
    } catch {
      // Fall through to the model route. A deployment can have the translator
      // contract in its catalog without a usable anonymous route.
    }
  }

  const llm = service(ctx, 'llm')
  const defaultModel = service(ctx, 'agentDefaultModel')
  const selection = defaultModel && typeof defaultModel.currentSelection === 'function' ? defaultModel.currentSelection() : undefined
  if (llm && typeof llm.stream === 'function' && selection?.provider && selection?.model) {
    const language = target === 'zh' ? 'Simplified Chinese' : 'English'
    const stream = llm.stream({
      provider: selection.provider,
      model: selection.model,
      system:
        `You translate skill descriptions for a developer tool. Translate the user's description into ${language}. ` +
        'Preserve product names, technical terms, file names, paths, flags and punctuation. Return only the translation, without quotes, labels or explanation.',
      messages: [{ role: 'user', content: [{ type: 'text', text: clipped }] }],
      temperature: 0,
      maxTokens: 900,
      ...(signal === undefined ? {} : { signal }),
    })
    const result = await collectStreamText(stream)
    if (result) return result
  }

  throw new Error('no translation provider available (translator and llm are both unavailable)')
}

/**
 * Run `worker` over `items`, limiting concurrency.
 *
 * @template T, R
 * @param {T[]} items
 * @param {number} concurrency
 * @param {(item: T) => Promise<R>} worker
 * @returns {Promise<R[]>}
 */
async function mapLimit(items, concurrency, worker) {
  let cursor = 0
  const results = new Array(items.length)
  async function run() {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await worker(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, run))
  return results
}

/**
 * Fill missing display descriptions for all skills and persist the cache.
 *
 * @param {{
 *   ctx: any,
 *   skills: Array<{name: string, description: string}>,
 *   cache: {version: number, entries: Record<string, any>},
 *   dshHome: string,
 *   signal?: AbortSignal,
 *   concurrency?: number,
 * }} input
 * @returns {Promise<{
 *   entries: Record<string, any>,
 *   stats: { attempted: number, translated: number, failed: number, errors: string[] }
 * }>}
 */
export async function ensureSkillDescriptions({ ctx, skills, cache, dshHome, signal, concurrency = 2 }) {
  /** @type {Record<string, any>} */
  const entries = { ...(cache?.entries ?? {}) }
  const jobs = []
  for (const skill of skills) {
    const plan = translationPlan(skill, { entries })
    if (!plan.zh && !plan.en) continue
    jobs.push({ skill, plan })
  }

  const stats = { attempted: 0, translated: 0, failed: 0, errors: [] }
  if (jobs.length === 0) return { entries, stats }

  await mapLimit(jobs, concurrency, async ({ skill, plan }) => {
    const original = skill.description.trim()
    const hash = descriptionFingerprint(original)
    const previous = validCacheEntry(entries[skill.name], original) ? { ...entries[skill.name] } : { hash }
    const next = { hash }
    if (previous.zh) next.zh = previous.zh
    if (previous.en) next.en = previous.en

    for (const target of ['zh', 'en']) {
      if (!plan[target]) continue
      stats.attempted += 1
      const key = `${skill.name}\u0000${target}\u0000${hash}`
      try {
        let task = inflight.get(key)
        if (!task) {
          task = translateDescription(ctx, original, target, signal)
          inflight.set(key, task)
          task.finally(() => inflight.delete(key)).catch(() => {})
        }
        const translated = await task
        if (translated) {
          next[target] = translated
          stats.translated += 1
        }
      } catch (error) {
        stats.failed += 1
        stats.errors.push(`${skill.name} (${target}): ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    if (next.zh || next.en) {
      next.updatedAt = new Date().toISOString()
      delete next.failedAt
    } else {
      next.failedAt = Date.now()
    }
    entries[skill.name] = next
  })

  try {
    await writeTranslationCache(translationCachePath(dshHome), { version: CACHE_VERSION, entries })
  } catch (error) {
    stats.errors.push(`翻译缓存写入失败: ${error instanceof Error ? error.message : String(error)}`)
  }
  return { entries, stats }
}

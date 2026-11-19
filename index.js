import { resolveAgentsHome, resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import {
  assertManagedSkillPath,
  deleteSkillDirectory,
  duplicateSkillDirectory,
  normalizeSkillName,
  readSkillDocument,
  saveSkillDocument,
} from './lib/editor.js'
import { buildInventory } from './lib/inventory.js'
import { buildSkillRoots, listOffSkills } from './lib/live.js'
import { applySkillState, resolveStateFileForScope } from './lib/mutation.js'
import { registerPreStepNotice } from './lib/notice.js'
import { findProjectRoot } from './lib/project-root.js'
import { scanSkillRoots } from './lib/scan.js'
import { inspectAgentScopes } from './lib/scope-check.js'
import { createShadowProvider } from './lib/shadow.js'
import { globalStatePath, projectStatePath, readStateFile, writeStateFile } from './lib/state.js'
import {
  ensureSkillDescriptions,
  readTranslationCache,
  translationCachePath,
} from './lib/translations.js'

export const name = 'dsh-skill-center'
export const inject = ['skills', 'webServer']

export const ROUTE = '/skill-center/api'
const MAX_BODY_BYTES = 1_000_000
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** @type {(() => void) | undefined} */
let invalidateShadowProvider

/**
 * Invalidation callbacks for providers installed in individual agent scopes.
 * The registry keeps one provider table per scope; a scoped table shadows the
 * global table for the same name, so every live agent needs its own copy.
 *
 * @type {Set<() => void>}
 */
const scopedInvalidators = new Set()

/** Serialize state-file writes so two quick clicks cannot lose an update. */
let stateWriteQueue = Promise.resolve()

/**
 * @template T
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 */
function enqueueStateWrite(task) {
  const run = stateWriteQueue.then(task, task)
  stateWriteQueue = run.catch(() => {})
  return run
}

class ApiError extends Error {
  /**
   * @param {number} status
   * @param {string} code
   * @param {string} message
   */
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

/**
 * Host half of the Skill Center.
 *
 * P2 keeps the provider registration synchronous (the registry requires that)
 * and hands it an independent disk+state reader. The provider cannot call
 * ctx.skills.snapshot(): it is itself called by collectFresh(), so doing that
 * would recurse. listOffSkills() scans the same four roots directly.
 */
export function apply(ctx) {
  const logger = ctx.logger
  const homeDefaults = () => ({
    dshHome: resolveDshHome(),
    agentsHome: resolveAgentsHome(),
  })
  // A hot reload creates a fresh module instance in a new fiber, but the old
  // WeakSet may still remember agent contexts whose providers were disposed
  // with the previous fiber. Reset the bookkeeping so every live agent gets a
  // provider again in this fiber.
  scopedContexts = new WeakSet()
  scopedInvalidators.clear()
  scopedInstallStats = {
    attempts: 0,
    installed: 0,
    createdEvents: 0,
    createdInstalled: 0,
    noContext: 0,
    noService: 0,
    errors: [],
  }
  try {
    const create = createShadowProvider({
      getOffSkills: (options) => listOffSkills(options, homeDefaults()),
    })
    ctx.skills.registerProvider((control) => {
      invalidateShadowProvider = control.invalidate
      return create(control)
    })
  } catch (error) {
    logger?.warn?.(`[skill-center] shadow provider registration failed: ${errorMessage(error)}`)
    throw error
  }

  // Future agents: register the listener before touching the existing list.
  // If one stale agent's context cannot be inspected, the exception must not
  // abort this block and leave later agents (or this listener) unregistered.
  if (typeof ctx.on === 'function') {
    ctx.on(
      'agent/created',
      ({ agent }) => {
        scopedInstallStats.createdEvents += 1
        try {
          if (installScopedShadow(ctx, agent, homeDefaults)) scopedInstallStats.createdInstalled += 1
        } catch (error) {
          logger?.warn?.(`[skill-center] agent/created shadow install failed: ${errorMessage(error)}`)
        }
      },
      { global: true, prepend: true },
    )
  }
  // Existing sessions may already have a live agent when this plugin is
  // reloaded; install their scoped shadow now.
  try {
    const agents = typeof ctx.get === 'function' ? ctx.get('agents') : undefined
    if (agents && typeof agents.list === 'function') {
      for (const agent of agents.list()) {
        try {
          installScopedShadow(ctx, agent, homeDefaults)
        } catch (error) {
          logger?.warn?.(`[skill-center] existing agent shadow install failed: ${errorMessage(error)}`)
        }
      }
    }
  } catch (error) {
    logger?.warn?.(`[skill-center] agent scope shadow setup failed: ${errorMessage(error)}`)
  }

  // Scoped providers are installed from `agent/created` and from the existing
  // agent list above. Do not install providers from inside a pre-step listener:
  // registering a provider mutates the scope layers that the very same dispatch
  // is iterating, which can tear the cascade in the middle of a turn.
  registerPreStepNotice(ctx, homeDefaults)

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: ROUTE,
        handler: (request, response) => handleRequest(ctx, request, response),
      }),
    'skill-center.route',
  )
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

/** Agent scopes that already own a skill-center provider in this fiber. */
let scopedContexts = new WeakSet()

/** Lightweight diagnostics for the next P2 banner and for live verification. */
let scopedInstallStats = {
  attempts: 0,
  installed: 0,
  createdEvents: 0,
  createdInstalled: 0,
  noContext: 0,
  noService: 0,
  errors: /** @type {string[]} */ ([]),
}

/**
 * Register the shadow provider inside one agent's scope.
 *
 * This is the second half of the layer story. The global registration wins
 * within the global layer, but an agent preset's standing mount can register
 * skill-filesystem in the agent's own layer; `collectFresh` merges global first
 * and then every scope layer, so the later scope entry replaces our global
 * shadow by name. Registering the same provider through `agent.ctx` creates a
 * rank-0 competitor in that exact layer, where it beats every filesystem rank.
 *
 * @param {any} ctx
 * @param {any} agent
 * @param {() => { dshHome: string, agentsHome: string }} homeDefaults
 * @returns {boolean}
 */
function installScopedShadow(ctx, agent, homeDefaults) {
  scopedInstallStats.attempts += 1
  const agentCtx = agent?.ctx
  if (!agentCtx) {
    scopedInstallStats.noContext += 1
    return false
  }
  if (scopedContexts.has(agentCtx)) return false
  let skills
  try {
    // `agentCtx.skills` is guarded by Cordis' service-injection check and
    // throws "cannot get property ... without inject" on contexts that do not
    // declare the dependency. `get()` is the safe lookup used by plugins.
    skills = typeof agentCtx.get === 'function' ? agentCtx.get('skills') : agentCtx.skills
  } catch (error) {
    scopedInstallStats.errors.push(errorMessage(error))
    ctx.logger?.warn?.(`[skill-center] scoped skills lookup failed: ${errorMessage(error)}`)
    return false
  }
  if (!skills || typeof skills.registerProvider !== 'function') {
    scopedInstallStats.noService += 1
    return false
  }
  try {
    const create = createShadowProvider({
      getOffSkills: (options) => listOffSkills(options, homeDefaults()),
    })
    skills.registerProvider((control) => {
      const invalidate = control.invalidate
      scopedInvalidators.add(invalidate)
      control.signal.addEventListener('abort', () => scopedInvalidators.delete(invalidate), { once: true })
      return create(control)
    })
    scopedContexts.add(agentCtx)
    scopedInstallStats.installed += 1
    return true
  } catch (error) {
    // Re-registering after a reload can race an older scope owner. A duplicate
    // name is already covered by that provider, so only warn for real failures.
    if (!String(errorMessage(error)).includes('already registered')) {
      scopedInstallStats.errors.push(errorMessage(error))
      ctx.logger?.warn?.(`[skill-center] scoped shadow registration failed: ${errorMessage(error)}`)
    }
    return false
  }
}

/** Invalidate both the global provider and every live agent-scope provider. */
function invalidateShadowProviders() {
  invalidateShadowProvider?.()
  for (const invalidate of [...scopedInvalidators]) {
    try {
      invalidate()
    } catch {
      // A disposed agent scope is allowed to disappear between ticks.
    }
  }
}

/**
 * @param {import('node:http').ServerResponse} response
 * @param {number} status
 * @param {unknown} payload
 */
function writeJson(response, status, payload) {
  const text = JSON.stringify(payload)
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('cache-control', 'no-store')
  response.setHeader('content-length', Buffer.byteLength(text))
  response.end(text)
}

/**
 * @param {import('node:http').IncomingMessage} request
 * @param {number} limit
 * @returns {Promise<string>}
 */
function readBody(request, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error(`request body exceeds ${limit} bytes`))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

/**
 * Resolve the workspace list without relying on the client's cwd. The UI gets
 * this exact array from the host. A synthetic fallback is used only when the
 * workspace registry is unavailable, so the page is still usable in a bare
 * process.
 *
 * @param {any} ctx
 * @returns {{ workspaces: Array<{id: string, title: string, path: string}>, warnings: string[] }}
 */
export function listWorkspaces(ctx) {
  /** @type {string[]} */
  const warnings = []
  /** @type {Array<{id: string, title: string, path: string}>} */
  const workspaces = []
  try {
    const registry = typeof ctx.get === 'function' ? ctx.get('workspaceRegistry') : undefined
    if (registry && typeof registry.list === 'function') {
      for (const entity of registry.list()) {
        const path = typeof entity.path === 'string' ? entity.path : String(entity.path ?? '')
        if (!path) continue
        const id = String(entity.id ?? path)
        if (workspaces.some((workspace) => workspace.path === path)) continue
        workspaces.push({
          id,
          title: typeof entity.title === 'string' && entity.title ? entity.title : path,
          path,
        })
      }
    }
  } catch (error) {
    warnings.push(`工作区列表读取失败: ${errorMessage(error)}`)
  }
  if (workspaces.length === 0) {
    const cwd = process.cwd()
    workspaces.push({ id: '__cwd__', title: '当前进程目录', path: cwd })
    warnings.push('workspaceRegistry 未返回工作区，已回退到当前进程目录')
  }
  return { workspaces, warnings }
}

/**
 * Build the complete read-only payload for one workspace.
 *
 * @param {any} ctx
 * @param {string | undefined} requestedWorkspaceId
 * @param {{ shadowActive?: boolean, translateDescriptions?: boolean }} [options]
 */
export async function buildPayload(ctx, requestedWorkspaceId, options = {}) {
  const shadowActive = options.shadowActive !== false
  const translateDescriptions = options.translateDescriptions !== false
  const workspaceResult = listWorkspaces(ctx)
  const warnings = [...workspaceResult.warnings]
  const selected =
    workspaceResult.workspaces.find((workspace) => workspace.id === requestedWorkspaceId) ??
    workspaceResult.workspaces[0]
  const cwd = selected.path

  const dshHome = resolveDshHome()
  const agentsHome = resolveAgentsHome()
  const projectRoot = await findProjectRoot(cwd)

  const scanRoots = buildSkillRoots({ dshHome, agentsHome, projectRoot })

  const scanResult = await scanSkillRoots(scanRoots)
  warnings.push(...scanResult.warnings.map((warning) => `${warning.path}: ${warning.error}`))

  let snapshotSkills = []
  let snapshotComplete = true
  try {
    const snapshot = await ctx.skills.snapshot({ cwd })
    snapshotSkills = Array.isArray(snapshot?.skills) ? snapshot.skills : []
    snapshotComplete = snapshot?.complete !== false
  } catch (error) {
    warnings.push(`ctx.skills.snapshot 失败: ${errorMessage(error)}`)
    snapshotComplete = false
  }

  const projectStateResult = await readStateFile(projectStatePath(projectRoot))
  const globalStateResult = await readStateFile(globalStatePath(dshHome))
  if (projectStateResult.warning) warnings.push(projectStateResult.warning)
  if (globalStateResult.warning) warnings.push(globalStateResult.warning)

  const translationCacheResult = await readTranslationCache(translationCachePath(dshHome))
  if (translationCacheResult.warning) warnings.push(translationCacheResult.warning)
  let translationEntries = translationCacheResult.cache.entries
  const translationStats = { attempted: 0, translated: 0, failed: 0, errors: [] }

  let inventory = buildInventory({
    snapshotSkills,
    scannedSkills: scanResult.skills,
    projectState: projectStateResult.state,
    globalState: globalStateResult.state,
    shadowActive,
    descriptionTranslations: translationEntries,
  })

  if (translateDescriptions) {
    try {
      const translated = await ensureSkillDescriptions({
        ctx,
        skills: inventory.skills,
        cache: translationCacheResult.cache,
        dshHome,
      })
      translationEntries = translated.entries
      Object.assign(translationStats, translated.stats)
      if (translationStats.translated > 0) {
        inventory = buildInventory({
          snapshotSkills,
          scannedSkills: scanResult.skills,
          projectState: projectStateResult.state,
          globalState: globalStateResult.state,
          shadowActive,
          descriptionTranslations: translationEntries,
        })
      }
    } catch (error) {
      translationStats.failed += 1
      translationStats.errors.push(errorMessage(error))
    }
  }
  for (const error of translationStats.errors) ctx.logger?.warn?.(`[skill-center] ${error}`)

  const hiddenBundled = snapshotSkills.filter((skill) => skill && skill.source === 'bundled').length

  // The shadow provider is global, but an agent preset's standing mount may
  // register in a scope layer and replace it. Count only live skills whose
  // effective state is off yet whose winning registry provider is not us. This
  // is also P2's runtime self-check; the same names feed the red banner in the
  // UI whenever a scope-layer override cannot be repaired.
  const offNames = new Set(
    inventory.skills.filter((skill) => skill.state === 'off' && skill.hasLiveEntry).map((skill) => skill.name),
  )
  const protectedNames = new Set(
    snapshotSkills
      .filter((skill) => skill && skill.provider === 'skill-center' && offNames.has(skill.name))
      .map((skill) => skill.name),
  )
  const unscopedUnprotected = shadowActive
    ? inventory.skills.filter((skill) => skill.state === 'off' && skill.hasLiveEntry && !protectedNames.has(skill.name))
    : []
  const scopeDiagnostics = shadowActive
    ? await inspectAgentScopes(ctx, cwd, inventory.skills, {
        ensureAgentShadow: (agent) => installScopedShadow(ctx, agent, () => ({ dshHome, agentsHome })),
      })
    : []
  const escaped = new Set(unscopedUnprotected.map((skill) => skill.name))
  for (const result of scopeDiagnostics) for (const name of result.unprotected ?? []) escaped.add(name)
  const unprotectedSkills = inventory.skills.filter((skill) => escaped.has(skill.name))
  const unprotected = unprotectedSkills.length
  if (unprotected > 0) {
    ctx.logger?.warn?.(
      `[skill-center] ${unprotected} skill(s) cannot be intercepted in every scope: ${unprotectedSkills
        .map((skill) => skill.name)
        .join(', ')}`,
    )
  }

  return {
    ok: true,
    plugin: name,
    phase: 'P4',
    capabilities: {
      readOnly: false,
      switching: true,
      projectState: true,
      editing: true,
      projectScopes: ['project-dsh', 'project-agents'],
      userScopes: ['user-dsh', 'user-agents', 'custom'],
    },
    generatedAt: new Date().toISOString(),
    workspaceId: selected.id,
    workspaces: workspaceResult.workspaces,
    environment: {
      dshHome,
      agentsHome,
      projectRoot,
      cwd,
    },
    skills: inventory.skills,
    groups: inventory.groups,
    tokenEstimate: inventory.tokenEstimate,
    translation: {
      cachePath: translationCachePath(dshHome),
      attempted: translationStats.attempted,
      translated: translationStats.translated,
      failed: translationStats.failed,
      errors: translationStats.errors.slice(0, 10),
    },
    snapshotComplete,
    hiddenBundled,
    unprotected,
    unprotectedSkills: unprotectedSkills.map((skill) => skill.name),
    scopeDiagnostics,
    scopedInstallStats,
    warnings,
  }
}

/**
 * Write one explicit state entry (project or global), then invalidate the
 * registry cache so the next agent/pre-step recomputes the catalog. Project
 * skills write `<projectRoot>/.dsh/skill-center.json`; user skills write
 * `<DSH_HOME>/skill-center/state.json`. `inherit` removes the key so the
 * read-time default applies again.
 *
 * @param {any} ctx
 * @param {{ name?: unknown, state?: unknown, scope?: unknown, workspaceId?: unknown }} input
 */
export async function setSkillState(ctx, input) {
  const name = typeof input?.name === 'string' ? input.name.trim() : ''
  if (!NAME_PATTERN.test(name)) throw new ApiError(400, 'INVALID_NAME', `invalid skill name: ${name || '(empty)'}`)
  const next = input?.state
  if (next !== 'on' && next !== 'off' && next !== 'inherit') {
    throw new ApiError(400, 'INVALID_STATE', `invalid state: ${String(next)}`)
  }

  const workspaceId = typeof input?.workspaceId === 'string' ? input.workspaceId : undefined
  const before = await buildPayload(ctx, workspaceId, { shadowActive: true })
  const skill = before.skills.find((entry) => entry.name === name)
  if (!skill) throw new ApiError(404, 'UNKNOWN_SKILL', `unknown skill: ${name}`)
  if (skill.source === 'bundled') throw new ApiError(403, 'BUNDLED_SKILL', '官方内置 skill 不归技能中心管理')

  // P2: project-level skills write <projectRoot>/.dsh/skill-center.json;
  // user-level skills keep writing <DSH_HOME>/skill-center/state.json. The
  // client sends the scope explicitly, but infer it when omitted so every
  // caller gets the correct file instead of accidentally writing global state.
  const requestedScope = input?.scope === undefined ? undefined : String(input.scope)
  if (requestedScope !== undefined && requestedScope !== 'global' && requestedScope !== 'project') {
    throw new ApiError(400, 'INVALID_SCOPE', `invalid scope: ${requestedScope}`)
  }
  const scope = requestedScope ?? (skill.scope === 'project' ? 'project' : 'global')
  if (scope === 'project' && skill.scope !== 'project') {
    throw new ApiError(409, 'SCOPE_MISMATCH', '该 skill 不是项目级，不能写入项目状态')
  }
  if (scope === 'global' && skill.scope !== 'user') {
    throw new ApiError(409, 'SCOPE_MISMATCH', '项目级 skill 必须写入当前工作区的项目状态')
  }

  const filePath = resolveStateFileForScope(scope, before.environment)
  await enqueueStateWrite(() =>
    applySkillState(filePath, name, next, {
      description: skill.description,
      path: skill.path,
      source: skill.source,
    }),
  )
  invalidateShadowProviders()

  const after = await buildPayload(ctx, before.workspaceId, { shadowActive: true })
  const updatedSkill = after.skills.find((entry) => entry.name === name) ?? skill
  return {
    ok: true,
    action: 'setState',
    phase: 'P4',
    name,
    scope,
    state: updatedSkill.state,
    effective: updatedSkill.state,
    stateSource: updatedSkill.stateSource,
    workspaceId: before.workspaceId,
    applies: 'next-turn',
    skill: updatedSkill,
  }
}

/** Resolve one editable skill and prove its directory lives under a managed root. */
async function loadEditableSkill(ctx, input) {
  const name = typeof input?.name === 'string' ? input.name.trim() : ''
  if (!NAME_PATTERN.test(name)) throw new ApiError(400, 'INVALID_NAME', `invalid skill name: ${name || '(empty)'}`)
  const workspaceId = typeof input?.workspaceId === 'string' ? input.workspaceId : undefined
  const payload = await buildPayload(ctx, workspaceId, { shadowActive: true })
  const skill = payload.skills.find((entry) => entry.name === name)
  if (!skill) throw new ApiError(404, 'UNKNOWN_SKILL', `unknown skill: ${name}`)
  if (skill.source === 'bundled') throw new ApiError(403, 'BUNDLED_SKILL', '官方内置 skill 不归技能中心管理')
  if (skill.missingFile || !skill.path) throw new ApiError(409, 'NO_LOCAL_FILE', '该 skill 没有本地 SKILL.md，无法编辑')
  const roots = buildSkillRoots(payload.environment)
  try {
    const managed = await assertManagedSkillPath(skill.path, roots)
    return { payload, skill, managed }
  } catch (error) {
    if (errorMessage(error) === 'SKILL_OUTSIDE_MANAGED_ROOTS') {
      throw new ApiError(403, 'SKILL_OUTSIDE_ROOTS', 'SKILL.md 不在技能中心管理的目录内')
    }
    throw new ApiError(409, 'NO_LOCAL_FILE', errorMessage(error))
  }
}

/** Keep phantom caches in sync after a successful edit. */
async function refreshSkillCaches(environment, skill, description) {
  const files = [projectStatePath(environment.projectRoot), globalStatePath(environment.dshHome)]
  for (const filePath of files) {
    const current = await readStateFile(filePath)
    const entry = current.state.skills[skill.name]
    if (!entry) continue
    await writeStateFile(filePath, {
      version: current.state.version,
      skills: {
        ...current.state.skills,
        [skill.name]: {
          ...entry,
          description,
          path: skill.path,
          source: skill.source,
        },
      },
    })
  }
}

/** Remove cached phantom entries after a real directory deletion. */
async function clearSkillCaches(environment, name) {
  const files = [projectStatePath(environment.projectRoot), globalStatePath(environment.dshHome)]
  for (const filePath of files) {
    const current = await readStateFile(filePath)
    if (!current.state.skills[name]) continue
    const skills = { ...current.state.skills }
    delete skills[name]
    await writeStateFile(filePath, { version: current.state.version, skills })
  }
}

export async function readSkill(ctx, input) {
  const { payload, skill } = await loadEditableSkill(ctx, input)
  const document = await readSkillDocument(skill.path)
  return {
    ok: true,
    action: 'read',
    phase: 'P4',
    workspaceId: payload.workspaceId,
    skill: {
      ...skill,
      body: document.body,
      frontmatter: document.frontmatter,
      whenToUse: document.whenToUse,
      invocation: document.invocation,
    },
  }
}

export async function saveSkill(ctx, input) {
  const { payload, skill } = await loadEditableSkill(ctx, input)
  if (typeof input?.name !== 'string' || input.name.trim() !== skill.name) {
    throw new ApiError(409, 'RENAME_NOT_SUPPORTED', '改名请使用「复制为模板」')
  }
  let document
  try {
    document = await saveSkillDocument(skill.path, input)
  } catch (error) {
    throw new ApiError(400, 'WRITE_FAILED', errorMessage(error))
  }
  await refreshSkillCaches(payload.environment, { ...skill, path: document.path }, document.description)
  invalidateShadowProviders()
  return {
    ok: true,
    action: 'save',
    phase: 'P4',
    name: document.name,
    path: document.path,
    workspaceId: payload.workspaceId,
    applies: 'next-turn',
    skill: { ...skill, description: document.description, whenToUse: document.whenToUse, invocation: document.invocation },
  }
}

export async function duplicateSkill(ctx, input) {
  const { payload, skill, managed } = await loadEditableSkill(ctx, input)
  let targetName
  try {
    targetName = normalizeSkillName(input?.targetName ?? input?.newName)
  } catch (error) {
    throw new ApiError(400, 'INVALID_NAME', errorMessage(error))
  }
  if (payload.skills.some((entry) => entry.name === targetName)) {
    throw new ApiError(409, 'NAME_TAKEN', `skill name already exists: ${targetName}`)
  }
  let created
  try {
    created = await duplicateSkillDirectory(skill.path, {
      targetRoot: managed.root,
      targetName,
      description: typeof input?.description === 'string' ? input.description : undefined,
    })
  } catch (error) {
    const message = errorMessage(error)
    if (message === 'TARGET_EXISTS') throw new ApiError(409, 'TARGET_EXISTS', `目标目录已存在: ${targetName}`)
    throw new ApiError(400, 'COPY_FAILED', message)
  }
  invalidateShadowProviders()
  return {
    ok: true,
    action: 'duplicate',
    phase: 'P4',
    name: created.name,
    path: created.path,
    workspaceId: payload.workspaceId,
    applies: 'next-turn',
    skill: { ...skill, name: created.name, path: created.path },
  }
}

export async function deleteSkill(ctx, input) {
  const { payload, skill } = await loadEditableSkill(ctx, input)
  try {
    await deleteSkillDirectory(skill.path)
  } catch (error) {
    throw new ApiError(400, 'DELETE_FAILED', errorMessage(error))
  }
  await clearSkillCaches(payload.environment, skill.name)
  invalidateShadowProviders()
  return {
    ok: true,
    action: 'delete',
    phase: 'P4',
    name: skill.name,
    workspaceId: payload.workspaceId,
    applies: 'next-turn',
  }
}

/**
 * @param {any} ctx
 * @param {import('node:http').IncomingMessage} request
 * @param {import('node:http').ServerResponse} response
 */
export async function handleRequest(ctx, request, response) {
  try {
    const url = new URL(request.url ?? '/', 'http://skill-center.local')
    const action = url.searchParams.get('action') ?? 'list'
    if (request.method === 'GET' && action === 'list') {
      const payload = await buildPayload(ctx, url.searchParams.get('workspaceId') ?? undefined)
      writeJson(response, 200, payload)
      return
    }
    if (request.method === 'GET' && action === 'read') {
      const result = await readSkill(ctx, {
        name: url.searchParams.get('name') ?? '',
        workspaceId: url.searchParams.get('workspaceId') ?? undefined,
      })
      writeJson(response, 200, result)
      return
    }
    if (request.method === 'POST' && (action === 'setState' || action === 'save' || action === 'duplicate' || action === 'delete')) {
      let input
      try {
        const text = await readBody(request)
        input = text ? JSON.parse(text) : {}
      } catch (error) {
        throw new ApiError(400, 'INVALID_JSON', `invalid JSON body: ${errorMessage(error)}`)
      }
      const result =
        action === 'setState'
          ? await setSkillState(ctx, input)
          : action === 'save'
            ? await saveSkill(ctx, input)
            : action === 'duplicate'
              ? await duplicateSkill(ctx, input)
              : await deleteSkill(ctx, input)
      writeJson(response, 200, result)
      return
    }
    if (request.method === 'POST') {
      // Drain unknown POST bodies so the socket cannot stay half-open.
      try {
        await readBody(request)
      } catch {
        // Ignore; the unsupported action is the real error.
      }
      writeJson(response, 405, { ok: false, error: `unsupported action: ${action}` })
      return
    }
    writeJson(response, 405, { ok: false, error: `unsupported action: ${action}` })
  } catch (error) {
    if (error instanceof ApiError) {
      writeJson(response, error.status, { ok: false, error: error.message, code: error.code })
      return
    }
    writeJson(response, 500, { ok: false, error: errorMessage(error) })
  }
}


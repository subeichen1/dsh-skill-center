import { join } from 'node:path'
import { findProjectRoot } from './project-root.js'
import { scanSkillRoots } from './scan.js'
import { effectiveState, globalStatePath, projectStatePath, readStateFile } from './state.js'

/**
 * The four roots the skill center owns. Order matters: it mirrors the
 * filesystem provider's rank order (project-dsh 100, project-agents 200,
 * user-dsh 400, user-agents 500). The scan helper keeps the first entry for a
 * duplicated name, so a project skill wins over a user skill with the same name,
 * exactly as the registry's within-layer rank comparison does.
 *
 * @param {{ dshHome: string, agentsHome: string, projectRoot: string }} homes
 * @returns {Array<{path: string, source: string}>}
 */
export function buildSkillRoots({ dshHome, agentsHome, projectRoot }) {
  return [
    { path: join(projectRoot, '.dsh', 'skills'), source: 'project-dsh' },
    { path: join(projectRoot, '.agents', 'skills'), source: 'project-agents' },
    { path: join(dshHome, 'skills'), source: 'user-dsh' },
    { path: join(agentsHome, 'skills'), source: 'user-agents' },
  ]
}

/**
 * Independent disk + state view used by the shadow provider. It cannot call
 * ctx.skills.snapshot(): provider.list() is itself called from collectFresh(),
 * so a snapshot here would recurse forever. Instead it scans the same four
 * roots and computes read-time effective state from both state files.
 *
 * Only real SKILL.md files can become shadows; a phantom state entry has no
 * live registry entry to hide, and the UI obtains phantoms from the state cache
 * separately.
 *
 * @param {{ cwd?: string, dshHome?: string, agentsHome?: string, extraRoots?: Array<{path: string, source: string}>, signal?: AbortSignal }} [options]
 * @returns {Promise<{ skills: Array<Record<string, any>>, warnings: Array<{path: string, error: string}>, projectRoot: string }>}
 */
export async function loadLiveSkills(options = {}) {
  options.signal?.throwIfAborted?.()
  const cwd = typeof options.cwd === 'string' && options.cwd ? options.cwd : process.cwd()
  const dshHome = options.dshHome
  const agentsHome = options.agentsHome
  if (typeof dshHome !== 'string' || !dshHome) throw new Error('loadLiveSkills requires a resolved dshHome')
  if (typeof agentsHome !== 'string' || !agentsHome) throw new Error('loadLiveSkills requires a resolved agentsHome')
  const projectRoot = await findProjectRoot(cwd)
  const roots = buildSkillRoots({ dshHome, agentsHome, projectRoot })
  if (Array.isArray(options.extraRoots)) roots.push(...options.extraRoots.filter((root) => root && root.path))

  const scan = await scanSkillRoots(roots)
  const projectStateResult = await readStateFile(projectStatePath(projectRoot))
  const globalStateResult = await readStateFile(globalStatePath(dshHome))
  const warnings = [...scan.warnings]
  if (projectStateResult.warning) warnings.push({ path: projectStatePath(projectRoot), error: projectStateResult.warning })
  if (globalStateResult.warning) warnings.push({ path: globalStatePath(dshHome), error: globalStateResult.warning })

  return {
    skills: scan.skills,
    warnings,
    projectRoot,
    projectState: projectStateResult.state,
    globalState: globalStateResult.state,
  }
}

/**
 * Return the shadow candidates for the given listing options. `source` is
 * copied unchanged so the UI can still tell project-dsh from user-dsh; only
 * `provider` belongs to this plugin.
 *
 * DSH home paths are injected by the host (resolved with
 * @deepseek-ai/dsh-home-paths) so this module stays testable in plain Node.
 *
 * @param {unknown} options
 * @param {{ dshHome?: string, agentsHome?: string }} [defaults]
 * @returns {Promise<Array<Record<string, any>>>}
 */
export async function listOffSkills(options, defaults = {}) {
  const input = options && typeof options === 'object' ? /** @type {Record<string, any>} */ (options) : {}
  const live = await loadLiveSkills({
    cwd: typeof input.cwd === 'string' ? input.cwd : undefined,
    dshHome: typeof input.dshHome === 'string' ? input.dshHome : defaults.dshHome,
    agentsHome: typeof input.agentsHome === 'string' ? input.agentsHome : defaults.agentsHome,
    extraRoots: Array.isArray(input.extraRoots) ? input.extraRoots : undefined,
    signal: input.signal,
  })
  return live.skills.filter(
    (skill) =>
      skill &&
      skill.source !== 'bundled' &&
      effectiveState(skill.name, skill.source, live.projectState, live.globalState) === 'off',
  )
}

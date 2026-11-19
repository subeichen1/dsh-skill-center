import { localizedDescriptions } from './descriptions.js'
import { effectiveState } from './state.js'
import { estimateCatalogTokens } from './tokens.js'

const SOURCE_LABELS = Object.freeze({
  'project-dsh': { zh: '项目 .dsh', en: 'Project .dsh' },
  'project-agents': { zh: '项目 .agents', en: 'Project .agents' },
  'user-dsh': { zh: '用户 .dsh', en: 'User .dsh' },
  'user-agents': { zh: '用户 .agents', en: 'User .agents' },
  custom: { zh: '自定义', en: 'Custom' },
})

/**
 * Human-readable source label. The client chooses the language, so both labels
 * travel in the payload.
 *
 * @param {string} source
 */
export function sourceLabel(source) {
  return SOURCE_LABELS[source] ?? { zh: source || '未知', en: source || 'Unknown' }
}

/**
 * Whether a source is project-scoped. The definition is shared with the
 * read-time default rule: any source beginning with "project-" defaults on.
 *
 * @param {string} source
 * @returns {'project'|'user'}
 */
export function scopeOfSource(source) {
  return typeof source === 'string' && source.startsWith('project-') ? 'project' : 'user'
}

/**
 * Merge three independent views of the same skills:
 * 1. ctx.skills.snapshot() — registry-authoritative invocation/provider data.
 * 2. An independent disk scan — works when a skill is shadowed, deleted, or
 *    the registry has not refreshed yet.
 * 3. State-file cache — keeps "phantom" rows visible after SKILL.md is gone.
 *
 * Snapshot wins on every overlapping field. Scan fills registry gaps. Cache
 * only supplies rows that neither live view knows about.
 *
 * @param {{
 *   snapshotSkills?: Array<Record<string, any>>,
 *   scannedSkills?: Array<Record<string, any>>,
 *   projectState?: ReturnType<typeof import('./state.js').emptyState>,
 *   globalState?: ReturnType<typeof import('./state.js').emptyState>,
 *   shadowActive?: boolean,
 *   descriptionTranslations?: Record<string, { zh?: string, en?: string }>,
 * }} input
 */
export function buildInventory({
  snapshotSkills = [],
  scannedSkills = [],
  projectState = { version: 1, skills: {} },
  globalState = { version: 1, skills: {} },
  shadowActive = false,
  descriptionTranslations = {},
}) {
  const snapshotByName = new Map()
  for (const skill of snapshotSkills) {
    if (!skill || typeof skill.name !== 'string') continue
    if (skill.source === 'bundled') continue
    if (!snapshotByName.has(skill.name)) snapshotByName.set(skill.name, skill)
  }
  const scanByName = new Map()
  for (const skill of scannedSkills) {
    if (!skill || typeof skill.name !== 'string') continue
    if (!scanByName.has(skill.name)) scanByName.set(skill.name, skill)
  }

  const names = new Set([...snapshotByName.keys(), ...scanByName.keys()])
  for (const state of [projectState, globalState]) {
    if (!state || !state.skills) continue
    for (const [name, entry] of Object.entries(state.skills)) {
      if (entry && entry.source && entry.source !== 'bundled') names.add(name)
    }
  }

  /** @type {Array<Record<string, any>>} */
  const skills = []
  for (const name of names) {
    const snapshot = snapshotByName.get(name)
    const scanned = scanByName.get(name)
    const projectEntry = projectState && projectState.skills ? projectState.skills[name] : undefined
    const globalEntry = globalState && globalState.skills ? globalState.skills[name] : undefined
    // Project entries only cache the field the user changed; fall back to the
    // global entry for description/path/source so a phantom row keeps its
    // display data even after a project-level override.
    const cached = projectEntry || globalEntry ? { ...(globalEntry ?? {}), ...(projectEntry ?? {}) } : undefined
    const stateSource = projectEntry ? 'project' : globalEntry ? 'global' : 'default'
    const source = snapshot?.source ?? scanned?.source ?? cached?.source
    if (!source || source === 'bundled') continue

    const shadowed = snapshot?.provider === 'skill-center'
    // A shadow deliberately reports no invocation; recover the real values
    // from the disk scan when available, otherwise assume callable so a state
    // cache row is not incorrectly presented as permanently non-invocable.
    const invocation = shadowed
      ? (scanned?.invocation ?? { modelInvocable: true, userInvocable: true })
      : (snapshot?.invocation ?? scanned?.invocation ?? { modelInvocable: true, userInvocable: true })

    const state = effectiveState(name, source, projectState, globalState)
    const hasLiveEntry = Boolean(snapshot || scanned)
    const missingFile = !scanned && !snapshot
    const skillPath = snapshot?.path ?? scanned?.path ?? cached?.path
    const actualCallable = Boolean(invocation.modelInvocable || invocation.userInvocable)
    // In P0 (`shadowActive: false`) the registry is untouched, so "enabled"
    // reflects what the model can actually see today. Once shadows are active,
    // a skill is enabled only when its effective state is on.
    const enabled = shadowActive ? state === 'on' && actualCallable && !missingFile : actualCallable && !missingFile
    const originalDescription = snapshot?.description ?? scanned?.description ?? cached?.description ?? ''
    const localized = localizedDescriptions(name, originalDescription, descriptionTranslations)

    skills.push({
      name,
      description: originalDescription,
      // Display-only translations. The model-facing description and the
      // token estimate below deliberately keep the original SKILL.md text.
      descriptionZh: localized.zh,
      descriptionEn: localized.en,
      path: skillPath,
      whenToUse: snapshot?.whenToUse ?? scanned?.whenToUse,
      resourceBase: snapshot?.resourceBase,
      source,
      sourceLabel: sourceLabel(source),
      scope: scopeOfSource(source),
      provider: snapshot?.provider ?? null,
      invocation: {
        modelInvocable: Boolean(invocation.modelInvocable),
        userInvocable: Boolean(invocation.userInvocable),
      },
      state,
      stateSource,
      explicitState: stateSource !== 'default',
      enabled,
      shadowed,
      missingFile,
      editable: Boolean(skillPath) && !missingFile,
      fromSnapshot: Boolean(snapshot),
      fromScan: Boolean(scanned),
      root: scanned?.root,
      hasLiveEntry,
    })
  }

  skills.sort((left, right) => {
    if (left.scope !== right.scope) return left.scope === 'project' ? -1 : 1
    return left.name.localeCompare(right.name)
  })

  const projectCount = skills.filter((skill) => skill.scope === 'project').length
  const userCount = skills.filter((skill) => skill.scope === 'user').length
  const resident = skills.filter((skill) => skill.enabled && skill.invocation.modelInvocable)
  return {
    skills,
    groups: { project: projectCount, user: userCount, total: skills.length },
    tokenEstimate: {
      ...estimateCatalogTokens(
        resident.map((skill) => ({
          name: skill.name,
          description: skill.description,
          modelInvocable: true,
        })),
      ),
      formula: 'name.length + 6 + min(description.length, 500); CJK=1 token, other=1/3.5 token; +150 frame',
      estimated: true,
    },
  }
}

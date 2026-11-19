export const SHADOW_PROVIDER_NAME = 'skill-center'
export const SHADOW_RANK = 0
export const NO_INVOCATION = Object.freeze({ modelInvocable: false, userInvocable: false })

/**
 * Build the shadow candidate for a skill that is currently off.
 *
 * The candidate is intentionally an exact copy of the original name,
 * description, source, path, whenToUse and resourceBase. `source` must stay the
 * original value because the UI distinguishes project-dsh from user-dsh by it;
 * only `provider` identifies this provider. `rank: 0` wins within one layer
 * against user-dsh (400) and project-dsh (100).
 *
 * @param {{
 *   name: string,
 *   description: string,
 *   source: string,
 *   path?: string,
 *   whenToUse?: string,
 *   resourceBase?: string,
 * }} skill
 * @returns {{
 *   name: string,
 *   description: string,
 *   invocation: {modelInvocable: false, userInvocable: false},
 *   source: string,
 *   rank: number,
 *   provider: string,
 *   path?: string,
 *   whenToUse?: string,
 *   resourceBase?: string,
 * }}
 */
export function buildShadowCandidate(skill) {
  if (!skill || typeof skill.name !== 'string' || typeof skill.description !== 'string' || skill.description.length === 0) {
    throw new Error('shadow candidate requires a non-empty name and description')
  }
  return {
    name: skill.name,
    description: skill.description,
    invocation: { modelInvocable: false, userInvocable: false },
    source: skill.source,
    rank: SHADOW_RANK,
    provider: SHADOW_PROVIDER_NAME,
    ...(typeof skill.path === 'string' ? { path: skill.path } : {}),
    ...(typeof skill.whenToUse === 'string' ? { whenToUse: skill.whenToUse } : {}),
    ...(skill.resourceBase !== undefined ? { resourceBase: skill.resourceBase } : {}),
  }
}

/**
 * Create the provider factory handed to ctx.skills.registerProvider(). It is
 * synchronous, as required by the skill registry. `getOffSkills` is supplied by
 * the host layer and returns the current off-state skills for the listing
 * options; P0 supplies an empty list until switching is enabled.
 *
 * Layer semantics (kept here as required documentation):
 * - `rank` is only compared inside one layer. collectFresh builds layers as
 *   [global, ...chainLayers(scope)] and merges each layer with `merged.set`, so
 *   a later layer replaces a winner from an earlier layer wholesale.
 * - The filesystem provider is registered globally and distinguishes projects
 *   with `options.cwd`, so project and user skills both live in the global
 *   layer. A rank-0 shadow therefore beats project-dsh(100) and user-dsh(400)
 *   inside that layer.
 * - An agent preset's standing mount can register into a scope layer, which
 *   would override a global shadow. The host therefore checks every list()
 *   result with ctx.skills.snapshot({cwd, scope}) and surfaces any off-state
 *   skill whose provider is not "skill-center" as an unprotected-skill banner.
 *
 * @param {{ getOffSkills: (options: unknown) => Promise<Array<Record<string, any>>> }} options
 */
export function createShadowProvider({ getOffSkills }) {
  return (control) => ({
    name: SHADOW_PROVIDER_NAME,
    /**
     * @param {unknown} options
     * @returns {Promise<Array<ReturnType<typeof buildShadowCandidate>>>}
     */
    async list(options) {
      if (control.signal.aborted) return []
      const skills = await getOffSkills(options)
      const candidates = []
      for (const skill of skills) {
        try {
          candidates.push(buildShadowCandidate(skill))
        } catch {
          // A malformed entry must not poison the whole provider observation.
        }
      }
      return candidates
    },
    /**
     * Deliberately undefined. Two current consumers check invocation before
     * calling get(), but returning undefined is the second safety net for
     * future consumers: an off skill has no loadable definition.
     *
     * @param {unknown} _candidate
     * @returns {undefined}
     */
    get(_candidate) {
      return undefined
    },
  })
}

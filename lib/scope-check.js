/**
 * Runtime self-check for the layer contract.
 *
 * `SkillRegistry.collectFresh()` merges the global layer first and then every
 * layer in `chainLayers(options.scope)`. A later layer replaces an earlier entry
 * with the same name as a whole, so a rank-0 shadow in the global layer cannot
 * protect an agent whose preset standing-mount registered `skill-filesystem`
 * in that agent's own scope. This module asks every live agent what its catalog
 * actually resolves to, using the same `scope: agent` lookup the skill tool and
 * slash-invocation listeners use.
 *
 * It is deliberately kept free of `@deepseek-ai/*` imports so it can be unit
 * tested without the DSH loader. `index.js` supplies the real agent service.
 */

/**
 * @param {any} ctx
 * @param {string} cwd
 * @param {Array<{name: string, state: string, hasLiveEntry?: boolean}>} inventorySkills
 * @param {{ ensureAgentShadow?: (agent: any) => void }} [options]
 * @returns {Promise<Array<{agentId: string, unprotected: string[], missing: string[], error?: string}>>}
 */
export async function inspectAgentScopes(ctx, cwd, inventorySkills, options = {}) {
  const agentsService = typeof ctx.get === 'function' ? ctx.get('agents') : undefined
  const agents = agentsService && typeof agentsService.list === 'function' ? agentsService.list() : []
  const offNames = new Set(
    inventorySkills
      .filter((skill) => skill.state === 'off' && skill.hasLiveEntry !== false)
      .map((skill) => skill.name),
  )
  const results = []
  for (const agent of agents) {
    try {
      // Make sure this particular live agent has a scoped competitor before
      // asking what its catalog actually resolves to. Agents created before
      // this plugin was loaded do not receive the historical `agent/created`
      // edge, so inspecting is also the repair point.
      options.ensureAgentShadow?.(agent)
      const snapshot = await ctx.skills.snapshot({ cwd, scope: agent })
      const providers = new Map(
        (Array.isArray(snapshot?.skills) ? snapshot.skills : []).map((skill) => [skill.name, skill.provider]),
      )
      const unprotected = [...offNames].filter((name) => providers.get(name) !== 'skill-center')
      results.push({
        agentId: String(agent.id ?? ''),
        unprotected,
        missing: [...offNames].filter((name) => !providers.has(name)),
      })
    } catch (error) {
      results.push({
        agentId: String(agent?.id ?? ''),
        unprotected: [...offNames],
        missing: [],
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return results
}

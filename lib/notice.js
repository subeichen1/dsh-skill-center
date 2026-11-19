import { randomUUID } from 'node:crypto'
import { listOffSkills } from './live.js'

/** Matches the same slash gesture dsh-tool-skill uses for injection. */
export const SKILL_GESTURE = /(^|\s)\/([a-z0-9]+(?:-[a-z0-9]+)*)(?=\s|$)/g

/**
 * @param {unknown} error
 * @returns {string}
 */
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Extract slash gestures from user-authored text blocks. Only messages whose
 * source is the user participate; injected context and skill invocations do not
 * create new gestures.
 *
 * @param {Array<Record<string, any>> | undefined} messages
 * @returns {string[]}
 */
export function invokedSkillNames(messages) {
  const names = new Set()
  for (const message of Array.isArray(messages) ? messages : []) {
    if (!message || message.role !== 'user') continue
    if (!message.source || message.source.kind !== 'user') continue
    for (const block of Array.isArray(message.content) ? message.content : []) {
      if (!block || block.type !== 'text' || typeof block.text !== 'string') continue
      for (const match of block.text.matchAll(SKILL_GESTURE)) names.add(match[2])
    }
  }
  return [...names]
}

/**
 * @param {string} name
 * @returns {string}
 */
export function disabledSkillNotice(name) {
  return `/${name} 已在技能中心关闭，请在 设置 → 技能中心 打开后再试。\n/${name} is disabled in Skill Center. Open Settings → Skill Center to enable it.`
}

/**
 * @param {string} name
 */
function createDisabledNoticeMessage(name) {
  return {
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text: disabledSkillNotice(name) }],
    // A dedicated kind renders as a context row (not a human bubble) and keeps
    // the fallback notice visually distinct from the real skill invocation.
    source: { kind: 'skill-center', name },
  }
}

/**
 * @param {Record<string, any>} message
 * @param {string} name
 */
function isDisabledNotice(message, name) {
  if (!message || !message.source) return false
  if (message.source.kind !== 'skill-center' || message.source.name !== name) return false
  return (
    Array.isArray(message.content) &&
    message.content.some(
      (block) =>
        block && block.type === 'text' && typeof block.text === 'string' && block.text.includes('已在技能中心关闭'),
    )
  )
}

/**
 * The client menu caches skill lists and does not subscribe to skills/change.
 * The slash injector in dsh-tool-skill silently skips an off skill, so without
 * this listener the user gets no feedback at all. After the rest of the chain
 * has run, append a visible context message for every /name that is currently
 * off. We deliberately read the state files here instead of trusting the
 * registry: an agent-preset standing mount can register skill-filesystem in a
 * scope layer, which overrides our global shadow. The registry then still
 * reports the skill as callable while its on-disk state says off — exactly the
 * case where the user needs the explicit notice (P2 surfaces it as a banner).
 *
 * @param {any} ctx
 * @param {() => { dshHome: string, agentsHome: string }} homeDefaults
 */
export function registerPreStepNotice(ctx, homeDefaults) {
  if (typeof ctx.on !== 'function') return
  // Append: catalog/digest and slash injection belong to dsh-tool-skill's own
  // listeners. We only append the explicit disabled-skill notice after the
  // rest of the cascade has produced its decision.
  ctx.on(
    'agent/pre-step',
    async ({ agent, messages, signal }, next) => {
      const decision = await next()
      if (!decision || decision.kind === 'reject') return decision
      try {
        const names = invokedSkillNames(messages)
        if (names.length === 0) return decision
        const workingDirectory =
          ctx.workingDirectory ?? (typeof ctx.get === 'function' ? ctx.get('workingDirectory') : undefined)
        let cwd = process.cwd()
        if (workingDirectory && typeof workingDirectory.ensure === 'function' && agent !== undefined) {
          cwd = await workingDirectory.ensure(agent, signal)
        }
        const offSkills = await listOffSkills({ cwd, signal }, homeDefaults())
        const offNames = new Set(offSkills.map((skill) => skill.name))
        const additions = []
        for (const name of names) {
          if (!offNames.has(name)) continue
          if ((Array.isArray(decision.messages) ? decision.messages : []).some((message) => isDisabledNotice(message, name))) continue
          additions.push(createDisabledNoticeMessage(name))
        }
        if (additions.length === 0) return decision
        return { ...decision, messages: [...(Array.isArray(decision.messages) ? decision.messages : []), ...additions] }
      } catch (error) {
        ctx.logger?.warn?.(`[skill-center] pre-step notice failed: ${errorMessage(error)}`)
        return decision
      }
    },
    // agent/pre-step is dispatched on the agent's scope carrier. A listener on
    // the root plugin context only participates when it is global.
    { global: true },
  )
}

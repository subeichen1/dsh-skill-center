import assert from 'node:assert/strict'
import test from 'node:test'

import { inspectAgentScopes } from '../lib/scope-check.js'

function fakeContext(snapshotSkills) {
  const agent = { id: 'agent-1', ctx: { marker: 'scope' } }
  return {
    agent,
    ctx: {
      get(name) {
        if (name === 'agents') return { list: () => [agent] }
        return undefined
      },
      skills: {
        async snapshot(options) {
          assert.equal(options.scope, agent)
          return { skills: snapshotSkills, complete: true }
        },
      },
    },
  }
}

test('scope self-check reports an off skill whose scope provider is not skill-center', async () => {
  const { ctx, agent } = fakeContext([{ name: 'p-one', provider: 'filesystem' }])
  const results = await inspectAgentScopes(
    ctx,
    'C:\\work\\demo',
    [{ name: 'p-one', state: 'off', hasLiveEntry: true }],
    { ensureAgentShadow: (candidate) => assert.equal(candidate, agent) },
  )
  assert.deepEqual(results, [{ agentId: 'agent-1', unprotected: ['p-one'], missing: [] }])
})

test('scope self-check is clean when the scoped shadow wins', async () => {
  const { ctx } = fakeContext([{ name: 'p-one', provider: 'skill-center' }])
  const results = await inspectAgentScopes(ctx, 'C:\\work\\demo', [
    { name: 'p-one', state: 'off', hasLiveEntry: true },
  ])
  assert.deepEqual(results, [{ agentId: 'agent-1', unprotected: [], missing: [] }])
})

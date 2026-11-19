import {
  globalStatePath,
  projectStatePath,
  readStateFile,
  withStateEntry,
  writeStateFile,
} from './state.js'

/**
 * Resolve the state file for an explicit scope. Project state belongs to the
 * current workspace; global state belongs to DSH_HOME.
 *
 * @param {'project' | 'global'} scope
 * @param {{ projectRoot: string, dshHome: string }} environment
 */
export function resolveStateFileForScope(scope, environment) {
  return scope === 'project'
    ? projectStatePath(environment.projectRoot)
    : globalStatePath(environment.dshHome)
}

/**
 * Persist one explicit state entry. `inherit` deletes the key instead of
 * writing a default, which is what keeps read-time defaults intact.
 *
 * @param {string} filePath
 * @param {string} name
 * @param {'on' | 'off' | 'inherit'} state
 * @param {{ description?: string, path?: string, source?: string }} cache
 */
export async function applySkillState(filePath, name, state, cache) {
  const current = await readStateFile(filePath)
  const updated = withStateEntry(current.state, name, state, cache)
  await writeStateFile(filePath, updated)
  return updated
}

import { stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

/**
 * Whether a path exists (any file type). Permission and transient errors are
 * treated as "not found" so project-root discovery never breaks a listing.
 *
 * @param {string} path
 * @returns {Promise<boolean>}
 */
export async function pathExists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/**
 * Find the project root exactly like dsh-skill-filesystem's `findProjectRoot`:
 * start at cwd, walk up while the current directory has no `.git`, and if the
 * filesystem root is reached without finding one, return the original cwd.
 *
 * The function deliberately does not stop at the first `.git` above a nested
 * repository root any differently from the built-in provider; keeping the same
 * semantics means both providers resolve `<projectRoot>/.dsh/skills` to the
 * same place.
 *
 * @param {string} cwd
 * @returns {Promise<string>}
 */
export async function findProjectRoot(cwd) {
  const original = resolve(cwd)
  let current = original
  while (true) {
    if (await pathExists(join(current, '.git'))) return current
    const parent = dirname(current)
    if (parent === current) return original
    current = parent
  }
}

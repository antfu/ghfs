import { resolveConfig } from '../config/load'
import { resolveRepo } from '../config/repo'

export interface ScannedRepoResolution {
  /** Resolved `owner/name`, or null when the directory could not be resolved. */
  repo: string | null
  /** Human-readable reason resolution failed, set only when `repo` is null. */
  error?: string
}

/**
 * Resolve the repository of a directory found by the hub scanner.
 *
 * Unlike {@link resolveRepo}, this never throws: a directory whose git remote
 * and `package.json#repository` disagree is still a project the user wants to
 * see, so the failure travels back to the picker as a message instead of
 * making the directory disappear from the scan.
 */
export async function resolveScannedRepo(cwd: string): Promise<ScannedRepoResolution> {
  let configRepo: string | undefined
  try {
    const config = await resolveConfig({ cwd })
    configRepo = config.repo || undefined
  }
  catch {
    // ghfs.config.ts may be present but fail to load; fall through to git/package.json detection.
  }

  try {
    const result = await resolveRepo({ cwd, configRepo, interactive: false })
    return { repo: result.repo }
  }
  catch (err) {
    return { repo: null, error: toResolutionMessage(err) }
  }
}

function toResolutionMessage(err: unknown): string {
  if (err instanceof Error && err.message)
    return err.message
  return String(err)
}

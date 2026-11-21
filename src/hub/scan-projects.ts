import type { ScannedRepoResolution } from './scanned-repo'
import type { ScannedRepo } from './scanner'
import { resolveScannedRepo } from './scanned-repo'
import { scanGitRepos } from './scanner'

export interface ScannedProject extends ScannedRepoResolution {
  /** Absolute path to the project directory. */
  path: string
  /** Final segment of the path; used as a display name. */
  name: string
}

/**
 * Scan hub roots for git directories and resolve each one's repository.
 *
 * Shared by the hub project picker and the `ghfs hub` startup report so both
 * describe the same set of directories. Unresolvable directories are kept, with
 * `error` explaining why.
 */
export async function scanProjectDirectories(roots: string[]): Promise<ScannedProject[]> {
  const unique: ScannedRepo[] = []
  const seen = new Set<string>()

  for (const root of roots) {
    let scanned: ScannedRepo[]
    try {
      scanned = await scanGitRepos(root)
    }
    catch {
      continue
    }
    for (const repo of scanned) {
      if (seen.has(repo.path))
        continue
      seen.add(repo.path)
      unique.push(repo)
    }
  }

  const projects = await Promise.all(unique.map(async repo => ({
    path: repo.path,
    name: repo.name,
    ...await resolveScannedRepo(repo.path),
  })))

  return projects.sort((a, b) => a.path.localeCompare(b.path))
}

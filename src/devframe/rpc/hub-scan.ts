import type { ScannedRepo } from '../../hub/scanner'
import type { HubScannedProject } from './types'
import { defineRpcFunction } from 'devframe'
import { resolveConfig } from '../../config/load'
import { resolveRepo } from '../../config/repo'
import { scanGitRepos } from '../../hub/scanner'
import { findProjectIcon } from '../../utils/project-icon'
import { resolveHubRoot } from './hub-helpers'
import { getHubContext } from './utils'

async function tryResolveRepo(cwd: string): Promise<string | null> {
  try {
    let configRepo: string | undefined
    try {
      const config = await resolveConfig({ cwd })
      configRepo = config.repo || undefined
    }
    catch {
      // ghfs.config.ts may be present but fail to load; fall through to git/package.json detection.
    }
    const result = await resolveRepo({ cwd, configRepo, interactive: false })
    return result.repo
  }
  catch {
    return null
  }
}

export const hubScan = defineRpcFunction({
  name: 'ghfs:hub-scan',
  type: 'query',
  setup: (context) => {
    const hub = getHubContext(context)
    return {
      handler: async (rootPath?: string): Promise<HubScannedProject[]> => {
        const targets: string[] = rootPath ? [resolveHubRoot(rootPath)] : Array.from(hub.roots).sort()
        const enabledPaths = new Set(Array.from(hub.projects.values()).map(p => p.path))
        const unique: ScannedRepo[] = []
        const seen = new Set<string>()
        for (const target of targets) {
          let scanned: ScannedRepo[]
          try {
            scanned = await scanGitRepos(target)
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
        const resolved = await Promise.all(unique.map(async (repo) => {
          const [iconDataUrl, resolvedRepo] = await Promise.all([
            findProjectIcon(repo.path).catch(() => null),
            tryResolveRepo(repo.path),
          ])
          return { repo, resolvedRepo, iconDataUrl }
        }))
        const entries: HubScannedProject[] = []
        for (const { repo, resolvedRepo, iconDataUrl } of resolved) {
          if (!resolvedRepo)
            continue
          entries.push({
            path: repo.path,
            name: repo.name,
            repo: resolvedRepo,
            enabled: enabledPaths.has(repo.path),
            iconDataUrl,
          })
        }
        entries.sort((a, b) => a.path.localeCompare(b.path))
        return entries
      },
    }
  },
})

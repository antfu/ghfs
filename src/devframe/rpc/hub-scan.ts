import type { HubScannedProject } from './types'
import { defineRpcFunction } from 'devframe'
import { scanGitRepos } from '../../hub/scanner'
import { findProjectIcon } from '../../utils/project-icon'
import { resolveHubRoot } from './hub-helpers'
import { getHubContext } from './utils'

export const hubScan = defineRpcFunction({
  name: 'ghfs:hub-scan',
  type: 'query',
  setup: (context) => {
    const hub = getHubContext(context)
    return {
      handler: async (rootPath?: string): Promise<HubScannedProject[]> => {
        const targets: string[] = rootPath ? [resolveHubRoot(rootPath)] : Array.from(hub.roots).sort()
        const enabledPaths = new Set(Array.from(hub.projects.values()).map(p => p.path))
        const collected = new Map<string, HubScannedProject>()
        for (const target of targets) {
          let scanned: Awaited<ReturnType<typeof scanGitRepos>>
          try {
            scanned = await scanGitRepos(target)
          }
          catch {
            continue
          }
          for (const repo of scanned) {
            if (collected.has(repo.path))
              continue
            collected.set(repo.path, {
              path: repo.path,
              name: repo.name,
              enabled: enabledPaths.has(repo.path),
              iconDataUrl: await findProjectIcon(repo.path).catch(() => null),
            })
          }
        }
        const out = Array.from(collected.values())
        out.sort((a, b) => a.path.localeCompare(b.path))
        return out
      },
    }
  },
})

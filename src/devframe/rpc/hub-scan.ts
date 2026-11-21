import type { HubScannedProject } from './types'
import { defineRpcFunction } from 'devframe'
import { scanProjectDirectories } from '../../hub/scan-projects'
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
        const projects = await scanProjectDirectories(targets)
        return Promise.all(projects.map(async project => ({
          path: project.path,
          name: project.name,
          repo: project.repo,
          error: project.error,
          enabled: enabledPaths.has(project.path),
          iconDataUrl: await findProjectIcon(project.path).catch(() => null),
        })))
      },
    }
  },
})

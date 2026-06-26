import type { DevframeNodeContext } from 'devframe'
import type { ProjectContext } from '../project-context'
import type { HubInfo } from './types'

/**
 * State that hub-only RPC handlers reach for via `getHubContext(context)`.
 * `setupHubMode` builds this once at boot and stores it on the devframe
 * context with `setHubContext`.
 */
export interface HubRpcContext {
  devframeCtx: DevframeNodeContext
  homeDir?: string
  launchCwd: string
  roots: Set<string>
  projects: Map<string, ProjectContext>
  /** Absolute paths of enabled projects the user has hidden from the hub. */
  excluded: Set<string>
  withLock: <T>(fn: () => Promise<T>) => Promise<T>
  buildHubInfo: () => HubInfo
  broadcastProjectsChange: () => void
  broadcastHubInfoChange: () => void
  loadProjectByPath: (path: string) => Promise<ProjectContext>
  persistEnabled: () => Promise<void>
  /** Persist the current `excluded` set to hub.json. */
  persistExcluded: () => Promise<void>
  autoSync: { setInterval: (ms: number | undefined) => void, close: () => void }
}

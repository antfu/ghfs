import type { DevToolsNodeContext } from 'devframe'
import type { ProjectContext } from '../project-context'
import type { HubInfo } from './types'

/**
 * State that hub-only RPC handlers reach for via `getHubContext(context)`.
 * `setupHubMode` builds this once at boot and stores it on the devframe
 * context with `setHubContext`.
 */
export interface HubRpcContext {
  devframeCtx: DevToolsNodeContext
  homeDir?: string
  launchCwd: string
  roots: Set<string>
  projects: Map<string, ProjectContext>
  withLock: <T>(fn: () => Promise<T>) => Promise<T>
  buildHubInfo: () => HubInfo
  broadcastProjectsChange: () => void
  broadcastHubInfoChange: () => void
  loadProjectByPath: (path: string) => Promise<ProjectContext>
  persistEnabled: () => Promise<void>
  autoSync: { setInterval: (ms: number | undefined) => void, close: () => void }
}

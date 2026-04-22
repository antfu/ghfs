import type { GhfsResolvedConfig } from '../types'
import type { RepositoryProvider } from '../types/provider'
import type { RemotePollerHandle } from './poller'
import type { ClientFunctions } from './types'

export type Broadcast = {
  [K in keyof ClientFunctions]: ClientFunctions[K]
}

export interface ServerContext {
  config: GhfsResolvedConfig
  repo: string
  storageDirAbsolute: string
  executeFilePath: string
  getToken: () => Promise<string>
  getProvider: () => Promise<RepositoryProvider | null>
  broadcast: Broadcast
  poller: RemotePollerHandle
}

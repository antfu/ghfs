import type { GhfsResolvedConfig } from '../types'
import type { RepositoryProvider } from '../types/provider'

export interface SyncOptions {
  config: GhfsResolvedConfig
  repo: string
  token: string
  provider?: RepositoryProvider
  full?: boolean
  since?: string
  numbers?: number[]
}

export interface SyncSummary {
  repo: string
  since?: string
  syncedAt: string
  scanned: number
  written: number
  moved: number
  patchesWritten: number
  patchesDeleted: number
}

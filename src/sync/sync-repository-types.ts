import type { GhfsResolvedConfig, IssueKind, IssueState, SyncState } from '../types'
import type { ProviderItem, RepositoryProvider } from '../types/provider'

export interface SyncContext {
  provider: RepositoryProvider
  repoSlug: string
  storageDirAbsolute: string
  config: GhfsResolvedConfig
  syncState: SyncState
  syncedAt: string
}

export interface IssueCandidates {
  issues: ProviderItem[]
  scanned: number
  allOpenNumbers?: Set<number>
}

export interface IssuePaths {
  openPath: string
  closedPath: string
  targetPath: string
  patchPath: string
  trackedPath?: string
  hasOpenFile: boolean
  hasClosedFile: boolean
  hasTrackedFile: boolean
  hasLocalFile: boolean
  hasTargetFile: boolean
}

export interface PatchPlan {
  shouldWritePatch: boolean
  shouldDeletePatch: boolean
}

export interface ItemSyncStats {
  written: number
  moved: number
  patchesWritten: number
  patchesDeleted: number
}

export interface SyncCounters extends ItemSyncStats {
  scanned: number
}

export interface ClosedIssuePolicyInput {
  context: SyncContext
  number: number
  kind: IssueKind
  state: IssueState
  paths: IssuePaths
}

import type { GhfsResolvedConfig, IssueKind, IssueState, SyncState } from '../types'
import type { ProviderItem, RepositoryProvider } from '../types/provider'
import type { SyncProgressSnapshot } from './contracts'

export interface GitHubRepository {
  name: string
  full_name: string
  description: string | null
  private: boolean
  archived: boolean
  default_branch: string
  html_url: string
  fork: boolean
  open_issues_count: number
  has_issues: boolean
  has_projects: boolean
  has_wiki: boolean
  created_at: string
  updated_at: string
  pushed_at: string | null
  owner: {
    login: string
  }
}

export interface GitHubLabel {
  name: string
  color: string
  description: string | null
  default: boolean
}

export interface GitHubMilestone {
  number: number
  title: string
  state: 'open' | 'closed'
  description: string | null
  due_on: string | null
  open_issues: number
  closed_issues: number
  created_at: string
  updated_at: string
  closed_at: string | null
}

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
  skipped: number
  written: number
  moved: number
  patchesWritten: number
  patchesDeleted: number
}

export interface SyncCounters extends SyncProgressSnapshot {}

export interface ClosedIssuePolicyInput {
  context: SyncContext
  number: number
  kind: IssueKind
  state: IssueState
  paths: IssuePaths
}

import type { Octokit } from 'octokit'
import type { GhfsResolvedConfig, IssueKind, IssueState, SyncState } from '../types'

export interface GitHubIssue {
  number: number
  state: 'open' | 'closed'
  html_url?: string
  updated_at: string
  created_at: string
  closed_at: string | null
  title: string
  body: string | null
  user: {
    login: string
  } | null
  labels: Array<string | { name?: string | null }>
  assignees: Array<{ login: string }> | null
  milestone: {
    title?: string | null
  } | null
  pull_request?: Record<string, unknown>
}

export interface GitHubComment {
  id: number
  body: string | null
  created_at: string
  updated_at: string
  user: {
    login: string
  } | null
}

export interface GitHubPull {
  draft: boolean
  merged: boolean
  merged_at: string | null
  base: {
    ref: string
  }
  head: {
    ref: string
  }
  requested_reviewers: Array<{ login: string }>
}

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
  octokit: Octokit
  owner: string
  repo: string
  repoSlug: string
  storageDirAbsolute: string
  config: GhfsResolvedConfig
  syncState: SyncState
  syncedAt: string
}

export interface IssueCandidates {
  issues: GitHubIssue[]
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

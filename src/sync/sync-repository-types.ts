import type { Octokit } from 'octokit'
import type { GhfsResolvedConfig, IssueKind, IssueState, SyncState } from '../types'
import type { SyncProgressSnapshot } from './contracts'

export interface GitHubIssue {
  number: number
  state: 'open' | 'closed'
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

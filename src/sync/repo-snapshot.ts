import { readFile } from 'node:fs/promises'
import { join } from 'pathe'
import { REPO_SNAPSHOT_FILE_NAME } from '../constants'

export interface RepoSnapshot {
  repo: string
  synced_at: string
  repository: {
    owner: string
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
  }
  labels: Array<{
    name: string
    color: string
    description: string | null
    default: boolean
  }>
  milestones: Array<{
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
  }>
}

export async function loadRepoSnapshot(storageDirAbsolute: string): Promise<RepoSnapshot | null> {
  try {
    const raw = await readFile(join(storageDirAbsolute, REPO_SNAPSHOT_FILE_NAME), 'utf8')
    return JSON.parse(raw) as RepoSnapshot
  }
  catch {
    return null
  }
}

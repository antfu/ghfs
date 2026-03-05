import type { IssueCandidates, SyncContext } from './sync-repository-types'
import { resolvePaginateState } from './sync-repository-utils'

export async function fetchIssueCandidatesByPagination(context: SyncContext, since: string | undefined): Promise<IssueCandidates> {
  if (context.config.sync.closed === false) {
    const openIssues = await paginateIssues(context, 'open', since)
    if (!since) {
      return {
        issues: openIssues,
        scanned: openIssues.length,
        allOpenNumbers: new Set(openIssues.map(issue => issue.number)),
      }
    }

    const recentlyClosedIssues = await paginateIssues(context, 'closed', since)
    return {
      issues: [...openIssues, ...recentlyClosedIssues],
      scanned: openIssues.length + recentlyClosedIssues.length,
    }
  }

  const state = resolvePaginateState(context.config.sync.closed)
  const issues = await paginateIssues(context, state, since)
  return {
    issues,
    scanned: issues.length,
  }
}

export async function fetchIssueCandidatesByNumbers(context: SyncContext, numbers: number[]): Promise<IssueCandidates> {
  const issues = await context.provider.fetchItemsByNumbers(numbers)
  return {
    issues,
    scanned: issues.length,
  }
}

async function paginateIssues(context: SyncContext, state: 'open' | 'closed' | 'all', since: string | undefined) {
  return await context.provider.fetchItems({
    state,
    since,
  })
}

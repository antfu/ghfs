import type { Octokit } from 'octokit'
import type {
  PaginateItemsOptions,
  ProviderComment,
  ProviderItem,
  ProviderItemSnapshot,
  ProviderLabel,
  ProviderLockReason,
  ProviderMilestone,
  ProviderPullMetadata,
  ProviderRepository,
  RepositoryProvider,
} from '../../types/provider'
import { collectPages, iteratePages } from '../helpers'
import { createGitHubClient } from './client'

export interface CreateGitHubProviderOptions {
  token: string
  owner: string
  repo: string
}

export function createGitHubProvider(options: CreateGitHubProviderOptions): RepositoryProvider {
  const octokit = createGitHubClient(options.token)
  const { owner, repo } = options

  return {
    paginateItems: paginateOptions => paginateItems(octokit, owner, repo, paginateOptions),
    fetchItems: paginateOptions => fetchItems(octokit, owner, repo, paginateOptions),
    eachItem: paginateOptions => eachItem(octokit, owner, repo, paginateOptions),
    fetchItemsByNumbers: numbers => fetchItemsByNumbers(octokit, owner, repo, numbers),
    fetchComments: number => fetchComments(octokit, owner, repo, number),
    fetchPullMetadata: number => fetchPullMetadata(octokit, owner, repo, number),
    fetchPullPatch: number => fetchPullPatch(octokit, owner, repo, number),
    fetchItemSnapshot: number => fetchItemSnapshot(octokit, owner, repo, number),
    fetchRepository: () => fetchRepository(octokit, owner, repo),
    fetchRepositoryLabels: () => fetchRepositoryLabels(octokit, owner, repo),
    fetchRepositoryMilestones: () => fetchRepositoryMilestones(octokit, owner, repo),

    actionClose: number => actionClose(octokit, owner, repo, number),
    actionReopen: number => actionReopen(octokit, owner, repo, number),
    actionSetTitle: (number, title) => actionSetTitle(octokit, owner, repo, number, title),
    actionSetBody: (number, body) => actionSetBody(octokit, owner, repo, number, body),
    actionAddComment: (number, body) => actionAddComment(octokit, owner, repo, number, body),
    actionAddLabels: (number, labels) => actionAddLabels(octokit, owner, repo, number, labels),
    actionRemoveLabels: (number, labels) => actionRemoveLabels(octokit, owner, repo, number, labels),
    actionSetLabels: (number, labels) => actionSetLabels(octokit, owner, repo, number, labels),
    actionAddAssignees: (number, assignees) => actionAddAssignees(octokit, owner, repo, number, assignees),
    actionRemoveAssignees: (number, assignees) => actionRemoveAssignees(octokit, owner, repo, number, assignees),
    actionSetAssignees: (number, assignees) => actionSetAssignees(octokit, owner, repo, number, assignees),
    actionSetMilestone: (number, milestone) => actionSetMilestone(octokit, owner, repo, number, milestone),
    actionClearMilestone: number => actionClearMilestone(octokit, owner, repo, number),
    actionLock: (number, reason) => actionLock(octokit, owner, repo, number, reason),
    actionUnlock: number => actionUnlock(octokit, owner, repo, number),
    actionRequestReviewers: (number, reviewers) => actionRequestReviewers(octokit, owner, repo, number, reviewers),
    actionRemoveReviewers: (number, reviewers) => actionRemoveReviewers(octokit, owner, repo, number, reviewers),
    actionMarkReadyForReview: number => actionMarkReadyForReview(octokit, owner, repo, number),
    actionConvertToDraft: number => actionConvertToDraft(octokit, owner, repo, number),
  }
}

async function* paginateItems(
  octokit: Octokit,
  owner: string,
  repo: string,
  options: PaginateItemsOptions,
): AsyncIterable<ProviderItem[]> {
  const iterator = octokit.paginate.iterator(octokit.rest.issues.listForRepo, {
    owner,
    repo,
    state: options.state,
    sort: 'updated',
    direction: 'asc',
    per_page: 100,
    since: options.since,
  }) as AsyncIterable<{ data: GitHubIssue[] }>

  for await (const page of iterator)
    yield page.data.map(mapIssue)
}

async function fetchItems(
  octokit: Octokit,
  owner: string,
  repo: string,
  options: PaginateItemsOptions,
): Promise<ProviderItem[]> {
  return await collectPages(paginateItems(octokit, owner, repo, options))
}

async function* eachItem(
  octokit: Octokit,
  owner: string,
  repo: string,
  options: PaginateItemsOptions,
): AsyncIterable<ProviderItem> {
  yield* iteratePages(paginateItems(octokit, owner, repo, options))
}

async function fetchItemsByNumbers(octokit: Octokit, owner: string, repo: string, numbers: number[]): Promise<ProviderItem[]> {
  const items = await Promise.all(
    numbers.map(async (number) => {
      const result = await octokit.rest.issues.get({
        owner,
        repo,
        issue_number: number,
      })
      return mapIssue(result.data as GitHubIssue)
    }),
  )

  return items.sort((a, b) => a.number - b.number)
}

async function fetchComments(octokit: Octokit, owner: string, repo: string, number: number): Promise<ProviderComment[]> {
  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    owner,
    repo,
    issue_number: number,
    per_page: 100,
  }) as GitHubComment[]

  return comments.map(mapComment)
}

async function fetchPullMetadata(octokit: Octokit, owner: string, repo: string, number: number): Promise<ProviderPullMetadata> {
  const result = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: number,
  })

  const pull = result.data as GitHubPull
  return {
    isDraft: pull.draft,
    merged: pull.merged,
    mergedAt: pull.merged_at,
    baseRef: pull.base.ref,
    headRef: pull.head.ref,
    requestedReviewers: pull.requested_reviewers.map(reviewer => reviewer.login),
  }
}

async function fetchPullPatch(octokit: Octokit, owner: string, repo: string, number: number): Promise<string> {
  const result = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
    owner,
    repo,
    pull_number: number,
    mediaType: {
      format: 'patch',
    },
  })

  if (typeof result.data === 'string')
    return result.data

  throw new Error(`Unexpected patch response for pull #${number}`)
}

async function fetchItemSnapshot(octokit: Octokit, owner: string, repo: string, number: number): Promise<ProviderItemSnapshot> {
  const result = await octokit.rest.issues.get({
    owner,
    repo,
    issue_number: number,
  })

  const issue = result.data as GitHubIssue
  return {
    number,
    kind: issue.pull_request ? 'pull' : 'issue',
    updatedAt: issue.updated_at ?? null,
  }
}

async function fetchRepository(octokit: Octokit, owner: string, repo: string): Promise<ProviderRepository> {
  const result = await octokit.rest.repos.get({ owner, repo })
  return result.data as ProviderRepository
}

async function fetchRepositoryLabels(octokit: Octokit, owner: string, repo: string): Promise<ProviderLabel[]> {
  return await octokit.paginate(octokit.rest.issues.listLabelsForRepo, {
    owner,
    repo,
    per_page: 100,
  }) as ProviderLabel[]
}

async function fetchRepositoryMilestones(octokit: Octokit, owner: string, repo: string): Promise<ProviderMilestone[]> {
  return await octokit.paginate(octokit.rest.issues.listMilestones, {
    owner,
    repo,
    state: 'all',
    per_page: 100,
  }) as ProviderMilestone[]
}

async function actionClose(octokit: Octokit, owner: string, repo: string, number: number): Promise<void> {
  await octokit.rest.issues.update({ owner, repo, issue_number: number, state: 'closed' })
}

async function actionReopen(octokit: Octokit, owner: string, repo: string, number: number): Promise<void> {
  await octokit.rest.issues.update({ owner, repo, issue_number: number, state: 'open' })
}

async function actionSetTitle(octokit: Octokit, owner: string, repo: string, number: number, title: string): Promise<void> {
  await octokit.rest.issues.update({ owner, repo, issue_number: number, title })
}

async function actionSetBody(octokit: Octokit, owner: string, repo: string, number: number, body: string): Promise<void> {
  await octokit.rest.issues.update({ owner, repo, issue_number: number, body })
}

async function actionAddComment(octokit: Octokit, owner: string, repo: string, number: number, body: string): Promise<void> {
  await octokit.rest.issues.createComment({ owner, repo, issue_number: number, body })
}

async function actionAddLabels(octokit: Octokit, owner: string, repo: string, number: number, labels: string[]): Promise<void> {
  await octokit.rest.issues.addLabels({ owner, repo, issue_number: number, labels })
}

async function actionRemoveLabels(octokit: Octokit, owner: string, repo: string, number: number, labels: string[]): Promise<void> {
  for (const label of labels) {
    try {
      await octokit.rest.issues.removeLabel({ owner, repo, issue_number: number, name: label })
    }
    catch (error) {
      const status = (error as { status?: number }).status
      if (status !== 404)
        throw error
    }
  }
}

async function actionSetLabels(octokit: Octokit, owner: string, repo: string, number: number, labels: string[]): Promise<void> {
  await octokit.rest.issues.setLabels({ owner, repo, issue_number: number, labels })
}

async function actionAddAssignees(octokit: Octokit, owner: string, repo: string, number: number, assignees: string[]): Promise<void> {
  await octokit.rest.issues.addAssignees({ owner, repo, issue_number: number, assignees })
}

async function actionRemoveAssignees(octokit: Octokit, owner: string, repo: string, number: number, assignees: string[]): Promise<void> {
  await octokit.rest.issues.removeAssignees({ owner, repo, issue_number: number, assignees })
}

async function actionSetAssignees(octokit: Octokit, owner: string, repo: string, number: number, assignees: string[]): Promise<void> {
  await octokit.rest.issues.update({ owner, repo, issue_number: number, assignees })
}

async function actionSetMilestone(octokit: Octokit, owner: string, repo: string, number: number, milestone: string | number): Promise<void> {
  const resolvedMilestone = await resolveMilestone(octokit, owner, repo, milestone)
  await octokit.rest.issues.update({ owner, repo, issue_number: number, milestone: resolvedMilestone })
}

async function actionClearMilestone(octokit: Octokit, owner: string, repo: string, number: number): Promise<void> {
  await octokit.rest.issues.update({ owner, repo, issue_number: number, milestone: null })
}

async function actionLock(octokit: Octokit, owner: string, repo: string, number: number, reason?: ProviderLockReason): Promise<void> {
  await octokit.rest.issues.lock({
    owner,
    repo,
    issue_number: number,
    lock_reason: normalizeLockReason(reason),
  })
}

async function actionUnlock(octokit: Octokit, owner: string, repo: string, number: number): Promise<void> {
  await octokit.rest.issues.unlock({ owner, repo, issue_number: number })
}

async function actionRequestReviewers(octokit: Octokit, owner: string, repo: string, number: number, reviewers: string[]): Promise<void> {
  await octokit.rest.pulls.requestReviewers({
    owner,
    repo,
    pull_number: number,
    reviewers,
  })
}

async function actionRemoveReviewers(octokit: Octokit, owner: string, repo: string, number: number, reviewers: string[]): Promise<void> {
  await octokit.rest.pulls.removeRequestedReviewers({
    owner,
    repo,
    pull_number: number,
    reviewers,
  })
}

async function actionMarkReadyForReview(octokit: Octokit, owner: string, repo: string, number: number): Promise<void> {
  await octokit.request('POST /repos/{owner}/{repo}/pulls/{pull_number}/ready_for_review', {
    owner,
    repo,
    pull_number: number,
  })
}

async function actionConvertToDraft(octokit: Octokit, owner: string, repo: string, number: number): Promise<void> {
  await octokit.request('POST /repos/{owner}/{repo}/pulls/{pull_number}/convert-to-draft', {
    owner,
    repo,
    pull_number: number,
  })
}

async function resolveMilestone(octokit: Octokit, owner: string, repo: string, value: string | number): Promise<number> {
  if (typeof value === 'number')
    return value

  if (/^\d+$/.test(value))
    return Number(value)

  const milestones = await octokit.paginate(octokit.rest.issues.listMilestones, {
    owner,
    repo,
    state: 'all',
    per_page: 100,
  }) as Array<{ number: number, title: string }>

  const matched = milestones.find(item => item.title === value)
  if (!matched)
    throw new Error(`Milestone not found: ${value}`)

  return matched.number
}

function normalizeLockReason(reason: ProviderLockReason | undefined): 'resolved' | 'off-topic' | 'too heated' | 'spam' | undefined {
  if (!reason)
    return undefined
  if (reason === 'too-heated')
    return 'too heated'
  return reason
}

function mapIssue(issue: GitHubIssue): ProviderItem {
  return {
    number: issue.number,
    kind: issue.pull_request ? 'pull' : 'issue',
    state: issue.state === 'closed' ? 'closed' : 'open',
    updatedAt: issue.updated_at,
    createdAt: issue.created_at,
    closedAt: issue.closed_at,
    title: issue.title,
    body: issue.body,
    author: issue.user?.login ?? null,
    labels: issue.labels
      .map((label) => {
        if (typeof label === 'string')
          return label
        return label.name ?? undefined
      })
      .filter((label): label is string => Boolean(label)),
    assignees: (issue.assignees ?? []).map(assignee => assignee.login),
    milestone: issue.milestone?.title ?? null,
  }
}

function mapComment(comment: GitHubComment): ProviderComment {
  return {
    id: comment.id,
    body: comment.body,
    createdAt: comment.created_at,
    updatedAt: comment.updated_at,
    author: comment.user?.login ?? null,
  }
}

interface GitHubIssue {
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

interface GitHubComment {
  id: number
  body: string | null
  created_at: string
  updated_at: string
  user: {
    login: string
  } | null
}

interface GitHubPull {
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

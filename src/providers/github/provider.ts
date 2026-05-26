import type { Octokit } from 'octokit'
import type {
  MergeOptions,
  PaginateItemsOptions,
  ProviderAuthenticatedUser,
  ProviderComment,
  ProviderCommit,
  ProviderItem,
  ProviderItemSnapshot,
  ProviderLabel,
  ProviderLockReason,
  ProviderMilestone,
  ProviderPullMetadata,
  ProviderReactions,
  ProviderRepository,
  ProviderReviewState,
  ProviderTimelineEvent,
  ProviderTimelineSource,
  ProviderUpdateCounts,
  ReactionTarget,
  RepositoryProvider,
} from '../../types/provider'
import type { ReactionContent } from '../../utils/reactions'
import { diagnostics } from '../../logger'
import { randomHexColor } from '../../utils/color'
import { formatIssueNumber } from '../../utils/format'
import { createEmptyReactions, isReactionContent, normalizeReactions, reactionKeyFromContent } from '../../utils/reactions'
import { collectPages, iteratePages } from '../helpers'
import { createGitHubClient } from './client'

type BumpRequestCount = () => void

export interface CreateGitHubProviderOptions {
  token: string
  owner: string
  repo: string
}

export function createGitHubProvider(options: CreateGitHubProviderOptions): RepositoryProvider {
  const octokit = createGitHubClient(options.token)
  const { owner, repo } = options
  let requestCount = 0
  const bumpRequestCount = () => {
    requestCount += 1
  }

  let authenticatedUserPromise: Promise<ProviderAuthenticatedUser | null> | null = null
  const fetchAuthenticatedUserCached = (): Promise<ProviderAuthenticatedUser | null> => {
    if (!authenticatedUserPromise)
      authenticatedUserPromise = fetchAuthenticatedUser(octokit, bumpRequestCount)
    return authenticatedUserPromise
  }

  return {
    paginateItems: paginateOptions => paginateItems(octokit, owner, repo, paginateOptions, bumpRequestCount),
    fetchItems: paginateOptions => fetchItems(octokit, owner, repo, paginateOptions, bumpRequestCount),
    eachItem: paginateOptions => eachItem(octokit, owner, repo, paginateOptions, bumpRequestCount),
    fetchItemsByNumbers: numbers => fetchItemsByNumbers(octokit, owner, repo, numbers, bumpRequestCount),
    fetchComments: number => fetchComments(octokit, owner, repo, number, bumpRequestCount),
    fetchPullMetadata: number => fetchPullMetadata(octokit, owner, repo, number, bumpRequestCount),
    fetchPullPatch: number => fetchPullPatch(octokit, owner, repo, number, bumpRequestCount),
    fetchPullCommits: number => fetchPullCommits(octokit, owner, repo, number, bumpRequestCount),
    fetchTimeline: number => fetchTimeline(octokit, owner, repo, number, bumpRequestCount),
    fetchItemSnapshot: number => fetchItemSnapshot(octokit, owner, repo, number, bumpRequestCount),
    fetchRepository: () => fetchRepository(octokit, owner, repo, bumpRequestCount),
    fetchRepositoryLabels: () => fetchRepositoryLabels(octokit, owner, repo, bumpRequestCount),
    fetchRepositoryMilestones: () => fetchRepositoryMilestones(octokit, owner, repo, bumpRequestCount),
    fetchAuthenticatedUser: fetchAuthenticatedUserCached,
    countUpdatedSince: since => countUpdatedSince(octokit, owner, repo, since, bumpRequestCount),
    getRequestCount: () => requestCount,

    actionClose: number => actionClose(octokit, owner, repo, number, bumpRequestCount),
    actionReopen: number => actionReopen(octokit, owner, repo, number, bumpRequestCount),
    actionSetTitle: (number, title) => actionSetTitle(octokit, owner, repo, number, title, bumpRequestCount),
    actionSetBody: (number, body) => actionSetBody(octokit, owner, repo, number, body, bumpRequestCount),
    actionAddComment: (number, body) => actionAddComment(octokit, owner, repo, number, body, bumpRequestCount),
    actionAddLabels: (number, labels) => actionAddLabels(octokit, owner, repo, number, labels, bumpRequestCount),
    actionRemoveLabels: (number, labels) => actionRemoveLabels(octokit, owner, repo, number, labels, bumpRequestCount),
    actionSetLabels: (number, labels) => actionSetLabels(octokit, owner, repo, number, labels, bumpRequestCount),
    actionAddAssignees: (number, assignees) => actionAddAssignees(octokit, owner, repo, number, assignees, bumpRequestCount),
    actionRemoveAssignees: (number, assignees) => actionRemoveAssignees(octokit, owner, repo, number, assignees, bumpRequestCount),
    actionSetAssignees: (number, assignees) => actionSetAssignees(octokit, owner, repo, number, assignees, bumpRequestCount),
    actionSetMilestone: (number, milestone) => actionSetMilestone(octokit, owner, repo, number, milestone, bumpRequestCount),
    actionClearMilestone: number => actionClearMilestone(octokit, owner, repo, number, bumpRequestCount),
    actionLock: (number, reason) => actionLock(octokit, owner, repo, number, reason, bumpRequestCount),
    actionUnlock: number => actionUnlock(octokit, owner, repo, number, bumpRequestCount),
    actionRequestReviewers: (number, reviewers) => actionRequestReviewers(octokit, owner, repo, number, reviewers, bumpRequestCount),
    actionRemoveReviewers: (number, reviewers) => actionRemoveReviewers(octokit, owner, repo, number, reviewers, bumpRequestCount),
    actionMarkReadyForReview: number => actionMarkReadyForReview(octokit, owner, repo, number, bumpRequestCount),
    actionConvertToDraft: number => actionConvertToDraft(octokit, owner, repo, number, bumpRequestCount),
    actionApprove: (number, body) => actionSubmitReview(octokit, owner, repo, number, 'APPROVE', body, bumpRequestCount),
    actionRequestChanges: (number, body) => actionSubmitReview(octokit, owner, repo, number, 'REQUEST_CHANGES', body, bumpRequestCount),
    actionReviewComment: (number, body) => actionSubmitReview(octokit, owner, repo, number, 'COMMENT', body, bumpRequestCount),
    actionMerge: (number, mergeOptions) => actionMerge(octokit, owner, repo, number, mergeOptions, bumpRequestCount),
    actionEnqueueMerge: number => actionEnqueueMerge(octokit, owner, repo, number, bumpRequestCount),
    actionAddReaction: (number, reaction, target) =>
      actionAddReaction(octokit, owner, repo, number, reaction, target, bumpRequestCount),
    actionRemoveReaction: (number, reaction, target) =>
      actionRemoveReaction(octokit, owner, repo, number, reaction, target, fetchAuthenticatedUserCached, bumpRequestCount),
    fetchViewerReactions: (number, target) =>
      fetchViewerReactions(octokit, owner, repo, number, target, fetchAuthenticatedUserCached, bumpRequestCount),
  }
}

async function* paginateItems(
  octokit: Octokit,
  owner: string,
  repo: string,
  options: PaginateItemsOptions,
  bumpRequestCount: BumpRequestCount,
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

  for await (const page of iterator) {
    bumpRequestCount()
    yield page.data.map(mapIssue)
  }
}

async function fetchItems(
  octokit: Octokit,
  owner: string,
  repo: string,
  options: PaginateItemsOptions,
  bumpRequestCount: BumpRequestCount,
): Promise<ProviderItem[]> {
  return await collectPages(paginateItems(octokit, owner, repo, options, bumpRequestCount))
}

async function* eachItem(
  octokit: Octokit,
  owner: string,
  repo: string,
  options: PaginateItemsOptions,
  bumpRequestCount: BumpRequestCount,
): AsyncIterable<ProviderItem> {
  yield* iteratePages(paginateItems(octokit, owner, repo, options, bumpRequestCount))
}

async function fetchItemsByNumbers(
  octokit: Octokit,
  owner: string,
  repo: string,
  numbers: number[],
  bumpRequestCount: BumpRequestCount,
): Promise<ProviderItem[]> {
  const items = await Promise.all(
    numbers.map(async (number) => {
      bumpRequestCount()
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

async function fetchComments(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  bumpRequestCount: BumpRequestCount,
): Promise<ProviderComment[]> {
  bumpRequestCount()
  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    owner,
    repo,
    issue_number: number,
    per_page: 100,
  }) as GitHubComment[]

  return comments.map(mapComment)
}

async function fetchPullMetadata(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  bumpRequestCount: BumpRequestCount,
): Promise<ProviderPullMetadata> {
  bumpRequestCount()
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
    mergeable: pull.mergeable ?? null,
    mergeableState: pull.mergeable_state ?? 'unknown',
  }
}

async function fetchPullPatch(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  bumpRequestCount: BumpRequestCount,
): Promise<string> {
  bumpRequestCount()
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

  throw diagnostics.GHFS0300({
    issue: formatIssueNumber(number, { repo: `${owner}/${repo}`, kind: 'pull' }),
  })
}

async function fetchPullCommits(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  bumpRequestCount: BumpRequestCount,
): Promise<ProviderCommit[]> {
  bumpRequestCount()
  const commits = await octokit.paginate(octokit.rest.pulls.listCommits, {
    owner,
    repo,
    pull_number: number,
    per_page: 100,
  }) as GitHubPullCommit[]

  return commits.map(mapPullCommit)
}

async function fetchTimeline(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  bumpRequestCount: BumpRequestCount,
): Promise<ProviderTimelineEvent[]> {
  bumpRequestCount()
  const events = await octokit.paginate(octokit.rest.issues.listEventsForTimeline, {
    owner,
    repo,
    issue_number: number,
    per_page: 100,
  }) as GitHubTimelineEvent[]

  const out: ProviderTimelineEvent[] = []
  for (const event of events) {
    const mapped = mapTimelineEvent(event)
    if (mapped)
      out.push(mapped)
  }

  await enrichReviewReactions(octokit, out, bumpRequestCount)
  return out
}

async function enrichReviewReactions(
  octokit: Octokit,
  events: ProviderTimelineEvent[],
  bumpRequestCount: BumpRequestCount,
): Promise<void> {
  const reviewIds = events.flatMap(e =>
    e.kind === 'reviewed' && e.review?.nodeId ? [e.review.nodeId] : [],
  )
  if (reviewIds.length === 0)
    return

  const unique = [...new Set(reviewIds)]
  try {
    bumpRequestCount()
    const data = await octokit.graphql<{
      nodes: Array<{ id: string, reactionGroups?: Array<{ content: string, users: { totalCount: number } }> } | null>
    }>(
      `query ReviewReactions($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on PullRequestReview {
            id
            reactionGroups { content users(first: 0) { totalCount } }
          }
        }
      }`,
      { ids: unique },
    )

    const byId = new Map<string, ProviderReactions>()
    for (const node of data.nodes ?? []) {
      if (!node?.id || !node.reactionGroups)
        continue
      const reactions = createEmptyReactions()
      for (const group of node.reactionGroups) {
        const wireContent = graphqlContentToReaction(group.content)
        if (!wireContent)
          continue
        const count = group.users.totalCount
        if (count <= 0)
          continue
        reactions[reactionKeyFromContent(wireContent)] = count
        reactions.totalCount += count
      }
      byId.set(node.id, reactions)
    }

    for (const event of events) {
      if (event.kind !== 'reviewed' || !event.review?.nodeId)
        continue
      const reactions = byId.get(event.review.nodeId)
      if (reactions)
        event.review.reactions = reactions
    }
  }
  catch {
    // Silently degrade — reviews without reaction data still render, just without the counts row.
  }
}

async function fetchItemSnapshot(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  bumpRequestCount: BumpRequestCount,
): Promise<ProviderItemSnapshot> {
  bumpRequestCount()
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

async function fetchRepository(octokit: Octokit, owner: string, repo: string, bumpRequestCount: BumpRequestCount): Promise<ProviderRepository> {
  bumpRequestCount()
  const result = await octokit.rest.repos.get({ owner, repo })
  const data = result.data as ProviderRepository
  const mergeQueueEnabled = await fetchMergeQueueEnabled(octokit, owner, repo, bumpRequestCount)
  return {
    ...data,
    merge_queue_enabled: mergeQueueEnabled,
  }
}

/**
 * Check whether the default branch's merge queue is set up. Uses GraphQL
 * because REST doesn't expose this. Returns `null` on errors (insufficient
 * permission, GraphQL unavailable) so the UI can keep working.
 */
async function fetchMergeQueueEnabled(
  octokit: Octokit,
  owner: string,
  repo: string,
  bumpRequestCount: BumpRequestCount,
): Promise<boolean | null> {
  bumpRequestCount()
  try {
    const result = await octokit.graphql<{
      repository: { mergeQueue: { id: string } | null } | null
    }>(
      `query MergeQueueEnabled($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          mergeQueue {
            id
          }
        }
      }`,
      { owner, name: repo },
    )
    return Boolean(result.repository?.mergeQueue)
  }
  catch {
    return null
  }
}

async function fetchRepositoryLabels(octokit: Octokit, owner: string, repo: string, bumpRequestCount: BumpRequestCount): Promise<ProviderLabel[]> {
  bumpRequestCount()
  return await octokit.paginate(octokit.rest.issues.listLabelsForRepo, {
    owner,
    repo,
    per_page: 100,
  }) as ProviderLabel[]
}

async function fetchRepositoryMilestones(octokit: Octokit, owner: string, repo: string, bumpRequestCount: BumpRequestCount): Promise<ProviderMilestone[]> {
  bumpRequestCount()
  return await octokit.paginate(octokit.rest.issues.listMilestones, {
    owner,
    repo,
    state: 'all',
    per_page: 100,
  }) as ProviderMilestone[]
}

async function fetchAuthenticatedUser(octokit: Octokit, bumpRequestCount: BumpRequestCount): Promise<ProviderAuthenticatedUser | null> {
  bumpRequestCount()
  try {
    const result = await octokit.rest.users.getAuthenticated()
    return {
      login: result.data.login,
      name: result.data.name ?? null,
      avatarUrl: result.data.avatar_url,
    }
  }
  catch {
    return null
  }
}

async function countUpdatedSince(
  octokit: Octokit,
  owner: string,
  repo: string,
  since: string,
  bumpRequestCount: BumpRequestCount,
): Promise<ProviderUpdateCounts> {
  bumpRequestCount()
  const sinceQuery = normalizeSinceForSearch(since)
  const result = await octokit.graphql<{
    issues: { issueCount: number }
    pulls: { issueCount: number }
  }>(
    `query CountsUpdated($issuesQuery: String!, $pullsQuery: String!) {
      issues: search(query: $issuesQuery, type: ISSUE, first: 0) { issueCount }
      pulls: search(query: $pullsQuery, type: ISSUE, first: 0) { issueCount }
    }`,
    {
      issuesQuery: `repo:${owner}/${repo} is:issue updated:>=${sinceQuery}`,
      pullsQuery: `repo:${owner}/${repo} is:pr updated:>=${sinceQuery}`,
    },
  )
  return {
    issues: result.issues.issueCount,
    pulls: result.pulls.issueCount,
  }
}

function normalizeSinceForSearch(since: string): string {
  const date = new Date(since)
  if (Number.isNaN(date.getTime()))
    return since
  return date.toISOString()
}

async function actionClose(octokit: Octokit, owner: string, repo: string, number: number, bumpRequestCount: BumpRequestCount): Promise<void> {
  bumpRequestCount()
  await octokit.rest.issues.update({ owner, repo, issue_number: number, state: 'closed' })
}

async function actionReopen(octokit: Octokit, owner: string, repo: string, number: number, bumpRequestCount: BumpRequestCount): Promise<void> {
  bumpRequestCount()
  await octokit.rest.issues.update({ owner, repo, issue_number: number, state: 'open' })
}

async function actionSetTitle(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  title: string,
  bumpRequestCount: BumpRequestCount,
): Promise<void> {
  bumpRequestCount()
  await octokit.rest.issues.update({ owner, repo, issue_number: number, title })
}

async function actionSetBody(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  body: string,
  bumpRequestCount: BumpRequestCount,
): Promise<void> {
  bumpRequestCount()
  await octokit.rest.issues.update({ owner, repo, issue_number: number, body })
}

async function actionAddComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  body: string,
  bumpRequestCount: BumpRequestCount,
): Promise<void> {
  bumpRequestCount()
  await octokit.rest.issues.createComment({ owner, repo, issue_number: number, body })
}

async function actionAddLabels(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  labels: string[],
  bumpRequestCount: BumpRequestCount,
): Promise<void> {
  await ensureLabelsExist(octokit, owner, repo, labels, bumpRequestCount)
  bumpRequestCount()
  await octokit.rest.issues.addLabels({ owner, repo, issue_number: number, labels })
}

async function actionRemoveLabels(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  labels: string[],
  bumpRequestCount: BumpRequestCount,
): Promise<void> {
  for (const label of labels) {
    try {
      bumpRequestCount()
      await octokit.rest.issues.removeLabel({ owner, repo, issue_number: number, name: label })
    }
    catch (error) {
      const status = (error as { status?: number }).status
      if (status !== 404)
        throw error
    }
  }
}

async function actionSetLabels(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  labels: string[],
  bumpRequestCount: BumpRequestCount,
): Promise<void> {
  await ensureLabelsExist(octokit, owner, repo, labels, bumpRequestCount)
  bumpRequestCount()
  await octokit.rest.issues.setLabels({ owner, repo, issue_number: number, labels })
}

async function ensureLabelsExist(
  octokit: Octokit,
  owner: string,
  repo: string,
  labels: string[],
  bumpRequestCount: BumpRequestCount,
): Promise<void> {
  if (!labels.length)
    return

  const existingLabels = await fetchRepositoryLabels(octokit, owner, repo, bumpRequestCount)
  const existingLabelNames = new Set(existingLabels.map(label => label.name.toLowerCase()))

  for (const label of labels) {
    const normalizedLabel = label.toLowerCase()
    if (existingLabelNames.has(normalizedLabel))
      continue

    try {
      bumpRequestCount()
      await octokit.rest.issues.createLabel({
        owner,
        repo,
        name: label,
        color: randomHexColor(),
      })
      existingLabelNames.add(normalizedLabel)
    }
    catch (error) {
      const status = (error as { status?: number }).status
      if (status !== 422)
        throw error
      existingLabelNames.add(normalizedLabel)
    }
  }
}

async function actionAddAssignees(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  assignees: string[],
  bumpRequestCount: BumpRequestCount,
): Promise<void> {
  bumpRequestCount()
  await octokit.rest.issues.addAssignees({ owner, repo, issue_number: number, assignees })
}

async function actionRemoveAssignees(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  assignees: string[],
  bumpRequestCount: BumpRequestCount,
): Promise<void> {
  bumpRequestCount()
  await octokit.rest.issues.removeAssignees({ owner, repo, issue_number: number, assignees })
}

async function actionSetAssignees(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  assignees: string[],
  bumpRequestCount: BumpRequestCount,
): Promise<void> {
  bumpRequestCount()
  await octokit.rest.issues.update({ owner, repo, issue_number: number, assignees })
}

async function actionSetMilestone(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  milestone: string | number,
  bumpRequestCount: BumpRequestCount,
): Promise<void> {
  const resolvedMilestone = await resolveMilestone(octokit, owner, repo, milestone, bumpRequestCount)
  bumpRequestCount()
  await octokit.rest.issues.update({ owner, repo, issue_number: number, milestone: resolvedMilestone })
}

async function actionClearMilestone(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  bumpRequestCount: BumpRequestCount,
): Promise<void> {
  bumpRequestCount()
  await octokit.rest.issues.update({ owner, repo, issue_number: number, milestone: null })
}

async function actionLock(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  reason: ProviderLockReason | undefined,
  bumpRequestCount: BumpRequestCount,
): Promise<void> {
  bumpRequestCount()
  await octokit.rest.issues.lock({
    owner,
    repo,
    issue_number: number,
    lock_reason: normalizeLockReason(reason),
  })
}

async function actionUnlock(octokit: Octokit, owner: string, repo: string, number: number, bumpRequestCount: BumpRequestCount): Promise<void> {
  bumpRequestCount()
  await octokit.rest.issues.unlock({ owner, repo, issue_number: number })
}

async function actionRequestReviewers(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  reviewers: string[],
  bumpRequestCount: BumpRequestCount,
): Promise<void> {
  bumpRequestCount()
  await octokit.rest.pulls.requestReviewers({
    owner,
    repo,
    pull_number: number,
    reviewers,
  })
}

async function actionRemoveReviewers(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  reviewers: string[],
  bumpRequestCount: BumpRequestCount,
): Promise<void> {
  bumpRequestCount()
  await octokit.rest.pulls.removeRequestedReviewers({
    owner,
    repo,
    pull_number: number,
    reviewers,
  })
}

async function actionMarkReadyForReview(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  bumpRequestCount: BumpRequestCount,
): Promise<void> {
  bumpRequestCount()
  await octokit.request('POST /repos/{owner}/{repo}/pulls/{pull_number}/ready_for_review', {
    owner,
    repo,
    pull_number: number,
  })
}

async function actionConvertToDraft(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  bumpRequestCount: BumpRequestCount,
): Promise<void> {
  bumpRequestCount()
  await octokit.request('POST /repos/{owner}/{repo}/pulls/{pull_number}/convert-to-draft', {
    owner,
    repo,
    pull_number: number,
  })
}

async function actionSubmitReview(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT',
  body: string | undefined,
  bumpRequestCount: BumpRequestCount,
): Promise<void> {
  bumpRequestCount()
  await octokit.rest.pulls.createReview({
    owner,
    repo,
    pull_number: number,
    event,
    ...(body !== undefined && body.length > 0 ? { body } : {}),
  })
}

async function actionMerge(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  mergeOptions: MergeOptions,
  bumpRequestCount: BumpRequestCount,
): Promise<void> {
  bumpRequestCount()
  await octokit.rest.pulls.merge({
    owner,
    repo,
    pull_number: number,
    merge_method: mergeOptions.method ?? 'squash',
    ...(mergeOptions.commitTitle !== undefined ? { commit_title: mergeOptions.commitTitle } : {}),
    ...(mergeOptions.commitMessage !== undefined ? { commit_message: mergeOptions.commitMessage } : {}),
  })
}

async function actionEnqueueMerge(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  bumpRequestCount: BumpRequestCount,
): Promise<void> {
  bumpRequestCount()
  const pull = await octokit.rest.pulls.get({ owner, repo, pull_number: number })
  const pullRequestId = (pull.data as { node_id?: string }).node_id
  if (!pullRequestId)
    throw new Error(`Cannot enqueue PR #${number}: missing GraphQL node id`)

  bumpRequestCount()
  await octokit.graphql(
    `mutation EnqueuePullRequest($input: EnqueuePullRequestInput!) {
      enqueuePullRequest(input: $input) {
        mergeQueueEntry {
          id
        }
      }
    }`,
    { input: { pullRequestId } },
  )
}

async function resolveMilestone(
  octokit: Octokit,
  owner: string,
  repo: string,
  value: string | number,
  bumpRequestCount: BumpRequestCount,
): Promise<number> {
  if (typeof value === 'number')
    return value

  if (/^\d+$/.test(value))
    return Number(value)

  bumpRequestCount()
  const milestones = await octokit.paginate(octokit.rest.issues.listMilestones, {
    owner,
    repo,
    state: 'all',
    per_page: 100,
  }) as Array<{ number: number, title: string }>

  const matched = milestones.find(item => item.title === value)
  if (!matched)
    throw diagnostics.GHFS0301({ value })

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
    ...(issue.html_url ? { url: issue.html_url } : {}),
    state: issue.state === 'closed' ? 'closed' : 'open',
    stateReason: normalizeStateReason(issue.state_reason),
    updatedAt: issue.updated_at,
    createdAt: issue.created_at,
    closedAt: issue.closed_at,
    title: issue.title,
    body: issue.body,
    author: issue.user?.login ?? null,
    ...(issue.user?.avatar_url ? { authorAvatarUrl: issue.user.avatar_url } : {}),
    labels: issue.labels
      .map((label) => {
        if (typeof label === 'string')
          return label
        return label.name ?? undefined
      })
      .filter((label): label is string => Boolean(label)),
    assignees: (issue.assignees ?? []).map(assignee => assignee.login),
    milestone: issue.milestone?.title ?? null,
    reactions: mapReactions(issue.reactions),
  }
}

function normalizeStateReason(reason: string | null | undefined): ProviderItem['stateReason'] {
  if (reason === 'completed' || reason === 'not_planned' || reason === 'reopened')
    return reason
  return null
}

function mapComment(comment: GitHubComment): ProviderComment {
  return {
    id: comment.id,
    body: comment.body,
    createdAt: comment.created_at,
    updatedAt: comment.updated_at,
    author: comment.user?.login ?? null,
    ...(comment.user?.avatar_url ? { authorAvatarUrl: comment.user.avatar_url } : {}),
    reactions: mapReactions(comment.reactions),
  }
}

function mapPullCommit(commit: GitHubPullCommit): ProviderCommit {
  return {
    sha: commit.sha,
    message: commit.commit.message,
    authorLogin: commit.author?.login ?? null,
    authorName: commit.commit.author?.name ?? null,
    authorDate: commit.commit.author?.date ?? commit.commit.committer?.date ?? '',
    committerLogin: commit.committer?.login ?? null,
    committerDate: commit.commit.committer?.date ?? commit.commit.author?.date ?? '',
    ...(commit.html_url ? { url: commit.html_url } : {}),
  }
}

function mapTimelineEvent(event: GitHubTimelineEvent): ProviderTimelineEvent | null {
  const eventName = event.event
  if (!eventName)
    return null

  // `committed` events use commit shape (no id/created_at/actor).
  if (eventName === 'committed' && event.sha) {
    const createdAt = event.committer?.date ?? event.author?.date
    if (!createdAt)
      return null
    const fullMessage = event.message ?? ''
    const firstLine = fullMessage.split('\n', 1)[0] ?? ''
    return {
      id: `commit:${event.sha}`,
      kind: 'committed',
      createdAt,
      actor: event.author?.name ?? event.committer?.name ?? null,
      sha: event.sha,
      commitMessage: firstLine,
      body: fullMessage,
      ...(event.commit_url ? { commitUrl: event.commit_url } : {}),
    }
  }

  const createdAt = event.created_at ?? event.submitted_at
  if (!createdAt)
    return null

  const id = event.id != null ? String(event.id) : `${eventName}:${createdAt}`
  const actor = event.actor?.login ?? event.user?.login ?? null
  const actorAvatarUrl = event.actor?.avatar_url ?? event.user?.avatar_url ?? undefined
  const base = { id, createdAt, actor, ...(actorAvatarUrl ? { actorAvatarUrl } : {}) }

  function extractSource(): ProviderTimelineSource | undefined {
    const issue = event.source?.issue
    if (!issue?.number)
      return undefined
    return {
      number: issue.number,
      kind: issue.pull_request ? 'pull' : 'issue',
      ...(issue.title ? { title: issue.title } : {}),
      ...(issue.html_url ? { url: issue.html_url } : {}),
      ...(issue.repository?.full_name ? { repo: issue.repository.full_name } : {}),
    }
  }

  switch (eventName) {
    case 'closed':
      return {
        ...base,
        kind: 'closed',
        ...(event.state_reason ? { stateReason: event.state_reason } : {}),
        ...(event.commit_id ? { sha: event.commit_id } : {}),
        ...(event.commit_url ? { commitUrl: event.commit_url } : {}),
      }
    case 'reopened':
      return { ...base, kind: 'reopened' }
    case 'merged':
      return {
        ...base,
        kind: 'merged',
        ...(event.commit_id ? { sha: event.commit_id } : {}),
        ...(event.commit_url ? { commitUrl: event.commit_url } : {}),
      }
    case 'head_ref_force_pushed':
      return {
        ...base,
        kind: 'head_ref_force_pushed',
        ...(event.commit_id ? { sha: event.commit_id } : {}),
        ...(event.commit_url ? { commitUrl: event.commit_url } : {}),
      }
    case 'head_ref_deleted':
    case 'head_ref_restored':
    case 'unlocked':
    case 'ready_for_review':
    case 'convert_to_draft':
    case 'pinned':
    case 'unpinned':
    case 'mentioned':
    case 'subscribed':
    case 'unsubscribed':
      return { ...base, kind: eventName }
    case 'locked':
      return {
        ...base,
        kind: 'locked',
        ...(event.lock_reason ? { lockReason: event.lock_reason } : {}),
      }
    case 'labeled':
    case 'unlabeled':
      if (!event.label)
        return null
      return {
        ...base,
        kind: eventName,
        label: { name: event.label.name, color: event.label.color ?? '' },
      }
    case 'assigned':
    case 'unassigned':
      if (!event.assignee?.login)
        return null
      return { ...base, kind: eventName, assignee: event.assignee.login }
    case 'review_requested':
    case 'review_request_removed': {
      const userLogin = event.requested_reviewer?.login
      const teamName = event.requested_team?.name
      const reviewer = userLogin ?? teamName
      if (!reviewer)
        return null
      return {
        ...base,
        kind: eventName,
        requestedReviewer: reviewer,
        ...(userLogin ? {} : { isTeam: true }),
      }
    }
    case 'reviewed': {
      const rawState = event.state ?? 'commented'
      return {
        ...base,
        kind: 'reviewed',
        review: {
          state: normalizeReviewState(rawState),
          body: event.body ?? null,
          submittedAt: event.submitted_at ?? createdAt,
          ...(event.node_id ? { nodeId: event.node_id } : {}),
        },
        body: event.body ?? null,
      }
    }
    case 'review_dismissed': {
      const dismissed = event.dismissed_review
      if (!dismissed)
        return { ...base, kind: 'unknown', rawKind: eventName }
      return {
        ...base,
        kind: 'review_dismissed',
        dismissedReview: {
          state: dismissed.state,
          reviewId: dismissed.review_id,
          dismissalMessage: dismissed.dismissal_message,
        },
        ...(event.review?.user?.login ? { reviewedBy: event.review.user.login } : {}),
      }
    }
    case 'commented':
      return {
        ...base,
        kind: 'commented',
        ...(typeof event.id === 'number' ? { commentId: event.id } : {}),
        body: event.body ?? null,
      }
    case 'renamed':
      if (!event.rename)
        return null
      return {
        ...base,
        kind: 'renamed',
        rename: { from: event.rename.from, to: event.rename.to },
      }
    case 'referenced':
    case 'cross-referenced':
    case 'connected':
    case 'disconnected':
    case 'marked_as_duplicate':
    case 'unmarked_as_duplicate': {
      const source = extractSource()
      return { ...base, kind: eventName, ...(source ? { source } : {}) }
    }
    case 'milestoned':
    case 'demilestoned':
      return {
        ...base,
        kind: eventName,
        ...(event.milestone?.title ? { milestone: event.milestone.title } : {}),
      }
    case 'transferred': {
      const fromRepo = event.transferred?.from_repository?.full_name ?? event.from_repository?.full_name
      return {
        ...base,
        kind: 'transferred',
        ...(fromRepo ? { fromRepo } : {}),
      }
    }
    case 'base_ref_changed': {
      const fromRef = event.changes?.base?.ref?.from ?? event.base_ref?.from
      const toRef = event.changes?.base?.ref?.to ?? event.base_ref?.to
      return {
        ...base,
        kind: 'base_ref_changed',
        ...(fromRef ? { oldRef: fromRef } : {}),
        ...(toRef ? { newRef: toRef } : {}),
      }
    }
    case 'auto_merge_enabled':
    case 'auto_merge_disabled':
    case 'auto_squash_enabled':
    case 'auto_squash_disabled':
    case 'auto_rebase_enabled':
    case 'auto_rebase_disabled':
      return {
        ...base,
        kind: eventName,
        ...(event.commit_title ? { commitTitle: event.commit_title } : {}),
        ...(event.commit_message ? { commitMessage: event.commit_message } : {}),
      }
    default:
      return { ...base, kind: 'unknown', rawKind: eventName }
  }
}

function normalizeReviewState(state: string): ProviderReviewState {
  const lower = state.toLowerCase()
  if (lower === 'approved' || lower === 'changes_requested' || lower === 'commented' || lower === 'dismissed' || lower === 'pending')
    return lower
  return 'commented'
}

const REACTION_TO_GRAPHQL: Record<ReactionContent, string> = {
  '+1': 'THUMBS_UP',
  '-1': 'THUMBS_DOWN',
  'laugh': 'LAUGH',
  'hooray': 'HOORAY',
  'confused': 'CONFUSED',
  'heart': 'HEART',
  'rocket': 'ROCKET',
  'eyes': 'EYES',
}

const GRAPHQL_TO_REACTION = Object.fromEntries(
  Object.entries(REACTION_TO_GRAPHQL).map(([k, v]) => [v, k]),
) as Record<string, ReactionContent>

function graphqlContentToReaction(graphqlContent: string): ReactionContent | null {
  return GRAPHQL_TO_REACTION[graphqlContent] ?? null
}

async function actionAddReaction(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  reaction: ReactionContent,
  target: ReactionTarget,
  bumpRequestCount: BumpRequestCount,
): Promise<void> {
  bumpRequestCount()
  if (target.kind === 'item') {
    await octokit.rest.reactions.createForIssue({
      owner,
      repo,
      issue_number: number,
      content: reaction,
    })
    return
  }
  if (target.kind === 'comment') {
    await octokit.rest.reactions.createForIssueComment({
      owner,
      repo,
      comment_id: target.commentId,
      content: reaction,
    })
    return
  }
  await octokit.graphql(
    `mutation AddReviewReaction($subjectId: ID!, $content: ReactionContent!) {
      addReaction(input: { subjectId: $subjectId, content: $content }) {
        reaction { id }
      }
    }`,
    { subjectId: target.reviewId, content: REACTION_TO_GRAPHQL[reaction] },
  )
}

async function actionRemoveReaction(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  reaction: ReactionContent,
  target: ReactionTarget,
  fetchAuth: () => Promise<ProviderAuthenticatedUser | null>,
  bumpRequestCount: BumpRequestCount,
): Promise<void> {
  if (target.kind === 'review') {
    bumpRequestCount()
    await octokit.graphql(
      `mutation RemoveReviewReaction($subjectId: ID!, $content: ReactionContent!) {
        removeReaction(input: { subjectId: $subjectId, content: $content }) {
          reaction { id }
        }
      }`,
      { subjectId: target.reviewId, content: REACTION_TO_GRAPHQL[reaction] },
    )
    return
  }

  const user = await fetchAuth()
  if (!user)
    throw diagnostics.GHFS0302()

  if (target.kind === 'item') {
    bumpRequestCount()
    const reactions = await octokit.paginate(octokit.rest.reactions.listForIssue, {
      owner,
      repo,
      issue_number: number,
      content: reaction,
      per_page: 100,
    }) as Array<{ id: number, user?: { login: string } | null, content: string }>
    const mine = reactions.find(r => r.user?.login === user.login && r.content === reaction)
    if (!mine)
      return
    bumpRequestCount()
    await octokit.rest.reactions.deleteForIssue({ owner, repo, issue_number: number, reaction_id: mine.id })
    return
  }

  bumpRequestCount()
  const commentReactions = await octokit.paginate(octokit.rest.reactions.listForIssueComment, {
    owner,
    repo,
    comment_id: target.commentId,
    content: reaction,
    per_page: 100,
  }) as Array<{ id: number, user?: { login: string } | null, content: string }>
  const mineComment = commentReactions.find(r => r.user?.login === user.login && r.content === reaction)
  if (!mineComment)
    return
  bumpRequestCount()
  await octokit.rest.reactions.deleteForIssueComment({
    owner,
    repo,
    comment_id: target.commentId,
    reaction_id: mineComment.id,
  })
}

async function fetchViewerReactions(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  target: ReactionTarget,
  fetchAuth: () => Promise<ProviderAuthenticatedUser | null>,
  bumpRequestCount: BumpRequestCount,
): Promise<ReactionContent[]> {
  if (target.kind === 'review') {
    bumpRequestCount()
    const data = await octokit.graphql<{
      node: { reactionGroups?: Array<{ content: string, viewerHasReacted: boolean }> } | null
    }>(
      `query ViewerReviewReactions($id: ID!) {
        node(id: $id) {
          ... on PullRequestReview {
            reactionGroups { content viewerHasReacted }
          }
        }
      }`,
      { id: target.reviewId },
    )
    const groups = data.node?.reactionGroups ?? []
    return groups
      .filter(g => g.viewerHasReacted)
      .map(g => graphqlContentToReaction(g.content))
      .filter((c): c is ReactionContent => c !== null)
  }

  const user = await fetchAuth()
  if (!user)
    return []

  if (target.kind === 'item') {
    bumpRequestCount()
    const reactions = await octokit.paginate(octokit.rest.reactions.listForIssue, {
      owner,
      repo,
      issue_number: number,
      per_page: 100,
    }) as Array<{ user?: { login: string } | null, content: string }>
    return collectViewerReactions(reactions, user.login)
  }

  bumpRequestCount()
  const commentReactions = await octokit.paginate(octokit.rest.reactions.listForIssueComment, {
    owner,
    repo,
    comment_id: target.commentId,
    per_page: 100,
  }) as Array<{ user?: { login: string } | null, content: string }>
  return collectViewerReactions(commentReactions, user.login)
}

function collectViewerReactions(
  reactions: Array<{ user?: { login: string } | null, content: string }>,
  login: string,
): ReactionContent[] {
  const out = new Set<ReactionContent>()
  for (const r of reactions) {
    if (r.user?.login !== login)
      continue
    if (isReactionContent(r.content))
      out.add(r.content)
  }
  return [...out]
}

function mapReactions(reactions: GitHubReactions | null | undefined): ProviderReactions {
  return normalizeReactions({
    totalCount: reactions?.total_count,
    plusOne: reactions?.['+1'],
    minusOne: reactions?.['-1'],
    laugh: reactions?.laugh,
    hooray: reactions?.hooray,
    confused: reactions?.confused,
    heart: reactions?.heart,
    rocket: reactions?.rocket,
    eyes: reactions?.eyes,
  })
}

interface GitHubIssue {
  number: number
  state: 'open' | 'closed'
  state_reason?: string | null
  html_url?: string
  updated_at: string
  created_at: string
  closed_at: string | null
  title: string
  body: string | null
  user: {
    login: string
    avatar_url?: string | null
  } | null
  labels: Array<string | { name?: string | null }>
  assignees: Array<{ login: string }> | null
  milestone: {
    title?: string | null
  } | null
  reactions?: GitHubReactions | null
  pull_request?: Record<string, unknown>
}

interface GitHubComment {
  id: number
  body: string | null
  created_at: string
  updated_at: string
  user: {
    login: string
    avatar_url?: string | null
  } | null
  reactions?: GitHubReactions | null
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
  mergeable?: boolean | null
  mergeable_state?: string
}

interface GitHubReactions {
  'total_count'?: number
  '+1'?: number
  '-1'?: number
  'laugh'?: number
  'hooray'?: number
  'confused'?: number
  'heart'?: number
  'rocket'?: number
  'eyes'?: number
}

interface GitHubPullCommit {
  sha: string
  html_url?: string
  commit: {
    message: string
    author?: {
      name?: string | null
      email?: string | null
      date?: string | null
    } | null
    committer?: {
      name?: string | null
      email?: string | null
      date?: string | null
    } | null
  }
  author?: { login: string } | null
  committer?: { login: string } | null
}

interface GitHubTimelineEvent {
  id?: number | string
  node_id?: string
  event?: string
  created_at?: string
  submitted_at?: string
  actor?: { login: string, avatar_url?: string | null } | null
  user?: { login: string, avatar_url?: string | null } | null
  label?: { name: string, color?: string | null }
  assignee?: { login: string } | null
  requested_reviewer?: { login: string } | null
  requested_team?: { name: string } | null
  rename?: { from: string, to: string }
  state?: string
  state_reason?: string | null
  body?: string | null
  milestone?: { title?: string } | null
  source?: {
    type?: string
    issue?: {
      number?: number
      title?: string
      html_url?: string
      pull_request?: unknown
      repository?: { full_name?: string } | null
    } | null
  } | null
  // committed shape
  sha?: string
  message?: string
  author?: { name?: string | null, date?: string | null } | null
  committer?: { name?: string | null, date?: string | null } | null
  /** Commit referenced by an event (merged / closed-by-commit / head_ref_force_pushed). */
  commit_id?: string | null
  commit_url?: string | null
  /** Reason supplied to a `locked` event. */
  lock_reason?: string | null
  /** Populated for `review_dismissed`. */
  dismissed_review?: { state: string, review_id: number, dismissal_message: string | null } | null
  review_id?: number
  review?: { user?: { login: string } | null } | null
  /** Populated for `transferred` (REST surfaces this under both paths). */
  transferred?: { from_repository?: { full_name?: string } | null } | null
  from_repository?: { full_name?: string } | null
  /** Populated for `base_ref_changed`. */
  changes?: { base?: { ref?: { from?: string, to?: string } } } | null
  base_ref?: { from?: string, to?: string } | null
  /** Populated for `auto_merge_*` / `auto_squash_*` / `auto_rebase_*`. */
  commit_title?: string
  commit_message?: string
}

import type { Octokit } from 'octokit'
import type {
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
  ProviderTimelineEventKind,
  ProviderUpdateCounts,
  RepositoryProvider,
} from '../../types/provider'
import { CodedError, log } from '../../logger'
import { randomHexColor } from '../../utils/color'
import { formatIssueNumber } from '../../utils/format'
import { normalizeReactions } from '../../utils/reactions'
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

  throw new CodedError(log.GHFS0300({
    issue: formatIssueNumber(number, { repo: `${owner}/${repo}`, kind: 'pull' }),
  }))
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
  return out
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
  return result.data as ProviderRepository
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
    throw new CodedError(log.GHFS0301({ value }))

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
    }
  }

  const createdAt = event.created_at ?? event.submitted_at
  if (!createdAt)
    return null

  const id = event.id != null ? String(event.id) : `${eventName}:${createdAt}`
  const actor = event.actor?.login ?? event.user?.login ?? null
  const base: ProviderTimelineEvent = {
    id,
    kind: 'unknown',
    createdAt,
    actor,
  }

  switch (eventName) {
    case 'closed':
    case 'reopened':
    case 'merged':
    case 'locked':
    case 'unlocked':
    case 'ready_for_review':
    case 'convert_to_draft':
    case 'head_ref_deleted':
    case 'head_ref_restored':
    case 'head_ref_force_pushed':
      return { ...base, kind: eventName as ProviderTimelineEventKind, ...(event.state_reason ? { stateReason: event.state_reason } : {}) }
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
      const reviewer = event.requested_reviewer?.login ?? event.requested_team?.name
      if (!reviewer)
        return null
      return { ...base, kind: eventName, requestedReviewer: reviewer }
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
        },
        body: event.body ?? null,
      }
    }
    case 'commented':
      return {
        ...base,
        kind: 'commented',
        commentId: typeof event.id === 'number' ? event.id : undefined,
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
      return { ...base, kind: eventName }
    default:
      if (!actor)
        return null
      return { ...base, kind: 'unknown' }
  }
}

function normalizeReviewState(state: string): ProviderReviewState {
  const lower = state.toLowerCase()
  if (lower === 'approved' || lower === 'changes_requested' || lower === 'commented' || lower === 'dismissed' || lower === 'pending')
    return lower
  return 'commented'
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
  event?: string
  created_at?: string
  submitted_at?: string
  actor?: { login: string } | null
  user?: { login: string } | null
  label?: { name: string, color?: string | null }
  assignee?: { login: string } | null
  requested_reviewer?: { login: string } | null
  requested_team?: { name: string } | null
  rename?: { from: string, to: string }
  state?: string
  state_reason?: string | null
  body?: string | null
  // committed shape
  sha?: string
  message?: string
  author?: { name?: string | null, date?: string | null } | null
  committer?: { name?: string | null, date?: string | null } | null
}

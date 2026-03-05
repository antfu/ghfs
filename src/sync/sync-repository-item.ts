import type { GitHubIssue, ItemSyncStats, PatchPlan, SyncContext } from './sync-repository-types'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { renderIssueMarkdown } from './markdown'
import { downloadPullPatch, fetchIssueComments, getPullMetadata } from './sync-repository-github'
import {
  handleClosedIssueByPolicy,
  moveMarkdownByState,
  removePatchIfExists,
  removeStaleMarkdownFiles,
  resolveIssuePaths,
  shouldSkipIssueSync,
  updateTrackedItem,
} from './sync-repository-storage'
import { normalizeLabels, resolvePatchPlan } from './sync-repository-utils'

export async function syncIssueCandidate(context: SyncContext, issue: GitHubIssue): Promise<ItemSyncStats> {
  const number = issue.number
  const kind = issue.pull_request ? 'pull' : 'issue'
  const state = issue.state === 'closed' ? 'closed' : 'open'
  const tracked = context.syncState.items[String(number)]
  const paths = await resolveIssuePaths(context.storageDirAbsolute, kind, number, issue.title, state, tracked?.filePath)

  const closedDecision = await handleClosedIssueByPolicy({
    context,
    number,
    kind,
    state,
    paths,
  })
  if (closedDecision)
    return closedDecision

  const patchPlan = resolvePatchPlan(context.config.sync.patches, kind, state)

  if (await shouldSkipIssueSync(tracked, issue.updated_at, paths, patchPlan)) {
    let patchesDeleted = 0
    if (patchPlan.shouldDeletePatch)
      patchesDeleted += await removePatchIfExists(context.storageDirAbsolute, number)
    await removeStaleMarkdownFiles(paths)
    updateTrackedItem(context, number, kind, state, issue.updated_at, paths.targetPath, patchPlan.shouldWritePatch ? paths.patchPath : undefined)
    return {
      skipped: 1,
      written: 0,
      moved: 0,
      patchesWritten: 0,
      patchesDeleted,
    }
  }

  const comments = await fetchIssueComments(context, number)
  const pull = kind === 'pull'
    ? await getPullMetadata(context.octokit, context.owner, context.repo, number)
    : undefined

  const markdown = renderIssueMarkdown({
    repo: context.repoSlug,
    number,
    kind,
    state,
    title: issue.title,
    body: issue.body ?? '',
    author: issue.user?.login ?? 'unknown',
    labels: normalizeLabels(issue.labels),
    assignees: (issue.assignees ?? []).map(assignee => assignee.login),
    milestone: issue.milestone?.title ?? null,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
    closedAt: issue.closed_at,
    lastSyncedAt: context.syncedAt,
    comments: comments.map(comment => ({
      id: comment.id,
      author: comment.user?.login ?? 'unknown',
      body: comment.body ?? '',
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
    })),
    pr: pull,
  })

  const moved = await moveMarkdownByState(paths, state)
  await writeFileEnsured(paths.targetPath, markdown)
  await removeStaleMarkdownFiles(paths)

  const patchStats = await syncPatchByPlan(context, number, paths.patchPath, patchPlan)
  updateTrackedItem(context, number, kind, state, issue.updated_at, paths.targetPath, patchPlan.shouldWritePatch ? paths.patchPath : undefined)

  return {
    skipped: 0,
    written: 1,
    moved,
    patchesWritten: patchStats.patchesWritten,
    patchesDeleted: patchStats.patchesDeleted,
  }
}

async function syncPatchByPlan(
  context: SyncContext,
  number: number,
  patchPath: string,
  patchPlan: PatchPlan,
): Promise<Pick<ItemSyncStats, 'patchesWritten' | 'patchesDeleted'>> {
  let patchesWritten = 0
  let patchesDeleted = 0

  if (patchPlan.shouldWritePatch) {
    const patch = await downloadPullPatch(context.octokit, context.owner, context.repo, number)
    await writeFileEnsured(patchPath, patch)
    patchesWritten += 1
  }

  if (patchPlan.shouldDeletePatch)
    patchesDeleted += await removePatchIfExists(context.storageDirAbsolute, number)

  return {
    patchesWritten,
    patchesDeleted,
  }
}

async function writeFileEnsured(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, 'utf8')
}

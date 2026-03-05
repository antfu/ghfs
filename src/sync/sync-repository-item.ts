import type { ProviderItem } from '../types/provider'
import type { ItemSyncStats, PatchPlan, SyncContext } from './sync-repository-types'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { renderIssueMarkdown } from './markdown'
import {
  handleClosedIssueByPolicy,
  moveMarkdownByState,
  removePatchIfExists,
  removeStaleMarkdownFiles,
  resolveIssuePaths,
  shouldSkipIssueSync,
  updateTrackedItem,
} from './sync-repository-storage'
import { resolvePatchPlan } from './sync-repository-utils'

export async function syncIssueCandidate(context: SyncContext, issue: ProviderItem): Promise<ItemSyncStats> {
  const number = issue.number
  const kind = issue.kind
  const state = issue.state
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

  if (await shouldSkipIssueSync(tracked, issue.updatedAt, paths, patchPlan)) {
    let patchesDeleted = 0
    if (patchPlan.shouldDeletePatch)
      patchesDeleted += await removePatchIfExists(context.storageDirAbsolute, number)
    await removeStaleMarkdownFiles(paths)
    updateTrackedItem(context, number, kind, state, issue.updatedAt, paths.targetPath, patchPlan.shouldWritePatch ? paths.patchPath : undefined)
    return {
      skipped: 1,
      written: 0,
      moved: 0,
      patchesWritten: 0,
      patchesDeleted,
    }
  }

  const comments = await context.provider.fetchComments(number)
  const pull = kind === 'pull'
    ? await context.provider.fetchPullMetadata(number)
    : undefined

  const markdown = renderIssueMarkdown({
    repo: context.repoSlug,
    number,
    kind,
    url: issue.url,
    state,
    title: issue.title,
    body: issue.body ?? '',
    author: issue.author ?? 'unknown',
    labels: issue.labels,
    assignees: issue.assignees,
    milestone: issue.milestone,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    closedAt: issue.closedAt,
    lastSyncedAt: context.syncedAt,
    comments: comments.map(comment => ({
      id: comment.id,
      author: comment.author ?? 'unknown',
      body: comment.body ?? '',
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
    })),
    pr: pull,
  })

  const moved = await moveMarkdownByState(paths, state)
  await writeFileEnsured(paths.targetPath, markdown)
  await removeStaleMarkdownFiles(paths)

  const patchStats = await syncPatchByPlan(context, number, paths.patchPath, patchPlan)
  updateTrackedItem(context, number, kind, state, issue.updatedAt, paths.targetPath, patchPlan.shouldWritePatch ? paths.patchPath : undefined)

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
    const patch = await context.provider.fetchPullPatch(number)
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

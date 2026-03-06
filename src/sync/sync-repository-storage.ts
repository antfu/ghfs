import type { SyncItemState, SyncState } from '../types'
import type { ClosedIssuePolicyInput, IssuePaths, ItemSyncStats, PatchPlan, SyncContext } from './sync-repository-types'
import { readdir, rm } from 'node:fs/promises'
import { isAbsolute, join } from 'pathe'
import { CLOSED_DIR_NAME, ISSUE_DIR_NAME, PULL_DIR_NAME } from '../constants'
import { movePath, pathExists, removePatchIfExists, removePath } from '../utils/fs'
import {
  getItemMarkdownPath,
  getPrPatchPath,
} from './paths'
import { relativeToStorage, shouldSyncKind } from './sync-repository-utils'

export async function resolveIssuePaths(
  storageDirAbsolute: string,
  kind: 'issue' | 'pull',
  number: number,
  title: string,
  state: 'open' | 'closed',
  trackedFilePath?: string,
): Promise<IssuePaths> {
  const closedPath = getItemMarkdownPath(storageDirAbsolute, kind, number, 'closed', title)
  const openPath = getItemMarkdownPath(storageDirAbsolute, kind, number, 'open', title)
  const hasClosedFile = await pathExists(closedPath)
  const hasOpenFile = await pathExists(openPath)
  const trackedPath = resolveTrackedPath(storageDirAbsolute, trackedFilePath)
  const hasTrackedFile = trackedPath ? await pathExists(trackedPath) : false
  const targetPath = getItemMarkdownPath(storageDirAbsolute, kind, number, state, title)
  const hasTargetFile = state === 'open' ? hasOpenFile : hasClosedFile
  const matchedPaths = await findMatchedMarkdownPaths(storageDirAbsolute, kind, number, [
    openPath,
    closedPath,
    trackedPath,
  ])

  return {
    openPath,
    closedPath,
    targetPath,
    patchPath: getPrPatchPath(storageDirAbsolute, number, title),
    trackedPath,
    hasOpenFile,
    hasClosedFile,
    hasTrackedFile,
    matchedPaths,
    hasLocalFile: hasOpenFile || hasClosedFile || hasTrackedFile || matchedPaths.length > 0,
    hasTargetFile,
  }
}

export async function handleClosedIssueByPolicy(input: ClosedIssuePolicyInput): Promise<ItemSyncStats | undefined> {
  const { context, number, kind, state, paths } = input
  if (state !== 'closed')
    return undefined

  if (context.config.sync.closed === false) {
    for (const markdownPath of getExistingMarkdownPaths(paths))
      await removePath(markdownPath)

    let patchesDeleted = 0
    if (kind === 'pull')
      patchesDeleted += await removePatchIfExists(context.storageDirAbsolute, number)

    delete context.syncState.items[String(number)]
    return {
      kind,
      action: 'remove',
      skipped: 0,
      written: 0,
      moved: 0,
      patchesWritten: 0,
      patchesDeleted,
    }
  }

  if (context.config.sync.closed === 'existing' && !paths.hasLocalFile) {
    let patchesDeleted = 0
    if (kind === 'pull' && context.config.sync.patches !== 'all')
      patchesDeleted += await removePatchIfExists(context.storageDirAbsolute, number)

    delete context.syncState.items[String(number)]
    return {
      kind,
      action: 'remove',
      skipped: 0,
      written: 0,
      moved: 0,
      patchesWritten: 0,
      patchesDeleted,
    }
  }

  return undefined
}

export async function shouldSkipIssueSync(
  tracked: SyncItemState | undefined,
  issueUpdatedAt: string,
  paths: IssuePaths,
  patchPlan: PatchPlan,
): Promise<boolean> {
  if (!tracked)
    return false
  if (tracked.lastUpdatedAt !== issueUpdatedAt)
    return false
  if (!paths.hasTargetFile)
    return false

  if (patchPlan.shouldWritePatch)
    return await pathExists(paths.patchPath)

  return true
}

export async function moveMarkdownByState(paths: IssuePaths, state: 'open' | 'closed'): Promise<number> {
  const sourcePath = resolveMoveSourcePath(paths, state)
  if (!sourcePath)
    return 0
  if (sourcePath === paths.targetPath)
    return 0

  if (await pathExists(paths.targetPath))
    return 0

  await movePath(sourcePath, paths.targetPath)
  return 1
}

export async function removeStaleMarkdownFiles(paths: IssuePaths): Promise<void> {
  for (const markdownPath of getExistingMarkdownPaths(paths)) {
    if (markdownPath === paths.targetPath)
      continue
    await removePath(markdownPath)
  }
}

export function resolveMoveSourcePath(paths: IssuePaths, state: 'open' | 'closed'): string | undefined {
  if (paths.hasTrackedFile && paths.trackedPath && paths.trackedPath !== paths.targetPath)
    return paths.trackedPath

  if (state === 'open' && paths.hasClosedFile && paths.closedPath !== paths.targetPath)
    return paths.closedPath
  if (state === 'closed' && paths.hasOpenFile && paths.openPath !== paths.targetPath)
    return paths.openPath

  const openPathIsMovable = paths.hasOpenFile && paths.openPath !== paths.targetPath
  if (openPathIsMovable)
    return paths.openPath

  const closedPathIsMovable = paths.hasClosedFile && paths.closedPath !== paths.targetPath
  if (closedPathIsMovable)
    return paths.closedPath

  return paths.matchedPaths.find(path => path !== paths.targetPath)
}

export function getExistingMarkdownPaths(paths: IssuePaths): string[] {
  const markdownPaths = new Set<string>()
  if (paths.hasOpenFile)
    markdownPaths.add(paths.openPath)
  if (paths.hasClosedFile)
    markdownPaths.add(paths.closedPath)
  if (paths.hasTrackedFile && paths.trackedPath)
    markdownPaths.add(paths.trackedPath)
  for (const matchedPath of paths.matchedPaths)
    markdownPaths.add(matchedPath)
  return [...markdownPaths]
}

function resolveTrackedPath(storageDirAbsolute: string, trackedFilePath: string | undefined): string | undefined {
  if (!trackedFilePath)
    return undefined
  if (isAbsolute(trackedFilePath))
    return trackedFilePath
  return join(storageDirAbsolute, trackedFilePath)
}

function resolveTrackedPathOrJoin(storageDirAbsolute: string, trackedFilePath: string): string {
  return resolveTrackedPath(storageDirAbsolute, trackedFilePath) ?? join(storageDirAbsolute, trackedFilePath)
}

async function findMatchedMarkdownPaths(
  storageDirAbsolute: string,
  kind: 'issue' | 'pull',
  number: number,
  knownPaths: Array<string | undefined>,
): Promise<string[]> {
  const matchedPaths = new Set<string>()
  const knownPathSet = new Set(knownPaths.filter(Boolean))
  const padded = String(number).padStart(5, '0')
  const kindDir = kind === 'issue' ? ISSUE_DIR_NAME : PULL_DIR_NAME

  for (const stateDir of ['', CLOSED_DIR_NAME]) {
    const dir = stateDir
      ? join(storageDirAbsolute, kindDir, stateDir)
      : join(storageDirAbsolute, kindDir)

    let files: string[]
    try {
      files = await readdir(dir)
    }
    catch {
      continue
    }

    for (const fileName of files) {
      if (!fileName.startsWith(`${padded}-`) || !fileName.endsWith('.md'))
        continue
      const fullPath = join(dir, fileName)
      if (!knownPathSet.has(fullPath))
        matchedPaths.add(fullPath)
    }
  }

  return [...matchedPaths]
}

export function updateTrackedItem(
  context: SyncContext,
  number: number,
  kind: 'issue' | 'pull',
  state: 'open' | 'closed',
  issueUpdatedAt: string,
  markdownPath: string,
  patchPath: string | undefined,
  data: SyncItemState['data'],
): void {
  context.syncState.items[String(number)] = {
    number,
    kind,
    state,
    lastUpdatedAt: issueUpdatedAt,
    lastSyncedAt: context.syncedAt,
    filePath: relativeToStorage(context.storageDirAbsolute, markdownPath),
    patchPath: patchPath ? relativeToStorage(context.storageDirAbsolute, patchPath) : undefined,
    data,
  }
}

export async function pruneTrackedClosedItems(storageDirAbsolute: string, syncState: SyncState, sync: SyncContext['config']['sync']): Promise<number> {
  if (sync.issues)
    await rm(join(storageDirAbsolute, ISSUE_DIR_NAME, CLOSED_DIR_NAME), { recursive: true, force: true })
  if (sync.pulls)
    await rm(join(storageDirAbsolute, PULL_DIR_NAME, CLOSED_DIR_NAME), { recursive: true, force: true })

  let patchesDeleted = 0
  for (const item of Object.values(syncState.items)) {
    if (item.state !== 'closed')
      continue
    if (!shouldSyncKind(sync, item.kind))
      continue
    await removePath(resolveTrackedPathOrJoin(storageDirAbsolute, item.filePath))
    if (item.kind === 'pull')
      patchesDeleted += await removePatchIfExists(storageDirAbsolute, item.number)
    delete syncState.items[String(item.number)]
  }

  return patchesDeleted
}

export async function pruneMissingOpenTrackedItems(storageDirAbsolute: string, syncState: SyncState, openNumbers: Set<number>, sync: SyncContext['config']['sync']): Promise<number> {
  let patchesDeleted = 0

  for (const item of Object.values(syncState.items)) {
    if (item.state !== 'open')
      continue
    if (!shouldSyncKind(sync, item.kind))
      continue
    if (openNumbers.has(item.number))
      continue

    await removePath(resolveTrackedPathOrJoin(storageDirAbsolute, item.filePath))
    if (item.kind === 'pull')
      patchesDeleted += await removePatchIfExists(storageDirAbsolute, item.number)
    delete syncState.items[String(item.number)]
  }

  return patchesDeleted
}

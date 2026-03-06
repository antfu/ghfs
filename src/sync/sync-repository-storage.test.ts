import type { SyncState } from '../types'
import type { RepositoryProvider } from '../types/provider'
import type { IssuePaths, SyncContext } from './sync-repository-types'
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import process from 'node:process'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { getItemMarkdownPath, getPrPatchPath } from './paths'
import {
  getExistingMarkdownPaths,
  handleClosedIssueByPolicy,
  moveMarkdownByState,
  pruneMissingOpenTrackedItems,
  pruneTrackedClosedItems,
  removeStaleMarkdownFiles,
  resolveIssuePaths,
  resolveMoveSourcePath,
  shouldSkipIssueSync,
  updateTrackedItem,
} from './sync-repository-storage'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('sync-repository-storage', () => {
  it('resolves issue paths including tracked and matched legacy markdown files', async () => {
    const dir = await createTempDir()
    const openPath = getItemMarkdownPath(dir, 'issue', 1, 'open', 'New Title')
    const trackedPath = join(dir, 'issues', '00001-tracked.md')
    const legacyPath = join(dir, 'issues', '00001-legacy.md')

    await mkdir(join(dir, 'issues'), { recursive: true })
    await writeFile(openPath, '# open', 'utf8')
    await writeFile(trackedPath, '# tracked', 'utf8')
    await writeFile(legacyPath, '# legacy', 'utf8')

    const paths = await resolveIssuePaths(dir, 'issue', 1, 'New Title', 'open', 'issues/00001-tracked.md')

    expect(paths.hasOpenFile).toBe(true)
    expect(paths.hasClosedFile).toBe(false)
    expect(paths.hasTrackedFile).toBe(true)
    expect(paths.hasTargetFile).toBe(true)
    expect(paths.hasLocalFile).toBe(true)
    expect(paths.trackedPath).toBe(trackedPath)
    expect(paths.matchedPaths).toContain(legacyPath)
  })

  it('removes closed artifacts and sync-state entries when closed policy is false', async () => {
    const dir = await createTempDir()
    const context = createSyncContext(dir, { closed: false })
    const number = 2
    const title = 'PR 2'
    const openPath = getItemMarkdownPath(dir, 'pull', number, 'open', title)
    const closedPath = getItemMarkdownPath(dir, 'pull', number, 'closed', title)
    const patchPath = getPrPatchPath(dir, number, title)

    await mkdir(join(dir, 'pulls', 'closed'), { recursive: true })
    await writeFile(openPath, '# open', 'utf8')
    await writeFile(closedPath, '# closed', 'utf8')
    await writeFile(patchPath, 'diff --git', 'utf8')
    context.syncState.items[String(number)] = createTrackedItem({
      number,
      kind: 'pull',
      state: 'closed',
      filePath: 'pulls/closed/00002-pr-2.md',
    })

    const paths = await resolveIssuePaths(dir, 'pull', number, title, 'closed')
    const result = await handleClosedIssueByPolicy({
      context,
      number,
      kind: 'pull',
      state: 'closed',
      paths,
    })

    expect(result).toEqual({
      kind: 'pull',
      action: 'remove',
      skipped: 0,
      written: 0,
      moved: 0,
      patchesWritten: 0,
      patchesDeleted: 1,
    })
    expect(context.syncState.items[String(number)]).toBeUndefined()
    await expectPathMissing(openPath)
    await expectPathMissing(closedPath)
    await expectPathMissing(patchPath)
  })

  it('removes closed tracked entry without local markdown when closed policy is true', async () => {
    const dir = await createTempDir()
    const context = createSyncContext(dir, {
      closed: true,
      patches: 'open',
    })
    const number = 4
    const patchPath = join(dir, 'pulls', '00004-pr-4.patch')
    await mkdir(join(dir, 'pulls'), { recursive: true })
    await writeFile(patchPath, 'diff --git', 'utf8')
    context.syncState.items[String(number)] = createTrackedItem({
      number,
      kind: 'pull',
      state: 'closed',
      filePath: 'pulls/closed/00004-pr-4.md',
    })

    const result = await handleClosedIssueByPolicy({
      context,
      number,
      kind: 'pull',
      state: 'closed',
      paths: createIssuePaths({
        patchPath,
        hasLocalFile: false,
      }),
    })

    expect(result?.action).toBe('remove')
    expect(result?.patchesDeleted).toBe(1)
    expect(context.syncState.items[String(number)]).toBeUndefined()
    await expectPathMissing(patchPath)
  })

  it('skips sync only when tracked metadata and patch requirements match', async () => {
    const dir = await createTempDir()
    const tracked = createTrackedItem({
      number: 1,
      kind: 'issue',
      state: 'open',
      filePath: 'issues/00001-issue-1.md',
    })
    const patchPath = join(dir, 'pulls', '00001-pr-1.patch')
    const paths = createIssuePaths({
      targetPath: join(dir, 'issues', '00001-issue-1.md'),
      patchPath,
      hasTargetFile: true,
    })

    expect(await shouldSkipIssueSync(tracked, tracked.lastUpdatedAt, paths, {
      shouldWritePatch: false,
      shouldDeletePatch: false,
    })).toBe(true)

    expect(await shouldSkipIssueSync(tracked, tracked.lastUpdatedAt, paths, {
      shouldWritePatch: true,
      shouldDeletePatch: false,
    })).toBe(false)

    await mkdir(join(dir, 'pulls'), { recursive: true })
    await writeFile(patchPath, 'diff --git', 'utf8')
    expect(await shouldSkipIssueSync(tracked, tracked.lastUpdatedAt, paths, {
      shouldWritePatch: true,
      shouldDeletePatch: false,
    })).toBe(true)
  })

  it('moves and removes stale markdown files based on target state', async () => {
    const dir = await createTempDir()
    const openPath = getItemMarkdownPath(dir, 'issue', 9, 'open', 'Old Title')
    const closedPath = getItemMarkdownPath(dir, 'issue', 9, 'closed', 'Old Title')
    const stalePath = join(dir, 'issues', '00009-extra.md')
    await mkdir(join(dir, 'issues', 'closed'), { recursive: true })
    await writeFile(openPath, '# open', 'utf8')
    await writeFile(stalePath, '# stale', 'utf8')

    const paths: IssuePaths = {
      openPath,
      closedPath,
      targetPath: closedPath,
      patchPath: join(dir, 'pulls', '00009-pr-9.patch'),
      hasOpenFile: true,
      hasClosedFile: false,
      hasTrackedFile: false,
      matchedPaths: [stalePath],
      hasLocalFile: true,
      hasTargetFile: false,
    }

    expect(await moveMarkdownByState(paths, 'closed')).toBe(1)
    await expectPathMissing(openPath)
    await expectPathExists(closedPath)

    await removeStaleMarkdownFiles({
      ...paths,
      targetPath: closedPath,
      hasOpenFile: false,
      hasClosedFile: true,
    })
    await expectPathMissing(stalePath)
  })

  it('resolves source path priority and existing markdown list', () => {
    const paths = createIssuePaths({
      openPath: '/tmp/open.md',
      closedPath: '/tmp/closed.md',
      targetPath: '/tmp/target.md',
      trackedPath: '/tmp/tracked.md',
      hasOpenFile: true,
      hasClosedFile: true,
      hasTrackedFile: true,
      matchedPaths: ['/tmp/extra.md'],
    })

    expect(resolveMoveSourcePath(paths, 'open')).toBe('/tmp/tracked.md')
    expect(getExistingMarkdownPaths(paths)).toEqual([
      '/tmp/open.md',
      '/tmp/closed.md',
      '/tmp/tracked.md',
      '/tmp/extra.md',
    ])

    const fallbackPaths = createIssuePaths({
      openPath: '/tmp/open.md',
      closedPath: '/tmp/closed.md',
      targetPath: '/tmp/target.md',
      hasOpenFile: false,
      hasClosedFile: false,
      hasTrackedFile: false,
      matchedPaths: ['/tmp/target.md', '/tmp/fallback.md'],
    })
    expect(resolveMoveSourcePath(fallbackPaths, 'closed')).toBe('/tmp/fallback.md')
  })

  it('prunes tracked closed and missing open entries', async () => {
    const dir = await createTempDir()
    const syncState: SyncState = {
      version: 2,
      executions: [],
      items: {
        10: createTrackedItem({
          number: 10,
          kind: 'issue',
          state: 'closed',
          filePath: 'issues/closed/00010-issue-10.md',
        }),
        11: createTrackedItem({
          number: 11,
          kind: 'pull',
          state: 'closed',
          filePath: 'pulls/closed/00011-pr-11.md',
        }),
        20: createTrackedItem({
          number: 20,
          kind: 'issue',
          state: 'open',
          filePath: 'issues/00020-issue-20.md',
        }),
        21: createTrackedItem({
          number: 21,
          kind: 'pull',
          state: 'open',
          filePath: 'pulls/00021-pr-21.md',
        }),
      },
    }

    await mkdir(join(dir, 'issues', 'closed'), { recursive: true })
    await mkdir(join(dir, 'pulls', 'closed'), { recursive: true })
    await writeFile(join(dir, 'issues', 'closed/00010-issue-10.md'), '# issue closed', 'utf8')
    await writeFile(join(dir, 'pulls', 'closed/00011-pr-11.md'), '# pull closed', 'utf8')
    await writeFile(join(dir, 'pulls', '00011-pr-11.patch'), 'diff --git', 'utf8')
    await writeFile(join(dir, 'issues', '00020-issue-20.md'), '# issue open', 'utf8')
    await writeFile(join(dir, 'pulls', '00021-pr-21.md'), '# pull open', 'utf8')
    await writeFile(join(dir, 'pulls', '00021-pr-21.patch'), 'diff --git', 'utf8')

    const sync = {
      issues: true,
      pulls: true,
      closed: false,
      patches: 'open' as const,
    }

    const closedPatches = await pruneTrackedClosedItems(dir, syncState, sync)
    expect(closedPatches).toBe(1)
    expect(syncState.items['10']).toBeUndefined()
    expect(syncState.items['11']).toBeUndefined()

    const missingOpenPatches = await pruneMissingOpenTrackedItems(dir, syncState, new Set([20]), sync)
    expect(missingOpenPatches).toBe(1)
    expect(syncState.items['20']).toBeDefined()
    expect(syncState.items['21']).toBeUndefined()
  })

  it('updates tracked items with storage-relative paths', () => {
    const storageDir = join(process.cwd(), '.tmp-ghfs-storage')
    const context = createSyncContext(storageDir)
    const markdownPath = join(storageDir, 'issues', '00001-issue-1.md')
    const patchPath = join(storageDir, 'pulls', '00001-pr-1.patch')

    updateTrackedItem(
      context,
      1,
      'pull',
      'open',
      '2026-01-02T00:00:00.000Z',
      markdownPath,
      patchPath,
      {
        item: createTrackedItem({
          number: 1,
          kind: 'pull',
          state: 'open',
          filePath: 'pulls/00001-pr-1.md',
        }).data.item,
        comments: [],
        pull: {
          isDraft: false,
          merged: false,
          mergedAt: null,
          baseRef: 'main',
          headRef: 'feature',
          requestedReviewers: [],
        },
      },
    )

    expect(context.syncState.items['1']).toEqual(expect.objectContaining({
      filePath: 'issues/00001-issue-1.md',
      patchPath: 'pulls/00001-pr-1.patch',
      lastUpdatedAt: '2026-01-02T00:00:00.000Z',
      lastSyncedAt: context.syncedAt,
    }))
  })
})

function createSyncContext(storageDirAbsolute: string, syncOverrides: Partial<SyncContext['config']['sync']> = {}): SyncContext {
  return {
    provider: {} as RepositoryProvider,
    repoSlug: 'owner/repo',
    storageDirAbsolute,
    config: {
      cwd: process.cwd(),
      repo: 'owner/repo',
      directory: '.ghfs',
      auth: {
        token: '',
      },
      sync: {
        issues: syncOverrides.issues ?? true,
        pulls: syncOverrides.pulls ?? true,
        closed: syncOverrides.closed ?? false,
        patches: syncOverrides.patches ?? 'open',
      },
    },
    syncState: {
      version: 2,
      executions: [],
      items: {},
    },
    syncedAt: '2026-01-01T00:00:00.000Z',
    totalIssues: 0,
    totalPulls: 0,
  }
}

function createTrackedItem(input: {
  number: number
  kind: 'issue' | 'pull'
  state: 'open' | 'closed'
  filePath: string
}) {
  return {
    number: input.number,
    kind: input.kind,
    state: input.state,
    lastUpdatedAt: '2026-01-01T00:00:00.000Z',
    lastSyncedAt: '2026-01-01T00:00:00.000Z',
    filePath: input.filePath,
    data: {
      item: {
        number: input.number,
        kind: input.kind,
        state: input.state,
        updatedAt: '2026-01-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
        closedAt: input.state === 'closed' ? '2026-01-01T00:00:00.000Z' : null,
        title: `${input.kind} ${input.number}`,
        body: null,
        author: 'user',
        labels: [],
        assignees: [],
        milestone: null,
      },
      comments: [],
      ...(input.kind === 'pull'
        ? {
            pull: {
              isDraft: false,
              merged: false,
              mergedAt: null,
              baseRef: 'main',
              headRef: 'feature',
              requestedReviewers: [],
            },
          }
        : {}),
    },
  } as SyncState['items'][string]
}

function createIssuePaths(overrides: Partial<IssuePaths>): IssuePaths {
  return {
    openPath: overrides.openPath ?? '/tmp/open.md',
    closedPath: overrides.closedPath ?? '/tmp/closed.md',
    targetPath: overrides.targetPath ?? '/tmp/target.md',
    patchPath: overrides.patchPath ?? '/tmp/target.patch',
    trackedPath: overrides.trackedPath,
    hasOpenFile: overrides.hasOpenFile ?? false,
    hasClosedFile: overrides.hasClosedFile ?? false,
    hasTrackedFile: overrides.hasTrackedFile ?? false,
    matchedPaths: overrides.matchedPaths ?? [],
    hasLocalFile: overrides.hasLocalFile ?? false,
    hasTargetFile: overrides.hasTargetFile ?? false,
  }
}

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ghfs-sync-storage-test-'))
  tempDirs.push(dir)
  return dir
}

async function expectPathMissing(path: string): Promise<void> {
  await expect(access(path)).rejects.toThrow()
}

async function expectPathExists(path: string): Promise<void> {
  await expect(access(path)).resolves.toBeUndefined()
}

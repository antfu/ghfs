import type { SyncSummary } from '../../sync'
import type { ExecutionResult, GhfsResolvedConfig, SyncState } from '../../types'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readAndValidateExecuteFile } from '../../execute/validate'
import { saveSyncState } from '../../sync/state'
import { createServerFunctions } from './rpc'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('createServerFunctions', () => {
  it('queues item edits by replacing same-family execute.yml operations and preserving append actions', async () => {
    const dir = await createFixtureDir()
    const executeFilePath = join(dir, 'execute.yml')

    await writeFile(executeFilePath, [
      '- action: add-comment',
      '  number: 1',
      '  body: keep this',
      '- action: set-title',
      '  number: 1',
      '  title: Old queued title',
      '- action: add-labels',
      '  number: 1',
      '  labels: [queued]',
      '- action: set-title',
      '  number: 2',
      '  title: Keep other item',
      '',
    ].join('\n'), 'utf8')

    await writeFile(join(dir, 'execute.md'), '', 'utf8')
    await saveSyncState(dir, createSyncState())

    const server = createServerFunctions({
      config: createConfig('/workspace'),
      executeFilePath,
      storageDirAbsolute: dir,
    })

    await server.queueItemEdits({
      number: 1,
      title: 'New queued title',
      body: 'Body before queue',
      state: 'open',
      labels: ['bug', 'enhancement'],
      assignees: [],
      milestone: null,
      reviewers: [],
      comment: 'new queued comment',
    })

    const rewritten = await readAndValidateExecuteFile(executeFilePath)
    expect(rewritten).toEqual([
      {
        action: 'add-comment',
        number: 1,
        body: 'keep this',
      },
      {
        action: 'set-title',
        number: 2,
        title: 'Keep other item',
      },
      {
        action: 'set-title',
        number: 1,
        title: 'New queued title',
        ifUnchangedSince: '2026-01-01T00:00:00.000Z',
      },
      {
        action: 'add-labels',
        number: 1,
        labels: ['enhancement'],
        ifUnchangedSince: '2026-01-01T00:00:00.000Z',
      },
      {
        action: 'add-comment',
        number: 1,
        body: 'new queued comment',
      },
    ])
  })

  it('overlays queued execute.yml intents in item detail response', async () => {
    const dir = await createFixtureDir()
    const executeFilePath = join(dir, 'execute.yml')

    await writeFile(executeFilePath, [
      '- action: set-title',
      '  number: 1',
      '  title: Queued title',
      '- action: close',
      '  number: 1',
      '- action: add-labels',
      '  number: 1',
      '  labels: [enhancement]',
      '',
    ].join('\n'), 'utf8')

    await writeFile(join(dir, 'execute.md'), '', 'utf8')
    await saveSyncState(dir, createSyncState())
    await writeFile(join(dir, 'repo.json'), JSON.stringify({
      labels: [
        { name: 'bug', color: 'ff0000', description: null, default: false },
        { name: 'enhancement', color: '00ff00', description: null, default: false },
      ],
      milestones: [
        { number: 1, title: 'v1', state: 'open' },
      ],
    }, null, 2), 'utf8')

    const server = createServerFunctions({
      config: createConfig('/workspace'),
      executeFilePath,
      storageDirAbsolute: dir,
    })

    const detail = await server.getItemDetail(1)
    expect(detail.title).toBe('Queued title')
    expect(detail.state).toBe('closed')
    expect(detail.labels).toEqual(['bug', 'enhancement'])
    expect(detail.labelsCatalog).toHaveLength(2)
    expect(detail.queue).toHaveLength(3)
  })

  it('executes immediately and emits progress/completion callbacks', async () => {
    const dir = await createFixtureDir()
    const executeFilePath = join(dir, 'execute.yml')

    await writeFile(executeFilePath, [
      '- action: close',
      '  number: 1',
      '',
    ].join('\n'), 'utf8')
    await writeFile(join(dir, 'execute.md'), '', 'utf8')
    await saveSyncState(dir, createSyncState())

    const onStateChanged = vi.fn(async () => {})
    const onExecuteProgress = vi.fn(async () => {})
    const onExecuteComplete = vi.fn(async () => {})
    const syncRepository = vi.fn(async () => createSyncSummary())

    const executionResult = createExecutionResult()
    const executePendingChanges = vi.fn(async ({ reporter }) => {
      reporter?.onStart?.({
        repo: 'owner/repo',
        mode: 'apply',
        planned: 1,
      })
      reporter?.onProgress?.({
        repo: 'owner/repo',
        mode: 'apply',
        planned: 1,
        completed: 1,
        applied: 1,
        failed: 0,
        detail: executionResult.details[0],
      })
      return executionResult
    })

    const server = createServerFunctions({
      config: createConfig('/workspace'),
      executeFilePath,
      storageDirAbsolute: dir,
      onStateChanged,
      onExecuteProgress,
      onExecuteComplete,
      resolveRepo: vi.fn(async () => ({
        repo: 'owner/repo',
        source: 'config' as const,
        candidates: [],
      })),
      resolveAuthToken: vi.fn(async () => 'token'),
      executePendingChanges,
      appendExecutionResult: vi.fn(async () => {}),
      syncRepository,
    })

    const result = await server.executeNow()
    expect(result.result).toEqual(executionResult)
    expect(onExecuteProgress).toHaveBeenCalledWith(expect.objectContaining({
      type: 'start',
      planned: 1,
      repo: 'owner/repo',
    }))
    expect(onExecuteProgress).toHaveBeenCalledWith(expect.objectContaining({
      type: 'progress',
      completed: 1,
      applied: 1,
      failed: 0,
    }))
    expect(onExecuteComplete).toHaveBeenCalledWith(executionResult)
    expect(onStateChanged).toHaveBeenCalled()
    expect(syncRepository).toHaveBeenCalledWith(expect.objectContaining({
      repo: 'owner/repo',
      token: 'token',
      numbers: [1],
    }))
  })
})

function createConfig(cwd: string): GhfsResolvedConfig {
  return {
    cwd,
    repo: 'owner/repo',
    directory: '.ghfs',
    auth: {
      token: '',
    },
    sync: {
      issues: true,
      pulls: true,
      closed: false,
      patches: 'open',
    },
  }
}

function createSyncState(): SyncState {
  return {
    version: 2,
    repo: 'owner/repo',
    lastSyncedAt: '2026-01-01T00:00:00.000Z',
    items: {
      1: {
        number: 1,
        kind: 'issue',
        state: 'open',
        lastUpdatedAt: '2026-01-01T00:00:00.000Z',
        lastSyncedAt: '2026-01-01T00:00:00.000Z',
        filePath: 'issues/00001-issue.md',
        data: {
          item: {
            number: 1,
            kind: 'issue',
            state: 'open',
            updatedAt: '2026-01-01T00:00:00.000Z',
            createdAt: '2026-01-01T00:00:00.000Z',
            closedAt: null,
            title: 'Base title',
            body: 'Body before queue',
            author: 'antfu',
            labels: ['bug'],
            assignees: [],
            milestone: null,
            url: 'https://github.com/owner/repo/issues/1',
          },
          comments: [],
        },
      },
    },
    executions: [],
  }
}

function createExecutionResult(): ExecutionResult {
  return {
    runId: 'run_1',
    createdAt: '2026-01-01T00:00:00.000Z',
    mode: 'apply',
    repo: 'owner/repo',
    planned: 1,
    applied: 1,
    failed: 0,
    details: [
      {
        op: 1,
        action: 'close',
        number: 1,
        status: 'applied',
        message: 'close #1',
      },
    ],
  }
}

function createSyncSummary(): SyncSummary {
  return {
    repo: 'owner/repo',
    syncedAt: '2026-01-01T00:00:00.000Z',
    totalIssues: 1,
    totalPulls: 0,
    updatedIssues: 1,
    updatedPulls: 0,
    trackedItems: 1,
    requestCount: 2,
    selected: 1,
    processed: 1,
    skipped: 0,
    scanned: 1,
    written: 1,
    moved: 0,
    patchesWritten: 0,
    patchesDeleted: 0,
    durationMs: 100,
  }
}

async function createFixtureDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ghfs-ui-rpc-test-'))
  tempDirs.push(dir)
  return dir
}

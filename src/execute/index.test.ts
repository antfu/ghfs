import type { GhfsResolvedConfig } from '../types'
import type { RepositoryProvider } from '../types/provider'
import type { PendingOp } from './types'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import process from 'node:process'
import { join } from 'pathe'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExecuteCancelledError, executePendingChanges } from './index'
import { readAndValidateExecuteFile, writeExecuteFile } from './validate'

describe('executePendingChanges', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns report mode with planned operations when apply is false', async () => {
    const executeFilePath = await createTempExecuteFile([
      '- action: close',
      '  number: 1',
      '- action: close',
      '  number: 2',
      '',
    ].join('\n'))

    const result = await executePendingChanges({
      config: createConfig(),
      repo: 'owner/repo',
      token: 'test-token',
      executeFilePath,
      apply: false,
      nonInteractive: true,
      continueOnError: false,
    })

    expect(result.mode).toBe('report')
    expect(result.planned).toBe(2)
    expect(result.applied).toBe(0)
    expect(result.failed).toBe(0)
    expect(result.details.every(detail => detail.status === 'planned')).toBe(true)

    await cleanupTempFile(executeFilePath)
  })

  it('returns early with empty report when there are no operations', async () => {
    const executeFilePath = await createTempExecuteFile('[]\n')
    const reporter = {
      onStart: vi.fn(),
      onProgress: vi.fn(),
      onComplete: vi.fn(),
      onError: vi.fn(),
    }

    const result = await executePendingChanges({
      config: createConfig(),
      repo: 'owner/repo',
      token: 'test-token',
      executeFilePath,
      apply: true,
      nonInteractive: true,
      continueOnError: false,
      reporter,
    })

    expect(result.mode).toBe('report')
    expect(result.planned).toBe(0)
    expect(result.applied).toBe(0)
    expect(result.failed).toBe(0)
    expect(reporter.onStart).not.toHaveBeenCalled()
    expect(reporter.onComplete).not.toHaveBeenCalled()
    expect(reporter.onError).not.toHaveBeenCalled()

    await cleanupTempFile(executeFilePath)
  })

  it('throws when interactive mode is active without prompts', async () => {
    const executeFilePath = await createTempExecuteFile('- action: close\n  number: 1\n')

    await withTTY(true, async () => {
      await expect(executePendingChanges({
        config: createConfig(),
        repo: 'owner/repo',
        token: 'test-token',
        executeFilePath,
        apply: true,
        nonInteractive: false,
        continueOnError: false,
      })).rejects.toThrow('Interactive execute prompts are unavailable')
    })

    await cleanupTempFile(executeFilePath)
  })

  it('throws ExecuteCancelledError when apply confirmation is declined', async () => {
    const executeFilePath = await createTempExecuteFile('- action: close\n  number: 1\n')

    const prompts = {
      selectOperations: vi.fn(async () => [0]),
      confirmApply: vi.fn(async () => false),
    }

    await withTTY(true, async () => {
      await expect(executePendingChanges({
        config: createConfig(),
        repo: 'owner/repo',
        token: 'test-token',
        executeFilePath,
        apply: true,
        prompts,
        nonInteractive: false,
        continueOnError: false,
      })).rejects.toBeInstanceOf(ExecuteCancelledError)
    })

    expect(prompts.selectOperations).toHaveBeenCalledTimes(1)
    expect(prompts.confirmApply).toHaveBeenCalledWith(1)
    await cleanupTempFile(executeFilePath)
  })

  it('applies only selected indexes when provided', async () => {
    const executeFilePath = await createTempExecuteFile([
      '- action: close',
      '  number: 1',
      '- action: close',
      '  number: 2',
      '- action: close',
      '  number: 3',
      '',
    ].join('\n'))

    const actionClose = vi.fn(async () => {})
    const provider = createMockProvider({ actionClose })

    const result = await executePendingChanges({
      config: createConfig(),
      repo: 'owner/repo',
      token: 'test-token',
      provider,
      executeFilePath,
      apply: true,
      selectedIndexes: [1, 99, 1],
      nonInteractive: true,
      continueOnError: false,
    })

    expect(result.mode).toBe('apply')
    expect(result.planned).toBe(1)
    expect(result.applied).toBe(1)
    expect(result.failed).toBe(0)
    expect(actionClose).toHaveBeenCalledTimes(1)
    expect(actionClose).toHaveBeenCalledWith(2)
    await expect(readAndValidateExecuteFile(executeFilePath)).resolves.toEqual([
      { action: 'close', number: 1 },
      { action: 'close', number: 3 },
    ])

    await cleanupTempFile(executeFilePath)
  })

  it('returns an empty apply result when selected indexes are all invalid', async () => {
    const executeFilePath = await createTempExecuteFile('- action: close\n  number: 1\n')
    const provider = createMockProvider()
    const reporter = {
      onStart: vi.fn(),
      onProgress: vi.fn(),
      onComplete: vi.fn(),
      onError: vi.fn(),
    }

    const result = await executePendingChanges({
      config: createConfig(),
      repo: 'owner/repo',
      token: 'test-token',
      provider,
      executeFilePath,
      apply: true,
      selectedIndexes: [99],
      nonInteractive: true,
      continueOnError: false,
      reporter,
    })

    expect(result.mode).toBe('apply')
    expect(result.planned).toBe(0)
    expect(result.applied).toBe(0)
    expect(result.failed).toBe(0)
    expect(provider.fetchItemSnapshot).not.toHaveBeenCalled()
    expect(reporter.onStart).toHaveBeenCalledWith({
      repo: 'owner/repo',
      mode: 'apply',
      planned: 0,
    })
    expect(reporter.onComplete).toHaveBeenCalledTimes(1)

    await cleanupTempFile(executeFilePath)
  })

  it('continues after failure when continueOnError is true', async () => {
    const executeFilePath = await createTempExecuteFile([
      '- action: close',
      '  number: 1',
      '- action: close',
      '  number: 2',
      '- action: close',
      '  number: 3',
      '',
    ].join('\n'))

    const actionClose = vi.fn(async (number: number) => {
      if (number === 2)
        throw new Error('simulated failure')
    })
    const provider = createMockProvider({
      actionClose,
    })

    const result = await executePendingChanges({
      config: createConfig(),
      repo: 'owner/repo',
      token: 'test-token',
      provider,
      executeFilePath,
      apply: true,
      nonInteractive: true,
      continueOnError: true,
    })

    expect(result.applied).toBe(2)
    expect(result.failed).toBe(1)
    expect(actionClose).toHaveBeenCalledTimes(3)
    await expect(readAndValidateExecuteFile(executeFilePath)).resolves.toEqual([
      { action: 'close', number: 2 },
    ])

    await cleanupTempFile(executeFilePath)
  })

  it('removes successfully applied operations from execute.yml and keeps remaining ones', async () => {
    const executeFilePath = await createTempExecuteFile([
      '- action: close',
      '  number: 1',
      '- action: close',
      '  number: 2',
      '- action: close',
      '  number: 3',
      '',
    ].join('\n'))

    const actionClose = vi.fn(async (number: number) => {
      if (number === 2)
        throw new Error('simulated failure')
    })

    const provider = createMockProvider({
      actionClose,
    })

    const result = await executePendingChanges({
      config: createConfig(),
      repo: 'owner/repo',
      token: 'test-token',
      provider,
      executeFilePath,
      apply: true,
      nonInteractive: true,
      continueOnError: false,
    })

    expect(result.applied).toBe(1)
    expect(result.failed).toBe(1)
    expect(actionClose).toHaveBeenCalledTimes(2)
    await expect(readAndValidateExecuteFile(executeFilePath)).resolves.toEqual([
      { action: 'close', number: 2 },
      { action: 'close', number: 3 },
    ])

    await cleanupTempFile(executeFilePath)
  })

  it('loads execute-md operations and reports parsing warnings', async () => {
    const executeFilePath = await createTempExecuteFile('[]\n')
    const executeMdPath = executeFilePath.replace(/execute\.yml$/, 'execute.md')
    await writeFile(executeMdPath, ['close #10 #11', 'unknown #1', ''].join('\n'), 'utf8')

    const actionClose = vi.fn(async () => {})
    const provider = createMockProvider({ actionClose })
    const warnings: string[] = []

    const result = await executePendingChanges({
      config: createConfig(),
      repo: 'owner/repo',
      token: 'test-token',
      provider,
      executeFilePath,
      apply: true,
      nonInteractive: true,
      continueOnError: true,
      onWarning: warning => warnings.push(warning),
    })

    expect(result.applied).toBe(2)
    expect(warnings).toHaveLength(1)
    await expect(readFile(executeMdPath, 'utf8')).resolves.toContain('unknown #1')

    await cleanupTempFile(executeFilePath)
  })

  it('applies close-with-comment by creating comment then closing', async () => {
    const executeFilePath = await createTempExecuteFile([
      '- action: close-with-comment',
      '  number: 1',
      '  body: done',
      '',
    ].join('\n'))

    const calls: string[] = []
    const actionAddComment = vi.fn(async () => {
      calls.push('comment')
    })
    const actionClose = vi.fn(async () => {
      calls.push('close')
    })
    const provider = createMockProvider({
      actionAddComment,
      actionClose,
    })

    const result = await executePendingChanges({
      config: createConfig(),
      repo: 'owner/repo',
      token: 'test-token',
      provider,
      executeFilePath,
      apply: true,
      nonInteractive: true,
      continueOnError: false,
    })

    expect(result.applied).toBe(1)
    expect(actionAddComment).toHaveBeenCalledWith(1, 'done')
    expect(actionClose).toHaveBeenCalledWith(1)
    expect(calls).toEqual(['comment', 'close'])

    await cleanupTempFile(executeFilePath)
  })

  it('reports conflict when ifUnchangedSince is older than remote updatedAt', async () => {
    const executeFilePath = await createTempExecuteFile([
      '- action: close',
      '  number: 1',
      '  ifUnchangedSince: 2026-01-01T00:00:00.000Z',
      '',
    ].join('\n'))
    const actionClose = vi.fn(async () => {})
    const provider = createMockProvider({
      fetchItemSnapshot: vi.fn(async (number: number) => ({
        number,
        kind: 'issue' as const,
        updatedAt: '2026-01-02T00:00:00.000Z',
      })),
      actionClose,
    })

    const result = await executePendingChanges({
      config: createConfig(),
      repo: 'owner/repo',
      token: 'test-token',
      provider,
      executeFilePath,
      apply: true,
      nonInteractive: true,
      continueOnError: false,
    })

    expect(result.applied).toBe(0)
    expect(result.failed).toBe(1)
    expect(result.details[0]?.status).toBe('failed')
    expect(result.details[0]?.message).toContain('Operation conflict')
    expect(actionClose).not.toHaveBeenCalled()

    await cleanupTempFile(executeFilePath)
  })

  it('fails pull-only actions when the target is not a pull request', async () => {
    const executeFilePath = await createTempExecuteFile([
      '- action: request-reviewers',
      '  number: 1',
      '  reviewers: [alice]',
      '',
    ].join('\n'))
    const actionRequestReviewers = vi.fn(async () => {})
    const provider = createMockProvider({
      fetchItemSnapshot: vi.fn(async number => ({
        number,
        kind: 'issue' as const,
        updatedAt: '2026-01-01T00:00:00.000Z',
      })),
      actionRequestReviewers,
    })

    const result = await executePendingChanges({
      config: createConfig(),
      repo: 'owner/repo',
      token: 'test-token',
      provider,
      executeFilePath,
      apply: true,
      nonInteractive: true,
      continueOnError: false,
    })

    expect(result.applied).toBe(0)
    expect(result.failed).toBe(1)
    expect(result.details[0]?.message).toContain('requires #1 to be a pull request')
    expect(actionRequestReviewers).not.toHaveBeenCalled()

    await cleanupTempFile(executeFilePath)
  })

  it('dispatches all supported action handlers to provider methods', async () => {
    const dispatchCases: Array<{
      name: string
      op: PendingOp
      method: keyof RepositoryProvider
      args: unknown[]
      kind?: 'issue' | 'pull'
    }> = [
      { name: 'reopen', op: { action: 'reopen', number: 1 }, method: 'actionReopen', args: [1] },
      { name: 'set-title', op: { action: 'set-title', number: 1, title: 'new title' }, method: 'actionSetTitle', args: [1, 'new title'] },
      { name: 'set-body', op: { action: 'set-body', number: 1, body: 'new body' }, method: 'actionSetBody', args: [1, 'new body'] },
      { name: 'add-comment', op: { action: 'add-comment', number: 1, body: 'comment' }, method: 'actionAddComment', args: [1, 'comment'] },
      { name: 'add-labels', op: { action: 'add-labels', number: 1, labels: ['bug'] }, method: 'actionAddLabels', args: [1, ['bug']] },
      { name: 'remove-labels', op: { action: 'remove-labels', number: 1, labels: ['bug'] }, method: 'actionRemoveLabels', args: [1, ['bug']] },
      { name: 'set-labels', op: { action: 'set-labels', number: 1, labels: ['bug'] }, method: 'actionSetLabels', args: [1, ['bug']] },
      { name: 'add-assignees', op: { action: 'add-assignees', number: 1, assignees: ['antfu'] }, method: 'actionAddAssignees', args: [1, ['antfu']] },
      { name: 'remove-assignees', op: { action: 'remove-assignees', number: 1, assignees: ['antfu'] }, method: 'actionRemoveAssignees', args: [1, ['antfu']] },
      { name: 'set-assignees', op: { action: 'set-assignees', number: 1, assignees: ['antfu'] }, method: 'actionSetAssignees', args: [1, ['antfu']] },
      { name: 'set-milestone', op: { action: 'set-milestone', number: 1, milestone: 'v1' }, method: 'actionSetMilestone', args: [1, 'v1'] },
      { name: 'clear-milestone', op: { action: 'clear-milestone', number: 1 }, method: 'actionClearMilestone', args: [1] },
      { name: 'lock', op: { action: 'lock', number: 1, reason: 'too-heated' }, method: 'actionLock', args: [1, 'too-heated'] },
      { name: 'unlock', op: { action: 'unlock', number: 1 }, method: 'actionUnlock', args: [1] },
      { name: 'request-reviewers', op: { action: 'request-reviewers', number: 1, reviewers: ['alice'] }, method: 'actionRequestReviewers', args: [1, ['alice']], kind: 'pull' },
      { name: 'remove-reviewers', op: { action: 'remove-reviewers', number: 1, reviewers: ['alice'] }, method: 'actionRemoveReviewers', args: [1, ['alice']], kind: 'pull' },
      { name: 'mark-ready-for-review', op: { action: 'mark-ready-for-review', number: 1 }, method: 'actionMarkReadyForReview', args: [1], kind: 'pull' },
      { name: 'convert-to-draft', op: { action: 'convert-to-draft', number: 1 }, method: 'actionConvertToDraft', args: [1], kind: 'pull' },
    ]

    for (const testCase of dispatchCases) {
      const executeFilePath = await createTempExecuteFile('[]\n')
      await writeExecuteFile(executeFilePath, [testCase.op])

      const provider = createMockProvider({
        fetchItemSnapshot: vi.fn(async number => ({
          number,
          kind: testCase.kind ?? 'issue',
          updatedAt: '2026-01-01T00:00:00.000Z',
        })),
      })

      const result = await executePendingChanges({
        config: createConfig(),
        repo: 'owner/repo',
        token: 'test-token',
        provider,
        executeFilePath,
        apply: true,
        nonInteractive: true,
        continueOnError: false,
      })

      expect(result.applied, testCase.name).toBe(1)
      expect(result.failed, testCase.name).toBe(0)
      expect((provider[testCase.method] as unknown as ReturnType<typeof vi.fn>), testCase.name).toHaveBeenCalledWith(...testCase.args)

      await cleanupTempFile(executeFilePath)
    }
  })

  it('emits reporter lifecycle callbacks for apply mode', async () => {
    const executeFilePath = await createTempExecuteFile([
      '- action: close',
      '  number: 1',
      '- action: close',
      '  number: 2',
      '',
    ].join('\n'))

    const actionClose = vi.fn(async (number: number) => {
      if (number === 2)
        throw new Error('simulated failure')
    })
    const provider = createMockProvider({
      actionClose,
    })

    const reporter = {
      onStart: vi.fn(),
      onProgress: vi.fn(),
      onComplete: vi.fn(),
      onError: vi.fn(),
    }

    const result = await executePendingChanges({
      config: createConfig(),
      repo: 'owner/repo',
      token: 'test-token',
      provider,
      executeFilePath,
      apply: true,
      nonInteractive: true,
      continueOnError: false,
      reporter,
    })

    expect(result.applied).toBe(1)
    expect(result.failed).toBe(1)
    expect(reporter.onStart).toHaveBeenCalledWith({
      repo: 'owner/repo',
      mode: 'apply',
      planned: 2,
    })
    expect(reporter.onProgress).toHaveBeenCalledTimes(2)
    expect(reporter.onComplete).toHaveBeenCalledTimes(1)
    expect(reporter.onError).not.toHaveBeenCalled()

    await cleanupTempFile(executeFilePath)
  })

  it('emits reporter error callback when execute source loading fails', async () => {
    const executeFilePath = await createTempExecuteFile('- action: unknown\n  number: 1\n')
    const reporter = {
      onStart: vi.fn(),
      onProgress: vi.fn(),
      onComplete: vi.fn(),
      onError: vi.fn(),
    }

    await expect(executePendingChanges({
      config: createConfig(),
      repo: 'owner/repo',
      token: 'test-token',
      executeFilePath,
      apply: true,
      nonInteractive: true,
      continueOnError: false,
      reporter,
    })).rejects.toThrow('Invalid execute file')

    expect(reporter.onError).toHaveBeenCalledTimes(1)
    await cleanupTempFile(executeFilePath)
  })
})

function createMockProvider(overrides: Partial<RepositoryProvider> = {}): RepositoryProvider {
  return {
    async* paginateItems() {
      yield []
    },
    fetchItems: vi.fn(async () => []),
    async* eachItem() {
    },
    fetchItemsByNumbers: vi.fn(async () => []),
    fetchComments: vi.fn(async () => []),
    fetchPullMetadata: vi.fn(async () => ({
      isDraft: false,
      merged: false,
      mergedAt: null,
      baseRef: 'main',
      headRef: 'feature',
      requestedReviewers: [],
    })),
    fetchPullPatch: vi.fn(async () => ''),
    fetchPullCommits: vi.fn(async () => []),
    fetchTimeline: vi.fn(async () => []),
    fetchItemSnapshot: vi.fn(async number => ({
      number,
      kind: 'issue' as const,
      updatedAt: '2026-01-01T00:00:00.000Z',
    })),
    fetchRepository: vi.fn(async () => ({
      name: 'repo',
      full_name: 'owner/repo',
      description: null,
      private: false,
      archived: false,
      default_branch: 'main',
      html_url: 'https://github.com/owner/repo',
      fork: false,
      open_issues_count: 0,
      has_issues: true,
      has_projects: true,
      has_wiki: false,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      pushed_at: '2026-01-01T00:00:00.000Z',
      owner: {
        login: 'owner',
      },
    })),
    fetchRepositoryLabels: vi.fn(async () => []),
    fetchRepositoryMilestones: vi.fn(async () => []),
    countUpdatedSince: vi.fn(async () => ({ issues: 0, pulls: 0 })),
    getRequestCount: vi.fn(() => 0),
    actionClose: vi.fn(async () => {}),
    actionReopen: vi.fn(async () => {}),
    actionSetTitle: vi.fn(async () => {}),
    actionSetBody: vi.fn(async () => {}),
    actionAddComment: vi.fn(async () => {}),
    actionAddLabels: vi.fn(async () => {}),
    actionRemoveLabels: vi.fn(async () => {}),
    actionSetLabels: vi.fn(async () => {}),
    actionAddAssignees: vi.fn(async () => {}),
    actionRemoveAssignees: vi.fn(async () => {}),
    actionSetAssignees: vi.fn(async () => {}),
    actionSetMilestone: vi.fn(async () => {}),
    actionClearMilestone: vi.fn(async () => {}),
    actionLock: vi.fn(async () => {}),
    actionUnlock: vi.fn(async () => {}),
    actionRequestReviewers: vi.fn(async () => {}),
    actionRemoveReviewers: vi.fn(async () => {}),
    actionMarkReadyForReview: vi.fn(async () => {}),
    actionConvertToDraft: vi.fn(async () => {}),
    ...overrides,
  }
}

function createConfig(): GhfsResolvedConfig {
  return {
    cwd: process.cwd(),
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

async function createTempExecuteFile(content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ghfs-exec-run-test-'))
  const file = join(dir, 'execute.yml')
  await writeFile(file, content, 'utf8')
  return file
}

async function cleanupTempFile(file: string): Promise<void> {
  const dir = file.slice(0, file.lastIndexOf('/'))
  await rm(dir, { recursive: true, force: true })
}

async function withTTY<T>(isTTY: boolean, fn: () => Promise<T>): Promise<T> {
  const previous = process.stdin.isTTY
  Object.defineProperty(process.stdin, 'isTTY', {
    value: isTTY,
    configurable: true,
  })
  try {
    return await fn()
  }
  finally {
    if (previous === undefined)
      delete (process.stdin as { isTTY?: boolean }).isTTY
    else
      Object.defineProperty(process.stdin, 'isTTY', { value: previous, configurable: true })
  }
}

import type { GhfsResolvedConfig } from '../types'
import type { RepositoryProvider } from '../types/provider'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { executePendingChanges } from './index'
import { readAndValidateExecuteFile } from './validate'

describe('executePendingChanges', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('removes successfully applied operations from execute.yml and keeps remaining ones', async () => {
    const executeFilePath = await createTempExecuteFile(
      [
        '- action: close',
        '  number: 1',
        '- action: close',
        '  number: 2',
        '- action: close',
        '  number: 3',
        '',
      ].join('\n'),
    )

    const fetchItemSnapshot = vi.fn(async (number: number) => ({
      number,
      kind: 'issue' as const,
      updatedAt: '2026-01-01T00:00:00.000Z',
    }))
    const actionClose = vi.fn(async (number: number) => {
      if (number === 2)
        throw new Error('simulated failure')
    })

    const provider = createMockProvider({
      fetchItemSnapshot,
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

  it('emits reporter lifecycle callbacks for apply mode', async () => {
    const executeFilePath = await createTempExecuteFile(
      [
        '- action: close',
        '  number: 1',
        '- action: close',
        '  number: 2',
        '',
      ].join('\n'),
    )

    const fetchItemSnapshot = vi.fn(async (number: number) => ({
      number,
      kind: 'issue' as const,
      updatedAt: '2026-01-01T00:00:00.000Z',
    }))
    const actionClose = vi.fn(async (number: number) => {
      if (number === 2)
        throw new Error('simulated failure')
    })
    const provider = createMockProvider({
      fetchItemSnapshot,
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
      closed: 'existing',
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

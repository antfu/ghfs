import type { Octokit } from 'octokit'
import type { GhfsResolvedConfig } from '../types'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGitHubClient } from '../github/client'
import { executePendingChanges } from './index'
import { readAndValidateExecuteFile } from './validate'

vi.mock('../github/client', () => ({
  createGitHubClient: vi.fn(),
}))

const mockedCreateGitHubClient = vi.mocked(createGitHubClient)

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

    const octokit = createMockOctokit()
    mockedCreateGitHubClient.mockReturnValue(octokit)

    const result = await executePendingChanges({
      config: createConfig(),
      repo: 'owner/repo',
      token: 'test-token',
      executeFilePath,
      apply: true,
      nonInteractive: true,
      continueOnError: false,
    })

    expect(result.applied).toBe(1)
    expect(result.failed).toBe(1)
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

    mockedCreateGitHubClient.mockReturnValue(createMockOctokit())
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

function createMockOctokit(): Octokit {
  const get = vi.fn(async ({ issue_number }: { issue_number: number }) => {
    return {
      data: {
        number: issue_number,
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    }
  })

  const update = vi.fn(async ({ issue_number }: { issue_number: number }) => {
    if (issue_number === 2)
      throw new Error('simulated failure')
    return { data: {} }
  })

  return {
    rest: {
      issues: {
        get,
        update,
      },
    },
    paginate: vi.fn(),
    request: vi.fn(),
  } as unknown as Octokit
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

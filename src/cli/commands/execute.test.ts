import type { ExecutePrompts } from '../../execute'
import type { PendingOp } from '../../execute/types'
import type { SyncSummary } from '../../sync'
import type { ExecutionResult, GhfsResolvedConfig } from '../../types'
import type { ExecuteCommandDependencies } from './execute'
import { describe, expect, it, vi } from 'vitest'
import { ExecuteCancelledError } from '../../execute'
import { runExecuteCommand } from './execute'

describe('runExecuteCommand', () => {
  it('executes operations with --run in non-interactive mode', async () => {
    const context = createContext({
      isTTY: vi.fn(() => false),
      executePendingChanges: vi.fn(async options => options.apply ? createApplyResult() : createReportResult()),
    })

    await runExecuteCommand({ run: true, nonInteractive: true }, context.dependencies)

    expect(context.dependencies.resolveRepo).toHaveBeenCalledTimes(1)
    expect(context.dependencies.resolveAuthToken).toHaveBeenCalledTimes(1)
    expect(context.dependencies.appendExecutionResult).toHaveBeenCalledTimes(1)
    expect(context.dependencies.syncRepository).toHaveBeenCalledTimes(1)
    expect(context.printer.success).toHaveBeenCalledWith('Execution summary: planned 1, applied 1, failed 0.')
  })

  it('reports only without --run in non-interactive mode and skips auth and state writes', async () => {
    const context = createContext({
      isTTY: vi.fn(() => false),
      executePendingChanges: vi.fn(async options => options.apply ? createApplyResult() : createReportResult()),
    })

    await runExecuteCommand({ nonInteractive: true }, context.dependencies)

    expect(context.dependencies.resolveRepo).not.toHaveBeenCalled()
    expect(context.dependencies.resolveAuthToken).not.toHaveBeenCalled()
    expect(context.dependencies.appendExecutionResult).not.toHaveBeenCalled()
    expect(context.dependencies.syncRepository).not.toHaveBeenCalled()
    expect(context.dependencies.executePendingChanges).toHaveBeenCalledWith(expect.objectContaining({
      apply: false,
    }))
  })

  it('runs report mode in interactive TTY when --run is not provided', async () => {
    const context = createContext({
      isTTY: vi.fn(() => true),
      executePendingChanges: vi.fn(async (options) => {
        options.onPlan?.([
          {
            action: 'close',
            number: 1,
          },
        ] as PendingOp[])
        return options.apply ? createApplyResult() : createReportResult()
      }),
    })

    await runExecuteCommand({}, context.dependencies)

    expect(context.dependencies.resolveAuthToken).not.toHaveBeenCalled()
    expect(context.dependencies.executePendingChanges).toHaveBeenCalledWith(expect.objectContaining({
      apply: false,
      nonInteractive: false,
      prompts: context.prompts,
    }))
    expect(context.printer.table).toHaveBeenCalledWith(
      'Planned operations',
      [['#1', '#1 close']],
      { dimKey: false },
    )
    expect(context.prompts.confirmApply).toHaveBeenCalledWith(1)
  })

  it('executes selected operations directly when confirmed in interactive mode', async () => {
    const context = createContext({
      isTTY: vi.fn(() => true),
      executePendingChanges: vi.fn(async options => options.apply ? createApplyResult() : createReportResult()),
    })

    vi.mocked(context.prompts.confirmApply).mockResolvedValue(true)

    await runExecuteCommand({}, context.dependencies)

    expect(context.dependencies.executePendingChanges).toHaveBeenCalledTimes(2)
    expect(context.dependencies.executePendingChanges).toHaveBeenNthCalledWith(1, expect.objectContaining({
      apply: false,
      nonInteractive: false,
      prompts: context.prompts,
    }))
    expect(context.dependencies.executePendingChanges).toHaveBeenNthCalledWith(2, expect.objectContaining({
      apply: true,
      selectedIndexes: [0],
      nonInteractive: true,
      prompts: context.prompts,
    }))
    expect(context.dependencies.resolveRepo).toHaveBeenCalledTimes(1)
    expect(context.dependencies.resolveAuthToken).toHaveBeenCalledTimes(1)
    expect(context.dependencies.appendExecutionResult).toHaveBeenCalledTimes(1)
    expect(context.dependencies.syncRepository).toHaveBeenCalledTimes(1)
    expect(context.printer.header).toHaveBeenCalledTimes(1)
    expect(context.printer.success).toHaveBeenCalledWith('Execution summary: planned 1, applied 1, failed 0.')
  })

  it('cancels cleanly when operation selection is cancelled in interactive mode', async () => {
    const context = createContext({
      isTTY: vi.fn(() => true),
      executePendingChanges: vi.fn(async () => {
        throw new ExecuteCancelledError()
      }),
    })

    await runExecuteCommand({}, context.dependencies)

    expect(context.printer.info).toHaveBeenCalledWith('Execution cancelled.')
  })
})

interface ExecuteCommandTestContext {
  dependencies: ExecuteCommandDependencies
  printer: ReturnType<typeof createPrinter>
  prompts: ExecutePrompts
}

function createContext(
  overrides: Partial<ExecuteCommandDependencies> = {},
): ExecuteCommandTestContext {
  const printer = createPrinter()
  const prompts: ExecutePrompts = {
    selectOperations: vi.fn(async (ops: Parameters<ExecutePrompts['selectOperations']>[0]) => ops.map((_, index) => index)),
    confirmApply: vi.fn(async () => false),
  }

  const dependencies: ExecuteCommandDependencies = {
    createCliPrinter: vi.fn(() => printer),
    resolveConfig: vi.fn(async () => createConfig()),
    isTTY: vi.fn(() => false),
    resolveRepo: vi.fn(async () => ({
      repo: 'owner/repo',
      source: 'config' as const,
      candidates: [],
    })),
    resolveAuthToken: vi.fn(async () => 'token'),
    executePendingChanges: vi.fn(async () => createReportResult()),
    appendExecutionResult: vi.fn(async () => {}),
    syncRepository: vi.fn(async () => createSyncSummary()),
    createExecutePrompts: vi.fn(() => prompts),
    promptForToken: vi.fn(async () => 'token'),
    promptRepoChoice: vi.fn(async () => 'owner/repo'),
    ...overrides,
  }

  return {
    dependencies,
    printer,
    prompts,
  }
}

function createPrinter() {
  return {
    mode: 'plain' as const,
    header: vi.fn(),
    start: vi.fn(),
    step: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    done: vi.fn(),
    note: vi.fn(),
    table: vi.fn(),
    print: vi.fn(),
    createSyncReporter: vi.fn(() => ({})),
    createExecuteReporter: vi.fn(() => ({})),
  }
}

function createConfig(): GhfsResolvedConfig {
  return {
    cwd: '/tmp',
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

function createReportResult(): ExecutionResult {
  return {
    runId: 'run_1',
    createdAt: '2026-01-01T00:00:00.000Z',
    mode: 'report',
    repo: 'owner/repo',
    planned: 1,
    applied: 0,
    failed: 0,
    details: [
      {
        op: 1,
        action: 'close',
        number: 1,
        status: 'planned',
        message: 'close #1',
      },
    ],
  }
}

function createApplyResult(): ExecutionResult {
  return {
    runId: 'run_2',
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
    totalPulls: 1,
    updatedIssues: 1,
    updatedPulls: 0,
    trackedItems: 2,
    requestCount: 3,
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

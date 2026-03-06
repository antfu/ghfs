import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCliPrinter } from './printer'

const clack = vi.hoisted(() => ({
  spinnerStart: vi.fn(),
  spinnerStop: vi.fn(),
  spinnerMessage: vi.fn(),
  spinnerError: vi.fn(),
  progressStart: vi.fn(),
  progressAdvance: vi.fn(),
  progressMessage: vi.fn(),
  progressStop: vi.fn(),
  progressError: vi.fn(),
  logStep: vi.fn(),
}))

vi.mock('@clack/prompts', () => ({
  log: {
    step: clack.logStep,
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  spinner: vi.fn(() => ({
    start: clack.spinnerStart,
    stop: clack.spinnerStop,
    cancel: vi.fn(),
    error: clack.spinnerError,
    message: clack.spinnerMessage,
    clear: vi.fn(),
    isCancelled: false,
  })),
  progress: vi.fn(() => ({
    start: clack.progressStart,
    stop: clack.progressStop,
    cancel: vi.fn(),
    error: clack.progressError,
    message: clack.progressMessage,
    clear: vi.fn(),
    isCancelled: false,
    advance: clack.progressAdvance,
  })),
}))

describe('createCliPrinter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throttles plain sync progress output', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const printer = createCliPrinter('sync', {
      isTTY: false,
      isCI: false,
      progressEvery: 2,
    })
    const reporter = printer.createSyncReporter()

    reporter.onStart?.({
      repo: 'owner/repo',
      startedAt: '2026-01-01T00:00:00.000Z',
      snapshot: {
        scanned: 0,
        selected: 0,
        processed: 0,
        skipped: 0,
        written: 0,
        moved: 0,
        patchesWritten: 0,
        patchesDeleted: 0,
      },
    })
    reporter.onStageStart?.({
      stage: 'fetch',
      message: 'Fetch updated issues/PRs',
      snapshot: {
        scanned: 0,
        selected: 5,
        processed: 0,
        skipped: 0,
        written: 0,
        moved: 0,
        patchesWritten: 0,
        patchesDeleted: 0,
      },
    })
    reporter.onStageUpdate?.({
      stage: 'fetch',
      snapshot: {
        scanned: 0,
        selected: 5,
        processed: 1,
        skipped: 0,
        written: 1,
        moved: 0,
        patchesWritten: 0,
        patchesDeleted: 0,
      },
    })
    reporter.onStageUpdate?.({
      stage: 'fetch',
      snapshot: {
        scanned: 0,
        selected: 5,
        processed: 2,
        skipped: 0,
        written: 2,
        moved: 0,
        patchesWritten: 0,
        patchesDeleted: 0,
      },
    })
    reporter.onStageUpdate?.({
      stage: 'fetch',
      snapshot: {
        scanned: 0,
        selected: 5,
        processed: 5,
        skipped: 0,
        written: 5,
        moved: 0,
        patchesWritten: 0,
        patchesDeleted: 0,
      },
    })

    const printed = logSpy.mock.calls.map(call => String(call[0]))
    const progressLines = printed.filter(line => line.toLowerCase().includes('fetched'))
    expect(progressLines).toHaveLength(2)

    logSpy.mockRestore()
  })

  it('uses clack spinner and progress in rich mode', () => {
    const printer = createCliPrinter('sync', {
      isTTY: true,
      isCI: false,
    })
    const reporter = printer.createSyncReporter()

    reporter.onStageStart?.({
      stage: 'pagination',
      message: 'Pagination',
      snapshot: {
        scanned: 3,
        selected: 0,
        processed: 0,
        skipped: 0,
        written: 0,
        moved: 0,
        patchesWritten: 0,
        patchesDeleted: 0,
      },
    })
    reporter.onStageEnd?.({
      stage: 'pagination',
      message: 'Pagination',
      durationMs: 10,
      snapshot: {
        scanned: 3,
        selected: 0,
        processed: 0,
        skipped: 0,
        written: 0,
        moved: 0,
        patchesWritten: 0,
        patchesDeleted: 0,
      },
    })
    reporter.onStageStart?.({
      stage: 'fetch',
      message: 'Fetch updated issues/PRs',
      snapshot: {
        scanned: 3,
        selected: 3,
        processed: 0,
        skipped: 0,
        written: 0,
        moved: 0,
        patchesWritten: 0,
        patchesDeleted: 0,
      },
    })
    reporter.onStageUpdate?.({
      stage: 'fetch',
      message: '#3 issue open',
      snapshot: {
        scanned: 3,
        selected: 3,
        processed: 1,
        skipped: 0,
        written: 1,
        moved: 0,
        patchesWritten: 0,
        patchesDeleted: 0,
      },
    })
    reporter.onStageEnd?.({
      stage: 'fetch',
      message: 'Fetch updated issues/PRs',
      durationMs: 20,
      snapshot: {
        scanned: 3,
        selected: 3,
        processed: 3,
        skipped: 0,
        written: 3,
        moved: 0,
        patchesWritten: 0,
        patchesDeleted: 0,
      },
    })

    expect(clack.spinnerStart).toHaveBeenCalled()
    expect(clack.spinnerStop).toHaveBeenCalled()
    expect(clack.progressStart).toHaveBeenCalled()
    expect(clack.progressAdvance).toHaveBeenCalled()
    expect(clack.progressStop).toHaveBeenCalled()
    expect(clack.logStep).not.toHaveBeenCalled()
  })

  it('does not print resolve and filter stages', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const printer = createCliPrinter('sync', {
      isTTY: false,
      isCI: false,
    })
    const reporter = printer.createSyncReporter()

    const snapshot = {
      scanned: 0,
      selected: 0,
      processed: 0,
      skipped: 0,
      written: 0,
      moved: 0,
      patchesWritten: 0,
      patchesDeleted: 0,
    }

    reporter.onStageStart?.({
      stage: 'metadata',
      message: 'Fetch repository metadata',
      snapshot,
    })
    reporter.onStageEnd?.({
      stage: 'metadata',
      message: 'Fetch repository metadata',
      durationMs: 5,
      snapshot,
    })
    reporter.onStageStart?.({
      stage: 'materialize',
      message: 'Materialize local files',
      snapshot,
    })
    reporter.onStageEnd?.({
      stage: 'materialize',
      message: 'Materialize local files',
      durationMs: 5,
      snapshot,
    })
    reporter.onStageStart?.({
      stage: 'pagination',
      message: 'Pagination',
      snapshot: { ...snapshot, scanned: 2 },
    })

    const printed = logSpy.mock.calls.map(call => String(call[0]))
    expect(printed).toEqual([
      'Pagination',
    ])

    logSpy.mockRestore()
  })

  it('formats singular and plural nouns in plain mode', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const printer = createCliPrinter('sync', {
      isTTY: false,
      isCI: false,
    })

    const syncReporter = printer.createSyncReporter()
    syncReporter.onComplete?.({
      summary: {
        repo: 'owner/repo',
        syncedAt: '2026-01-01T00:00:00.000Z',
        totalIssues: 3,
        totalPulls: 2,
        updatedIssues: 1,
        updatedPulls: 1,
        trackedItems: 5,
        requestCount: 7,
        selected: 1,
        processed: 1,
        skipped: 0,
        scanned: 1,
        written: 1,
        moved: 0,
        patchesWritten: 1,
        patchesDeleted: 1,
        durationMs: 100,
      },
      stages: {
        metadata: 1,
        pagination: 1,
        fetch: 1,
        materialize: 1,
        prune: 1,
        save: 1,
      },
    })

    const executeReporter = printer.createExecuteReporter()
    executeReporter.onStart?.({
      repo: 'owner/repo',
      mode: 'report',
      planned: 1,
    })
    executeReporter.onStart?.({
      repo: 'owner/repo',
      mode: 'apply',
      planned: 2,
    })

    const printed = logSpy.mock.calls.map(call => String(call[0]))
    expect(printed.some(line => line.includes('1 issues and 1 PRs updated'))).toBe(true)
    expect(printed.some(line => line.includes('(100ms)'))).toBe(true)
    expect(printed.some(line => line.includes('1 planned operation'))).toBe(true)
    expect(printed.some(line => line.includes('2 planned operations'))).toBe(true)

    logSpy.mockRestore()
  })
})

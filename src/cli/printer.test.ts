import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCliPrinter } from './printer'

const clack = vi.hoisted(() => ({
  intro: vi.fn(),
  outro: vi.fn(),
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
  intro: clack.intro,
  outro: clack.outro,
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

  it('prints clickable repo link in rich header', () => {
    const printer = createCliPrinter('sync', {
      isTTY: true,
      isCI: false,
    })

    printer.header('owner/repo')

    expect(clack.intro).toHaveBeenCalledTimes(1)
    expect(clack.intro.mock.calls[0]?.[0]).toContain('\u001B]8;;https://github.com/owner/repo\u001B\\owner/repo\u001B]8;;\u001B\\')
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
      mode: 'full',
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
      stage: 'sync',
      message: 'Sync items',
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
      stage: 'sync',
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
      stage: 'sync',
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
      stage: 'sync',
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
    const progressLines = printed.filter(line => line.toLowerCase().includes('processed'))
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
      stage: 'fetch',
      message: 'Fetch issue and pull request candidates',
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
      stage: 'fetch',
      message: 'Fetch issue and pull request candidates',
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
      stage: 'sync',
      message: 'Sync items',
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
      stage: 'sync',
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
      stage: 'sync',
      message: 'Sync items',
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
      stage: 'resolve',
      message: 'Resolve sync context',
      snapshot,
    })
    reporter.onStageEnd?.({
      stage: 'resolve',
      message: 'Resolve sync context',
      durationMs: 5,
      snapshot,
    })
    reporter.onStageStart?.({
      stage: 'filter',
      message: 'Filter candidate items',
      snapshot,
    })
    reporter.onStageEnd?.({
      stage: 'filter',
      message: 'Filter candidate items',
      durationMs: 5,
      snapshot,
    })
    reporter.onStageStart?.({
      stage: 'fetch',
      message: 'Fetch issue and pull request candidates',
      snapshot: { ...snapshot, scanned: 2 },
    })

    const printed = logSpy.mock.calls.map(call => String(call[0]))
    expect(printed).toEqual([
      'Fetch issue and pull request candidates',
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
        mode: 'full',
        syncedAt: '2026-01-01T00:00:00.000Z',
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
        resolve: 1,
        fetch: 1,
        filter: 1,
        sync: 1,
        prune: 1,
        save: 1,
      },
    })

    const executeReporter = printer.createExecuteReporter()
    executeReporter.onStart?.({
      repo: 'owner/repo',
      mode: 'dry-run',
      planned: 1,
    })
    executeReporter.onStart?.({
      repo: 'owner/repo',
      mode: 'apply',
      planned: 2,
    })

    const printed = logSpy.mock.calls.map(call => String(call[0]))
    expect(printed.some(line => line.includes('1 selected item'))).toBe(true)
    expect(printed.some(line => line.includes('(100ms)'))).toBe(true)
    expect(printed.some(line => line.includes('1 planned operation'))).toBe(true)
    expect(printed.some(line => line.includes('2 planned operations'))).toBe(true)

    logSpy.mockRestore()
  })
})

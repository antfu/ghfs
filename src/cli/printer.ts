import type { ExecuteReporter } from '../execute'
import type { SyncReporter, SyncStage } from '../sync'
import process from 'node:process'
import * as p from '@clack/prompts'
import c from 'ansis'
import { countNoun, formatDuration, formatValue } from '../utils/format'
import { ASCII_HEADER, toGitHubRepoUrl } from './meta'

export type PrinterMode = 'rich' | 'plain'
export type PrinterKeyValueEntry = readonly [key: string, value: string | number | Date | undefined | null]

export interface CreateCliPrinterOptions {
  isTTY?: boolean
  isCI?: boolean
  progressEvery?: number
}

export interface CliPrinter {
  mode: PrinterMode
  header: (repo: string) => void
  start: (message: string) => void
  step: (message: string) => void
  info: (message: string) => void
  success: (message: string) => void
  warn: (message: string) => void
  error: (message: string) => void
  done: (message?: string) => void
  note: (message: string, title?: string) => void
  table: (
    title: string,
    entries: ReadonlyArray<PrinterKeyValueEntry>,
    options?: PrinterKeyValueOptions,
  ) => void
  print: (lines: string[]) => void
  createSyncReporter: () => SyncReporter
  createExecuteReporter: () => ExecuteReporter
}

export interface PrinterKeyValueOptions {
  indent?: number
  dimKey?: boolean
  excludeZero?: boolean
}

interface SyncStageSnapshot {
  scanned: number
  selected: number
  processed: number
  skipped: number
  written: number
  moved: number
  patchesWritten: number
  patchesDeleted: number
}

export function createCliPrinter(command: string, options: CreateCliPrinterOptions = {}): CliPrinter {
  const mode = resolveMode(options)
  const progressEvery = options.progressEvery ?? 25

  const write = (message?: string) => {
    if (message == null)
      return
    console.log(message)
  }

  const writeError = (message: string) => {
    console.error(message)
  }

  const printer: CliPrinter = {
    mode,
    header(repo) {
      if (mode !== 'rich')
        return
      write(ASCII_HEADER(formatTerminalLink(repo, toGitHubRepoUrl(repo))))
    },
    start(message) {
      if (mode === 'rich') {
        p.intro(message)
      }
      else {
        write(message)
      }
    },
    step(message) {
      if (mode === 'rich')
        p.log.step(message)
      else
        write(message)
    },
    info(message) {
      if (mode === 'rich')
        p.log.info(message)
      else
        write(message)
    },
    success(message) {
      if (mode === 'rich')
        p.log.success(message)
      else
        write(message)
    },
    warn(message) {
      if (mode === 'rich')
        p.log.warn(message)
      else
        write(message)
    },
    error(message) {
      if (mode === 'rich')
        p.log.error(message)
      else
        writeError(message)
    },
    done(message) {
      if (mode === 'rich')
        p.outro(message)
      else
        write(message)
    },
    note(message, title) {
      if (mode === 'rich') {
        p.note(message, title, { format: line => line })
      }
      else {
        if (title)
          write(`--- ${title} ---`)
        write(message)
        if (title)
          write('---')
      }
    },
    table(title, entries, options) {
      const lines = formatKeyValueLines(entries, options)
      if (lines.length !== 0)
        printer.note(lines.join('\n'), title)
    },
    print(lines) {
      for (const line of lines)
        console.log(line)
    },
    createSyncReporter() {
      return mode === 'rich'
        ? createRichSyncReporter(printer)
        : createPlainSyncReporter(printer, progressEvery)
    },
    createExecuteReporter() {
      return mode === 'rich'
        ? createRichExecuteReporter(printer)
        : createPlainExecuteReporter(printer)
    },
  }

  return printer
}

function formatTerminalLink(text: string, url: string): string {
  return `\u001B]8;;${url}\u001B\\${text}\u001B]8;;\u001B\\`
}

function createRichSyncReporter(printer: CliPrinter): SyncReporter {
  let stageSpinner = p.spinner()
  let syncProgress = p.progress({ max: 1 })
  let hasSyncProgress = false
  let lastProcessed = 0

  return {
    onStart(event) {
      const mode = event.mode ? ` in ${event.mode} mode` : ''
      printer.start(`Starting sync for ${event.repo}${mode}.`)
    },
    onStageStart(event) {
      if (isHiddenSyncStage(event.stage))
        return

      if (event.stage === 'sync') {
        hasSyncProgress = true
        syncProgress = p.progress({ max: Math.max(event.snapshot.selected, 1) })
        lastProcessed = 0
        syncProgress.start(formatSyncProgressLine(event.snapshot))
        return
      }

      stageSpinner = p.spinner()
      stageSpinner.start(event.message)
    },
    onStageUpdate(event) {
      if (event.stage === 'sync' && hasSyncProgress) {
        const nextProcessed = event.snapshot.processed
        const advanceBy = Math.max(0, nextProcessed - lastProcessed)
        const message = formatSyncProgressLine(event.snapshot, event.message)
        if (advanceBy > 0)
          syncProgress.advance(advanceBy, message)
        else
          syncProgress.message(message)
        lastProcessed = nextProcessed
        return
      }

      if (isHiddenSyncStage(event.stage))
        return

      if (event.message)
        stageSpinner.message(event.message)
    },
    onStageEnd(event) {
      if (isHiddenSyncStage(event.stage))
        return

      const completionLine = formatStageCompletionLine(
        event.stage,
        event.snapshot,
        event.durationMs,
      )

      if (event.stage === 'sync' && hasSyncProgress) {
        const advanceBy = Math.max(0, event.snapshot.processed - lastProcessed)
        if (advanceBy > 0)
          syncProgress.advance(advanceBy)
        if (completionLine)
          syncProgress.stop(completionLine)
        else
          syncProgress.clear()
        hasSyncProgress = false
        return
      }

      if (completionLine)
        stageSpinner.stop(completionLine)
      else
        stageSpinner.clear()
    },
    onComplete(event) {
      printer.success(`Sync finished. Processed ${event.summary.processed} of ${countNoun(event.summary.selected, 'selected item')}${c.dim(` (${formatDuration(event.summary.durationMs)}`)}.`)
    },
    onError(event) {
      const stage = event.stage && !isHiddenSyncStage(event.stage) ? ` while ${describeStage(event.stage)}` : ''
      const message = `Sync failed${stage}: ${toErrorMessage(event.error)}`
      if (hasSyncProgress) {
        syncProgress.error(message)
        hasSyncProgress = false
        return
      }
      stageSpinner.error(message)
    },
  }
}

function createPlainSyncReporter(printer: CliPrinter, progressEvery: number): SyncReporter {
  let lastProgress = 0

  return {
    onStart(event) {
      const mode = event.mode ? ` in ${event.mode} mode` : ''
      printer.step(`Starting sync for ${event.repo}${mode}.`)
    },
    onStageStart(event) {
      if (isHiddenSyncStage(event.stage))
        return
      printer.step(event.message)
    },
    onStageUpdate(event) {
      if (event.stage === 'sync') {
        const processed = event.snapshot.processed
        const shouldLog = processed === 0
          || processed === event.snapshot.selected
          || processed - lastProgress >= progressEvery
        if (!shouldLog)
          return
        lastProgress = processed
        printer.step(formatSyncProgressLine(event.snapshot, event.message))
        return
      }

      if (isHiddenSyncStage(event.stage))
        return

      if (event.message)
        printer.info(event.message)
    },
    onStageEnd(event) {
      if (isHiddenSyncStage(event.stage))
        return

      const completionLine = formatStageCompletionLine(event.stage, event.snapshot, event.durationMs)
      if (!completionLine)
        return
      printer.step(completionLine)
    },
    onComplete(event) {
      printer.success(`Sync finished. Processed ${event.summary.processed} of ${countNoun(event.summary.selected, 'selected item')}${c.dim(` (${formatDuration(event.summary.durationMs)})`)}.`)
    },
    onError(event) {
      const stage = event.stage && !isHiddenSyncStage(event.stage) ? ` while ${describeStage(event.stage)}` : ''
      printer.error(c.red(`Sync failed${stage}: ${toErrorMessage(event.error)}`))
    },
  }
}

function createRichExecuteReporter(printer: CliPrinter): ExecuteReporter {
  let applyProgress = p.progress({ max: 1 })
  let hasApplyProgress = false
  let lastCompleted = 0

  return {
    onStart(event) {
      const runMode = event.mode === 'apply' ? 'apply run' : 'dry run'
      printer.step(`Starting ${runMode} with ${countNoun(event.planned, 'planned operation')}.`)
      if (event.mode === 'apply') {
        hasApplyProgress = true
        applyProgress = p.progress({ max: Math.max(event.planned, 1) })
        lastCompleted = 0
        applyProgress.start(`Completed 0 of ${countNoun(event.planned, 'operation')}`)
      }
    },
    onProgress(event) {
      if (!hasApplyProgress)
        return
      const advanceBy = Math.max(0, event.completed - lastCompleted)
      const message = `Completed ${event.completed} of ${countNoun(event.planned, 'operation')} (${event.applied} applied, ${event.failed} failed). Latest: operation #${event.detail.op} ${event.detail.status}.`
      if (advanceBy > 0)
        applyProgress.advance(advanceBy, message)
      else
        applyProgress.message(message)
      lastCompleted = event.completed
    },
    onComplete(event) {
      if (hasApplyProgress) {
        const advanceBy = Math.max(0, event.result.details.length - lastCompleted)
        if (advanceBy > 0)
          applyProgress.advance(advanceBy)
        applyProgress.stop(`Apply run finished (${event.result.applied} applied, ${event.result.failed} failed).`)
        hasApplyProgress = false
      }
      const runMode = event.result.mode === 'apply' ? 'Apply run' : 'Dry run'
      printer.success(`${runMode} finished. Planned ${event.result.planned}, applied ${event.result.applied}, failed ${event.result.failed}.`)
    },
    onError(event) {
      const message = `Execution failed: ${toErrorMessage(event.error)}`
      if (hasApplyProgress) {
        applyProgress.error(message)
        hasApplyProgress = false
        return
      }
      printer.error(c.red(message))
    },
  }
}

function createPlainExecuteReporter(printer: CliPrinter): ExecuteReporter {
  return {
    onStart(event) {
      const runMode = event.mode === 'apply' ? 'apply run' : 'dry run'
      printer.step(`Starting ${runMode} with ${countNoun(event.planned, 'planned operation')}.`)
    },
    onProgress(event) {
      printer.step(`Completed ${event.completed} of ${countNoun(event.planned, 'operation')} (${event.applied} applied, ${event.failed} failed). Latest: operation #${event.detail.op} ${event.detail.status}.`)
    },
    onComplete(event) {
      const runMode = event.result.mode === 'apply' ? 'Apply run' : 'Dry run'
      printer.success(`${runMode} finished. Planned ${event.result.planned}, applied ${event.result.applied}, failed ${event.result.failed}.`)
    },
    onError(event) {
      printer.error(c.red(`Execution failed: ${toErrorMessage(event.error)}`))
    },
  }
}

function resolveMode(options: CreateCliPrinterOptions): PrinterMode {
  const isTTY = options.isTTY ?? Boolean(process.stdout.isTTY)
  const isCI = options.isCI ?? Boolean(process.env.CI)
  return isTTY && !isCI ? 'rich' : 'plain'
}

function formatSyncProgressLine(
  snapshot: {
    selected: number
    processed: number
    skipped: number
    written: number
    moved: number
    patchesWritten: number
    patchesDeleted: number
  },
  message?: string,
): string {
  const line = `Processed ${snapshot.processed} of ${countNoun(snapshot.selected, 'item')} (${snapshot.skipped} skipped, ${snapshot.written} written, ${snapshot.moved} moved, ${countNoun(snapshot.patchesWritten, 'patch')} added, ${countNoun(snapshot.patchesDeleted, 'patch')} removed)`
  if (!message)
    return line
  return `${line}. Current: ${message}`
}

function formatStageCompletionLine(
  stage: SyncStage,
  snapshot: SyncStageSnapshot,
  durationMs: number,
): string | undefined {
  if (!hasStageEffect(stage, snapshot))
    return undefined

  const duration = c.dim(` (${formatDuration(durationMs)})`)

  if (stage === 'resolve')
    return `Resolved sync context${duration}.`

  if (stage === 'fetch')
    return `Fetched ${countNoun(snapshot.scanned, 'candidate item')}${duration}.`

  if (stage === 'filter')
    return `Selected ${snapshot.selected} of ${countNoun(snapshot.scanned, 'candidate item')}${duration}.`

  if (stage === 'sync')
    return `Synced ${snapshot.processed} of ${countNoun(snapshot.selected, 'selected item')} (${snapshot.skipped} skipped, ${snapshot.written} written, ${snapshot.moved} moved, ${countNoun(snapshot.patchesWritten, 'patch')} added, ${countNoun(snapshot.patchesDeleted, 'patch')} removed)${duration}.`

  if (stage === 'prune')
    return `Pruned local artifacts (${countNoun(snapshot.patchesDeleted, 'patch file')} removed)${duration}.`

  return undefined
}

function toErrorMessage(error: unknown): string {
  return (error as Error).message || String(error)
}

export function formatKeyValueLines(
  entries: ReadonlyArray<PrinterKeyValueEntry>,
  options: PrinterKeyValueOptions = {},
): string[] {
  const {
    indent = 1,
    dimKey = true,
    excludeZero = false,
  } = options

  const padding = ' '.repeat(Math.max(0, indent))

  const validEntries = entries
    .filter(([, value]) => {
      if (value == null)
        return false
      if (excludeZero && value === 0)
        return false
      return true
    })

  const keyWidth = Math.max(0, ...validEntries.map(([key]) => key.length))

  return validEntries
    .map(([key, value]) => {
      const displayKey = dimKey ? c.dim(key.padStart(keyWidth, ' ')) : key.padStart(keyWidth, ' ')

      if (value == null)
        return undefined

      if (excludeZero && value === 0)
        return undefined

      const formattedValue = formatValue(value)

      return `${padding}${displayKey}  ${formattedValue}`
    })
    .filter(x => x != null)
}

function hasStageEffect(stage: SyncStage, snapshot: SyncStageSnapshot): boolean {
  if (isHiddenSyncStage(stage))
    return false
  if (stage === 'fetch')
    return snapshot.scanned > 0
  if (stage === 'filter')
    return snapshot.selected > 0
  if (stage === 'sync')
    return snapshot.processed > 0
  if (stage === 'prune')
    return snapshot.patchesDeleted > 0
  return true
}

function isHiddenSyncStage(stage: SyncStage): boolean {
  return stage === 'resolve' || stage === 'filter'
}

function describeStage(stage: SyncStage): string {
  if (stage === 'resolve')
    return 'resolving the sync context'
  if (stage === 'fetch')
    return 'fetching candidates'
  if (stage === 'filter')
    return 'filtering candidates'
  if (stage === 'sync')
    return 'syncing items'
  if (stage === 'prune')
    return 'pruning local artifacts'
  return 'saving sync state'
}

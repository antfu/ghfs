import type { SyncSummary } from '../sync'
import type { CliPrinter } from './printer'
import { formatDuration } from '../utils/format'

export function printSyncSummaryTable(
  printer: CliPrinter,
  summary: SyncSummary,
  title: string,
): void {
  printer.table(title, [
    ['repo', summary.repo],
    ['synced at', summary.syncedAt ? new Date(summary.syncedAt) : '-'],
    ['since', summary.since ? new Date(summary.since) : '-'],
    ['mode', summary.mode],
    ['duration', formatDuration(summary.durationMs)],
    ['scanned', summary.scanned],
    ['selected', summary.selected],
    ['processed', summary.processed],
    ['skipped', summary.skipped],
    ['markdown written', summary.written],
    ['moved', summary.moved],
    ['patch written', summary.patchesWritten],
    ['patch deleted', summary.patchesDeleted],
  ], { excludeZero: true })
}

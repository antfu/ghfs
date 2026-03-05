import type { CAC } from 'cac'
import { resolveConfig } from '../../config/load'
import { getStatusSummary } from '../../sync/status'
import { withErrorHandling } from '../errors'
import { createCliPrinter } from '../printer'

export function registerStatusCommand(cli: CAC): void {
  cli
    .command('status', 'Show local sync status')
    .action(withErrorHandling(async () => {
      const printer = createCliPrinter('status')
      printer.start('Reading local sync state')
      const config = await resolveConfig()
      const summary = await getStatusSummary(config)
      printer.table('Status', [
        ['repo', summary.repo ?? '(not resolved yet)'],
        ['last sync', summary.lastSyncedAt],
        ['tracked items', summary.totalTracked],
        ['open items', summary.openCount],
        ['closed items', summary.closedCount],
        ['execution runs', summary.executionRuns],
      ], { excludeZero: true })
      printer.done('')
    }))
}

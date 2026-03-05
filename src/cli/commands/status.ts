import type { CAC } from 'cac'
import { resolveConfig } from '../../config/load'
import { getStatusSummary } from '../../sync/status'
import { withErrorHandling } from '../errors'
import { printStatusSummary } from '../output'

export function registerStatusCommand(cli: CAC): void {
  cli
    .command('status', 'Show local sync status')
    .action(withErrorHandling(async () => {
      const config = await resolveConfig()
      const summary = await getStatusSummary(config)
      printStatusSummary(summary)
    }))
}

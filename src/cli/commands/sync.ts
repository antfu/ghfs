import type { CAC } from 'cac'
import type { SyncSummary } from '../../sync'
import type { CliPrinter } from '../printer'
import process from 'node:process'
import { resolveAuthToken } from '../../config/auth'
import { resolveConfig } from '../../config/load'
import { resolveRepo } from '../../config/repo'
import { syncRepository } from '../../sync'
import { withErrorHandling } from '../errors'
import { createCliPrinter, formatDuration } from '../printer'

interface SyncCommandOptions {
  repo?: string
  since?: string
  full?: boolean
}

export function registerSyncCommand(cli: CAC): void {
  setupSyncCommand(cli.command('sync', 'Sync issues and pull requests to local mirror'))
  setupSyncCommand(cli.command('', 'Sync issues and pull requests to local mirror'))
}

function setupSyncCommand(command: ReturnType<CAC['command']>): void {
  command
    .option('--repo <repo>', 'GitHub repository in owner/name format')
    .option('--since <iso>', 'Only sync records updated since ISO datetime')
    .option('--full', 'Full sync ignoring previous cursor')
    .action(withErrorHandling(async (options: SyncCommandOptions) => {
      const printer = createCliPrinter('sync')
      printer.start('Preparing sync')

      const config = await resolveConfig()

      const repo = await resolveRepo({
        cwd: config.cwd,
        cliRepo: options.repo,
        configRepo: config.repo,
        interactive: process.stdin.isTTY,
      })

      const token = await resolveAuthToken({
        token: config.auth.token,
        interactive: process.stdin.isTTY,
      })

      const summary = await syncRepository({
        config,
        repo: repo.repo,
        token,
        since: options.since,
        full: Boolean(options.full),
        reporter: printer.createSyncReporter(),
      })

      printSyncSummary(printer, summary)
      printer.done('Sync finished')
    }))
}

function printSyncSummary(printer: CliPrinter, summary: SyncSummary): void {
  printer.table('Summary', [
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

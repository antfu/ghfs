import type { CAC } from 'cac'
import process from 'node:process'
import { resolve } from 'pathe'
import { resolveAuthToken } from '../../config/auth'
import { getExecuteFile, resolveConfig } from '../../config/load'
import { resolveRepo } from '../../config/repo'
import { ensureExecuteArtifacts } from '../../execute/schema'
import { syncRepository } from '../../sync'
import { withErrorHandling } from '../errors'
import { createCliPrinter } from '../printer'
import { promptForToken, promptRepoChoice } from '../prompts'
import { printSyncSummaryTable } from '../summary'

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

      const config = await resolveConfig()
      await ensureExecuteArtifacts(resolve(config.cwd, getExecuteFile(config)))

      const repo = await resolveRepo({
        cwd: config.cwd,
        cliRepo: options.repo,
        configRepo: config.repo,
        interactive: process.stdin.isTTY,
        selectRepoChoice: promptRepoChoice,
      })

      printer.header(repo.repo)

      const token = await resolveAuthToken({
        token: config.auth.token,
        interactive: process.stdin.isTTY,
        promptForToken,
      })

      const summary = await syncRepository({
        config,
        repo: repo.repo,
        token,
        since: options.since,
        full: Boolean(options.full),
        reporter: printer.createSyncReporter(),
      })

      printSyncSummaryTable(printer, summary, 'Summary')
      printer.done('Sync finished')
    }))
}

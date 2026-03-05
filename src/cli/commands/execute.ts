import type { CAC } from 'cac'
import { resolve } from 'node:path'
import process from 'node:process'
import { resolveAuthToken } from '../../config/auth'
import { getExecuteFile, getStorageDirAbsolute, resolveConfig } from '../../config/load'
import { resolveRepo } from '../../config/repo'
import { executePendingChanges } from '../../execute'
import { appendExecutionResult, syncRepository } from '../../sync'
import { withErrorHandling } from '../errors'
import { printExecutionPlan, printExecutionResult, printSyncSummary } from '../output'

interface ExecuteCommandOptions {
  repo?: string
  file?: string
  apply?: boolean
  nonInteractive?: boolean
  continueOnError?: boolean
}

export function registerExecuteCommand(cli: CAC): void {
  cli
    .command('execute', 'Execute operations from .ghfs/execute.yml')
    .option('--repo <repo>', 'GitHub repository in owner/name format')
    .option('--file <file>', 'Path to execute yaml file')
    .option('--apply', 'Apply mutations to GitHub (default is dry-run)')
    .option('--non-interactive', 'Disable interactive prompts')
    .option('--continue-on-error', 'Continue applying ops after a failure')
    .action(withErrorHandling(async (options: ExecuteCommandOptions) => {
      const config = await resolveConfig()
      const storageDirAbsolute = getStorageDirAbsolute(config)
      const interactive = process.stdin.isTTY && !options.nonInteractive

      const repo = await resolveRepo({
        cwd: config.cwd,
        cliRepo: options.repo,
        configRepo: config.repo,
        interactive,
      })

      const token = await resolveAuthToken({
        token: config.auth.token,
        interactive,
      })

      const executeFilePath = resolve(config.cwd, options.file ?? getExecuteFile(config))
      const result = await executePendingChanges({
        config,
        repo: repo.repo,
        token,
        executeFilePath,
        apply: Boolean(options.apply),
        nonInteractive: Boolean(options.nonInteractive),
        continueOnError: Boolean(options.continueOnError),
        onPlan: printExecutionPlan,
      })

      await appendExecutionResult(storageDirAbsolute, result)

      printExecutionResult(result)

      const affectedNumbers = [...new Set(
        result.details
          .filter(detail => detail.status === 'applied')
          .map(detail => detail.number),
      )]

      if (options.apply && affectedNumbers.length > 0) {
        const syncSummary = await syncRepository({
          config,
          repo: repo.repo,
          token,
          numbers: affectedNumbers,
        })
        printSyncSummary(syncSummary)
      }

      if (result.failed > 0)
        process.exitCode = 1
    }))
}

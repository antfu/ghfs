import type { CAC } from 'cac'
import type { PendingOp } from '../../execute/types'
import type { ExecutionResult } from '../../types'
import type { CliPrinter } from '../printer'
import { resolve } from 'node:path'
import process from 'node:process'
import { resolveAuthToken } from '../../config/auth'
import { getExecuteFile, getStorageDirAbsolute, resolveConfig } from '../../config/load'
import { resolveRepo } from '../../config/repo'
import { executePendingChanges } from '../../execute'
import { appendExecutionResult, syncRepository } from '../../sync'
import { describeAction } from '../../utils/format'
import { withErrorHandling } from '../errors'
import { createCliPrinter } from '../printer'
import { createExecutePrompts, promptForToken, promptRepoChoice } from '../prompts'
import { printSyncSummaryTable } from '../summary'

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
      const printer = createCliPrinter('execute')

      const config = await resolveConfig()
      const storageDirAbsolute = getStorageDirAbsolute(config)
      const interactive = process.stdin.isTTY && !options.nonInteractive

      const repo = await resolveRepo({
        cwd: config.cwd,
        cliRepo: options.repo,
        configRepo: config.repo,
        interactive,
        selectRepoChoice: promptRepoChoice,
      })

      printer.header(repo.repo)
      printer.start('Preparing execute run')

      const token = await resolveAuthToken({
        token: config.auth.token,
        interactive,
        promptForToken,
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
        onPlan: ops => printExecutionPlan(printer, ops),
        reporter: printer.createExecuteReporter(),
        prompts: createExecutePrompts(),
      })

      await appendExecutionResult(storageDirAbsolute, result)

      printExecutionResult(printer, result)

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
          reporter: printer.createSyncReporter(),
        })
        printSyncSummaryTable(printer, syncSummary, 'Sync Summary')
      }

      if (result.failed > 0)
        process.exitCode = 1

      printer.done('Execute finished')
    }))
}

function printExecutionPlan(printer: CliPrinter, ops: PendingOp[]): void {
  printer.table('Execution Plan', [
    ['operations', ops.length],
  ], { indent: 2 })

  if (ops.length === 0) {
    printer.table('Execution Plan Ops', [
      ['items', '(none)'],
    ], { indent: 2 })
    return
  }

  printer.table('Execution Plan Ops', ops.map((op, index) => [`op ${index + 1}`, describeAction(op.action, op.number)] as const), { indent: 2 })
}

function printExecutionResult(printer: CliPrinter, result: ExecutionResult): void {
  printer.table('Execution Result', [
    ['mode', result.mode],
    ['planned', result.planned],
    ['applied', result.applied],
    ['failed', result.failed],
  ], { indent: 2 })

  if (result.details.length === 0) {
    printer.table('Execution Details', [
      ['details', '(none)'],
    ], { indent: 2 })
    return
  }

  printer.table(
    'Execution Details',
    result.details.map(detail => [`op ${detail.op}`, `[${detail.status}] ${detail.message}`] as const),
    { indent: 2 },
  )
}

import type { CAC } from 'cac'
import type { ExecutePrompts } from '../../execute'
import type { PendingOp } from '../../execute/types'
import type { SyncSummary } from '../../sync'
import type { ExecutionResult, RepoDetectionCandidate, RepoResolutionResult } from '../../types'
import type { CliPrinter } from '../printer'
import process from 'node:process'
import { resolve } from 'pathe'
import { resolveAuthToken } from '../../config/auth'
import { getExecuteFile, getStorageDirAbsolute, resolveConfig } from '../../config/load'
import { resolveRepo } from '../../config/repo'
import { executePendingChanges, isExecuteCancelledError } from '../../execute'
import { appendExecutionResult, syncRepository } from '../../sync'
import { countNoun, describeAction, formatDuration } from '../../utils/format'
import { withErrorHandling } from '../errors'
import { createCliPrinter } from '../printer'
import { createExecutePrompts, promptForToken, promptRepoChoice } from '../prompts'

const PLAN_PREVIEW_LIMIT = 20

export interface ExecuteCommandOptions {
  repo?: string
  file?: string
  run?: boolean
  nonInteractive?: boolean
  continueOnError?: boolean
}

export interface ExecuteCommandDependencies {
  createCliPrinter: typeof createCliPrinter
  resolveConfig: typeof resolveConfig
  isTTY: () => boolean
  resolveRepo: typeof resolveRepo
  resolveAuthToken: typeof resolveAuthToken
  executePendingChanges: typeof executePendingChanges
  appendExecutionResult: typeof appendExecutionResult
  syncRepository: typeof syncRepository
  createExecutePrompts: () => ExecutePrompts
  promptForToken: typeof promptForToken
  promptRepoChoice: (
    gitCandidate: RepoDetectionCandidate,
    pkgCandidate: RepoDetectionCandidate,
  ) => Promise<string | undefined>
}

const defaultDependencies: ExecuteCommandDependencies = {
  createCliPrinter,
  resolveConfig,
  isTTY: () => Boolean(process.stdin.isTTY),
  resolveRepo,
  resolveAuthToken,
  executePendingChanges,
  appendExecutionResult,
  syncRepository,
  createExecutePrompts,
  promptForToken,
  promptRepoChoice,
}

export function registerExecuteCommand(cli: CAC): void {
  cli
    .command('execute', 'Execute operations from .ghfs/execute.yml')
    .option('--repo <repo>', 'GitHub repository in owner/name format')
    .option('--file <file>', 'Path to execute yaml file')
    .option('--run', 'Run mutations on GitHub')
    .option('--non-interactive', 'Disable interactive prompts')
    .option('--continue-on-error', 'Continue applying ops after a failure')
    .action(withErrorHandling(async (options: ExecuteCommandOptions) => runExecuteCommand(options)))
}

export async function runExecuteCommand(
  options: ExecuteCommandOptions,
  dependencies: ExecuteCommandDependencies = defaultDependencies,
): Promise<void> {
  const printer = dependencies.createCliPrinter('execute')

  const config = await dependencies.resolveConfig()
  const storageDirAbsolute = getStorageDirAbsolute(config)
  const interactive = dependencies.isTTY() && !options.nonInteractive

  const prompts = dependencies.createExecutePrompts()
  const runMutations = Boolean(options.run)

  let resolvedRepo: RepoResolutionResult | undefined
  let repoForRun = options.repo?.trim() || config.repo
  let tokenForRun = ''

  if (runMutations) {
    resolvedRepo = await dependencies.resolveRepo({
      cwd: config.cwd,
      cliRepo: options.repo,
      configRepo: config.repo,
      interactive,
      selectRepoChoice: dependencies.promptRepoChoice,
    })
    repoForRun = resolvedRepo.repo
    printer.header(resolvedRepo.repo)

    tokenForRun = await dependencies.resolveAuthToken({
      token: config.auth.token,
      interactive,
      promptForToken: dependencies.promptForToken,
    })
  }
  else if (repoForRun) {
    printer.header(repoForRun)
  }

  const executeFilePath = resolve(config.cwd, options.file ?? getExecuteFile(config))

  let result: ExecutionResult
  try {
    result = await dependencies.executePendingChanges({
      config,
      repo: repoForRun || '(repo not resolved)',
      token: tokenForRun,
      executeFilePath,
      apply: runMutations,
      nonInteractive: Boolean(options.nonInteractive),
      continueOnError: Boolean(options.continueOnError),
      onPlan: ops => printExecutionPlan(printer, ops),
      onWarning: warning => printer.warn(warning),
      reporter: runMutations ? printer.createExecuteReporter() : undefined,
      prompts,
    })
  }
  catch (error) {
    if (isExecuteCancelledError(error)) {
      printer.info('Execution cancelled.')
      return
    }
    throw error
  }

  if (!runMutations) {
    printReportSummary(printer, result)
    return
  }

  await dependencies.appendExecutionResult(storageDirAbsolute, result)
  printFailedOperations(printer, result)

  const affectedNumbers = [...new Set(
    result.details
      .filter(detail => detail.status === 'applied')
      .map(detail => detail.number),
  )]

  if (affectedNumbers.length > 0) {
    const syncSummary = await dependencies.syncRepository({
      config,
      repo: resolvedRepo?.repo || repoForRun || '',
      token: tokenForRun,
      numbers: affectedNumbers,
      reporter: printer.createSyncReporter(),
    })
    printPostRunSyncSummary(printer, syncSummary)
  }

  if (result.failed > 0)
    process.exitCode = 1
}

function printExecutionPlan(printer: CliPrinter, ops: PendingOp[]): void {
  if (ops.length === 0) {
    printer.info('No operations planned.')
    return
  }

  printer.info(`Planned ${countNoun(ops.length, 'operation')}.`)

  const previewLines = ops
    .slice(0, PLAN_PREVIEW_LIMIT)
    .map((op, index) => `${index + 1}. ${describeAction(op.action, op.number)}`)

  printer.print(previewLines)

  const remaining = ops.length - PLAN_PREVIEW_LIMIT
  if (remaining > 0)
    printer.info(`...and ${countNoun(remaining, 'more operation')}.`)
}

function printReportSummary(printer: CliPrinter, result: ExecutionResult): void {
  printer.success(`${countNoun(result.planned, 'operation')} found.`)
  if (result.planned > 0)
    printer.info('Run `ghfs execute --run` to execute these operations.')
}

function printFailedOperations(printer: CliPrinter, result: ExecutionResult): void {
  const failed = result.details.filter(detail => detail.status === 'failed')
  if (failed.length === 0)
    return

  printer.warn(`${countNoun(failed.length, 'operation')} failed:`)
  printer.print(
    failed.map(detail => `${detail.op}. ${describeAction(detail.action, detail.number)}: ${detail.message}`),
  )
}

function printPostRunSyncSummary(printer: CliPrinter, summary: SyncSummary): void {
  const refreshed = summary.updatedIssues + summary.updatedPulls
  printer.info(`Post-run sync refreshed ${countNoun(refreshed, 'item')} in ${formatDuration(summary.durationMs)} (${summary.requestCount} requests).`)
}

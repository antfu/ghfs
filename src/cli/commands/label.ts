import type { CAC } from 'cac'
import type { LabelSuggestion } from '../../ai/labeling'
import { resolve } from 'pathe'
import { runLabelSuggestion } from '../../ai/labeling/run'
import { getExecuteFile, getStorageDirAbsolute, resolveConfig } from '../../config/load'
import { countNoun, formatIssueNumber } from '../../utils/format'
import { withErrorHandling } from '../errors'
import { createCliPrinter } from '../printer'

interface LabelCommandOptions {
  all?: boolean
  threshold?: number
}

export function registerLabelCommand(cli: CAC): void {
  cli
    .command('label [...numbers]', 'Draft label suggestions from a decision model into the queue')
    .option('--all', 'Also consider open items that already have labels')
    .option('--threshold <probability>', 'Minimum probability for a label to be suggested (0-1)')
    .action(withErrorHandling(async (numbers: string[], options: LabelCommandOptions) => {
      const printer = createCliPrinter('label')
      const config = await resolveConfig()
      const storageDirAbsolute = getStorageDirAbsolute(config)
      const repo = config.repo || undefined

      printer.start('Scoring labels')
      const run = await runLabelSuggestion({
        config,
        storageDirAbsolute,
        executeFilePath: resolve(config.cwd, getExecuteFile(config)),
        numbers: numbers.map(Number).filter(Number.isInteger),
        all: options.all,
        threshold: options.threshold === undefined ? undefined : Number(options.threshold),
        onProgress: (event) => {
          if (event.stage === 'investigating')
            printer.step(`${formatIssueNumber(event.number, { repo })} unsure, gathering context`)
          else if (event.stage === 'done' && event.suggestion)
            printer.success(describeSuggestion(event.suggestion, repo))
        },
      })

      if (run.targets === 0) {
        printer.done('No open unlabeled items. Pass item numbers or `--all` to widen.')
        return
      }
      if (run.suggestions.length === 0) {
        printer.done(`Scored ${countNoun(run.targets, 'item')}; nothing cleared the threshold.`)
        return
      }
      printer.done(`Drafted labels for ${countNoun(run.suggestions.length, 'item')} into the queue. Review with \`ghfs execute\`.`)
    }))
}

function describeSuggestion(suggestion: LabelSuggestion, repo?: string): string {
  const labels = suggestion.labels.map(label => `${label} (${Math.round(suggestion.confidence[label]! * 100)}%)`).join(', ')
  return `${formatIssueNumber(suggestion.number, { repo })} ${labels}${suggestion.escalated ? ' · via agent' : ''}`
}

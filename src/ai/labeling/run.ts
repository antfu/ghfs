import type { QueueState } from '../../server/types'
import type { GhfsResolvedConfig } from '../../types/config'
import type { LabelProgressEvent, LabelSuggestion, SelectLabelTargetsOptions } from './index'
import { diagnostics } from '../../logger'
import { addQueueOps } from '../../server/queue-writer'
import { loadRepoSnapshot } from '../../sync/repo-snapshot'
import { loadSyncState } from '../../sync/state'
import { createAiRuntime, hasAiCredentials } from '../runtime'
import { selectLabelTargets, suggestLabels, toLabelOps } from './index'

export interface RunLabelSuggestionOptions extends SelectLabelTargetsOptions {
  config: GhfsResolvedConfig
  storageDirAbsolute: string
  executeFilePath: string
  /** Overrides `config.ai.labeling.threshold`. */
  threshold?: number
  signal?: AbortSignal
  onProgress?: (event: LabelProgressEvent) => void
}

export interface LabelSuggestionRun {
  targets: number
  suggestions: LabelSuggestion[]
  queue: QueueState
}

/** Scores the selected items, then drafts the accepted labels into the queue for review. */
export async function runLabelSuggestion(options: RunLabelSuggestionOptions): Promise<LabelSuggestionRun> {
  const { config, storageDirAbsolute, executeFilePath } = options
  if (!await hasAiCredentials(config.ai))
    throw diagnostics.GHFS0500()

  const [syncState, snapshot] = await Promise.all([
    loadSyncState(storageDirAbsolute),
    loadRepoSnapshot(storageDirAbsolute),
  ])
  const repoLabels = snapshot?.labels ?? []
  if (repoLabels.length === 0)
    throw diagnostics.GHFS0501()

  const aiConfig = options.threshold === undefined
    ? config.ai
    : { ...config.ai, labeling: { ...config.ai.labeling, threshold: options.threshold } }

  const targets = selectLabelTargets(syncState, options)
  const suggestions = await suggestLabels({
    runtime: createAiRuntime(aiConfig),
    config: aiConfig,
    syncState,
    storageDirAbsolute,
    repoLabels,
    targets,
    signal: options.signal,
    onProgress: options.onProgress,
  })

  const queueOptions = { storageDirAbsolute, executeFilePath }
  const queue = await addQueueOps(queueOptions, toLabelOps(suggestions))
  return { targets: targets.length, suggestions, queue }
}

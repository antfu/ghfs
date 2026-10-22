import type { GhfsResolvedConfig } from '../../types/config'
import type { DuplicatePair } from './index'
import { diagnostics } from '../../logger'
import { loadSyncState } from '../../sync/state'
import { createAiRuntime, hasAiCredentials } from '../runtime'
import { detectDuplicates, selectDuplicateCandidates } from './index'

export interface RunDuplicateDetectionOptions {
  config: GhfsResolvedConfig
  storageDirAbsolute: string
  signal?: AbortSignal
}

export interface DuplicateDetectionRun {
  model: string
  candidates: number
  pairs: DuplicatePair[]
}

export async function runDuplicateDetection(options: RunDuplicateDetectionOptions): Promise<DuplicateDetectionRun> {
  if (!await hasAiCredentials(options.config.ai))
    throw diagnostics.GHFS0500()
  const items = Object.values((await loadSyncState(options.storageDirAbsolute)).items)
  const candidates = selectDuplicateCandidates(items)
  const runtime = createAiRuntime(options.config.ai)
  const pairs = await detectDuplicates(runtime, items, candidates, { signal: options.signal })
  return { model: runtime.classifier.id, candidates: candidates.length, pairs }
}

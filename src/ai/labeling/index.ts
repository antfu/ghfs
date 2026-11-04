import type { PendingLabelsOp } from '../../execute/types'
import type { GhfsResolvedAiConfig } from '../../types/config'
import type { SyncItemState, SyncState } from '../../types/sync-state'
import type { AiRuntime } from '../runtime'
import type { LabelCandidate } from './questions'
import { readFile } from 'node:fs/promises'
import { join } from 'pathe'
import { gatherItemContext } from '../agent'
import { decideLabelProbabilities } from './decide'
import { buildItemState, buildLabelQuestions, pickLabels, sampleLabelExamples, uncertainLabels } from './questions'

export interface LabelSuggestion {
  number: number
  labels: string[]
  confidence: Record<string, number>
  model: string
  /** True when the decision model was unsure and the context agent was consulted. */
  escalated: boolean
}

export interface LabelProgressEvent {
  number: number
  stage: 'deciding' | 'investigating' | 'done'
  suggestion?: LabelSuggestion
}

export interface SelectLabelTargetsOptions {
  /** Explicit item numbers; when absent, open items are selected. */
  numbers?: number[]
  /** Include open items that already carry labels. */
  all?: boolean
}

export function selectLabelTargets(syncState: SyncState, options: SelectLabelTargetsOptions = {}): SyncItemState[] {
  const items = Object.values(syncState.items)
  if (options.numbers?.length) {
    const wanted = new Set(options.numbers)
    return items.filter(item => wanted.has(item.number))
  }
  return items.filter(item => item.state === 'open' && (options.all || item.data.item.labels.length === 0))
}

export interface SuggestLabelsOptions {
  runtime: AiRuntime
  config: GhfsResolvedAiConfig
  syncState: SyncState
  storageDirAbsolute: string
  repoLabels: LabelCandidate[]
  targets: SyncItemState[]
  signal?: AbortSignal
  onProgress?: (event: LabelProgressEvent) => void
}

export async function suggestLabels(options: SuggestLabelsOptions): Promise<LabelSuggestion[]> {
  const { runtime, config, syncState, targets } = options
  const { threshold, examplesPerLabel, guidelines, exclude } = config.labeling
  const items = Object.values(syncState.items)
  const labels = options.repoLabels.filter(label => !exclude.includes(label.name))
  if (labels.length === 0 || targets.length === 0)
    return []

  const examples = sampleLabelExamples(items, labels, examplesPerLabel, new Set(targets.map(t => t.number)))
  const questions = buildLabelQuestions(labels, examples)
  const suggestions: LabelSuggestion[] = []

  for (const target of targets) {
    options.signal?.throwIfAborted()
    const item = target.data.item
    options.onProgress?.({ number: target.number, stage: 'deciding' })

    let probabilities = await decideLabelProbabilities(runtime, buildItemState(item, { guidelines }), questions)
    let escalated = false

    const unsure = uncertainLabels(probabilities, threshold)
    if (unsure.length > 0) {
      options.onProgress?.({ number: target.number, stage: 'investigating' })
      escalated = true
      const notes = await gatherItemContext(runtime, {
        item: target,
        items,
        readPatch: () => readPatch(options.storageDirAbsolute, target),
      }, {
        candidates: unsure.map(name => ({ name, description: labels.find(l => l.name === name)?.description ?? null, probability: probabilities[name]! })),
        guidelines: guidelines || undefined,
        signal: options.signal,
      })
      if (notes)
        probabilities = await decideLabelProbabilities(runtime, buildItemState(item, { guidelines, notes }), questions)
    }

    const decision = pickLabels(probabilities, threshold)
    const fresh = decision.labels.filter(label => !item.labels.includes(label))
    const suggestion: LabelSuggestion | undefined = fresh.length
      ? {
          number: target.number,
          labels: fresh,
          confidence: Object.fromEntries(fresh.map(label => [label, decision.confidence[label]!])),
          model: runtime.classifier.id,
          escalated,
        }
      : undefined
    if (suggestion)
      suggestions.push(suggestion)
    options.onProgress?.({ number: target.number, stage: 'done', suggestion })
  }

  return suggestions
}

export function toLabelOps(suggestions: LabelSuggestion[]): PendingLabelsOp[] {
  return suggestions.map(s => ({
    action: 'add-labels',
    number: s.number,
    labels: s.labels,
    origin: { kind: 'ai', model: s.model, confidence: s.confidence },
  }))
}

async function readPatch(storageDirAbsolute: string, item: SyncItemState): Promise<string | null> {
  if (!item.patchPath)
    return null
  return readFile(join(storageDirAbsolute, item.patchPath), 'utf8').catch(() => null)
}

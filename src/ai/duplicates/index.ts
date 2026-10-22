import type { ClassifierBoolQuestion, JsonObject } from '@earendil-works/pi-ai'
import type { SyncItemState } from '../../types/sync-state'
import type { AiRuntime } from '../runtime'
import { sharedTokenCount, titleTokens } from '../../utils/tokens'

export interface DuplicateCandidate {
  a: number
  b: number
  /** Shared title tokens, plus one when the items share a label. */
  score: number
}

export interface DuplicatePair {
  a: number
  b: number
  probability: number
}

export const DEFAULT_CANDIDATE_LIMIT = 200
const BATCH_SIZE = 8
const BODY_EXCERPT = 1200
/** Pairs the model considers less likely than this are dropped from the result. */
const REPORT_FLOOR = 0.5

/**
 * Open items of the same kind whose titles overlap enough to be worth a model
 * call: two shared words, or one shared word plus a shared label.
 */
export function selectDuplicateCandidates(items: SyncItemState[], limit = DEFAULT_CANDIDATE_LIMIT): DuplicateCandidate[] {
  const open = items.filter(item => item.state === 'open').map(item => ({ item, tokens: titleTokens(item.data.item.title) }))
  const candidates: DuplicateCandidate[] = []
  for (let i = 0; i < open.length; i++) {
    for (let j = i + 1; j < open.length; j++) {
      const x = open[i]!
      const y = open[j]!
      if (x.item.kind !== y.item.kind)
        continue
      const shared = sharedTokenCount(x.tokens, y.tokens)
      const sharesLabel = x.item.data.item.labels.some(label => y.item.data.item.labels.includes(label))
      if (shared >= 2 || (shared >= 1 && sharesLabel))
        candidates.push({ a: x.item.number, b: y.item.number, score: shared + (sharesLabel ? 1 : 0) })
    }
  }
  return candidates.sort((p, q) => q.score - p.score || p.a - q.a || p.b - q.b).slice(0, limit)
}

function excerpt(item: SyncItemState): JsonObject {
  const body = item.data.item.body ?? ''
  return {
    number: item.number,
    title: item.data.item.title,
    body: body.length > BODY_EXCERPT ? `${body.slice(0, BODY_EXCERPT)}…` : body,
  }
}

export interface DetectDuplicatesOptions {
  signal?: AbortSignal
  onProgress?: (done: number, total: number) => void
}

/** Asks the decision model, several pairs per request, whether each pair reports the same underlying problem. */
export async function detectDuplicates(runtime: AiRuntime, items: SyncItemState[], candidates: DuplicateCandidate[], options: DetectDuplicatesOptions = {}): Promise<DuplicatePair[]> {
  const byNumber = new Map(items.map(item => [item.number, item]))
  const pairs: DuplicatePair[] = []

  for (let offset = 0; offset < candidates.length; offset += BATCH_SIZE) {
    options.signal?.throwIfAborted()
    const batch = candidates.slice(offset, offset + BATCH_SIZE)
    const state: JsonObject = { pairs: {} }
    const questions: Record<string, ClassifierBoolQuestion> = {}
    batch.forEach((candidate, index) => {
      const key = `p${index}`
      ;(state.pairs as Record<string, JsonObject>)[key] = { a: excerpt(byNumber.get(candidate.a)!), b: excerpt(byNumber.get(candidate.b)!) }
      questions[key] = {
        type: 'bool',
        instructions: `Do items a and b in pairs.${key} report the same underlying problem or request, such that one could be closed as a duplicate of the other?`,
        criteria: {
          true: 'Same root cause or the same request, even when worded differently or at different levels of detail.',
          false: 'Different problems or requests; merely touching the same area or feature does not count.',
        },
      }
    })

    const result = await runtime.models.classify(runtime.classifier, { state, questions }, { apiKey: runtime.apiKey, signal: options.signal })
    if (result.stopReason !== 'stop')
      throw new Error(result.errorMessage ?? `Decision model ${runtime.classifier.id} failed (${result.stopReason})`)

    batch.forEach((candidate, index) => {
      const answer = result.answers[`p${index}`]
      if (answer?.type === 'bool' && answer.probability >= REPORT_FLOOR)
        pairs.push({ a: candidate.a, b: candidate.b, probability: Math.round(answer.probability * 100) / 100 })
    })
    options.onProgress?.(Math.min(offset + BATCH_SIZE, candidates.length), candidates.length)
  }

  return pairs.sort((p, q) => q.probability - p.probability)
}

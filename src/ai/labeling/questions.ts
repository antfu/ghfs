import type { ClassifierBoolQuestion, JsonObject } from '@earendil-works/pi-ai'
import type { ProviderItem } from '../../types/provider'
import type { SyncItemState } from '../../types/sync-state'

export interface LabelCandidate {
  name: string
  description: string | null
}

export const ITEM_BODY_LIMIT = 6000

/** Up to `perLabel` titles of the most recently updated items carrying each label, as few-shot examples. */
export function sampleLabelExamples(items: SyncItemState[], labels: LabelCandidate[], perLabel: number, exclude: Set<number>): Record<string, string[]> {
  const sorted = [...items]
    .filter(item => !exclude.has(item.number))
    .sort((a, b) => b.data.item.updatedAt.localeCompare(a.data.item.updatedAt))
  const examples: Record<string, string[]> = {}
  for (const label of labels) {
    examples[label.name] = sorted
      .filter(item => item.data.item.labels.includes(label.name))
      .slice(0, perLabel)
      .map(item => item.data.item.title)
  }
  return examples
}

export function buildLabelQuestions(labels: LabelCandidate[], examples: Record<string, string[]>): Record<string, ClassifierBoolQuestion> {
  const questions: Record<string, ClassifierBoolQuestion> = {}
  for (const label of labels) {
    const titles = examples[label.name] ?? []
    const fits = [
      `Belongs under "${label.name}"${label.description ? `: ${label.description}` : ''}.`,
      titles.length ? `Items already carrying this label: ${titles.map(t => `"${t}"`).join('; ')}.` : '',
    ].filter(Boolean).join(' ')
    questions[label.name] = {
      type: 'bool',
      instructions: `Should this item carry the label "${label.name}"?`,
      criteria: { true: fits, false: `Does not belong under "${label.name}".` },
    }
  }
  return questions
}

export interface ItemStateOptions {
  guidelines?: string
  /** Notes gathered by the context agent, appended on the second pass. */
  notes?: string
}

export function buildItemState(item: ProviderItem, options: ItemStateOptions = {}): JsonObject {
  const body = item.body ?? ''
  const state: JsonObject = {
    kind: item.kind === 'pull' ? 'pull request' : 'issue',
    title: item.title,
    body: body.length > ITEM_BODY_LIMIT ? `${body.slice(0, ITEM_BODY_LIMIT)}\n(truncated)` : body,
  }
  if (item.labels.length)
    state.currentLabels = item.labels
  if (options.guidelines)
    state.labelingGuidelines = options.guidelines
  if (options.notes)
    state.additionalContext = options.notes
  return state
}

export interface LabelDecision {
  labels: string[]
  confidence: Record<string, number>
}

/** Labels whose probability clears the threshold, highest first. */
export function pickLabels(probabilities: Record<string, number>, threshold: number): LabelDecision {
  const labels = Object.entries(probabilities)
    .filter(([, p]) => p >= threshold)
    .sort((a, b) => b[1] - a[1])
    .map(([label]) => label)
  const confidence: Record<string, number> = {}
  for (const label of labels)
    confidence[label] = round(probabilities[label]!)
  return { labels, confidence }
}

/**
 * Labels the model neither accepted nor clearly rejected: between half the
 * threshold and the threshold. Any such label is grounds to gather more context.
 */
export function uncertainLabels(probabilities: Record<string, number>, threshold: number): string[] {
  const floor = threshold / 2
  return Object.entries(probabilities)
    .filter(([, p]) => p >= floor && p < threshold)
    .sort((a, b) => b[1] - a[1])
    .map(([label]) => label)
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

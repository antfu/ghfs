import type { AgentContext, AgentEvent, AgentLoopConfig, AgentMessage } from '@earendil-works/pi-agent-core'
import type { AssistantMessage } from '@earendil-works/pi-ai'
import type { AiRuntime } from '../runtime'
import type { AgentContextSource } from './tools'
import { runAgentLoop } from '@earendil-works/pi-agent-core'
import { ITEM_BODY_LIMIT } from '../labeling/questions'
import { createContextTools, createLedger } from './tools'

export const MAX_TURNS = 8
const READ_BUDGET_CHARS = 80_000

export interface LabelCandidateHint {
  name: string
  description: string | null
  probability: number
}

export interface GatherContextOptions {
  /** Labels the decision model was unsure about; the agent investigates these. */
  candidates: LabelCandidateHint[]
  guidelines?: string
  signal?: AbortSignal
  onEvent?: (event: AgentEvent) => void
}

const SYSTEM_PROMPT = [
  'You help triage GitHub issues and pull requests for a repository mirrored locally.',
  'A decision model scored every label for one item and was unsure about a few.',
  'Your job is to gather the facts a maintainer would need to settle those labels: read comments, the patch, linked items, or similar items as needed.',
  'Then call submit_context with concise, factual notes. Do not decide the labels yourself and do not call submit_context before looking at least once.',
].join(' ')

function buildPrompt(source: AgentContextSource, options: GatherContextOptions): string {
  const { item } = source.item.data
  const body = (item.body ?? '').slice(0, ITEM_BODY_LIMIT)
  const candidates = options.candidates
    .map(c => `- "${c.name}" (p=${c.probability.toFixed(2)})${c.description ? `: ${c.description}` : ''}`)
    .join('\n')
  return [
    `# ${item.kind === 'pull' ? 'Pull request' : 'Issue'} #${item.number}: ${item.title}`,
    item.labels.length ? `Current labels: ${item.labels.join(', ')}` : '',
    '',
    body || '(empty body)',
    '',
    '## Uncertain labels',
    candidates,
    options.guidelines ? `\n## Labeling guidelines\n${options.guidelines}` : '',
  ].filter(line => line !== undefined).join('\n')
}

/** Runs the tool-using agent and returns its notes, or `undefined` when it gave up without submitting. */
export async function gatherItemContext(runtime: AiRuntime, source: AgentContextSource, options: GatherContextOptions): Promise<string | undefined> {
  const ledger = createLedger()
  let steered = false
  let nudged = false

  const context: AgentContext = {
    messages: [{ role: 'system', content: SYSTEM_PROMPT, timestamp: Date.now() }],
    tools: createContextTools(source, ledger),
  }
  const prompt: AgentMessage = { role: 'user', content: buildPrompt(source, options), timestamp: Date.now() }

  const config: AgentLoopConfig = {
    model: runtime.agentModel,
    apiKey: runtime.apiKey,
    convertToLlm: messages => messages,
    getSteeringMessages: async () => {
      if (steered || (ledger.charsRead <= READ_BUDGET_CHARS && ledger.turn < MAX_TURNS - 1))
        return []
      steered = true
      return [{ role: 'user', content: 'Reading budget exhausted. Call submit_context now with what you have.', timestamp: Date.now() }]
    },
    getFollowUpMessages: async () => {
      if (nudged || ledger.notes !== undefined)
        return []
      nudged = true
      return [{ role: 'user', content: 'Call submit_context now.', timestamp: Date.now() }]
    },
    finishTurn: ({ message }) => {
      if (message.stopReason === 'error' || message.stopReason === 'aborted')
        return undefined
      if (ledger.notes !== undefined || ledger.turn >= MAX_TURNS)
        return { action: 'end' }
      return undefined
    },
  }

  const emit = (event: AgentEvent) => {
    if (event.type === 'turn_start')
      ledger.turn += 1
    options.onEvent?.(event)
  }

  const newMessages = await runAgentLoop(
    [prompt],
    context,
    config,
    emit,
    options.signal,
    (model, transcript, streamOptions) => runtime.models.streamSimple(model, transcript, streamOptions),
  )

  const last = newMessages.findLast((message): message is AssistantMessage => message.role === 'assistant')
  if (last?.stopReason === 'aborted' || options.signal?.aborted)
    throw new DOMException('Aborted', 'AbortError')
  if (last?.stopReason === 'error')
    throw new Error(last.errorMessage ?? 'Agent request failed')

  return ledger.notes || undefined
}

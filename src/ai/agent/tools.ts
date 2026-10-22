import type { AgentTool } from '@earendil-works/pi-agent-core'
import type { SyncItemState } from '../../types/sync-state'
import { Type } from '@earendil-works/pi-ai'
import { collectItemReferences } from '../../graph/model'
import { sharedTokenCount, titleTokens } from '../../utils/tokens'

export const READ_CALL_CHAR_CAP = 30_000
const EXCERPT_CHARS = 500
const SIMILAR_LIMIT = 8

/** What the agent may look at: the item under triage plus the rest of the local mirror. */
export interface AgentContextSource {
  item: SyncItemState
  items: SyncItemState[]
  readPatch: () => Promise<string | null>
}

export interface ContextLedger {
  turn: number
  charsRead: number
  notes?: string
}

export function createLedger(): ContextLedger {
  return { turn: 0, charsRead: 0 }
}

function cap(text: string): string {
  return text.length > READ_CALL_CHAR_CAP ? `${text.slice(0, READ_CALL_CHAR_CAP)}\n(truncated)` : text
}

function excerpt(body: string | null): string {
  const text = (body ?? '').trim()
  return text.length > EXCERPT_CHARS ? `${text.slice(0, EXCERPT_CHARS)}…` : text
}

function describeItem(item: SyncItemState): string {
  const { title, state, labels, kind } = item.data.item
  const labelText = labels.length ? labels.join(', ') : 'none'
  return `#${item.number} [${kind}, ${state}] ${title}\nlabels: ${labelText}\n${excerpt(item.data.item.body)}`
}

function textResult(ledger: ContextLedger, text: string) {
  const content = cap(text)
  ledger.charsRead += content.length
  return { content: [{ type: 'text' as const, text: content }], details: { chars: content.length } }
}

const NoParams = Type.Object({})

export function createReadCommentsTool(source: AgentContextSource, ledger: ContextLedger): AgentTool<typeof NoParams> {
  return {
    name: 'read_comments',
    label: 'Read comments',
    description: 'Returns the discussion comments on the item under triage, oldest first.',
    parameters: NoParams,
    execute: async () => {
      const comments = source.item.data.comments
      if (comments.length === 0)
        return textResult(ledger, '(no comments)')
      return textResult(ledger, comments.map(c => `@${c.author ?? 'ghost'} (${c.createdAt}):\n${c.body}`).join('\n\n---\n\n'))
    },
  }
}

export function createReadPatchTool(source: AgentContextSource, ledger: ContextLedger): AgentTool<typeof NoParams> {
  return {
    name: 'read_patch',
    label: 'Read patch',
    description: 'Returns the unified diff of the pull request under triage.',
    parameters: NoParams,
    execute: async () => textResult(ledger, (await source.readPatch()) ?? '(no patch available locally)'),
  }
}

export function createReadLinkedItemsTool(source: AgentContextSource, ledger: ContextLedger): AgentTool<typeof NoParams> {
  return {
    name: 'read_linked_items',
    label: 'Read linked items',
    description: 'Returns the issues and pull requests referenced by, or referencing, the item under triage, with their labels.',
    parameters: NoParams,
    execute: async () => {
      const byNumber = new Map(source.items.map(item => [item.number, item]))
      const linked = collectItemReferences(source.item).map(ref => byNumber.get(ref.number)).filter(item => item !== undefined)
      if (linked.length === 0)
        return textResult(ledger, '(no linked items synced locally)')
      return textResult(ledger, linked.map(describeItem).join('\n\n'))
    },
  }
}

const FindSimilarParams = Type.Object({
  query: Type.String({ description: 'Keywords to look for in item titles.' }),
})

export function findSimilarItems(items: SyncItemState[], query: string, exclude: number): SyncItemState[] {
  const wanted = titleTokens(query)
  if (wanted.size === 0)
    return []
  return items
    .filter(item => item.number !== exclude)
    .map(item => ({ item, score: sharedTokenCount(titleTokens(item.data.item.title), wanted) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.item.data.item.updatedAt.localeCompare(a.item.data.item.updatedAt))
    .slice(0, SIMILAR_LIMIT)
    .map(entry => entry.item)
}

export function createFindSimilarTool(source: AgentContextSource, ledger: ContextLedger): AgentTool<typeof FindSimilarParams> {
  return {
    name: 'find_similar',
    label: 'Find similar items',
    description: 'Finds locally synced issues and pull requests whose titles share keywords with the query, with their labels. Useful to see how comparable items were labeled.',
    parameters: FindSimilarParams,
    execute: async (_id, { query }) => {
      const similar = findSimilarItems(source.items, query, source.item.number)
      if (similar.length === 0)
        return textResult(ledger, '(no similar items)')
      return textResult(ledger, similar.map(describeItem).join('\n\n'))
    },
  }
}

const SubmitContextParams = Type.Object({
  notes: Type.String({ description: 'Concise factual notes about the item that bear on which labels apply.' }),
})

export function createSubmitContextTool(ledger: ContextLedger): AgentTool<typeof SubmitContextParams> {
  return {
    name: 'submit_context',
    label: 'Submit context',
    description: 'Ends the investigation. Pass the facts you gathered that help decide the uncertain labels; do not pick labels yourself.',
    parameters: SubmitContextParams,
    execute: async (_id, { notes }) => {
      ledger.notes = notes.trim()
      return { content: [{ type: 'text' as const, text: 'Context recorded.' }], details: undefined, terminate: true }
    },
  }
}

export function createContextTools(source: AgentContextSource, ledger: ContextLedger): AgentTool<any>[] {
  const tools: AgentTool<any>[] = [
    createReadCommentsTool(source, ledger),
    createReadLinkedItemsTool(source, ledger),
    createFindSimilarTool(source, ledger),
    createSubmitContextTool(ledger),
  ]
  if (source.item.kind === 'pull')
    tools.splice(1, 0, createReadPatchTool(source, ledger))
  return tools
}

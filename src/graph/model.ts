import type { IssueKind, IssueState } from '../types/issue'
import type { SyncItemState, SyncState } from '../types/sync-state'

export interface GraphItemNode {
  kind: 'item'
  id: string
  number: number
  itemKind: IssueKind
  state: IssueState
  merged: boolean
  draft: boolean
  title: string
  labels: string[]
  updatedAt: string
}

export interface GraphLabelNode {
  kind: 'label'
  id: string
  name: string
  color: string
}

export type GraphNode = GraphItemNode | GraphLabelNode

export type GraphEdgeKind
  /** Item carries this label; the layout pulls items toward their label anchors. */
  = | 'label'
  /** Mentioned / cross-referenced on GitHub. */
    | 'reference'
  /** Pull request closes the issue (GitHub "connected", or `closes #N` in the body). */
    | 'closes'
  /** Marked as duplicate on GitHub. */
    | 'duplicate'
  /** Closed by the same commit. */
    | 'closed-together'
  /** Flagged by the decision model; `confidence` is its probability. */
    | 'suspected-duplicate'

export interface GraphEdge {
  source: string
  target: string
  kind: GraphEdgeKind
  confidence?: number
}

export interface GraphModel {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export const UNLABELED_NODE_ID = 'label:'

export function itemNodeId(number: number): string {
  return `#${number}`
}

export function labelNodeId(name: string): string {
  return `label:${name}`
}

export interface ItemReference {
  number: number
  kind: Exclude<GraphEdgeKind, 'label' | 'suspected-duplicate' | 'closed-together'>
}

const CLOSES_RE = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)\b/gi
const MENTION_RE = /(?:^|[^\w&])#(\d+)\b/g

const REFERENCE_STRENGTH: Record<ItemReference['kind'], number> = { reference: 0, closes: 1, duplicate: 2 }

/** References to other items in this repository, from the timeline and the body. The strongest kind wins per item. */
export function collectItemReferences(item: SyncItemState): ItemReference[] {
  const refs = new Map<number, ItemReference>()
  const add = (ref: ItemReference) => {
    if (ref.number === item.number)
      return
    const current = refs.get(ref.number)
    if (!current || REFERENCE_STRENGTH[ref.kind] > REFERENCE_STRENGTH[current.kind])
      refs.set(ref.number, ref)
  }
  for (const event of item.data.timeline ?? []) {
    if (!('source' in event) || !event.source || event.source.repo)
      continue
    if (event.kind === 'marked_as_duplicate')
      add({ number: event.source.number, kind: 'duplicate' })
    else if (event.kind === 'connected')
      add({ number: event.source.number, kind: 'closes' })
    else if (event.kind === 'cross-referenced' || event.kind === 'referenced')
      add({ number: event.source.number, kind: 'reference' })
  }
  const body = item.data.item.body ?? ''
  for (const match of body.matchAll(MENTION_RE))
    add({ number: Number(match[1]), kind: 'reference' })
  for (const match of body.matchAll(CLOSES_RE))
    add({ number: Number(match[1]), kind: item.kind === 'pull' ? 'closes' : 'reference' })
  return [...refs.values()]
}

function closingSha(item: SyncItemState): string | undefined {
  const events = item.data.timeline ?? []
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]!
    if (event.kind === 'closed' || event.kind === 'merged')
      return event.sha
  }
  return undefined
}

export interface BuildGraphModelOptions {
  labels: Array<{ name: string, color: string }>
  /** Include every closed item; by default only closed items linked to an open one appear. */
  includeClosed?: boolean
}

export function buildGraphModel(syncState: SyncState, options: BuildGraphModelOptions): GraphModel {
  const items = Object.values(syncState.items)
  const byNumber = new Map(items.map(item => [item.number, item]))

  const edgeKeys = new Set<string>()
  const edges: GraphEdge[] = []
  const addEdge = (a: string, b: string, kind: GraphEdgeKind) => {
    const key = a < b ? `${kind}|${a}|${b}` : `${kind}|${b}|${a}`
    if (edgeKeys.has(key))
      return
    edgeKeys.add(key)
    edges.push({ source: a, target: b, kind })
  }

  for (const item of items) {
    for (const ref of collectItemReferences(item)) {
      if (!byNumber.has(ref.number))
        continue
      // A pull closes an issue regardless of which side recorded the link.
      const [source, target] = ref.kind === 'closes' && item.kind === 'issue'
        ? [itemNodeId(ref.number), itemNodeId(item.number)]
        : [itemNodeId(item.number), itemNodeId(ref.number)]
      addEdge(source, target, ref.kind)
    }
  }

  const bySha = new Map<string, SyncItemState[]>()
  for (const item of items) {
    const sha = item.state === 'closed' ? closingSha(item) : undefined
    if (sha)
      bySha.set(sha, [...(bySha.get(sha) ?? []), item])
  }
  for (const group of bySha.values()) {
    const pull = group.find(item => item.kind === 'pull')
    for (const item of group) {
      if (pull && item !== pull)
        addEdge(itemNodeId(pull.number), itemNodeId(item.number), 'closes')
    }
    const issues = group.filter(item => item.kind === 'issue')
    for (let i = 1; i < issues.length; i++)
      addEdge(itemNodeId(issues[0]!.number), itemNodeId(issues[i]!.number), 'closed-together')
  }

  const linkedToOpen = new Set<string>()
  for (const edge of edges) {
    const a = byNumber.get(Number(edge.source.slice(1)))
    const b = byNumber.get(Number(edge.target.slice(1)))
    if (a?.state === 'open')
      linkedToOpen.add(edge.target)
    if (b?.state === 'open')
      linkedToOpen.add(edge.source)
  }

  const visible = items.filter(item => item.state === 'open' || options.includeClosed || linkedToOpen.has(itemNodeId(item.number)))
  const visibleIds = new Set(visible.map(item => itemNodeId(item.number)))

  const nodes: GraphNode[] = visible.map(item => ({
    kind: 'item',
    id: itemNodeId(item.number),
    number: item.number,
    itemKind: item.kind,
    state: item.state,
    merged: item.data.pull?.merged ?? false,
    draft: item.data.pull?.isDraft ?? false,
    title: item.data.item.title,
    labels: item.data.item.labels,
    updatedAt: item.data.item.updatedAt,
  }))

  const usedLabels = new Set(visible.flatMap(item => item.data.item.labels))
  const labelColor = new Map(options.labels.map(label => [label.name, label.color]))
  for (const name of [...usedLabels].sort())
    nodes.push({ kind: 'label', id: labelNodeId(name), name, color: labelColor.get(name) ?? '8b949e' })
  if (visible.some(item => item.data.item.labels.length === 0))
    nodes.push({ kind: 'label', id: UNLABELED_NODE_ID, name: 'unlabeled', color: '8b949e' })

  for (const item of visible) {
    const id = itemNodeId(item.number)
    if (item.data.item.labels.length === 0)
      edges.push({ source: id, target: UNLABELED_NODE_ID, kind: 'label' })
    for (const name of item.data.item.labels)
      edges.push({ source: id, target: labelNodeId(name), kind: 'label' })
  }

  return {
    nodes,
    edges: edges.filter(edge => edge.kind === 'label' || (visibleIds.has(edge.source) && visibleIds.has(edge.target))),
  }
}

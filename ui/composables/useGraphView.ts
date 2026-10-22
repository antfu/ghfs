import type { GraphEdge, GraphModel } from '#ghfs/graph-model'
import type { DuplicateDetectionRun } from '#ghfs/rpc-types'
import { computed, ref } from 'vue'
import { buildGraphModel, itemNodeId } from '#ghfs/graph-model'
import { useAppState } from './useAppState'
import { useHubState } from './useHubState'
import { useRpc } from './useRpc'

const includeClosed = ref(false)
const findingDuplicates = ref(false)
/** Last duplicate scan per project; survives navigation so the edges don't vanish on return. */
const duplicateRuns = ref(new Map<string, DuplicateDetectionRun>())

export function useGraphView(projectId: () => string) {
  const rpc = useRpc()
  const hub = useHubState()
  const state = computed(() => useAppState(projectId()))

  const suspected = computed(() => duplicateRuns.value.get(projectId()) ?? null)

  const model = computed<GraphModel | null>(() => {
    const payload = state.value.payload.value
    if (!payload)
      return null
    const base = buildGraphModel(payload.syncState, { labels: payload.repositoryLabels, includeClosed: includeClosed.value })
    const threshold = 0.7
    const edges: GraphEdge[] = (suspected.value?.pairs ?? [])
      .filter(pair => pair.probability >= threshold)
      .map(pair => ({ source: itemNodeId(pair.a), target: itemNodeId(pair.b), kind: 'suspected-duplicate', confidence: pair.probability }))
    return { nodes: base.nodes, edges: [...base.edges, ...edges] }
  })

  /** Route to an item: `/N` in single-project mode, `/owner/repo/N` in the hub. */
  function itemRoute(number: number): string {
    const project = hub.projects.value.find(p => p.id === projectId())
    return hub.capabilities.value?.mode === 'hub' && project ? `/${project.repo}/${number}` : `/${number}`
  }

  function listRoute(): string {
    const project = hub.projects.value.find(p => p.id === projectId())
    return hub.capabilities.value?.mode === 'hub' && project ? `/${project.repo}` : '/'
  }

  async function findDuplicates() {
    if (findingDuplicates.value)
      return
    findingDuplicates.value = true
    state.value.setError(null)
    try {
      const run = await rpc.$call('ghfs:find-duplicates', projectId())
      duplicateRuns.value = new Map(duplicateRuns.value).set(projectId(), run)
      if (run.pairs.length === 0)
        state.value.setError(`Checked ${run.candidates} candidate pair${run.candidates === 1 ? '' : 's'}; none look like duplicates.`)
    }
    catch (error) {
      state.value.setError(`Duplicate detection failed: ${(error as Error).message}`)
    }
    finally {
      findingDuplicates.value = false
    }
  }

  async function queueLabel(number: number, label: string) {
    try {
      await rpc.$call('ghfs:add-queue-op', projectId(), { action: 'add-labels', number, labels: [label] })
    }
    catch (error) {
      state.value.setError((error as Error).message)
    }
  }

  /** Closes the newer item as a duplicate of the older one, attributing the call to the model. */
  async function queueCloseAsDuplicate(edge: GraphEdge) {
    const [a, b] = [Number(edge.source.slice(1)), Number(edge.target.slice(1))]
    const [older, newer] = a < b ? [a, b] : [b, a]
    const model = suspected.value?.model ?? 'ai'
    try {
      await rpc.$call('ghfs:add-queue-op', projectId(), {
        action: 'close-with-comment',
        number: newer,
        body: `Duplicate of #${older}`,
        ...(edge.confidence != null ? { origin: { kind: 'ai', model, confidence: { [`#${older}`]: edge.confidence } } } : {}),
      })
    }
    catch (error) {
      state.value.setError((error as Error).message)
    }
  }

  return {
    model,
    includeClosed,
    suspected,
    findingDuplicates,
    findDuplicates,
    queueLabel,
    queueCloseAsDuplicate,
    itemRoute,
    listRoute,
  }
}

<script setup lang="ts">
import type { GraphEdge, GraphNode } from '#ghfs/graph-model'
import { computed, ref, watch } from 'vue'
import { useRouter } from '#imports'
import { useActiveProjectId, useAppState } from '../../composables/useAppState'
import { useGraphView } from '../../composables/useGraphView'
import { useProjectPayload } from '../../composables/useProjectPayload'
import DisplayLabel from '../display/Label.vue'
import UiEmptyState from '../ui/EmptyState.vue'
import UiIconButton from '../ui/IconButton.vue'
import UiProgressToast from '../ui/ProgressToast.vue'
import UiWithCommand from '../ui/WithCommand.vue'
import GraphCanvas from '../graph/Canvas.vue'
import PanelAppBar from './AppBar.vue'
import PanelQueue from './Queue.vue'

const props = defineProps<{ projectId: string }>()

const activeId = useActiveProjectId()
activeId.value = props.projectId
const state = useAppState(props.projectId)
const payload = useProjectPayload()
const router = useRouter()
const graph = useGraphView(() => props.projectId)

watch(() => props.projectId, (id) => {
  activeId.value = id
  state.selectItem(null)
  payload.ensureLoaded(id)
}, { immediate: true })

const canvas = ref<InstanceType<typeof GraphCanvas>>()
const hasAi = computed(() => state.payload.value?.repo.hasAi ?? false)
const itemCount = computed(() => graph.model.value?.nodes.filter(n => n.kind === 'item').length ?? 0)
const linkCount = computed(() => graph.model.value?.edges.filter(e => e.kind !== 'label').length ?? 0)

const hover = ref<{ node?: GraphNode, edge?: GraphEdge, x: number, y: number } | null>(null)

const EDGE_LABELS: Record<GraphEdge['kind'], string> = {
  'label': 'label',
  'reference': 'referenced',
  'closes': 'closes',
  'duplicate': 'marked duplicate',
  'closed-together': 'closed by the same commit',
  'suspected-duplicate': 'suspected duplicate',
}

const LEGEND: Array<{ kind: GraphEdge['kind'], class: string }> = [
  { kind: 'reference', class: 'border-t border-#888' },
  { kind: 'closes', class: 'border-t-2 border-green-600' },
  { kind: 'duplicate', class: 'border-t-2 border-dashed border-red-600' },
  { kind: 'closed-together', class: 'border-t-2 border-dotted border-purple-600' },
  { kind: 'suspected-duplicate', class: 'border-t-2 border-dashed border-orange-700' },
]

function onSelect(number: number) {
  router.push(graph.itemRoute(number))
}

function onEdgeClick(edge: GraphEdge) {
  if (edge.kind === 'suspected-duplicate')
    graph.queueCloseAsDuplicate(edge)
}
</script>

<template>
  <div class="h-full flex flex-col" data-testid="graph-page">
    <PanelAppBar mode="project" />

    <div class="flex items-center gap-2 px-4 py-2 border-b border-base text-xs">
      <span class="color-muted tabular-nums">{{ itemCount }} items · {{ linkCount }} links</span>
      <div class="flex items-center gap-3 ml-3">
        <span
          v-for="entry in LEGEND"
          :key="entry.kind"
          class="inline-flex items-center gap-1.5 color-muted"
        >
          <span class="inline-block w-4" :class="entry.class" />
          {{ EDGE_LABELS[entry.kind] }}
        </span>
      </div>
      <div class="flex-auto" />
      <button
        type="button"
        class="btn-action text-xs"
        :class="graph.includeClosed.value ? 'btn-action-active' : ''"
        data-testid="graph-include-closed"
        @click="graph.includeClosed.value = !graph.includeClosed.value"
      >
        <span class="i-octicon-issue-closed-16" />
        Show closed
      </button>
      <UiWithCommand v-if="hasAi" v-slot="{ execute, disabled }" command="graph.find-duplicates">
        <button
          type="button"
          class="btn-action text-xs"
          :disabled="disabled"
          data-testid="graph-find-duplicates"
          @click="execute"
        >
          <span :class="graph.findingDuplicates.value ? 'i-ph-circle-notch-duotone animate-spin' : 'i-ph-sparkle-duotone'" />
          {{ graph.findingDuplicates.value ? 'Checking pairs…' : 'Find duplicates' }}
        </button>
      </UiWithCommand>
      <UiIconButton
        icon="i-ph-crosshair-duotone"
        size="sm"
        tooltip="Reset view"
        @click="canvas?.resetView()"
      />
    </div>

    <div class="relative flex-1 min-h-0">
      <UiEmptyState
        v-if="!graph.model.value"
        icon="i-ph-graph-duotone"
        :title="payload.loading.value ? 'Loading…' : 'No data'"
        :message="payload.error.value ?? undefined"
        size="lg"
      />
      <GraphCanvas
        v-else
        ref="canvas"
        :model="graph.model.value"
        :selected-number="state.selectedNumber.value"
        data-testid="graph-canvas"
        @select="onSelect"
        @drop-on-label="graph.queueLabel"
        @edge-click="onEdgeClick"
        @hover="hover = $event"
      />
      <PanelQueue />
      <UiProgressToast :key="projectId" />
      <p class="absolute bottom-3 left-4 text-xs color-faint pointer-events-none">
        Drag an item onto a label to queue it · click a suspected duplicate link to queue a close
      </p>

      <div
        v-if="hover?.node?.kind === 'item'"
        class="fixed z-dropdown panel-floating rounded-lg px-3 py-2 text-xs max-w-xs pointer-events-none"
        :style="{ left: `${hover.x + 12}px`, top: `${hover.y + 12}px` }"
      >
        <div class="flex items-center gap-1.5">
          <span class="font-mono color-muted">#{{ hover.node.number }}</span>
          <span class="color-base truncate">{{ hover.node.title }}</span>
        </div>
        <div v-if="hover.node.labels.length" class="flex flex-wrap gap-1 mt-1.5">
          <DisplayLabel v-for="label in hover.node.labels" :key="label" :name="label" />
        </div>
      </div>
      <div
        v-else-if="hover?.edge"
        class="fixed z-dropdown panel-floating rounded-lg px-3 py-2 text-xs pointer-events-none"
        :style="{ left: `${hover.x + 12}px`, top: `${hover.y + 12}px` }"
      >
        {{ hover.edge.source }} → {{ hover.edge.target }} · {{ EDGE_LABELS[hover.edge.kind] }}
        <span v-if="hover.edge.confidence != null" class="color-muted"> {{ Math.round(hover.edge.confidence * 100) }}%</span>
      </div>
    </div>
  </div>
</template>

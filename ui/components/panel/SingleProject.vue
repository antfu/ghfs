<script setup lang="ts">
import { computed, watch } from 'vue'
import { useActiveProjectId, useAppState } from '../../composables/useAppState'
import { useFilteredItems } from '../../composables/useFilteredItems'
import { useHubState } from '../../composables/useHubState'
import { useProjectPayload } from '../../composables/useProjectPayload'
import { useSelectedItemSync } from '../../composables/useSelectedItemSync'
import type { ListItem } from '../../types/list-item'
import UiIconButton from '../ui/IconButton.vue'
import UiWithCommand from '../ui/WithCommand.vue'
import PanelAppBar from './AppBar.vue'
import PanelProject from './Project.vue'

const props = defineProps<{
  projectId: string
  initialNumber?: number | null
}>()

const activeId = useActiveProjectId()
// Set the active project id synchronously so descendant composables
// (PanelAppBar, ItemList, PanelDetail) all read from the same bucket.
activeId.value = props.projectId

const state = useAppState(props.projectId)
useSelectedItemSync(() => props.projectId, () => props.initialNumber ?? null)

const { filteredItems, counts } = useFilteredItems()
const payload = useProjectPayload()
const hub = useHubState()

const hasPayload = computed(() => Boolean(state.payload.value))

const project = computed(() => hub.projects.value.find(p => p.id === props.projectId) ?? null)

const searching = computed(() => state.filters.search.trim().length > 0)

const cardsTooltip = computed(() => {
  const n = filteredItems.value.length
  if (n === 0)
    return 'No items to triage'
  return `Start a card pile — triage ${Math.min(n, 10)} ${n === 1 ? 'item' : 'items'}`
})

const selectedKey = computed(() => {
  const number = state.selectedNumber.value
  if (number == null)
    return null
  return filteredItems.value.find(it => it.number === number)?.key ?? null
})

watch(() => props.projectId, (id) => {
  activeId.value = id
  payload.loadInitial(id)
}, { immediate: true })

watch(filteredItems, (entries) => {
  if (state.selectedNumber.value == null)
    return
  if (!entries.some(e => e.number === state.selectedNumber.value))
    state.selectItem(null)
}, { flush: 'post' })

function onSelect(item: ListItem) {
  state.selectItem(item.number)
}
</script>

<template>
  <div class="h-full flex flex-col">
    <PanelAppBar mode="project" />
    <PanelProject
      :items="filteredItems"
      :selected-key="selectedKey"
      :search-highlight="state.filters.search"
      :loading="payload.loading.value"
      :load-error="payload.error.value"
      :has-payload="hasPayload"
      header-variant="project"
      :project="project"
      :projects="hub.projects.value"
      :search="state.filters.search"
      :kind="state.filters.kind"
      :counts="counts"
      :searching="searching"
      search-placeholder="Search title, body, author, labels…"
      @select="onSelect"
      @update:search="(v: string) => state.filters.search = v"
    >
      <template #header-actions>
        <UiWithCommand v-slot="{ execute, disabled }" command="cards.start" placement="badge">
          <UiIconButton
            icon="i-ph-cards-three-duotone"
            :tooltip="cardsTooltip"
            aria-label="Start a card pile"
            data-testid="list-header-cards-mode"
            :disabled="disabled || filteredItems.length === 0"
            @click="execute"
          />
        </UiWithCommand>
      </template>
    </PanelProject>
  </div>
</template>

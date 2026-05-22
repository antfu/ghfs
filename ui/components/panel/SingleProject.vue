<script setup lang="ts">
import type { ListItem } from '../../types/list-item'

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

const { filteredItems } = useFilteredItems()
const payload = useProjectPayload()

const hasPayload = computed(() => Boolean(state.payload.value))

const selectedKey = computed(() => {
  const number = state.selectedNumber.value
  if (number == null)
    return null
  return filteredItems.value.find(it => it.number === number)?.key ?? null
})

watch(() => props.projectId, (id) => {
  activeId.value = id
  // Don't clear selection or payload — keep showing cached data so the
  // navigation feels instant. The bucket is per-project anyway, so any
  // previously-loaded data for *this* id is still correct.
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
      @select="onSelect"
    />
  </div>
</template>

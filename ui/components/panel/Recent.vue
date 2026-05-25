<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useActiveProjectId } from '../../composables/useAppState'
import { useHubRecent } from '../../composables/useHubRecent'
import { useHubState } from '../../composables/useHubState'
import { useRecentFiltered } from '../../composables/useRecentFiltered'
import type { ListItem } from '../../types/list-item'
import UiIconButton from '../ui/IconButton.vue'
import UiWithCommand from '../ui/WithCommand.vue'
import PanelAppBar from './AppBar.vue'
import PanelProject from './Project.vue'

const recent = useHubRecent()
const hub = useHubState()
const { filteredItems, search, kind, counts } = useRecentFiltered()
const activeId = useActiveProjectId()

// Start fresh on every entry: clear any leftover selection synchronously so
// PanelDetail shows its empty state instead of briefly flashing a previous
// project's item.
recent.selectKey(null)
activeId.value = null

onMounted(() => {
  recent.load()
})

const cardsTooltip = computed(() => {
  const n = filteredItems.value.length
  if (n === 0)
    return 'No items to triage'
  return `Start a card pile — triage ${Math.min(n, 10)} ${n === 1 ? 'item' : 'items'}`
})

const hasPayload = computed(() => recent.items.value.length > 0)
const loading = computed(() => recent.loading.value && !hasPayload.value)
const loadError = computed(() => (hasPayload.value ? null : recent.error.value))
const searching = computed(() => search.value.trim().length > 0)

function onSelect(item: ListItem) {
  void recent.selectItem(item)
}
</script>

<template>
  <div class="h-full flex flex-col" data-testid="hub-recent-page">
    <PanelAppBar mode="hub" />

    <PanelProject
      :items="filteredItems"
      :selected-key="recent.selectedKey.value"
      :search-highlight="search"
      :show-repo-name="true"
      :loading="loading"
      :load-error="loadError"
      :has-payload="hasPayload"
      header-variant="recent"
      :projects="hub.projects.value"
      :search="search"
      :kind="kind"
      :counts="counts"
      :searching="searching"
      search-placeholder="Search across all projects…"
      empty-title="No recent activity"
      empty-message="Enable projects in the hub and sync them to see items here."
      @select="onSelect"
      @update:search="(v: string) => search = v"
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

<script setup lang="ts">
import type { ListItem } from '../../types/list-item'

const recent = useHubRecent()
const { filteredItems, search } = useRecentFiltered()
const activeId = useActiveProjectId()

// Start fresh on every entry: clear any leftover selection synchronously so
// PanelDetail shows its empty state instead of briefly flashing a previous
// project's item.
recent.selectKey(null)
activeId.value = null

onMounted(() => {
  recent.load()
})

function onSelect(item: ListItem) {
  void recent.selectItem(item)
}
</script>

<template>
  <div class="h-full flex flex-col" data-testid="hub-recent-page">
    <PanelAppBar mode="hub" />

    <main class="flex-1 min-h-0">
      <UiEmptyState
        v-if="recent.loading.value && recent.items.value.length === 0"
        icon="i-octicon-sync-16"
        title="Loading recent activity…"
      />
      <UiEmptyState
        v-else-if="recent.error.value"
        icon="i-ph-warning-duotone"
        :title="`Failed to load: ${recent.error.value}`"
      />
      <UiEmptyState
        v-else-if="recent.items.value.length === 0"
        icon="i-octicon-inbox-16"
        title="No recent activity"
        message="Enable projects in the hub and sync them to see items here."
      />
      <PanelProject
        v-else
        :items="filteredItems"
        :selected-key="recent.selectedKey.value"
        :search-highlight="search"
        :show-repo-name="true"
        @select="onSelect"
      />
    </main>
  </div>
</template>

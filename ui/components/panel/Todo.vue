<script setup lang="ts">
import type { ListItem } from '../../types/list-item'

const todos = useHubTodos()
const hub = useHubState()
const cards = useCardsMode()
const { ensureLoaded } = useProjectPayload()
const router = useRouter()

onMounted(() => {
  todos.load()
})

async function onSelect(item: ListItem) {
  await ensureLoaded(item.projectId)
  useActiveProjectId().value = item.projectId
  useAppState(item.projectId).selectItem(item.number)
  router.push(`/${item.repo}/${item.number}`)
}

function startCards() {
  if (todos.listItems.value.length === 0)
    return
  cards.openStartDialog(todos.listItems.value, { label: 'Todo' })
}
</script>

<template>
  <div class="h-full flex flex-col" data-testid="hub-todo-page">
    <PanelAppBar mode="hub" />

    <ItemListHeader
      variant="todo"
      title="Todo"
      :item-total="todos.items.value.length"
      :projects="hub.projects.value"
      :kind="todos.kind.value"
      :counts="todos.counts.value"
    >
      <template #actions>
        <UiIconButton
          v-if="todos.listItems.value.length > 0"
          icon="i-ph-cards-three-duotone"
          tooltip="Start a card pile"
          aria-label="Start a card pile"
          data-testid="todo-cards-mode"
          @click="startCards"
        />
      </template>
    </ItemListHeader>

    <main class="flex-1 min-h-0">
      <UiEmptyState
        v-if="todos.loading.value && todos.items.value.length === 0"
        icon="i-octicon-sync-16"
        title="Loading todo list…"
      />
      <UiEmptyState
        v-else-if="todos.error.value"
        icon="i-ph-warning-duotone"
        :title="`Failed to load: ${todos.error.value}`"
      />
      <UiEmptyState
        v-else-if="todos.items.value.length === 0"
        icon="i-ph-bookmark-simple-duotone"
        title="No items in your todo list"
        message="Mark items as todo while triaging a card pile to see them here."
      />
      <ItemList
        v-else
        :items="todos.filteredListItems.value"
        :selected-key="null"
        :show-repo-name="true"
        class="h-full"
        @select="onSelect"
      />
    </main>
  </div>
</template>

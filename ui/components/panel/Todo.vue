<script setup lang="ts">
import type { ListItem } from '../../types/list-item'

const todos = useHubTodos()
const cards = useCardsMode()
const { ensureLoaded } = useProjectPayload()
const router = useRouter()

onMounted(() => {
  todos.load()
})

async function onSelect(item: ListItem) {
  // Navigate to that project's detail view.
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

    <div class="flex items-center gap-3 px-4 py-2 border-b border-base">
      <h1 class="text-sm font-medium flex items-center gap-2">
        <span class="i-ph-bookmark-simple-duotone color-active" />
        Todo
        <span class="font-mono color-muted">{{ todos.items.value.length }}</span>
      </h1>
      <div class="flex-1" />
      <button
        v-if="todos.listItems.value.length > 0"
        type="button"
        class="btn-action-sm"
        data-testid="todo-cards-mode"
        @click="startCards"
      >
        <span class="i-ph-cards-three-duotone" />
        Start a pile
      </button>
    </div>

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
        :items="todos.listItems.value"
        :selected-key="null"
        :show-repo-name="true"
        class="h-full"
        @select="onSelect"
      />
    </main>
  </div>
</template>

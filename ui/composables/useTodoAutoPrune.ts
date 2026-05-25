import { watchEffect } from 'vue'
import { useAppState } from './useAppState'
import { useUiState } from './useUiState'

/**
 * Watches the active project's payload + todos list and removes any todo whose
 * underlying issue/PR has flipped to closed or merged. Runs once per `useTodoAutoPrune()`
 * mount, so call it from a long-lived root (e.g. `app.vue`).
 */
export function useTodoAutoPrune() {
  const ui = useUiState()
  const state = useAppState()

  watchEffect(() => {
    const payload = state.payload.value
    if (!payload)
      return
    const todos = ui.uiState.todos ?? []
    if (todos.length === 0)
      return

    const items = payload.syncState.items
    for (const n of todos) {
      const entry = items[String(n)]
      if (!entry)
        continue
      const data = entry.data
      const closed = data.item.state === 'closed'
      const merged = data.item.kind === 'pull' && Boolean(data.pull?.merged)
      if (closed || merged)
        ui.removeTodo(n)
    }
  })
}

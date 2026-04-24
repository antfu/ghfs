<script setup lang="ts">
import type { RepoLabel } from '#ghfs/server-types'

const state = useAppState()
const rpc = useRpc()
const ui = useUiState()
const isDark = useDark()

const selectedItem = computed(() => {
  const num = state.selectedNumber.value
  if (num == null)
    return null
  return state.payload.value?.syncState.items[String(num)] ?? null
})

const item = computed(() => selectedItem.value?.data.item ?? null)
const pending = usePendingOps(computed(() => item.value?.number ?? null))

const repoLabels = computed<RepoLabel[]>(() => state.payload.value?.repositoryLabels ?? [])

/**
 * Current labels taking a pending set-labels op into account, so opening the
 * editor a second time reflects the queued-but-not-yet-applied selection.
 */
const effectiveCurrentLabels = computed<string[]>(() => {
  const setOp = pending.entries.value.find(e => e.op.action === 'set-labels')
  if (setOp)
    return [...(setOp.op as { labels: string[] }).labels]
  return [...(item.value?.labels ?? [])]
})

const selected = ref<Set<string>>(new Set())
const query = ref('')
const highlighted = ref(0)

const filtered = computed<RepoLabel[]>(() => {
  const q = query.value.trim().toLowerCase()
  if (!q)
    return repoLabels.value
  return repoLabels.value.filter(l =>
    l.name.toLowerCase().includes(q)
    || (l.description?.toLowerCase().includes(q) ?? false),
  )
})

watch(() => ui.labelEditorOpen.value, (isOpen) => {
  if (!isOpen) {
    commitIfChanged()
    return
  }
  selected.value = new Set(effectiveCurrentLabels.value)
  query.value = ''
  highlighted.value = 0
})

watch(filtered, () => {
  if (highlighted.value >= filtered.value.length)
    highlighted.value = Math.max(0, filtered.value.length - 1)
})

function toggle(name: string) {
  const next = new Set(selected.value)
  if (next.has(name))
    next.delete(name)
  else
    next.add(name)
  selected.value = next
}

async function commitIfChanged() {
  if (!item.value)
    return
  const currentSet = new Set(effectiveCurrentLabels.value)
  const nextSet = selected.value
  if (currentSet.size === nextSet.size && [...currentSet].every(n => nextSet.has(n)))
    return
  const labels = [...nextSet].sort()
  try {
    const setOp = pending.entries.value.find(e => e.op.action === 'set-labels')
    if (setOp) {
      await rpc.updateQueueOp(setOp.id, {
        action: 'set-labels',
        number: item.value.number,
        labels,
      })
    }
    else {
      await rpc.addQueueOp({
        action: 'set-labels',
        number: item.value.number,
        labels,
      })
    }
  }
  catch (error) {
    state.setError((error as Error).message)
  }
}

function onListKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    highlighted.value = Math.min(filtered.value.length - 1, highlighted.value + 1)
  }
  else if (event.key === 'ArrowUp') {
    event.preventDefault()
    highlighted.value = Math.max(0, highlighted.value - 1)
  }
  else if (event.key === 'Enter' || event.key === ' ') {
    const target = filtered.value[highlighted.value]
    if (target) {
      event.preventDefault()
      toggle(target.name)
    }
  }
}

function openModel(value: boolean) {
  ui.labelEditorOpen.value = value
}
</script>

<template>
  <DialogRoot :open="ui.labelEditorOpen.value" @update:open="openModel">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 bg-black/40 backdrop-blur-sm z-60" />
      <DialogContent
        class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-base border border-base rounded-lg shadow-xl w-[min(92vw,32rem)] max-h-[70vh] z-60 flex flex-col overflow-hidden"
        @keydown="onListKeydown"
      >
        <header class="px-4 py-3 border-b border-base flex items-center gap-2">
          <span class="i-octicon-tag-16 color-active" />
          <DialogTitle class="font-medium text-sm">Edit labels</DialogTitle>
          <span v-if="item" class="font-mono text-xs color-muted">#{{ item.number }}</span>
          <div class="flex-1" />
          <span class="text-xs color-muted"><span class="kbd">Esc</span> to save &amp; close</span>
        </header>
        <DialogDescription class="sr-only">Toggle labels to queue a set-labels change for this item.</DialogDescription>

        <div class="px-4 py-2 border-b border-base">
          <input
            v-model="query"
            type="text"
            placeholder="Filter labels…"
            data-shortcut="label-filter"
            autofocus
            class="w-full bg-transparent border border-base rounded px-2 py-1.5 text-sm outline-none focus:border-active"
          >
        </div>

        <ul class="flex-1 overflow-y-auto py-1">
          <li v-if="!filtered.length" class="px-4 py-6 text-sm text-center color-muted">
            <template v-if="repoLabels.length">No labels match "{{ query }}"</template>
            <template v-else>No labels in this repository yet.</template>
          </li>
          <li
            v-for="(label, idx) in filtered"
            :key="label.name"
            class="flex items-center gap-3 px-3 py-1.5 text-sm cursor-pointer"
            :class="highlighted === idx ? 'bg-active' : 'hover:bg-subtle'"
            @mouseenter="highlighted = idx"
            @click="toggle(label.name)"
          >
            <span
              class="inline-flex items-center justify-center w-4 h-4 rounded border border-base shrink-0"
              :class="selected.has(label.name) ? 'bg-primary-500 border-primary-500' : ''"
            >
              <span v-if="selected.has(label.name)" class="i-octicon-check-16 text-white text-xs" />
            </span>
            <span
              class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium leading-none shrink-0"
              :style="labelStyle(label.color, isDark)"
            >{{ label.name }}</span>
            <span v-if="label.description" class="color-muted text-xs truncate">{{ label.description }}</span>
          </li>
        </ul>

        <footer class="flex items-center gap-2 px-4 py-2 border-t border-base text-xs color-muted">
          <span class="kbd">↑</span><span class="kbd">↓</span> move
          <span class="kbd">Enter</span> toggle
          <div class="flex-1" />
          <span>{{ selected.size }} selected</span>
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

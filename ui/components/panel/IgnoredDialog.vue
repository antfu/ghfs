<script setup lang="ts">
const open = defineModel<boolean>('open', { required: true })

const ui = useUiState()
const state = useAppState()

interface Row {
  number: number
  title: string
  kind: 'issue' | 'pull'
}

const rows = computed<Row[]>(() => {
  const ignored = ui.uiState.ignored ?? []
  const items = state.payload.value?.syncState.items ?? {}
  return ignored
    .map((n) => {
      const entry = items[String(n)]
      return {
        number: n,
        title: entry?.data.item.title ?? '(unknown)',
        kind: (entry?.data.item.kind ?? 'issue') as 'issue' | 'pull',
      }
    })
    .sort((a, b) => b.number - a.number)
})

function unignore(n: number) {
  ui.removeIgnored(n)
}
</script>

<template>
  <UiModal
    v-model:open="open"
    title="Ignored items"
    icon="i-ph-eye-slash-duotone"
    width="w-[min(92vw,32rem)]"
  >
    <div class="px-5 py-3 flex flex-col gap-1">
      <p v-if="rows.length === 0" class="text-sm color-muted text-center py-8">
        No ignored items.
      </p>
      <ul v-else class="flex flex-col">
        <li
          v-for="row in rows"
          :key="row.number"
          class="flex items-center gap-3 py-1.5 border-b border-base last:border-b-0"
        >
          <span
            :class="row.kind === 'pull'
              ? 'i-octicon-git-pull-request-16 color-muted'
              : 'i-octicon-issue-opened-16 color-muted'"
          />
          <span class="font-mono text-xs color-muted tabular-nums">#{{ row.number }}</span>
          <span class="flex-1 text-sm truncate">{{ row.title }}</span>
          <button
            type="button"
            class="btn-action-sm shrink-0"
            :title="`Un-ignore #${row.number}`"
            data-testid="ignored-dialog-unignore"
            @click="unignore(row.number)"
          >
            <span class="i-ph-arrow-counter-clockwise-duotone" />
            Un-ignore
          </button>
        </li>
      </ul>
    </div>
    <template #footer>
      <button type="button" class="btn-action-sm" @click="open = false">
        Close
      </button>
    </template>
  </UiModal>
</template>

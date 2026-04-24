<script setup lang="ts">
import type { SyncItemState } from '../../src/types/sync-state'

const props = defineProps<{ entry: SyncItemState, selected?: boolean }>()

const state = useAppState()

const item = computed(() => props.entry.data.item)
const pull = computed(() => props.entry.data.pull)
const search = computed(() => state.filters.search)
const labels = computed(() => item.value.labels ?? [])
const assignees = computed(() => item.value.assignees ?? [])

const pending = usePendingOps(computed(() => item.value.number))

const titleText = computed(() => pending.pendingTitle.value?.op.action === 'set-title'
  ? (pending.pendingTitle.value.op as { title: string }).title
  : item.value.title,
)
const titleHtml = computed(() => {
  if (search.value.trim())
    return highlight(titleText.value, search.value)
  return renderMarkdownInline(titleText.value)
})
const bodySnippetHtml = computed(() => {
  const q = search.value.trim()
  if (!q)
    return ''
  if ((titleText.value ?? '').toLowerCase().includes(q.toLowerCase()))
    return ''
  return snippet(item.value.body, q, 80)
})

function selectItem() {
  state.selectItem(item.value.number)
}

const rowRef = ref<HTMLElement | null>(null)
watch(
  () => props.selected,
  (selected) => {
    if (selected)
      rowRef.value?.scrollIntoView({ block: 'nearest' })
  },
  { immediate: true, flush: 'post' },
)
</script>

<template>
  <button
    ref="rowRef"
    type="button"
    class="group w-full text-left flex items-start gap-2.5 px-3 py-2 text-sm border-b border-base transition"
    :class="props.selected ? 'bg-selected' : 'hover:bg-subtle'"
    @click="selectItem"
  >
    <ItemStateIcon :item="item" :pull="pull" :pending="pending.direction.value" class="mt-0.5 shrink-0" />

    <div class="flex-1 min-w-0">
      <div class="flex items-baseline gap-2 flex-wrap">
        <span
          class="font-medium truncate"
          :class="{ 'italic': pending.pendingTitle.value }"
          v-html="titleHtml"
        />
        <a
          :href="item.url || `#${item.number}`"
          target="_blank"
          rel="noreferrer"
          tabindex="-1"
          class="font-mono text-xs color-muted hover:color-active tabular-nums"
          :aria-label="`Open #${item.number} on GitHub`"
          @click.stop
        >#{{ item.number }}</a>
        <span
          v-if="pending.hasPending.value"
          class="badge-color-yellow text-[10px] uppercase tracking-wide"
          :title="`${pending.entries.value.length} pending change(s)`"
        >
          <span class="i-octicon-hourglass-16 text-[10px] mr-0.5" />
          pending
        </span>
      </div>

      <div v-if="labels.length" class="flex items-center gap-1 flex-wrap mt-0.5">
        <Label v-for="label in labels.slice(0, 5)" :key="label" :name="label" />
        <span v-if="labels.length > 5" class="text-[10px] color-faint">+{{ labels.length - 5 }}</span>
      </div>

      <div v-if="bodySnippetHtml" class="text-xs color-muted mt-1 leading-relaxed" v-html="bodySnippetHtml" />

      <div class="flex items-center gap-2 flex-wrap text-xs color-muted mt-1">
        <template v-if="item.author">
          <Avatar :login="item.author" :size="14" />
          <span class="font-mono">@{{ item.author }}</span>
        </template>
        <span class="color-faint">·</span>
        <span>{{ formatRelative(item.updatedAt) }}</span>
        <template v-if="assignees.length">
          <span class="color-faint">·</span>
          <span class="flex items-center gap-1">
            <Avatar
              v-for="a in assignees.slice(0, 3)"
              :key="a"
              :login="a"
              :size="14"
            />
            <span v-if="assignees.length > 3" class="font-mono">+{{ assignees.length - 3 }}</span>
          </span>
        </template>
        <template v-if="item.reactions && item.reactions.totalCount > 0">
          <span class="color-faint">·</span>
          <span class="font-mono">{{ item.reactions.totalCount }}</span>
        </template>
      </div>
    </div>
  </button>
</template>

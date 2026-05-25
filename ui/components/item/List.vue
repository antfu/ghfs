<script setup lang="ts">
import type { ListItem } from '../../types/list-item'
import { computed, ref, watch } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import UiEmptyState from '../ui/EmptyState.vue'
import ItemRow from './Row.vue'

const props = withDefaults(defineProps<{
  items: ListItem[]
  selectedKey: string | null
  showRepoName?: boolean
  searchHighlight?: string
  emptyTitle?: string
  emptyMessage?: string
}>(), {
  searchHighlight: '',
  emptyTitle: 'No items match the current filter',
  emptyMessage: 'Change filters, or use the sync icon to pull from GitHub.',
})

const emit = defineEmits<{
  select: [item: ListItem]
}>()

const scrollRef = ref<HTMLDivElement | null>(null)

// 64px is a reasonable estimate for an ItemRow (title + meta + label row).
// The virtualizer auto-corrects after first measure via `measureElement`.
// Passing a computed makes count + getScrollElement reactive — without it,
// the virtualizer captures the initial empty count and never refreshes.
const virtualizer = useVirtualizer(computed(() => ({
  count: props.items.length,
  getScrollElement: () => scrollRef.value,
  estimateSize: () => 64,
  overscan: 6,
  getItemKey: (index: number) => {
    const it = props.items[index]
    return it ? it.key : index
  },
})))

// Keep the selected row in view when the user navigates with j/k or via URL.
watch(
  () => props.selectedKey,
  (key) => {
    if (key == null)
      return
    const index = props.items.findIndex(it => it.key === key)
    if (index < 0)
      return
    virtualizer.value.scrollToIndex(index, { align: 'auto', behavior: 'auto' })
  },
)

const virtualItems = computed(() => virtualizer.value.getVirtualItems())
const totalSize = computed(() => virtualizer.value.getTotalSize())

function measureRow(el: Element | { $el?: Element } | null): void {
  if (!el)
    return
  const target = (el as { $el?: Element }).$el ?? (el as Element)
  if (target && typeof (target as HTMLElement).getBoundingClientRect === 'function')
    virtualizer.value.measureElement(target as HTMLElement)
}
</script>

<template>
  <div ref="scrollRef" class="overflow-y-auto" data-testid="virtual-item-list">
    <UiEmptyState
      v-if="items.length === 0"
      icon="i-octicon-inbox-16"
      :title="emptyTitle"
      :message="emptyMessage"
    />
    <div v-else :style="{ height: `${totalSize}px`, position: 'relative', width: '100%' }">
      <div
        v-for="virtualRow in virtualItems"
        :key="virtualRow.key"
        :ref="measureRow"
        :data-index="virtualRow.index"
        :style="{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          transform: `translateY(${virtualRow.start}px)`,
        }"
      >
        <ItemRow
          :item="items[virtualRow.index]!"
          :selected="selectedKey === items[virtualRow.index]!.key"
          :show-repo-name="showRepoName"
          :search-highlight="searchHighlight"
          @select="emit('select', $event)"
        />
      </div>
    </div>
  </div>
</template>

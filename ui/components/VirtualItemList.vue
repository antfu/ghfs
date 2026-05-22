<script setup lang="ts">
import type { SyncItemState } from '../../src/types/sync-state'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  entries: SyncItemState[]
}>()

const state = useAppState()

const scrollRef = ref<HTMLDivElement | null>(null)

// 64px is a reasonable estimate for an ItemRow (title + meta + label row).
// The virtualizer auto-corrects after first measure via `measureElement`.
// Passing a computed makes count + getScrollElement reactive — without it,
// the virtualizer captures the initial empty count and never refreshes.
const virtualizer = useVirtualizer(computed(() => ({
  count: props.entries.length,
  getScrollElement: () => scrollRef.value,
  estimateSize: () => 64,
  overscan: 6,
  getItemKey: (index: number) => {
    const entry = props.entries[index]
    return entry ? `${entry.kind}-${entry.number}` : index
  },
})))

// Keep the selected row in view when the user navigates with j/k or via URL.
watch(
  () => state.selectedNumber.value,
  (number) => {
    if (number == null)
      return
    const index = props.entries.findIndex(e => e.number === number)
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
    <EmptyState
      v-if="entries.length === 0"
      icon="i-octicon-inbox-16"
      title="No items match the current filter"
      message="Change filters, or use the sync icon to pull from GitHub."
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
          :entry="entries[virtualRow.index]!"
          :selected="state.selectedNumber.value === entries[virtualRow.index]!.number"
        />
      </div>
    </div>
  </div>
</template>

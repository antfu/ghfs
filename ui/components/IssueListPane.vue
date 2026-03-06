<script setup lang="ts">
import type { UiItemSummary } from '~/types/rpc'

const props = defineProps<{
  items: UiItemSummary[]
  selectedNumber?: number
  loading?: boolean
}>()

const emit = defineEmits<{
  select: [number]
}>()

const filter = defineModel<string>('filter', {
  default: '',
})

const filteredItems = computed(() => {
  const keyword = filter.value.trim().toLowerCase()
  if (!keyword)
    return props.items

  return props.items.filter((item) => {
    const fields = [
      item.title,
      `#${item.number}`,
      ...item.labels,
      ...item.assignees,
      item.author || '',
    ]
    return fields.some(field => field.toLowerCase().includes(keyword))
  })
})

function selectItem(number: number): void {
  emit('select', number)
}
</script>

<template>
  <section class="panel-card h-full min-h-0 p-3 fade-in">
    <header class="mb-3 flex items-center gap-2">
      <input
        v-model="filter"
        class="field-base mono flex-1"
        placeholder="Filter by title, #id, label, assignee..."
      >
      <span class="mono text-xs text-muted">
        {{ filteredItems.length }}/{{ items.length }}
      </span>
    </header>

    <div class="max-h-[calc(100vh-19rem)] min-h-56 space-y-2 overflow-y-auto pr-1">
      <button
        v-for="item in filteredItems"
        :key="item.number"
        type="button"
        class="panel-soft w-full p-3 text-left transition hover:border-accent2/70"
        :class="item.number === selectedNumber ? 'border-accent bg-accent/8 shadow-[0_0_0_1px_rgba(61,220,151,0.5)]' : ''"
        @click="selectItem(item.number)"
      >
        <div class="mb-1 flex items-start justify-between gap-2">
          <p class="mono text-sm op-80">
            #{{ item.number }} · {{ item.kind === 'pull' ? 'PR' : 'Issue' }}
          </p>
          <span
            class="mono rounded-full px-2 py-0.5 text-[11px]"
            :class="item.state === 'open' ? 'bg-accent/18 text-accent' : 'bg-line/60 text-muted'"
          >
            {{ item.state }}
          </span>
        </div>

        <p class="line-clamp-2 text-sm font-600 leading-snug">
          {{ item.title }}
        </p>

        <div class="mt-2 flex flex-wrap gap-1">
          <span
            v-for="label in item.labels.slice(0, 4)"
            :key="label"
            class="mono rounded-full bg-panel px-1.5 py-0.5 text-[11px] text-muted"
          >
            {{ label }}
          </span>
          <span
            v-if="item.labels.length > 4"
            class="mono rounded-full bg-panel px-1.5 py-0.5 text-[11px] text-muted"
          >
            +{{ item.labels.length - 4 }}
          </span>
        </div>
      </button>

      <p
        v-if="!loading && filteredItems.length === 0"
        class="panel-soft p-4 text-sm text-muted"
      >
        No items found.
      </p>
    </div>
  </section>
</template>

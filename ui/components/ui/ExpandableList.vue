<script setup lang="ts" generic="T">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    list: T[]
    title?: string | [string, string]
    reversable?: boolean
    multiplier?: number
    containerClass?: string
  }>(),
  {
    reversable: true,
    multiplier: 1.5,
  },
)

const count = defineModel('count', {
  default: 20,
})

const reverse = defineModel('reverse', {
  default: false,
})

const resolvedTitle = computed(() =>
  Array.isArray(props.title) ? (reverse.value ? props.title[1] : props.title[0]) : props.title,
)

function toReversed<U>(arr: U[]): U[] {
  if ('toReversed' in arr)
    return (arr as unknown as { toReversed: () => U[] }).toReversed()
  return arr.slice().reverse()
}

const top = computed(() => {
  const list = props.list
  return (reverse.value ? toReversed(list) : list).slice(0, count.value)
})
</script>

<template>
  <div>
    <h2 v-if="title" class="mt-6 mb-3 op-fade font-bold flex gap-1 items-center">
      {{ resolvedTitle }}
      <DisplayNumberBadge v-if="list.length" :number="list.length" class="rounded-full text-sm" />
      <button
        v-if="reversable"
        title="Reverse"
        class="ml-auto w-8 h-8 rounded-full hover:bg-active flex items-center justify-center"
        @click="reverse = !reverse"
      >
        <div v-if="!reverse" class="i-ph-sort-descending" />
        <div v-else class="i-ph-sort-ascending" />
      </button>
    </h2>
    <div class="relative overflow-hidden panel-card" :class="containerClass">
      <div class="flex flex-col gap-2 p-4 pt-3 overflow-auto relative">
        <slot :items="top" />
      </div>
      <div
        v-if="list.length > count"
        class="pointer-events-none absolute left-0 right-0 bottom-0 bg-gradient-more h-30 mb-4 flex justify-center"
      >
        <button
          class="op35 p-2 pt-4 mt-auto pointer-events-auto hover:op100 flex items-center gap-1 justify-center"
          @click="count = Math.round(count * props.multiplier)"
        >
          <div class="i-ri-arrow-down-double-line" />
          <span>More</span>
          <DisplayNumberBadge prefix="+" :number="Math.min(Math.round(count * 0.5), props.list.length)" class="rounded-full text-sm" />
        </button>
        <button
          class="op35 p-2 pt-4 mt-auto pointer-events-auto hover:op100 flex items-center gap-1 justify-center"
          @click="count = props.list.length"
        >
          <div class="i-ph-arrows-out-line-vertical-duotone" />
          <span>All</span>
          <DisplayNumberBadge :number="props.list.length" class="rounded-full text-sm" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  color?: string
  icon?: string
  variant?: 'subtle' | 'solid'
  size?: 'xs' | 'sm'
  dataTestid?: string
}>(), {
  color: 'neutral',
  variant: 'subtle',
  size: 'sm',
})

const classes = computed(() => {
  const base = props.size === 'xs' ? 'text-[10px] px-1 py-0' : ''
  if (props.variant === 'solid') {
    const c = props.color
    return `badge bg-${c}-500 text-white border border-${c}-500 ${base}`
  }
  return `badge-color-${props.color} ${base}`
})
</script>

<template>
  <span :class="classes" :data-testid="dataTestid">
    <span v-if="icon" :class="icon" class="mr-1" :style="size === 'xs' ? 'font-size: 10px' : ''" />
    <slot />
  </span>
</template>

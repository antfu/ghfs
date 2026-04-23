<script setup lang="ts">
interface Props {
  tooltip?: string
  side?: 'top' | 'right' | 'bottom' | 'left'
}

const props = withDefaults(defineProps<Props>(), {
  side: 'bottom',
})
</script>

<template>
  <span
    v-tooltip="props.tooltip ? { content: props.tooltip, placement: props.side } : undefined"
    class="inline-flex"
  >
    <slot />
  </span>
</template>

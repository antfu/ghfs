<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  state: 'open' | 'closed' | 'merged' | 'draft' | 'not-planned' | 'reopened' | 'pending'
  kind?: 'issue' | 'pull'
}>()

const config = computed(() => {
  switch (props.state) {
    case 'open':
    case 'reopened':
      return { color: 'green', label: 'Open' }
    case 'merged':
      return { color: 'purple', label: 'Merged' }
    case 'closed':
      return { color: 'red', label: 'Closed' }
    case 'draft':
      return { color: 'gray', label: 'Draft' }
    case 'not-planned':
      return { color: 'gray', label: 'Not planned' }
    case 'pending':
      return { color: 'yellow', label: 'Pending', icon: 'i-octicon-hourglass-16' }
  }
  return { color: 'gray', label: props.state }
})
</script>

<template>
  <span
    :class="`badge-color-${config.color}`"
    class="uppercase tracking-wide text-[10px]"
  >
    <span v-if="config.icon" :class="config.icon" class="mr-1 text-[10px]" />
    {{ config.label }}
  </span>
</template>

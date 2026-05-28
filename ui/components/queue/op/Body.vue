<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  body: string
  maxLines?: number
}>()

const expanded = ref(false)

const maxLines = computed(() => props.maxLines ?? 6)
const lineCount = computed(() => props.body.split('\n').length)
const isLong = computed(() => lineCount.value > maxLines.value || props.body.length > 500)

const visible = computed(() => {
  if (expanded.value || !isLong.value)
    return props.body
  const truncated = props.body.split('\n').slice(0, maxLines.value).join('\n')
  return truncated.length > 500 ? `${truncated.slice(0, 500)}…` : truncated
})
</script>

<template>
  <div class="text-sm">
    <div
      class="font-sans color-base whitespace-pre-wrap break-words leading-relaxed bg-#8881 dark:bg-#fff1 rounded border border-base px-3 py-2"
      data-testid="queue-op-body"
    >{{ visible }}</div>
    <button
      v-if="isLong"
      type="button"
      class="text-xs color-active hover:underline mt-1"
      @click.stop="expanded = !expanded"
    >
      {{ expanded ? 'Show less' : 'Show more' }}
    </button>
  </div>
</template>

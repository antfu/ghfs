<script setup lang="ts">
import DisplayAuthor from '../display/Author.vue'
import DisplayDateBadge from '../display/DateBadge.vue'

interface Props {
  icon: string
  color?: string
  actor: string | null
  createdAt: string
}

withDefaults(defineProps<Props>(), { color: 'color-muted' })
</script>

<template>
  <div class="relative pl-10" data-testid="timeline-event">
    <span
      class="absolute left-0 top-0.5 inline-flex items-center justify-center w-8 h-8 rounded-full bg-base"
    >
      <span class="w-6 h-6 rounded-full bg-#8881 dark:bg-#fff1 inline-flex items-center justify-center">
        <span :class="[icon, color, 'text-xs']" />
      </span>
    </span>
    <div class="flex items-center gap-2 text-sm py-1 flex-wrap">
      <DisplayAuthor v-if="actor" :author="actor" :size="16" />
      <slot />
      <span class="color-faint">·</span>
      <DisplayDateBadge :time="createdAt" />
    </div>
  </div>
</template>

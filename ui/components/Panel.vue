<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  title?: string
  icon?: string
  variant?: 'floating' | 'solid'
  padding?: 'none' | 'sm' | 'md'
  headerClass?: string
  dataTestid?: string
  as?: string
}>(), {
  variant: 'floating',
  padding: 'md',
  as: 'div',
})

const rootClass = computed(() => {
  const base = 'rounded-xl overflow-hidden border border-base bg-base'
  return props.variant === 'floating' ? `${base} shadow-sm` : base
})

const bodyClass = computed(() => {
  if (props.padding === 'none') return ''
  if (props.padding === 'sm') return 'p-3'
  return 'p-4'
})
</script>

<template>
  <component :is="as" :class="rootClass" :data-testid="dataTestid">
    <header
      v-if="title || $slots.header || $slots.actions"
      class="flex items-center gap-2 px-4 py-2 border-b border-base bg-#8881 dark:bg-#fff1"
      :class="headerClass"
    >
      <slot name="header">
        <span v-if="icon" :class="icon" class="color-active shrink-0" />
        <span class="text-sm font-medium">{{ title }}</span>
      </slot>
      <div class="flex-1" />
      <slot name="actions" />
    </header>
    <div :class="bodyClass">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="px-4 py-2 border-t border-base">
      <slot name="footer" />
    </footer>
  </component>
</template>

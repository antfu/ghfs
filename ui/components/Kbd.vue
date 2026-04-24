<script setup lang="ts">
interface Props {
  shortcutId?: string
  /** Display tokens. Accepts an array like `['g', 'g']` or a string like `j`, `Esc`. */
  keys?: string | string[]
  active?: boolean
  /** Extra classes to layer on the root span. */
  tone?: 'default' | 'muted'
}

const props = withDefaults(defineProps<Props>(), {
  active: true,
  tone: 'default',
})

const inputFocused = useInputFocus()

const binding = computed(() => {
  if (!props.shortcutId)
    return null
  return useShortcut(props.shortcutId)
})

const displayKeys = computed<string[]>(() => {
  if (binding.value)
    return binding.value.label.value
  if (Array.isArray(props.keys))
    return props.keys
  if (props.keys)
    return [props.keys]
  return []
})

const isActive = computed<boolean>(() => {
  if (binding.value)
    return binding.value.active.value
  return props.active
})

const fadeClass = computed(() => {
  if (!isActive.value || inputFocused.value)
    return 'op30'
  return props.tone === 'muted' ? 'op60' : ''
})
</script>

<template>
  <span
    v-if="displayKeys.length"
    class="inline-flex items-center gap-0.5 align-middle transition-opacity"
    :class="fadeClass"
  >
    <kbd v-for="(k, i) in displayKeys" :key="i" class="kbd">{{ k }}</kbd>
  </span>
</template>

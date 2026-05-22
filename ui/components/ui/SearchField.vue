<script setup lang="ts">
withDefaults(defineProps<{
  placeholder?: string
  icon?: string
  command?: string
  dataTestid?: string
  dataShortcut?: string
  ariaLabel?: string
  autofocus?: boolean
}>(), {
  icon: 'i-octicon-search-16',
})

const value = defineModel<string>({ required: true })
const inputRef = ref<HTMLInputElement | null>(null)

defineExpose({ inputRef, focus: () => inputRef.value?.focus() })
</script>

<template>
  <label class="flex-1 min-w-0 flex items-center gap-2 border border-base rounded bg-transparent px-2 py-1 transition focus-within:border-active focus-within:ring-2 focus-within:ring-primary-500/30">
    <span v-if="icon" :class="icon" class="color-muted shrink-0" />
    <input
      ref="inputRef"
      v-model="value"
      type="text"
      :placeholder="placeholder"
      :aria-label="ariaLabel ?? placeholder"
      :data-testid="dataTestid"
      :data-shortcut="dataShortcut"
      :autofocus="autofocus"
      class="bg-transparent outline-none w-full font-sans text-sm min-w-0"
    >
    <UiKbd v-if="!value && command" :command="command" class="shrink-0" />
    <button
      v-else-if="value"
      type="button"
      class="color-muted hover:color-base shrink-0 flex items-center"
      aria-label="Clear"
      @click="value = ''"
    >
      <span class="i-ph-x text-sm" />
    </button>
  </label>
</template>

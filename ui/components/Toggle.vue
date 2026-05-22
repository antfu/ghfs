<script setup lang="ts">
defineProps<{
  ariaLabel: string
  disabled?: boolean
  busy?: boolean
  dataTestid?: string
}>()

const value = defineModel<boolean>({ required: true })
</script>

<template>
  <button
    type="button"
    role="switch"
    class="relative inline-flex items-center h-6 w-11 rounded-full border transition focus-visible:ring-2 focus-visible:ring-primary-500/40 outline-none shrink-0 disabled:op30"
    :class="value ? 'bg-primary-500 border-primary-500' : 'bg-base border-base'"
    :disabled="disabled || busy"
    :aria-checked="value"
    :aria-label="ariaLabel"
    :data-testid="dataTestid"
    @click="value = !value"
  >
    <span
      class="absolute top-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-white shadow transition-all"
      :class="value ? 'left-[1.4rem]' : 'left-0.5'"
    >
      <span v-if="busy" class="i-octicon-sync-16 animate-spin text-[10px] text-neutral-500" />
    </span>
  </button>
</template>

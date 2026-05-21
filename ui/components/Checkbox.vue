<script setup lang="ts">
const value = defineModel<boolean | string>('modelValue', {
  type: [Boolean, String],
})
</script>

<template>
  <div
    class="border border-base rounded flex gap-2 items-center relative h-5 w-5 hover:bg-active p-0.5"
    :class="value ? 'bg-primary-500/5' : 'bg-secondary'"
  >
    <div class="i-ph-check-bold text-xl text-primary-500" :class="value ? '' : 'op0'" />
    <input v-model="value" type="checkbox" class="absolute inset-0 z-10 opacity-[0.001]">
  </div>
</template>

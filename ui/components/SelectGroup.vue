<script setup lang="ts">
defineProps<{
  options: readonly (string | number | null)[]
  titles?: string[]
  classes?: string[]
}>()

const value = defineModel<string | number | null>('modelValue', {
  type: [String, Number],
})
</script>

<template>
  <fieldset class="flex flex-wrap border border-base rounded overflow-hidden text-xs">
    <label
      v-for="i, idx of options"
      :key="i ?? idx"
      class="border-b border-base relative mb--1px hover:bg-active px-1.5 py-1"
      :class="[
        idx ? 'border-l border-base ml--1px' : '',
        i === value ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400' : '',
      ]"
      :title="titles?.[idx]"
    >
      <div
        :class="[
          i === value ? '' : 'op-mute',
          titles?.[idx] ? '' : 'capitalize',
          classes?.[idx] || '',
        ]"
      >{{ titles?.[idx] ?? i }}</div>
      <input
        v-model="value" type="radio" :value="i"
        :title="titles?.[idx]"
        class="absolute inset-0 opacity-[0.001]"
      >
    </label>
  </fieldset>
</template>

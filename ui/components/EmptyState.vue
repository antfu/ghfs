<script setup lang="ts">
withDefaults(defineProps<{
  title?: string
  message?: string
  icon?: string
  color?: 'gray' | 'green' | 'red' | 'yellow' | 'blue'
  size?: 'sm' | 'md' | 'lg'
}>(), {
  color: 'gray',
  size: 'md',
})
</script>

<template>
  <div
    class="flex flex-col items-center justify-center text-center color-muted"
    :class="size === 'sm' ? 'py-6 gap-2' : size === 'lg' ? 'py-20 gap-4' : 'py-12 gap-3'"
  >
    <div v-if="icon" class="op-mute" :class="[icon, size === 'sm' ? 'text-2xl' : size === 'lg' ? 'text-5xl' : 'text-4xl']" />
    <div v-if="title" class="font-medium color-base" :class="size === 'sm' ? 'text-sm' : 'text-base'">
      {{ title }}
    </div>
    <p v-if="message" class="text-sm max-w-sm op-fade">
      {{ message }}
    </p>
    <slot name="hint" />
    <slot />
  </div>
</template>

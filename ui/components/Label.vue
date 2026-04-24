<script setup lang="ts">
interface Props {
  name: string
  /** Fallback hex color, used when the label isn't in the repo label map (e.g. removed labels in timeline events). */
  fallbackColor?: string
}

const props = defineProps<Props>()
const labelMap = useLabelColorMap()
const isDark = useDark()

const style = computed(() => {
  const color = labelMap.value.get(props.name)?.color ?? props.fallbackColor
  return color ? labelStyle(color, isDark.value) : undefined
})
</script>

<template>
  <span
    class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium leading-none"
    :class="{ 'badge-color-neutral border-transparent': !style }"
    :style="style"
  >{{ name }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useDark } from '@vueuse/core'
import { labelStyle, useHubLabelMap, useLabelColorMap } from '../../composables/useLabelColor'

interface Props {
  name: string
  /**
   * When set, resolve the color from the hub-level project registry
   * (`useHubLabelMap()`) using this project id. Used in mixed-repo lists so
   * labels from non-active projects render with their own repo's color.
   */
  projectId?: string
  /** Fallback hex color, used when the label isn't found in any map. */
  fallbackColor?: string
}

const props = defineProps<Props>()
const activeMap = useLabelColorMap()
const hubMap = useHubLabelMap()
const isDark = useDark()

const style = computed(() => {
  let color: string | undefined
  if (props.projectId) {
    color = hubMap.value.get(props.projectId)?.get(props.name)?.color
  }
  if (!color)
    color = activeMap.value.get(props.name)?.color
  if (!color)
    color = props.fallbackColor
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

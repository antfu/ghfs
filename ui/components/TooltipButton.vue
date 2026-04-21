<script setup lang="ts">
interface Props {
  tooltip?: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  disabled?: boolean
  as?: string
}

const props = withDefaults(defineProps<Props>(), {
  side: 'bottom',
  as: 'button',
})
</script>

<template>
  <TooltipRoot v-if="props.tooltip" :delay-duration="200">
    <TooltipTrigger :as="props.as" :disabled="props.disabled" class="contents">
      <slot />
    </TooltipTrigger>
    <TooltipPortal>
      <TooltipContent
        :side="props.side"
        :side-offset="6"
        class="z-50 bg-tooltip color-base rounded px-2 py-1 text-xs shadow font-sans"
      >
        {{ props.tooltip }}
      </TooltipContent>
    </TooltipPortal>
  </TooltipRoot>
  <component :is="props.as" v-else :disabled="props.disabled" class="contents">
    <slot />
  </component>
</template>

<script setup lang="ts">
import { Tooltip as VTooltip } from 'floating-vue'
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  icon?: string
  tooltip?: string
  ariaLabel?: string
  size?: 'sm' | 'md' | 'lg'
  active?: boolean
  disabled?: boolean
  as?: 'button' | 'a'
  href?: string
  target?: string
  rel?: string
  type?: 'button' | 'submit' | 'reset'
  dataTestid?: string
  spinning?: boolean
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left'
}>(), {
  size: 'md',
  as: 'button',
  type: 'button',
  tooltipSide: 'bottom',
})

const sizeClass = computed(() => {
  if (props.size === 'sm') return 'w-6 h-6 text-sm'
  if (props.size === 'lg') return 'w-10 h-10'
  return 'w-9 h-9'
})

const baseClass = computed(() =>
  `${sizeClass.value} rounded-full transition flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:pointer-events-none disabled:op30`,
)

const stateClass = computed(() =>
  props.active ? 'op100 color-active bg-active' : 'op-fade hover:op100 hover:bg-active',
)
</script>

<template>
  <VTooltip v-if="tooltip" :placement="tooltipSide" :distance="10" class="inline-flex">
    <component
      :is="as"
      :type="as === 'button' ? type : undefined"
      :disabled="as === 'button' ? disabled : undefined"
      :href="as === 'a' ? href : undefined"
      :target="as === 'a' ? target : undefined"
      :rel="as === 'a' ? rel : undefined"
      :aria-label="ariaLabel ?? tooltip"
      :data-testid="dataTestid"
      :class="[baseClass, stateClass, 'relative']"
    >
      <span v-if="icon" :class="[icon, spinning ? 'animate-spin' : '']" />
      <slot />
      <slot name="badge" />
    </component>
    <template #popper>
      {{ tooltip }}
    </template>
  </VTooltip>
  <component
    v-else
    :is="as"
    :type="as === 'button' ? type : undefined"
    :disabled="as === 'button' ? disabled : undefined"
    :href="as === 'a' ? href : undefined"
    :target="as === 'a' ? target : undefined"
    :rel="as === 'a' ? rel : undefined"
    :aria-label="ariaLabel"
    :data-testid="dataTestid"
    :class="[baseClass, stateClass, 'relative']"
  >
    <span v-if="icon" :class="[icon, spinning ? 'animate-spin' : '']" />
    <slot />
    <slot name="badge" />
  </component>
</template>

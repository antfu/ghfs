<script setup lang="ts">
import { computed } from 'vue'
import { useCommand } from '../../composables/useCommands'
import UiKbd from './Kbd.vue'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  command: string
  tone?: 'default' | 'muted'
  /**
   * - `inline` (default): kbd sits as a sibling to the right of the slot.
   * - `badge`: kbd is absolutely positioned at the bottom-right of the slot,
   *   for icon buttons that want the hint to overlay the trigger.
   */
  placement?: 'inline' | 'badge'
}>(), {
  placement: 'inline',
})

defineSlots<{
  default?: (slotProps: { execute: () => void, disabled: boolean }) => unknown
}>()

const binding = useCommand(props.command)
const disabled = computed(() => !binding.active.value)

function execute() {
  if (disabled.value)
    return
  const cmd = binding.command.value
  if (!cmd)
    return
  void cmd.run()
}
</script>

<template>
  <UiKbd v-if="!$slots.default" :command="command" :tone="tone" v-bind="$attrs" />
  <span
    v-else-if="placement === 'badge'"
    class="relative inline-flex align-middle"
    v-bind="$attrs"
  >
    <slot :execute="execute" :disabled="disabled" />
    <UiKbd
      :command="command"
      :tone="tone"
      class="absolute -bottom-1 -right-1 pointer-events-none"
    />
  </span>
  <span
    v-else
    class="inline-flex items-center gap-1 align-middle"
    v-bind="$attrs"
  >
    <slot :execute="execute" :disabled="disabled" />
    <UiKbd :command="command" :tone="tone" />
  </span>
</template>

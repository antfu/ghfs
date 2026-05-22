<script setup lang="ts">
defineOptions({ inheritAttrs: false })

const props = defineProps<{
  command: string
  tone?: 'default' | 'muted'
}>()

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
  <span v-else class="inline-flex items-center gap-1 align-middle" v-bind="$attrs">
    <slot :execute="execute" :disabled="disabled" />
    <UiKbd :command="command" :tone="tone" />
  </span>
</template>

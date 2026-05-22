<script setup lang="ts">
withDefaults(defineProps<{
  title?: string
  icon?: string
  description?: string
  width?: string
  maxHeight?: string
  dataTestid?: string
  closeOnBackdrop?: boolean
  closeOnEscape?: boolean
  hideClose?: boolean
}>(), {
  width: 'w-[min(92vw,32rem)]',
  maxHeight: 'max-h-[80vh]',
  closeOnBackdrop: true,
  closeOnEscape: true,
})

const open = defineModel<boolean>('open', { required: true })

function onInteractOutside(event: Event) {
  if (!open.value)
    return
  // Reka emits this when user clicks outside; respect closeOnBackdrop.
  // If disabled, prevent dismissal.
  if (!event.defaultPrevented && !(event as CustomEvent).cancelable)
    return
}

function onEscape(event: KeyboardEvent) {
  if (!open.value)
    return
  if (event.key === 'Escape' && !event.defaultPrevented)
    open.value = false
}

function close() {
  open.value = false
}
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay
        class="fixed inset-0 bg-black/40 z-modal-backdrop"
        @click="closeOnBackdrop ? close() : null"
      />
      <DialogContent
        :data-testid="dataTestid"
        class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 panel-card shadow-xl z-modal-content flex flex-col overflow-hidden"
        :class="[width, maxHeight]"
        @escape-key-down="closeOnEscape ? null : onEscape($event)"
        @pointer-down-outside="closeOnBackdrop ? null : (event: Event) => event.preventDefault()"
        @interact-outside="onInteractOutside"
      >
        <header v-if="title || $slots.header || $slots.actions" class="px-5 py-3 border-b border-base flex items-center gap-2">
          <slot name="header">
            <span v-if="icon" :class="icon" class="color-active shrink-0" />
            <DialogTitle class="font-medium text-sm">{{ title }}</DialogTitle>
          </slot>
          <div class="flex-1" />
          <slot name="actions" />
          <UiIconButton
            v-if="!hideClose"
            icon="i-ph-x"
            size="sm"
            aria-label="Close"
            @click="close"
          />
        </header>
        <DialogDescription v-if="description" class="sr-only">
          {{ description }}
        </DialogDescription>
        <div class="flex-1 overflow-y-auto">
          <slot />
        </div>
        <footer v-if="$slots.footer" class="px-5 py-3 border-t border-base flex items-center justify-end gap-2">
          <slot name="footer" />
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup lang="ts">
const state = useAppState()

const visible = computed(() => state.progress.value !== null || state.lastError.value !== null)
</script>

<template>
  <Transition
    enter-active-class="transition"
    enter-from-class="opacity-0 translate-y-2"
    enter-to-class="opacity-100 translate-y-0"
    leave-active-class="transition"
    leave-from-class="opacity-100 translate-y-0"
    leave-to-class="opacity-0 translate-y-2"
  >
    <div
      v-if="visible"
      class="fixed bottom-4 right-4 z-50 min-w-80 max-w-lg bg-glass rounded-lg shadow-lg border border-base"
    >
      <div v-if="state.lastError.value" class="flex items-start gap-2 px-4 py-3">
        <span class="i-carbon-warning text-red-500" />
        <div class="flex-1 text-sm">{{ state.lastError.value }}</div>
        <button
          class="color-muted hover:color-base"
          aria-label="Dismiss"
          @click="state.setError(null)"
        ><span class="i-carbon-close" /></button>
      </div>
      <div v-else-if="state.progress.value" class="flex items-start gap-3 px-4 py-3">
        <span class="i-carbon-renew animate-spin mt-0.5" />
        <div class="flex-1">
          <div class="text-sm">
            <span class="font-mono uppercase tracking-wide text-xs color-muted mr-2">{{ state.progress.value.kind }}</span>
            <span v-if="state.progress.value.stage" class="font-mono text-xs color-muted">{{ state.progress.value.stage }}</span>
          </div>
          <div v-if="state.progress.value.message" class="text-xs color-muted truncate mt-0.5">{{ state.progress.value.message }}</div>
          <div v-if="state.progress.value.percent != null" class="w-full h-1 bg-secondary rounded mt-2 overflow-hidden">
            <div
              class="h-full bg-primary-500 transition-all"
              :style="{ width: `${Math.round((state.progress.value.percent ?? 0) * 100)}%` }"
            />
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
const rpc = useRpc()
const hub = useHubState()

const ready = ref(false)
const fatalError = ref<string | null>(null)

onMounted(async () => {
  try {
    const caps = await rpc.capabilities()
    hub.setCapabilities(caps)
    ready.value = true
  }
  catch (error) {
    fatalError.value = (error as Error).message
  }
})
</script>

<template>
  <div v-if="fatalError" class="flex flex-col items-center justify-center h-full color-muted">
    <p class="text-sm">{{ fatalError }}</p>
  </div>
  <div v-else-if="!ready" class="flex flex-col items-center justify-center h-full color-muted">
    <span class="i-octicon-sync-16 animate-spin text-2xl mb-3 color-active" />
    <p class="text-sm">Connecting…</p>
  </div>
  <NuxtPage v-else />
</template>

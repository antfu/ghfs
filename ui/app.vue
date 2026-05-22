<script setup lang="ts">
useHead({
  htmlAttrs: { lang: 'en' },
  title: 'ghfs',
})

const rpc = useRpc()
const hub = useHubState()

registerCommands(createAppCommands())
useCommandHandler()
useShiki()

const hubUi = useHubUiState()
const settingsOpen = computed({
  get: () => hubUi.settingsOpen.value,
  set: v => (hubUi.settingsOpen.value = v),
})

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
  <div class="h-screen w-screen bg-base color-base font-sans overflow-hidden">
    <div v-if="fatalError" class="flex flex-col items-center justify-center h-full color-muted">
      <p class="text-sm">{{ fatalError }}</p>
    </div>
    <div v-else-if="!ready" class="flex flex-col items-center justify-center h-full color-muted">
      <span class="i-octicon-sync-16 animate-spin text-2xl mb-3 color-active" />
      <p class="text-sm">Connecting…</p>
    </div>
    <NuxtPage v-else />
    <SettingsDialog v-model:open="settingsOpen" />
    <HubQueueDrawer />
    <CommandPalette />
  </div>
</template>

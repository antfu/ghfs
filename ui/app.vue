<script setup lang="ts">
useHead({
  htmlAttrs: { lang: 'en' },
  title: 'ghfs',
})

useRpc()

registerCommands(createAppCommands())
useCommandHandler()
useShiki()

const hubUi = useHubUiState()
const settingsOpen = computed({
  get: () => hubUi.settingsOpen.value,
  set: v => (hubUi.settingsOpen.value = v),
})
</script>

<template>
  <div class="h-screen w-screen bg-base color-base font-sans overflow-hidden">
    <NuxtPage />
    <SettingsDialog v-model:open="settingsOpen" />
    <HubQueueDrawer />
    <CommandPalette />
  </div>
</template>

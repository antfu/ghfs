<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useHead } from '#imports'
import { NuxtPage } from '#components'
import CardsStartDialog from './components/cards/StartDialog.vue'
import HubQueueDrawer from './components/hub/QueueDrawer.vue'
import PanelCommandPalette from './components/panel/CommandPalette.vue'
import PanelHelp from './components/panel/Help.vue'
import PanelSettings from './components/panel/Settings.vue'
import { createAppCommands } from './composables/useAppCommands'
import { useCommandHandler } from './composables/useCommandHandler'
import { registerCommands } from './composables/useCommands'
import { useHubState } from './composables/useHubState'
import { useHubUiState } from './composables/useHubUiState'
import { useRpc } from './composables/useRpc'
import { useShiki } from './composables/useShiki'
import { useTodoAutoPrune } from './composables/useTodoAutoPrune'

useHead({
  htmlAttrs: { lang: 'en' },
  title: 'ghfs',
})

const rpc = useRpc()
const hub = useHubState()

registerCommands(createAppCommands())
useCommandHandler()
useShiki()
useTodoAutoPrune()

const hubUi = useHubUiState()
const settingsOpen = computed({
  get: () => hubUi.settingsOpen.value,
  set: v => (hubUi.settingsOpen.value = v),
})
const settingsTab = computed({
  get: () => hubUi.settingsTab.value,
  set: v => (hubUi.settingsTab.value = v),
})

const ready = ref(false)
const fatalError = ref<string | null>(null)

onMounted(async () => {
  try {
    const caps = await rpc.$call('ghfs:capabilities')
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
    <PanelSettings v-model:open="settingsOpen" v-model:tab="settingsTab" />
    <HubQueueDrawer />
    <PanelCommandPalette />
    <PanelHelp />
    <CardsStartDialog />
  </div>
</template>

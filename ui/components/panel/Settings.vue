<script setup lang="ts">
import type { SettingsTab } from '../../composables/useHubUiState'

const open = defineModel<boolean>('open', { required: true })
const tab = defineModel<SettingsTab>('tab', { default: 'general' })

const hub = useHubState()
const ui = useUiState()
const isHubMode = computed(() => hub.capabilities.value?.mode === 'hub')
const ignoredCount = computed(() => (ui.uiState.ignored ?? []).length)
</script>

<template>
  <UiModal
    v-model:open="open"
    title="Settings"
    icon="i-ph-gear-six-duotone"
    description="Configure ghfs — identity, sync, saved replies, projects, and ignored items."
    width="w-[min(92vw,42rem)]"
    height="h-[36rem]"
    data-testid="settings-dialog"
  >
    <TabsRoot v-model="tab" class="flex flex-col">
      <TabsList class="sticky top-0 z-1 bg-base flex items-stretch gap-1 px-4 pt-3 border-b border-base">
        <TabsTrigger value="general" class="tab-trigger" data-testid="settings-tab-general">
          <span class="i-ph-gear-six-duotone" />
          General
        </TabsTrigger>
        <TabsTrigger value="account" class="tab-trigger" data-testid="settings-tab-account">
          <span class="i-ph-user-circle-duotone" />
          Account
        </TabsTrigger>
        <TabsTrigger v-if="isHubMode" value="projects" class="tab-trigger" data-testid="settings-tab-projects">
          <span class="i-ph-folder-duotone" />
          Projects
        </TabsTrigger>
        <TabsTrigger value="templates" class="tab-trigger" data-testid="settings-tab-templates">
          <span class="i-ph-chat-circle-text-duotone" />
          Saved replies
        </TabsTrigger>
        <TabsTrigger value="ignored" class="tab-trigger" data-testid="settings-tab-ignored">
          <span class="i-ph-eye-slash-duotone" />
          Ignored
          <span v-if="ignoredCount > 0" class="tab-count">{{ ignoredCount }}</span>
        </TabsTrigger>
      </TabsList>

      <div class="px-5 py-4">
        <TabsContent value="general">
          <PanelSettingsGeneral :active="open && tab === 'general'" />
        </TabsContent>
        <TabsContent value="account">
          <PanelSettingsAccount :active="open && tab === 'account'" />
        </TabsContent>
        <TabsContent v-if="isHubMode" value="projects">
          <PanelSettingsProjects :active="open && tab === 'projects'" />
        </TabsContent>
        <TabsContent value="templates">
          <PanelSettingsTemplates />
        </TabsContent>
        <TabsContent value="ignored">
          <PanelSettingsIgnored />
        </TabsContent>
      </div>
    </TabsRoot>

    <template #footer>
      <button
        type="button"
        class="btn-action-sm"
        @click="open = false"
      >
        Close
      </button>
    </template>
  </UiModal>
</template>

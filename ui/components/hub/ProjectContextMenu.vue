<script setup lang="ts">
import type { ProjectSummary } from '#ghfs/rpc-types'
import { computed } from 'vue'
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuRoot,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from 'reka-ui'
import { useAppState } from '../../composables/useAppState'
import { setProjectExcluded, syncProject } from '../../composables/useHubUiState'
import { useOnlineState } from '../../composables/useOnlineState'
import UiKbd from '../ui/Kbd.vue'

const props = defineProps<{
  project: ProjectSummary
}>()

const state = useAppState(props.project.id)
const { offline } = useOnlineState()

const syncing = computed(() => state.syncing.value)
const canSync = computed(() => props.project.hasToken && !syncing.value && !offline.value)

const itemClass = 'flex items-center gap-2 px-2.5 py-1.5 text-sm rounded-md cursor-default select-none outline-none data-[highlighted]:bg-active data-[disabled]:op-50 data-[disabled]:pointer-events-none'

function onSync() {
  if (!canSync.value)
    return
  void syncProject(props.project.id)
}

function onExclude() {
  void setProjectExcluded(props.project.id, true)
}
</script>

<template>
  <ContextMenuRoot>
    <ContextMenuTrigger as-child>
      <slot />
    </ContextMenuTrigger>
    <ContextMenuPortal>
      <ContextMenuContent
        class="panel-floating z-dropdown min-w-56 rounded-lg p-1 shadow-lg outline-none"
        :collision-padding="8"
        data-testid="hub-project-menu"
      >
        <div class="px-2.5 py-1 text-[11px] color-muted font-mono truncate" :title="project.repo">
          {{ project.repo }}
        </div>
        <ContextMenuSeparator class="my-1 h-px bg-base" />
        <ContextMenuItem
          :class="itemClass"
          :disabled="!canSync"
          data-testid="hub-project-menu-sync"
          @select="onSync"
        >
          <span class="i-octicon-sync-16 text-sm shrink-0" :class="syncing ? 'animate-spin' : ''" />
          <span class="flex-1">Sync this project now</span>
        </ContextMenuItem>
        <ContextMenuItem
          :class="itemClass"
          data-testid="hub-project-menu-exclude"
          @select="onExclude"
        >
          <span class="i-ph-eye-slash-duotone text-sm shrink-0" />
          <span class="flex-1">Exclude this project</span>
          <UiKbd command="hub.exclude-project" />
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenuPortal>
  </ContextMenuRoot>
</template>

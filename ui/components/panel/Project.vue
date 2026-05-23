<script setup lang="ts">
import type { ProjectSummary } from '#ghfs/rpc-types'
import type { ListItem } from '../../types/list-item'
import { Pane, Splitpanes } from 'splitpanes'
import 'splitpanes/dist/splitpanes.css'

const props = withDefaults(defineProps<{
  items: ListItem[]
  selectedKey: string | null
  showRepoName?: boolean
  searchHighlight?: string
  loading?: boolean
  loadError?: string | null
  hasPayload?: boolean

  headerVariant?: 'project' | 'recent' | 'none'
  project?: ProjectSummary | null
  projects?: ProjectSummary[]
  search?: string
  kind?: 'issue' | 'pull'
  counts?: { issues: number, pulls: number }
  searching?: boolean
  searchPlaceholder?: string
  emptyTitle?: string
  emptyMessage?: string
}>(), {
  searchHighlight: '',
  loading: false,
  loadError: null,
  hasPayload: true,
  headerVariant: 'none',
  project: null,
  projects: () => [],
  searching: false,
})

const emit = defineEmits<{
  select: [item: ListItem]
  'update:search': [value: string]
}>()

const ui = useUiState()
const activeProjectId = useActiveProjectId()
const listPaneSize = computed(() => ui.uiState.listPaneSize ?? 30)

function onResize(panes: Array<{ size: number }>) {
  const first = panes[0]?.size
  if (typeof first === 'number')
    ui.setListPaneSize(first)
}

const showRefreshBadge = computed(() => props.loading && props.hasPayload)
const showFirstLoad = computed(() => props.loading && !props.hasPayload)
const showError = computed(() => Boolean(props.loadError) && !props.hasPayload)
</script>

<template>
  <div class="h-full flex flex-col relative of-hidden">
    <div
      v-if="showRefreshBadge"
      class="absolute top-0 left-0 right-0 h-0.5 overflow-hidden z-20 pointer-events-none"
      data-testid="project-refresh-bar"
    >
      <div class="h-full bg-primary-500/60 animate-pulse" style="width: 100%;" />
    </div>

    <main class="flex-1 min-h-0">
      <Splitpanes class="h-full w-full ghfs-splitpanes" :dbl-click-splitter="false" @resize="onResize">
        <Pane :size="listPaneSize" min-size="20" max-size="60" class="bg-base">
          <div class="h-full flex flex-col" data-testid="item-list">
            <ItemListHeader
              v-if="headerVariant !== 'none'"
              :variant="headerVariant"
              :project="project"
              :projects="projects"
              :search="search"
              :kind="kind"
              :counts="counts"
              :searching="searching"
              :search-placeholder="searchPlaceholder"
              @update:search="(v: string) => emit('update:search', v)"
            >
              <template #actions>
                <slot name="header-actions" />
              </template>
            </ItemListHeader>

            <div v-if="showFirstLoad" class="flex flex-col items-center justify-center py-32 color-muted flex-1" data-testid="project-loading">
              <span class="i-octicon-sync-16 animate-spin text-2xl mb-3 color-active" />
              <p class="text-sm">Loading…</p>
            </div>
            <div v-else-if="showError" class="px-4 py-6 color-muted flex-1">
              <p class="text-sm">{{ loadError }}</p>
            </div>
            <ItemList
              v-else
              :items="items"
              :selected-key="selectedKey"
              :show-repo-name="showRepoName"
              :search-highlight="searchHighlight"
              :empty-title="emptyTitle"
              :empty-message="emptyMessage"
              class="flex-1 min-h-0"
              @select="emit('select', $event)"
            />
          </div>
        </Pane>

        <Pane :size="100 - listPaneSize" class="bg-base">
          <div class="h-full" data-testid="detail-panel">
            <PanelDetail :key="activeProjectId ?? '__none__'" :show-repo="showRepoName" />
          </div>
        </Pane>
      </Splitpanes>
    </main>

    <PanelQueue />
    <UiProgressToast :key="activeProjectId ?? '__none__'" />
  </div>
</template>

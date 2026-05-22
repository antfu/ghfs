<script setup lang="ts">
const props = withDefaults(defineProps<{
  mode?: 'project' | 'hub'
}>(), {
  mode: 'project',
})

const activeId = useActiveProjectId()
const state = useAppState()
const rpc = useProjectRpc(() => activeId.value ?? '__default__')
const isDark = useDark()
const hub = useHubState()
const hubUi = useHubUiState()
const router = useRouter()
const route = useRoute()
const { counts } = useFilteredItems()
const { upCount } = useQueue()
const { totalCount: hubQueueTotal } = useHubQueue()

const isHubMode = computed(() => hub.capabilities.value?.mode === 'hub')
const repoName = computed(() => state.payload.value?.repo.repo ?? 'connecting…')
const hasToken = computed(() => state.payload.value?.repo.hasToken ?? false)
const searching = computed(() => state.filters.search.trim().length > 0)
const queueBadge = computed(() => (props.mode === 'hub' ? hubQueueTotal.value : upCount.value))
const showHubBack = computed(() => isHubMode.value && props.mode === 'project')
const onRecentPage = computed(() => route.path === '/recent')
const onQueuePage = computed(() => route.path === '/queue')

async function triggerSync() {
  if (props.mode === 'hub') {
    await syncAllProjects()
    return
  }
  state.setError(null)
  state.setSyncing(true)
  try {
    await rpc.triggerSync({})
  }
  catch (error) {
    state.setError(`Sync failed: ${(error as Error).message}`)
    state.setSyncing(false)
  }
}

function toggleQueue() {
  if (props.mode === 'hub') {
    if (hubUi.queueDrawerOpen.value)
      hubUi.closeQueueDrawer()
    else
      hubUi.openQueueDrawer()
    return
  }
  if (state.queueOpen.value)
    state.closeQueue()
  else
    state.openQueue()
}

const syncTooltip = computed(() => {
  if (props.mode === 'hub')
    return hubUi.syncingAll.value ? 'Syncing all projects…' : 'Sync all projects'
  return hasToken.value ? 'Sync from GitHub' : 'No GitHub token available'
})

const syncing = computed(() => (props.mode === 'hub' ? hubUi.syncingAll.value : state.syncing.value))
</script>

<template>
  <header
    class="sticky top-0 z-nav panel-floating border-x-0 border-t-0 flex items-center gap-2 px-4 h-14"
    data-testid="navbar"
  >
    <div class="flex items-center gap-2 min-w-0 flex-none">
      <IconButton
        v-if="showHubBack"
        icon="i-octicon-organization-16"
        tooltip="Back to hub home"
        aria-label="Hub home"
        data-testid="navbar-hub-home"
        active
        @click="router.push('/')"
      />
      <template v-else-if="mode === 'hub'">
        <span class="i-octicon-organization-16 text-lg color-active shrink-0" />
        <span class="text-sm font-semibold">ghfs hub</span>
      </template>
      <template v-else>
        <ProjectIcon
          v-if="activeId && state.payload.value"
          :project="{ id: activeId, repo: state.payload.value.repo.repo }"
          :size="20"
          fallback-class="color-base"
        />
        <span v-else class="i-octicon-mark-github-16 text-lg color-base shrink-0" />
      </template>
      <HubProjectSwitcher v-if="isHubMode && activeId && mode === 'project'" :project-id="activeId" />
      <span
        v-else-if="mode === 'project'"
        class="font-mono text-sm truncate max-w-60"
        data-testid="navbar-repo"
      >{{ repoName }}</span>
    </div>

    <template v-if="mode === 'project'">
      <div class="h-6 border-l border-base mx-1 flex-none" />

      <nav class="flex items-center gap-0 flex-none" aria-label="Kind">
        <button
          type="button"
          class="px-3 py-1.5 text-xs flex items-center gap-1.5 border-b-2 transition outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 rounded-t"
          :class="[
            !searching && state.filters.kind === 'issue'
              ? 'border-primary-500 dark:border-primary-400 color-active font-medium'
              : 'border-transparent color-muted hover:color-base',
            searching ? 'op50 cursor-default' : '',
          ]"
          :disabled="searching"
          data-testid="navbar-tab-issues"
          @click="state.filters.kind = 'issue'"
        >
          <span class="i-octicon-issue-opened-16" />
          <span class="font-mono tabular-nums">{{ counts.issues }}</span>
          <span>Issues</span>
          <Kbd command="tab.issues" />
        </button>
        <button
          type="button"
          class="px-3 py-1.5 text-xs flex items-center gap-1.5 border-b-2 transition outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 rounded-t"
          :class="[
            !searching && state.filters.kind === 'pull'
              ? 'border-primary-500 dark:border-primary-400 color-active font-medium'
              : 'border-transparent color-muted hover:color-base',
            searching ? 'op50 cursor-default' : '',
          ]"
          :disabled="searching"
          data-testid="navbar-tab-pulls"
          @click="state.filters.kind = 'pull'"
        >
          <span class="i-octicon-git-pull-request-16" />
          <span class="font-mono tabular-nums">{{ counts.pulls }}</span>
          <span>Pull requests</span>
          <Kbd command="tab.pulls" />
        </button>
      </nav>

      <div class="h-6 border-l border-base mx-1 flex-none" />

      <SearchField
        v-model="state.filters.search"
        placeholder="Search title, body, author, labels…"
        data-shortcut="search"
        data-testid="navbar-search"
        command="search.focus"
      />
    </template>

    <template v-else-if="mode === 'hub'">
      <div class="h-6 border-l border-base mx-1 flex-none" />
      <nav class="flex items-center gap-1 flex-none" aria-label="Hub sections">
        <button
          type="button"
          class="px-2.5 py-1.5 text-xs flex items-center gap-1.5 rounded transition outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          :class="route.path === '/' ? 'color-active font-medium bg-active' : 'color-muted hover:color-base'"
          data-testid="navbar-hub-home-link"
          @click="router.push('/')"
        >
          <span class="i-octicon-organization-16" />
          <span>Projects</span>
        </button>
        <button
          type="button"
          class="px-2.5 py-1.5 text-xs flex items-center gap-1.5 rounded transition outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          :class="onRecentPage ? 'color-active font-medium bg-active' : 'color-muted hover:color-base'"
          data-testid="navbar-hub-recent-link"
          @click="router.push('/recent')"
        >
          <span class="i-octicon-history-16" />
          <span>Recent</span>
          <Kbd command="hub.recent" />
        </button>
        <button
          type="button"
          class="px-2.5 py-1.5 text-xs flex items-center gap-1.5 rounded transition outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          :class="onQueuePage ? 'color-active font-medium bg-active' : 'color-muted hover:color-base'"
          data-testid="navbar-hub-queue-link"
          @click="router.push('/queue')"
        >
          <span class="i-octicon-list-unordered-16" />
          <span>Queue</span>
          <span
            v-if="hubQueueTotal > 0"
            class="badge-color-green !px-1 !py-0 font-mono tabular-nums text-[10px] leading-none min-w-4 h-4 justify-center"
          >{{ hubQueueTotal }}</span>
        </button>
      </nav>
    </template>

    <div class="flex-auto" />

    <div class="h-6 border-l border-base mx-1 flex-none" />

    <IconButton
      v-if="mode === 'project'"
      icon="i-octicon-sync-16"
      :tooltip="syncTooltip"
      :disabled="syncing || !hasToken"
      :spinning="syncing"
      @click="triggerSync"
    >
      <template #badge>
        <Kbd command="action.sync" class="absolute -bottom-1 -right-1" />
      </template>
    </IconButton>
    <IconButton
      v-else
      icon="i-octicon-sync-16"
      :tooltip="syncTooltip"
      :disabled="syncing"
      :spinning="syncing"
      data-testid="navbar-hub-sync-all"
      @click="triggerSync"
    />

    <IconButton
      v-if="mode === 'project'"
      icon="i-octicon-list-unordered-16"
      tooltip="Queue"
      :active="state.queueOpen.value"
      data-testid="navbar-queue-toggle"
      @click="toggleQueue"
    >
      <template #badge>
        <span
          v-if="queueBadge > 0"
          class="absolute -top-1 -right-1 badge-color-green !px-1 !py-0 font-mono tabular-nums text-[10px] leading-none min-w-4 h-4 justify-center"
          data-testid="queue-badge"
        >{{ queueBadge }}</span>
      </template>
    </IconButton>
    <IconButton
      v-else-if="mode === 'hub' && !onQueuePage"
      icon="i-ph-list-checks-duotone"
      tooltip="Quick view queue"
      :active="hubUi.queueDrawerOpen.value"
      data-testid="navbar-hub-queue-drawer-toggle"
      @click="toggleQueue"
    >
      <template #badge>
        <span
          v-if="queueBadge > 0"
          class="absolute -top-1 -right-1 badge-color-green !px-1 !py-0 font-mono tabular-nums text-[10px] leading-none min-w-4 h-4 justify-center"
        >{{ queueBadge }}</span>
      </template>
    </IconButton>

    <IconButton
      icon="i-ph-gear-six-duotone"
      tooltip="Settings"
      data-testid="navbar-settings"
      @click="hubUi.openSettings()"
    >
      <template #badge>
        <Kbd command="settings.open" class="absolute -bottom-1 -right-1" />
      </template>
    </IconButton>

    <IconButton
      :icon="isDark ? 'i-ph-sun-duotone' : 'i-ph-moon-duotone'"
      :tooltip="isDark ? 'Light mode' : 'Dark mode'"
      @click="isDark = !isDark"
    >
      <template #badge>
        <Kbd command="action.theme" class="absolute -bottom-1 -right-1" />
      </template>
    </IconButton>
  </header>
</template>

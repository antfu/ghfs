<script setup lang="ts">
const activeId = useActiveProjectId()
const state = useAppState()
const rpc = useProjectRpc(() => activeId.value ?? '__default__')
const isDark = useDark()
const hub = useHubState()
const router = useRouter()
const { counts } = useFilteredItems()
const { upCount } = useQueue()

const isHubMode = computed(() => hub.capabilities.value?.mode === 'hub')
const repoName = computed(() => state.payload.value?.repo.repo ?? 'connecting…')
const hasToken = computed(() => state.payload.value?.repo.hasToken ?? false)
const searching = computed(() => state.filters.search.trim().length > 0)

async function triggerSync() {
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
  if (state.queueOpen.value)
    state.closeQueue()
  else
    state.openQueue()
}
</script>

<template>
  <header
    class="sticky top-0 z-nav bg-glass border-b border-base flex items-center gap-2 px-4 h-14"
    data-testid="navbar"
  >
    <div class="flex items-center gap-2 min-w-0 flex-none">
      <IconButton
        v-if="isHubMode"
        icon="i-octicon-organization-16"
        tooltip="Back to hub home"
        aria-label="Hub home"
        data-testid="navbar-hub-home"
        active
        @click="router.push('/hub')"
      />
      <ProjectIcon
        v-else-if="activeId && state.payload.value"
        :project="{ id: activeId, repo: state.payload.value.repo.repo }"
        :size="20"
        fallback-class="color-base"
      />
      <span v-else class="i-octicon-mark-github-16 text-lg color-base shrink-0" />
      <HubProjectSwitcher v-if="isHubMode && activeId" :project-id="activeId" />
      <span v-else class="font-mono text-sm truncate max-w-60" data-testid="navbar-repo">{{ repoName }}</span>
    </div>

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
        <Kbd shortcut-id="tab.issues" />
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
        <Kbd shortcut-id="tab.pulls" />
      </button>
    </nav>

    <div class="h-6 border-l border-base mx-1 flex-none" />

    <SearchField
      v-model="state.filters.search"
      placeholder="Search title, body, author, labels…"
      data-shortcut="search"
      data-testid="navbar-search"
      shortcut-id="search.focus"
    />

    <div class="flex-auto" />

    <div class="h-6 border-l border-base mx-1 flex-none" />

    <IconButton
      icon="i-octicon-sync-16"
      :tooltip="hasToken ? 'Sync from GitHub' : 'No GitHub token available'"
      :disabled="state.syncing.value || !hasToken"
      :spinning="state.syncing.value"
      @click="triggerSync"
    >
      <template #badge>
        <Kbd shortcut-id="action.sync" class="absolute -bottom-1 -right-1" />
      </template>
    </IconButton>

    <IconButton
      icon="i-octicon-list-unordered-16"
      tooltip="Queue"
      :active="state.queueOpen.value"
      data-testid="navbar-queue-toggle"
      @click="toggleQueue"
    >
      <template #badge>
        <span
          v-if="upCount > 0"
          class="absolute -top-1 -right-1 badge-color-green !px-1 !py-0 font-mono tabular-nums text-[10px] leading-none min-w-4 h-4 justify-center"
          data-testid="queue-badge"
        >{{ upCount }}</span>
      </template>
    </IconButton>

    <IconButton
      :icon="isDark ? 'i-ph-sun-duotone' : 'i-ph-moon-duotone'"
      :tooltip="isDark ? 'Light mode' : 'Dark mode'"
      @click="isDark = !isDark"
    >
      <template #badge>
        <Kbd shortcut-id="action.theme" class="absolute -bottom-1 -right-1" />
      </template>
    </IconButton>
  </header>
</template>

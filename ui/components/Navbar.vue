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

async function checkRemote() {
  try {
    await rpc.checkRemote()
  }
  catch (error) {
    state.setError(`Remote check failed: ${(error as Error).message}`)
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
  <header class="sticky top-0 z-30 bg-glass flex items-center gap-3 px-4 h-14 border-b border-x-0 border-base" data-testid="navbar">
    <div class="flex items-center gap-2 min-w-0 flex-none">
      <TooltipButton v-if="isHubMode" tooltip="Back to hub home">
        <button
          class="btn-icon"
          aria-label="Hub home"
          data-testid="navbar-hub-home"
          @click="router.push('/hub')"
        >
          <span class="i-octicon-organization-16 text-lg color-active" />
        </button>
      </TooltipButton>
      <span v-else class="i-octicon-mark-github-16 text-lg color-base shrink-0" />
      <HubProjectSwitcher v-if="isHubMode && activeId" :project-id="activeId" />
      <span v-else class="font-mono text-sm truncate max-w-60" data-testid="navbar-repo">{{ repoName }}</span>
    </div>

    <div class="h-6 w-px bg-neutral-200 dark:bg-neutral-800 mx-1 flex-none" />

    <nav class="flex items-center gap-0 flex-none" aria-label="Kind">
      <button
        type="button"
        class="px-3 py-1.5 text-xs flex items-center gap-1.5 border-b-2 transition"
        :class="[!searching && state.filters.kind === 'issue' ? 'border-active color-active font-medium' : 'border-transparent color-muted hover:color-base', searching ? 'op50 cursor-default' : '']"
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
        class="px-3 py-1.5 text-xs flex items-center gap-1.5 border-b-2 transition"
        :class="[!searching && state.filters.kind === 'pull' ? 'border-active color-active font-medium' : 'border-transparent color-muted hover:color-base', searching ? 'op50 cursor-default' : '']"
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


    <div class="h-6 w-px bg-neutral-200 dark:bg-neutral-800 mx-1 flex-none" />

    <label class="flex-1 min-w-40 flex items-center gap-2 border border-base rounded bg-base px-2 py-1 transition max-w-xl focus-within:border-active focus-within:ring-2 focus-within:ring-primary-500/30">
      <span class="i-octicon-search-16 color-muted shrink-0" />
      <input
        v-model="state.filters.search"
        data-shortcut="search"
        data-testid="navbar-search"
        type="text"
        placeholder="Search title, body, author, labels…"
        class="bg-transparent outline-none w-full font-sans text-sm"
      >
      <Kbd v-if="!state.filters.search" shortcut-id="search.focus" class="shrink-0" />
      <button
        v-else
        class="color-muted hover:color-base shrink-0"
        aria-label="Clear"
        @click="state.filters.search = ''"
      ><span class="i-octicon-x-16 text-sm" /></button>
    </label>

    <div class="flex-auto"></div>

    <div class="h-6 w-px bg-neutral-200 dark:bg-neutral-800 mx-1 flex-none" />

    <div class="flex items-center gap-0.5 flex-none">
      <TooltipButton :tooltip="hasToken ? 'Sync from GitHub' : 'No GitHub token available'">
        <button class="btn-icon" :disabled="state.syncing.value || !hasToken" @click="triggerSync">
          <span class="i-octicon-sync-16" :class="{ 'animate-spin': state.syncing.value }" />
        </button>
      </TooltipButton>
      <Kbd shortcut-id="action.sync" />
    </div>

    <div class="flex items-center gap-0.5 flex-none">
      <TooltipButton tooltip="Queue">
        <button class="btn-icon relative" data-testid="navbar-queue-toggle" @click="toggleQueue">
          <span class="i-octicon-list-unordered-16" />
          <span
            v-if="upCount > 0"
            class="absolute -top-1 -right-1 badge-color-green !px-1 !py-0 font-mono tabular-nums text-[10px] leading-none min-w-4 h-4 justify-center"
            data-testid="queue-badge"
          >{{ upCount }}</span>
        </button>
      </TooltipButton>
      <Kbd shortcut-id="action.queue" />
    </div>

    <div class="flex items-center gap-0.5 flex-none">
      <TooltipButton :tooltip="isDark ? 'Light mode' : 'Dark mode'">
        <button class="btn-icon" @click="isDark = !isDark">
          <span :class="isDark ? 'i-octicon-sun-16' : 'i-octicon-moon-16'" />
        </button>
      </TooltipButton>
      <Kbd shortcut-id="action.theme" />
    </div>
  </header>
</template>

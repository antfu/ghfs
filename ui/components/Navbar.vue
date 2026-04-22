<script setup lang="ts">
const state = useAppState()
const rpc = useRpc()
const isDark = useDark()
const { counts } = useFilteredItems()

const repoName = computed(() => state.payload.value?.repo.repo ?? 'connecting…')
const upCount = computed(() => state.payload.value?.queue.upCount ?? 0)
const hasToken = computed(() => state.payload.value?.repo.hasToken ?? false)
const searching = computed(() => state.filters.search.trim().length > 0)

const stateOptions = [
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
] as const

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
  <header class="sticky top-0 z-30 bg-glass flex items-center gap-3 px-4 h-14 border-b border-x-0 border-base">
    <div class="flex items-center gap-2 min-w-0 flex-none">
      <span class="i-octicon-mark-github-16 text-lg color-base shrink-0" />
      <span class="font-mono text-sm truncate max-w-60">{{ repoName }}</span>
    </div>

    <div class="h-6 w-px bg-neutral-200 dark:bg-neutral-800 mx-1 flex-none" />

    <nav class="flex items-center gap-0 flex-none" aria-label="Kind">
      <button
        type="button"
        class="px-3 py-1.5 text-xs flex items-center gap-1.5 border-b-2 transition"
        :class="[!searching && state.filters.kind === 'issue' ? 'border-active color-active font-medium' : 'border-transparent color-muted hover:color-base', searching ? 'op50 cursor-default' : '']"
        :disabled="searching"
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
        @click="state.filters.kind = 'pull'"
      >
        <span class="i-octicon-git-pull-request-16" />
        <span class="font-mono tabular-nums">{{ counts.pulls }}</span>
        <span>Pull requests</span>
        <Kbd shortcut-id="tab.pulls" />
      </button>
    </nav>


    <div class="h-6 w-px bg-neutral-200 dark:bg-neutral-800 mx-1 flex-none" />

    <div class="flex items-center gap-0.5 bg-secondary rounded p-0.5 flex-none">
      <button
        v-for="opt in stateOptions"
        :key="opt.value"
        class="px-2 py-1 rounded text-xs transition"
        :class="state.filters.state === opt.value ? 'bg-base shadow-sm color-active font-medium' : 'color-muted hover:color-base'"
        @click="state.filters.state = opt.value"
      >
        {{ opt.label }}
      </button>
    </div>

    <label class="flex-1 min-w-40 flex items-center gap-2 border border-base rounded bg-base px-2 py-1 focus-within:border-active transition max-w-xl">
      <span class="i-octicon-search-16 color-muted shrink-0" />
      <input
        v-model="state.filters.search"
        data-shortcut="search"
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
        <button class="btn-icon relative" @click="toggleQueue">
          <span class="i-octicon-list-unordered-16" />
          <span
            v-if="upCount > 0"
            class="absolute -top-1 -right-1 badge-color-green !px-1 !py-0 font-mono tabular-nums text-[10px] leading-none min-w-4 h-4 justify-center"
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

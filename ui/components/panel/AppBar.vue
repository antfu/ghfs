<script setup lang="ts">
const props = withDefaults(defineProps<{
  mode?: 'project' | 'hub'
}>(), {
  mode: 'project',
})

const activeId = useActiveProjectId()
const state = useAppState()
const rpc = useRpc()
const isDark = useDark()
const hub = useHubState()
const hubUi = useHubUiState()
const router = useRouter()
const route = useRoute()
const { counts, filteredItems } = useFilteredItems()
const { upCount } = useQueue()
const { totalCount: hubQueueTotal } = useHubQueue()
const recentFiltered = useRecentFiltered()
const todos = useHubTodos()
const cards = useCardsMode()

const isHubMode = computed(() => hub.capabilities.value?.mode === 'hub')
const cardsHasPile = computed(() => cards.total.value > 0)
const onCardsPage = computed(() => route.path === '/cards')
const repoName = computed(() => state.payload.value?.repo.repo ?? 'connecting…')
const projectPath = computed(() => state.payload.value?.repo.projectPath ?? '')
const hasToken = computed(() => state.payload.value?.repo.hasToken ?? false)
const pathCopied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | null = null

async function copyProjectPath() {
  if (!projectPath.value)
    return
  try {
    await navigator.clipboard.writeText(projectPath.value)
    pathCopied.value = true
    if (copiedTimer)
      clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => { pathCopied.value = false }, 1200)
  }
  catch {}
}

async function openProjectFolder() {
  if (!activeId.value)
    return
  try {
    await rpc.$call('ghfs:open-folder', activeId.value)
  }
  catch (error) {
    state.setError(`Open folder failed: ${(error as Error).message}`)
  }
}
const searching = computed(() => state.filters.search.trim().length > 0)
const queueBadge = computed(() => (props.mode === 'hub' ? hubQueueTotal.value : upCount.value))
const showHubBack = computed(() => isHubMode.value && props.mode === 'project')
const onRecentPage = computed(() => route.path === '/recent')
const onTodoPage = computed(() => route.path === '/todo')

const forceSyncDialogOpen = ref(false)

function onSyncClick(event: MouseEvent, execute: () => void) {
  if (event.shiftKey) {
    forceSyncDialogOpen.value = true
    return
  }
  execute()
}

const syncTooltip = computed(() => {
  if (props.mode === 'hub')
    return hubUi.syncingAll.value ? 'Syncing all projects…' : 'Sync all projects'
  if (!hasToken.value)
    return 'No GitHub token available'
  return 'Sync from GitHub (⇧ for force sync)'
})

const syncing = computed(() => (props.mode === 'hub' ? hubUi.syncingAll.value : state.syncing.value))

const cardsSource = computed(() => {
  if (onTodoPage.value)
    return todos.listItems.value
  if (props.mode === 'hub' && onRecentPage.value)
    return recentFiltered.filteredItems.value
  return filteredItems.value
})
const cardsAvailable = computed(() => cardsSource.value.length > 0)
const cardsTooltip = computed(() => {
  const n = cardsSource.value.length
  if (n === 0)
    return 'No items to triage'
  return `Start a card pile — triage ${Math.min(n, 10)} ${n === 1 ? 'item' : 'items'}`
})

</script>

<template>
  <header
    class="sticky top-0 z-nav panel-floating border-x-0 border-t-0 flex items-center gap-2 px-4 h-14"
    data-testid="navbar"
  >
    <div class="flex items-center gap-2 min-w-0 flex-none">
      <UiWithCommand v-if="showHubBack" v-slot="{ execute, disabled }" command="hub.back">
        <UiIconButton
          icon="i-octicon-organization-16"
          tooltip="Back to hub home"
          aria-label="Hub home"
          data-testid="navbar-hub-home"
          active
          :disabled="disabled"
          @click="execute"
        />
      </UiWithCommand>
      <template v-else-if="mode === 'hub'">
        <span class="i-octicon-organization-16 text-lg color-active shrink-0" />
        <span class="text-sm font-semibold">ghfs hub</span>
      </template>
      <template v-else>
        <DisplayProjectIcon
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
      <template v-if="mode === 'project' && projectPath">
        <UiIconButton
          icon="i-ph-folder-open-duotone"
          tooltip="Open project folder"
          aria-label="Open project folder"
          data-testid="navbar-open-folder"
          @click="openProjectFolder"
        />
        <UiIconButton
          :icon="pathCopied ? 'i-ph-check-bold' : 'i-ph-copy-duotone'"
          :tooltip="pathCopied ? 'Copied!' : 'Copy project path'"
          aria-label="Copy project path"
          data-testid="navbar-copy-path"
          @click="copyProjectPath"
        />
      </template>
    </div>

    <template v-if="mode === 'project'">
      <div class="h-6 border-l border-base mx-1 flex-none" />

      <nav class="flex items-center gap-0 flex-none" aria-label="Kind">
        <UiWithCommand v-slot="{ execute, disabled }" command="tab.issues">
          <button
            type="button"
            class="px-3 py-1.5 text-xs flex items-center gap-1.5 border-b-2 transition outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 rounded-t"
            :class="[
              !searching && state.filters.kind === 'issue'
                ? 'border-primary-500 dark:border-primary-400 color-active font-medium'
                : 'border-transparent color-muted hover:color-base',
              searching ? 'op50 cursor-default' : '',
            ]"
            :disabled="searching || disabled"
            data-testid="navbar-tab-issues"
            @click="execute"
          >
            <span class="i-octicon-issue-opened-16" />
            <span class="font-mono tabular-nums">{{ counts.issues }}</span>
            <span>Issues</span>
          </button>
        </UiWithCommand>
        <UiWithCommand v-slot="{ execute, disabled }" command="tab.pulls">
          <button
            type="button"
            class="px-3 py-1.5 text-xs flex items-center gap-1.5 border-b-2 transition outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 rounded-t"
            :class="[
              !searching && state.filters.kind === 'pull'
                ? 'border-primary-500 dark:border-primary-400 color-active font-medium'
                : 'border-transparent color-muted hover:color-base',
              searching ? 'op50 cursor-default' : '',
            ]"
            :disabled="searching || disabled"
            data-testid="navbar-tab-pulls"
            @click="execute"
          >
            <span class="i-octicon-git-pull-request-16" />
            <span class="font-mono tabular-nums">{{ counts.pulls }}</span>
            <span>Pull requests</span>
          </button>
        </UiWithCommand>
      </nav>

      <div class="h-6 border-l border-base mx-1 flex-none" />

      <UiSearchField
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
        <UiWithCommand v-slot="{ execute, disabled }" command="hub.home">
          <button
            type="button"
            class="px-2.5 py-1.5 text-xs flex items-center gap-1.5 rounded transition outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            :class="route.path === '/' ? 'color-active font-medium bg-active' : 'color-muted hover:color-base'"
            data-testid="navbar-hub-home-link"
            :disabled="disabled"
            @click="execute"
          >
            <span class="i-octicon-organization-16" />
            <span>Projects</span>
          </button>
        </UiWithCommand>
        <UiWithCommand v-slot="{ execute, disabled }" command="hub.recent">
          <button
            type="button"
            class="px-2.5 py-1.5 text-xs flex items-center gap-1.5 rounded transition outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            :class="onRecentPage ? 'color-active font-medium bg-active' : 'color-muted hover:color-base'"
            data-testid="navbar-hub-recent-link"
            :disabled="disabled"
            @click="execute"
          >
            <span class="i-octicon-history-16" />
            <span>Recent</span>
          </button>
        </UiWithCommand>
        <UiWithCommand v-slot="{ execute, disabled }" command="hub.todo">
          <button
            type="button"
            class="px-2.5 py-1.5 text-xs flex items-center gap-1.5 rounded transition outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            :class="onTodoPage ? 'color-active font-medium bg-active' : 'color-muted hover:color-base'"
            data-testid="navbar-hub-todo-link"
            :disabled="disabled"
            @click="execute"
          >
            <span class="i-ph-bookmark-simple-duotone" />
            <span>Todo</span>
          </button>
        </UiWithCommand>
        <UiWithCommand v-if="cardsHasPile" v-slot="{ execute, disabled }" command="hub.cards">
          <button
            type="button"
            class="px-2.5 py-1.5 text-xs flex items-center gap-1.5 rounded transition outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            :class="onCardsPage ? 'color-active font-medium bg-active' : 'color-muted hover:color-base'"
            data-testid="navbar-hub-cards-link"
            :disabled="disabled"
            @click="execute"
          >
            <span class="i-ph-cards-three-duotone" />
            <span>Cards</span>
          </button>
        </UiWithCommand>
      </nav>

      <template v-if="onRecentPage">
        <div class="h-6 border-l border-base mx-1 flex-none" />
        <UiSearchField
          v-model="recentFiltered.search.value"
          placeholder="Search across all projects…"
          data-shortcut="search"
          data-testid="navbar-search"
          command="search.focus"
        />
      </template>
    </template>

    <div class="flex-auto" />

    <div class="h-6 border-l border-base mx-1 flex-none" />

    <UiWithCommand
      v-if="mode === 'project' || onRecentPage || onTodoPage"
      v-slot="{ execute, disabled }"
      command="cards.start"
      placement="badge"
    >
      <UiIconButton
        icon="i-ph-cards-three-duotone"
        :tooltip="cardsTooltip"
        aria-label="Start a card pile"
        data-testid="navbar-cards-mode"
        :disabled="disabled || !cardsAvailable"
        @click="execute"
      />
    </UiWithCommand>

    <UiWithCommand v-if="mode === 'project'" v-slot="{ execute, disabled }" command="action.sync" placement="badge">
      <UiIconButton
        icon="i-octicon-sync-16"
        :tooltip="syncTooltip"
        :disabled="syncing || !hasToken || disabled"
        :spinning="syncing"
        @click="(e: MouseEvent) => onSyncClick(e, execute)"
      />
    </UiWithCommand>
    <UiWithCommand v-else v-slot="{ execute }" command="hub.sync-all" placement="badge">
      <UiIconButton
        icon="i-octicon-sync-16"
        :tooltip="syncTooltip"
        :disabled="syncing"
        :spinning="syncing"
        data-testid="navbar-hub-sync-all"
        @click="execute"
      />
    </UiWithCommand>

    <UiWithCommand v-if="mode === 'project'" v-slot="{ execute, disabled }" command="action.queue" placement="badge">
      <UiIconButton
        icon="i-octicon-list-unordered-16"
        tooltip="Queue"
        :active="state.queueOpen.value"
        data-testid="navbar-queue-toggle"
        :disabled="disabled"
        @click="execute"
      >
        <template #badge>
          <span
            v-if="queueBadge > 0"
            class="absolute -top-1 -right-1 badge-color-green !px-1 !py-0 font-mono tabular-nums text-[10px] leading-none min-w-4 h-4 justify-center"
            data-testid="queue-badge"
          >{{ queueBadge }}</span>
        </template>
      </UiIconButton>
    </UiWithCommand>
    <UiWithCommand v-else-if="mode === 'hub'" v-slot="{ execute, disabled }" command="action.queue" placement="badge">
      <UiIconButton
        icon="i-ph-list-checks-duotone"
        tooltip="Quick view queue"
        :active="hubUi.queueDrawerOpen.value"
        data-testid="navbar-hub-queue-drawer-toggle"
        :disabled="disabled"
        @click="execute"
      >
        <template #badge>
          <span
            v-if="queueBadge > 0"
            class="absolute -top-1 -right-1 badge-color-green !px-1 !py-0 font-mono tabular-nums text-[10px] leading-none min-w-4 h-4 justify-center"
          >{{ queueBadge }}</span>
        </template>
      </UiIconButton>
    </UiWithCommand>

    <UiWithCommand v-slot="{ execute, disabled }" command="settings.open" placement="badge">
      <UiIconButton
        icon="i-ph-gear-six-duotone"
        tooltip="Settings"
        data-testid="navbar-settings"
        :disabled="disabled"
        @click="execute"
      />
    </UiWithCommand>

    <UiWithCommand v-slot="{ execute }" command="action.theme" placement="badge">
      <UiIconButton
        :icon="isDark ? 'i-ph-sun-duotone' : 'i-ph-moon-duotone'"
        :tooltip="isDark ? 'Light mode' : 'Dark mode'"
        @click="execute"
      />
    </UiWithCommand>

    <PanelForceSyncDialog v-if="mode === 'project'" v-model:open="forceSyncDialogOpen" />
  </header>
</template>

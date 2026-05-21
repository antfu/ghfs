<script setup lang="ts">
import type { ProjectSummary } from '#ghfs/shared-rpc'

const rpc = useRpc()
const hub = useHubState()
const hubUi = useHubUiState()
const isDark = useDark()
const ui = useUiState()

const projects = computed<ProjectSummary[]>(() => hub.projects.value)
const pickerOpen = computed({ get: () => hubUi.pickerOpen.value, set: v => (hubUi.pickerOpen.value = v) })
const rootDialogOpen = computed({ get: () => hubUi.rootDialogOpen.value, set: v => (hubUi.rootDialogOpen.value = v) })
const syncingAll = computed(() => hubUi.syncingAll.value)
const focusedIndex = ref(0)

const hubCwd = computed(() => hub.hubCwd.value)

const aggregates = computed(() => {
  let issues = 0
  let pulls = 0
  let tokens = 0
  let synced = 0
  for (const p of projects.value) {
    issues += p.openIssues
    pulls += p.openPulls
    if (p.hasToken)
      tokens += 1
    if (p.lastSyncedAt)
      synced += 1
  }
  return { issues, pulls, tokens, synced }
})

const lastSyncedSummary = computed(() => {
  let mostRecent: string | undefined
  for (const p of projects.value) {
    if (!p.lastSyncedAt)
      continue
    if (!mostRecent || p.lastSyncedAt > mostRecent)
      mostRecent = p.lastSyncedAt
  }
  return mostRecent
})

const syncableCount = computed(() => projects.value.filter(p => p.hasToken).length)

onMounted(async () => {
  try {
    const info = await rpc.hubInfo()
    hub.setHubCwd(info.cwd)
  }
  catch {
    /* header just falls back to the title */
  }
  try {
    const fresh = await rpc.listProjects()
    hub.setProjects(fresh)
  }
  catch {
    /* hub state stays whatever capabilities returned */
  }
})

async function onRootChanged() {
  // Same project IDs may point at different filesystem locations under a
  // new hub root, so flush the icon cache before refetching.
  clearProjectIconCache()
  try {
    const fresh = await rpc.listProjects()
    hub.setProjects(fresh)
  }
  catch { /* noop */ }
}

function openProject(id: string) {
  navigateTo(`/hub/${id}`)
}

async function syncAll() {
  await syncAllProjects()
}

const cardRefs = ref<HTMLButtonElement[]>([])

function setCardRef(el: Element | { $el: Element } | null, index: number) {
  if (!el)
    return
  const target = (el as { $el?: Element }).$el ?? el
  if (target instanceof HTMLButtonElement)
    cardRefs.value[index] = target
}

function focusCard(index: number) {
  const count = projects.value.length
  if (count === 0)
    return
  const next = ((index % count) + count) % count
  focusedIndex.value = next
  cardRefs.value[next]?.focus()
}

function focusNext(delta: number) {
  focusCard(focusedIndex.value + delta)
}

function onCardKeydown(event: KeyboardEvent, index: number) {
  if (event.key === 'j' || event.key === 'ArrowDown') {
    event.preventDefault()
    focusNext(1)
  }
  else if (event.key === 'k' || event.key === 'ArrowUp') {
    event.preventDefault()
    focusNext(-1)
  }
  else if (event.key === 'ArrowRight') {
    event.preventDefault()
    focusNext(1)
  }
  else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    focusNext(-1)
  }
  else if (event.key === 'g') {
    event.preventDefault()
    focusCard(0)
  }
  else if (event.key === 'G') {
    event.preventDefault()
    focusCard(projects.value.length - 1)
  }
  else {
    return
  }
  focusedIndex.value = index
}
</script>

<template>
  <div class="h-full flex flex-col" data-testid="hub-home">
    <header class="sticky top-0 z-nav bg-glass border-b border-base flex items-center gap-3 px-5 h-14">
      <span class="i-octicon-organization-16 text-lg color-active shrink-0" />
      <div class="flex flex-col leading-tight min-w-0">
        <span class="text-sm font-semibold">ghfs hub</span>
        <button
          v-if="hubCwd"
          type="button"
          class="text-[11px] color-muted hover:color-active font-mono truncate inline-flex items-center gap-1 transition outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 rounded"
          data-testid="hub-root-button"
          :title="`${hubCwd} — click to change`"
          @click="rootDialogOpen = true"
        >
          <span class="truncate">{{ hubCwd }}</span>
          <span class="i-ph-pencil-simple-duotone text-[10px] shrink-0 op70" />
        </button>
      </div>
      <div class="flex-1" />
      <button
        class="btn-action-sm"
        data-testid="hub-sync-all"
        :title="syncableCount > 0 ? `Sync ${syncableCount} project${syncableCount === 1 ? '' : 's'}` : 'No project has a GitHub token'"
        :disabled="syncingAll || syncableCount === 0"
        @click="syncAll"
      >
        <span class="i-octicon-sync-16" :class="syncingAll ? 'animate-spin' : ''" />
        <span>{{ syncingAll ? 'Syncing…' : 'Sync all' }}</span>
      </button>
      <button
        class="btn-action-sm"
        data-testid="hub-open-picker"
        @click="pickerOpen = true"
      >
        <span class="i-ph-sliders-duotone" />
        <span>Manage projects</span>
      </button>
      <IconButton
        :icon="isDark ? 'i-ph-sun-duotone' : 'i-ph-moon-duotone'"
        :tooltip="isDark ? 'Light mode' : 'Dark mode'"
        aria-label="Toggle theme"
        @click="isDark = !isDark"
      />
      <IconButton
        icon="i-ph-question-duotone"
        tooltip="Keyboard shortcuts"
        aria-label="Help"
        @click="ui.helpOpen.value = true"
      />
    </header>

    <main class="flex-1 overflow-y-auto">
      <div class="max-w-6xl mx-auto px-5 py-6 flex flex-col gap-6">
        <section
          class="panel-card px-5 py-4 flex flex-wrap items-center gap-x-6 gap-y-2"
          data-testid="hub-summary"
        >
          <div class="flex flex-col leading-tight">
            <span class="text-[11px] uppercase tracking-wide color-muted font-medium">Projects</span>
            <span class="text-2xl font-semibold tabular-nums">{{ projects.length }}</span>
          </div>
          <span class="h-8 border-l border-base mx-1" />
          <div class="flex flex-col leading-tight">
            <span class="text-[11px] uppercase tracking-wide color-muted font-medium flex items-center gap-1">
              <span class="i-octicon-issue-opened-16" />
              <span>Open issues</span>
            </span>
            <span class="text-2xl font-semibold tabular-nums">{{ aggregates.issues }}</span>
          </div>
          <div class="flex flex-col leading-tight">
            <span class="text-[11px] uppercase tracking-wide color-muted font-medium flex items-center gap-1">
              <span class="i-octicon-git-pull-request-16" />
              <span>Open pull requests</span>
            </span>
            <span class="text-2xl font-semibold tabular-nums">{{ aggregates.pulls }}</span>
          </div>
          <div class="flex-1" />
          <div class="flex flex-col leading-tight text-right">
            <span class="text-[11px] uppercase tracking-wide color-muted font-medium">Last sync</span>
            <span class="text-sm tabular-nums" :title="lastSyncedSummary ?? ''">{{ formatRelative(lastSyncedSummary) }}</span>
          </div>
        </section>

        <section class="flex flex-col gap-3">
          <div class="flex items-baseline gap-2">
            <h2 class="text-sm font-semibold">Projects</h2>
            <span class="color-muted text-xs">{{ projects.length }} enabled · sorted by recent activity</span>
            <div class="flex-1" />
            <button
              v-if="projects.length > 0"
              class="text-xs color-muted hover:color-active transition"
              @click="pickerOpen = true"
            >
              + add or remove
            </button>
          </div>

          <EmptyState
            v-if="projects.length === 0"
            icon="i-octicon-repo-16"
            title="No projects enabled yet"
            message="Click Manage projects to scan this directory and choose which repositories appear in the hub."
          >
            <template #hint>
              <button
                class="btn-primary text-xs flex items-center gap-1.5 mt-1"
                data-testid="hub-empty-cta"
                @click="pickerOpen = true"
              >
                <span class="i-ph-sliders-duotone" />
                <span>Manage projects</span>
              </button>
            </template>
          </EmptyState>

          <div
            v-else
            class="grid gap-3"
            style="grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));"
          >
            <HubProjectCard
              v-for="(project, index) in projects"
              :key="project.id"
              :ref="el => setCardRef(el, index)"
              :project="project"
              data-testid="hub-project-card"
              :data-project-id="project.id"
              @click="openProject(project.id)"
              @keydown="onCardKeydown($event, index)"
              @focus="focusedIndex = index"
            />
          </div>
        </section>
      </div>
    </main>

    <HubProjectPicker v-if="pickerOpen" @close="pickerOpen = false" />
    <HubRootDialog
      v-if="hubCwd"
      v-model:open="rootDialogOpen"
      :current="hubCwd"
      @changed="onRootChanged"
    />
    <HelpOverlay />
  </div>
</template>

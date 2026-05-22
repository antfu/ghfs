<script setup lang="ts">
import type { ProjectSummary } from '#ghfs/rpc-types'

const rpc = useRpc()
const hub = useHubState()
const hubUi = useHubUiState()

const projects = computed<ProjectSummary[]>(() => hub.projects.value)
const pickerOpen = computed({ get: () => hubUi.pickerOpen.value, set: v => (hubUi.pickerOpen.value = v) })
const focusedIndex = ref(0)

const onboardingOpen = ref(false)
const onboardingBusy = ref(false)
let onboardingDismissed = false

const hubActivity = useHubActivity()

const aggregates = computed(() => {
  let issues = 0
  let pulls = 0
  let newIssuesToday = 0
  let newPullsToday = 0
  let tokens = 0
  let synced = 0
  for (const p of projects.value) {
    issues += p.openIssues
    pulls += p.openPulls
    newIssuesToday += p.newIssuesToday ?? 0
    newPullsToday += p.newPullsToday ?? 0
    if (p.hasToken)
      tokens += 1
    if (p.lastSyncedAt)
      synced += 1
  }
  return { issues, pulls, newIssuesToday, newPullsToday, tokens, synced }
})

const sparklinePoints = computed(() => hubActivity.data.value?.buckets ?? [])

const lastActivitySummary = computed(() => {
  let mostRecent: string | undefined
  for (const p of projects.value) {
    const candidate = p.lastActivityAt ?? p.lastSyncedAt
    if (!candidate)
      continue
    if (!mostRecent || candidate > mostRecent)
      mostRecent = candidate
  }
  return mostRecent
})

onMounted(async () => {
  try {
    const info = await rpc.$call('ghfs:hub-info')
    hub.setHubInfo(info)
    if (!info.launchCwdInRoots && !onboardingDismissed)
      onboardingOpen.value = true
  }
  catch { /* fall back to title */ }
  try {
    const fresh = await rpc.$call('ghfs:list-projects')
    hub.setProjects(fresh)
  }
  catch { /* keep capabilities-provided list */ }
})

async function acceptOnboarding() {
  const path = hub.launchCwd.value
  if (!path || onboardingBusy.value)
    return
  onboardingBusy.value = true
  try {
    const info = await rpc.$call('ghfs:hub-add-root', path)
    hub.setHubInfo(info)
    onboardingDismissed = true
    onboardingOpen.value = false
  }
  catch {
    // Leave the modal open; the user can retry or skip.
  }
  finally {
    onboardingBusy.value = false
  }
}

function skipOnboarding() {
  onboardingDismissed = true
  onboardingOpen.value = false
}

function openProject(repo: string) {
  navigateTo(`/${repo}`)
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
    <PanelAppBar mode="hub" />

    <main class="flex-1 overflow-y-auto">
      <div class="max-w-6xl mx-auto px-5 py-6 flex flex-col gap-6">
        <section
          class="panel-card relative overflow-hidden px-5 py-4 flex flex-wrap items-center gap-x-6 gap-y-2"
          data-testid="hub-summary"
        >
          <div
            class="absolute inset-0 op-25 dark:op-20 pointer-events-none color-active"
            style="mask-image: linear-gradient(to bottom, transparent 0%, black 55%, black 88%, transparent 100%); -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 55%, black 88%, transparent 100%);"
            data-testid="hub-summary-chart"
          >
            <DisplayActivitySparkline :points="sparklinePoints" />
          </div>
          <div class="relative z-1 flex flex-col leading-tight">
            <span class="text-[11px] uppercase tracking-wide color-muted font-medium">Projects</span>
            <span class="text-2xl font-semibold tabular-nums">{{ projects.length }}</span>
          </div>
          <span class="relative z-1 h-8 border-l border-base mx-1" />
          <div class="relative z-1 flex flex-col leading-tight">
            <span class="text-[11px] uppercase tracking-wide color-muted font-medium flex items-center gap-1">
              <span class="i-octicon-issue-opened-16" />
              <span>Open issues</span>
            </span>
            <span class="flex items-baseline gap-1.5">
              <span class="text-2xl font-semibold tabular-nums">{{ aggregates.issues }}</span>
              <span
                v-if="aggregates.newIssuesToday > 0"
                class="text-xs font-medium tabular-nums color-green-600 dark:color-green-400"
                :title="`${aggregates.newIssuesToday} opened today`"
                data-testid="hub-summary-new-issues"
              >+{{ aggregates.newIssuesToday }}</span>
            </span>
          </div>
          <div class="relative z-1 flex flex-col leading-tight">
            <span class="text-[11px] uppercase tracking-wide color-muted font-medium flex items-center gap-1">
              <span class="i-octicon-git-pull-request-16" />
              <span>Open pull requests</span>
            </span>
            <span class="flex items-baseline gap-1.5">
              <span class="text-2xl font-semibold tabular-nums">{{ aggregates.pulls }}</span>
              <span
                v-if="aggregates.newPullsToday > 0"
                class="text-xs font-medium tabular-nums color-green-600 dark:color-green-400"
                :title="`${aggregates.newPullsToday} opened today`"
                data-testid="hub-summary-new-pulls"
              >+{{ aggregates.newPullsToday }}</span>
            </span>
          </div>
          <div class="relative z-1 flex-1" />
          <div class="relative z-1 flex flex-col leading-tight text-right">
            <span class="text-[11px] uppercase tracking-wide color-muted font-medium">Last activity</span>
            <DisplayDateBadge :time="lastActivitySummary" />
          </div>
        </section>

        <section class="flex flex-col gap-3">
          <div class="flex items-baseline gap-2">
            <h2 class="text-sm font-semibold">Projects</h2>
            <span class="color-muted text-xs">{{ projects.length }} enabled · sorted by recent activity</span>
            <div class="flex-1" />
            <UiWithCommand v-if="projects.length > 0" v-slot="{ execute, disabled }" command="hub.manage">
              <button
                class="text-xs color-muted hover:color-active transition"
                data-testid="hub-manage-projects"
                :disabled="disabled"
                @click="execute"
              >
                + add or remove
              </button>
            </UiWithCommand>
          </div>

          <UiEmptyState
            v-if="projects.length === 0"
            icon="i-octicon-repo-16"
            title="No projects enabled yet"
            message="Click Manage projects to scan this directory and choose which repositories appear in the hub."
          >
            <template #hint>
              <UiWithCommand v-slot="{ execute, disabled }" command="hub.manage">
                <button
                  class="btn-primary text-xs flex items-center gap-1.5 mt-1"
                  data-testid="hub-empty-cta"
                  :disabled="disabled"
                  @click="execute"
                >
                  <span class="i-ph-sliders-duotone" />
                  <span>Manage projects</span>
                </button>
              </UiWithCommand>
            </template>
          </UiEmptyState>

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
              :data-project-repo="project.repo"
              @click="openProject(project.repo)"
              @keydown="onCardKeydown($event, index)"
              @focus="focusedIndex = index"
            />
          </div>
        </section>
      </div>
    </main>

    <HubProjectPicker v-if="pickerOpen" @close="pickerOpen = false" />

    <UiModal
      v-if="onboardingOpen"
      v-model:open="onboardingOpen"
      icon="i-ph-folder-plus-duotone"
      title="Add this directory to hub roots?"
      width="w-[min(92vw,32rem)]"
      data-testid="hub-add-cwd-modal"
      :close-on-backdrop="false"
      :close-on-escape="false"
      hide-close
    >
      <div class="px-5 py-4 flex flex-col gap-3 text-sm">
        <p class="color-muted">
          Add the directory the CLI was launched from to your hub roots? Projects under it will be scannable and you can enable them from Manage projects.
        </p>
        <div class="rounded border border-base bg-base/40 px-2.5 py-2 font-mono text-xs break-all" data-testid="hub-add-cwd-modal-path">
          {{ hub.launchCwd.value }}
        </div>
      </div>
      <template #footer>
        <button
          type="button"
          class="btn-action-sm"
          data-testid="hub-add-cwd-modal-skip"
          :disabled="onboardingBusy"
          @click="skipOnboarding"
        >
          Skip
        </button>
        <button
          type="button"
          class="btn-primary text-sm flex items-center gap-1.5"
          data-testid="hub-add-cwd-modal-add"
          :disabled="onboardingBusy"
          @click="acceptOnboarding"
        >
          <span :class="onboardingBusy ? 'i-octicon-sync-16 animate-spin' : 'i-ph-plus-bold'" />
          <span>Add</span>
        </button>
      </template>
    </UiModal>
  </div>
</template>

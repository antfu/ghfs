<script setup lang="ts">
import type { CommentTemplate, RepoTemplate } from '#ghfs/rpc-types'
import { applyVariables } from '../../utils/templates'

const props = defineProps<{
  /** Optional context for `{{author}}`, `{{number}}`, `{{title}}`. */
  context?: { author?: string | null, number?: number | null, title?: string | null }
}>()

const emit = defineEmits<{
  /** Fired when the user picks a template — `body` already has variables applied. */
  pick: [body: string]
}>()

interface Entry {
  scope: 'repo' | 'global'
  title: string
  /** Raw body (with `{{var}}` placeholders). */
  body: string
  /** Body with placeholders resolved against the current context. */
  resolved: string
}

type ScopeFilter = 'all' | 'repo' | 'global'

const open = defineModel<boolean>('open', { default: false })

const activeId = useActiveProjectId()
const scope = useDetailScope()
const effectiveProjectId = computed(() => scope?.projectId ?? activeId.value)
const state = useAppState(scope?.projectId)
const hub = useHubSettings()

const repoProject = computed(() => {
  const payload = state.payload.value
  if (!payload)
    return null
  return { id: payload.projectId, repo: payload.repo.repo }
})

const repoTemplates = computed<RepoTemplate[]>(() => state.payload.value?.repoTemplates?.templates ?? [])
const hubTemplates = computed<CommentTemplate[]>(() => hub.commentTemplates.value)

const triggerRef = ref<HTMLButtonElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const root = ref<HTMLElement | null>(null)
const searchField = ref<{ focus: () => void } | null>(null)
const listRef = ref<HTMLElement | null>(null)
const search = ref('')
const highlightedIndex = ref(0)
const scopeFilter = ref<ScopeFilter>('all')

function resolveBody(body: string): string {
  return applyVariables(body, props.context ?? {})
}

const entries = computed<Entry[]>(() => {
  return [
    ...repoTemplates.value.map((t): Entry => ({ scope: 'repo', title: t.title, body: t.body, resolved: resolveBody(t.body) })),
    ...hubTemplates.value.map((t): Entry => ({ scope: 'global', title: t.title, body: t.body, resolved: resolveBody(t.body) })),
  ]
})

const repoCount = computed(() => entries.value.filter(e => e.scope === 'repo').length)
const globalCount = computed(() => entries.value.filter(e => e.scope === 'global').length)
const showScopeChips = computed(() => repoCount.value > 0 && globalCount.value > 0)

const filtered = computed<Entry[]>(() => {
  const q = search.value.trim().toLowerCase()
  const scoped = scopeFilter.value === 'all'
    ? entries.value
    : entries.value.filter(e => e.scope === scopeFilter.value)
  if (!q)
    return scoped
  return scoped.filter(e =>
    e.title.toLowerCase().includes(q)
    || e.body.toLowerCase().includes(q)
    || e.resolved.toLowerCase().includes(q),
  )
})

const highlighted = computed<Entry | null>(() => filtered.value[highlightedIndex.value] ?? null)

watch(open, async (v) => {
  if (!v)
    return
  search.value = ''
  scopeFilter.value = 'all'
  highlightedIndex.value = 0
  if (!hub.templatesHydrated.value)
    void hub.loadCommentTemplates()
  // Fetch latest repo templates if we don't have them yet (e.g. file added after initial payload).
  if (effectiveProjectId.value && state.payload.value && state.payload.value.repoTemplates?.templates.length === 0 && state.payload.value.repoTemplates.mtimeMs === null) {
    try {
      const next = await useRpc().$call('ghfs:repo-templates', effectiveProjectId.value)
      state.patchRepoTemplates(next)
    }
    catch {
      // ignore
    }
  }
  await nextTick()
  searchField.value?.focus()
})

watch(filtered, () => {
  if (highlightedIndex.value >= filtered.value.length)
    highlightedIndex.value = Math.max(0, filtered.value.length - 1)
})

watch(highlightedIndex, async () => {
  await nextTick()
  const el = listRef.value?.querySelector<HTMLElement>(`[data-index="${highlightedIndex.value}"]`)
  el?.scrollIntoView({ block: 'nearest' })
})

function close() {
  open.value = false
  triggerRef.value?.focus()
}

function pick(entry: Entry) {
  open.value = false
  emit('pick', entry.resolved)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }
  if (event.key === 'ArrowDown' || (event.key === 'j' && !isTypingInSearch(event))) {
    event.preventDefault()
    if (filtered.value.length)
      highlightedIndex.value = (highlightedIndex.value + 1) % filtered.value.length
    return
  }
  if (event.key === 'ArrowUp' || (event.key === 'k' && !isTypingInSearch(event))) {
    event.preventDefault()
    if (filtered.value.length)
      highlightedIndex.value = (highlightedIndex.value - 1 + filtered.value.length) % filtered.value.length
    return
  }
  if ((event.key === 'Tab' && !event.shiftKey) && showScopeChips.value) {
    event.preventDefault()
    cycleScope(1)
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    const target = filtered.value[highlightedIndex.value]
    if (target)
      pick(target)
  }
}

function cycleScope(direction: 1 | -1) {
  const order: ScopeFilter[] = ['all', 'repo', 'global']
  const idx = order.indexOf(scopeFilter.value)
  scopeFilter.value = order[(idx + direction + order.length) % order.length]!
}

function isTypingInSearch(event: KeyboardEvent): boolean {
  return (event.target as HTMLElement)?.tagName === 'INPUT'
}

onClickOutside(root, () => {
  if (open.value)
    close()
})

defineExpose({
  toggle() {
    open.value = !open.value
  },
  openPicker() {
    open.value = true
  },
})
</script>

<template>
  <div ref="root" class="relative">
    <button
      ref="triggerRef"
      type="button"
      class="inline-flex items-center justify-center w-7 h-7 rounded color-muted hover:color-active hover:bg-active focus-visible:bg-active focus-visible:color-active outline-none transition"
      :class="{ 'bg-active color-active': open }"
      :aria-haspopup="true"
      :aria-expanded="open"
      :aria-label="'Insert saved reply (⌘.)'"
      data-testid="comment-template-trigger"
      title="Insert saved reply (⌘.)"
      @click="open = !open"
    >
      <span class="i-ph-chat-circle-text-duotone text-base" />
    </button>

    <Transition
      enter-active-class="transition duration-150"
      enter-from-class="op0 -translate-y-1"
      enter-to-class="op100 translate-y-0"
      leave-active-class="transition duration-100"
      leave-from-class="op100 translate-y-0"
      leave-to-class="op0 -translate-y-1"
    >
      <div
        v-if="open"
        ref="menuRef"
        class="absolute z-dropdown top-full right-0 mt-1 w-[min(32rem,92vw)] panel-card !rounded-lg shadow-xl overflow-hidden flex flex-col"
        data-testid="comment-template-menu"
        @keydown="onKeydown"
      >
        <!-- Search -->
        <div class="px-3 py-2 border-b border-base shrink-0">
          <UiSearchField
            ref="searchField"
            v-model="search"
            placeholder="Search saved replies…"
            data-testid="comment-template-search"
          />
        </div>

        <!-- Scope filter chips -->
        <div
          v-if="showScopeChips"
          class="flex items-center gap-1 px-3 py-1.5 border-b border-base shrink-0"
          data-testid="comment-template-scope-filter"
        >
          <button
            type="button"
            class="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs rounded-full border outline-none transition whitespace-nowrap"
            :class="scopeFilter === 'all'
              ? 'bg-active color-base border-transparent'
              : 'color-muted border-base hover:bg-active/60'"
            data-testid="comment-template-scope-all"
            @click="scopeFilter = 'all'"
          >
            <span>All</span>
            <span class="tabular-nums op70 text-[11px]">{{ entries.length }}</span>
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs rounded-full border outline-none transition whitespace-nowrap"
            :class="scopeFilter === 'repo'
              ? 'bg-active color-base border-transparent'
              : 'color-muted border-base hover:bg-active/60'"
            data-testid="comment-template-scope-repo"
            @click="scopeFilter = 'repo'"
          >
            <DisplayProjectIcon v-if="repoProject" :project="repoProject" :size="12" fallback-class="color-muted" />
            <span v-else class="i-ph-git-branch-duotone text-xs" />
            <span class="truncate max-w-32 font-mono">{{ repoProject?.repo ?? 'This repo' }}</span>
            <span class="tabular-nums op70 text-[11px]">{{ repoCount }}</span>
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs rounded-full border outline-none transition whitespace-nowrap"
            :class="scopeFilter === 'global'
              ? 'bg-active color-base border-transparent'
              : 'color-muted border-base hover:bg-active/60'"
            data-testid="comment-template-scope-global"
            @click="scopeFilter = 'global'"
          >
            <span class="i-ph-globe-duotone text-xs" />
            <span>Global</span>
            <span class="tabular-nums op70 text-[11px]">{{ globalCount }}</span>
          </button>
        </div>

        <!-- List -->
        <div ref="listRef" class="max-h-[22rem] overflow-y-auto py-1 flex-1">
          <!-- Empty: nothing configured -->
          <div v-if="entries.length === 0" class="px-4 py-8 text-center flex flex-col items-center gap-2">
            <span class="i-ph-chat-circle-text-duotone text-3xl color-faint" />
            <p class="text-sm color-muted">No saved replies yet</p>
            <p class="text-xs color-faint">Add some in <span class="kbd">Settings</span> → Saved replies.</p>
          </div>

          <!-- Empty: search/filter -->
          <div v-else-if="filtered.length === 0" class="px-4 py-8 text-center flex flex-col items-center gap-2">
            <span class="i-ph-magnifying-glass-duotone text-2xl color-faint" />
            <p class="text-sm color-muted">No matches</p>
            <p v-if="scopeFilter !== 'all'" class="text-xs color-faint">
              Try <button type="button" class="underline hover:color-active" @click="scopeFilter = 'all'">all scopes</button>
            </p>
          </div>

          <ul v-else role="listbox" class="px-1">
            <li
              v-for="(entry, index) in filtered"
              :key="`${entry.scope}-${index}-${entry.title}`"
              role="option"
              :aria-selected="index === highlightedIndex"
              :data-index="index"
            >
              <button
                type="button"
                class="group w-full text-left flex items-start gap-2.5 px-2.5 py-2 rounded transition outline-none border-l-2"
                :class="index === highlightedIndex
                  ? 'bg-active border-l-primary-500'
                  : 'border-l-transparent hover:bg-active/60'"
                data-testid="comment-template-item"
                :data-scope="entry.scope"
                @click="pick(entry)"
                @mouseenter="highlightedIndex = index"
              >
                <span
                  v-if="entry.scope === 'repo'"
                  class="shrink-0 mt-0.5"
                  :title="repoProject ? `From ${repoProject.repo}` : 'From this repo'"
                  :aria-label="repoProject ? `From ${repoProject.repo}` : 'From this repo'"
                >
                  <DisplayProjectIcon v-if="repoProject" :project="repoProject" :size="16" fallback-class="color-muted" />
                  <span v-else class="i-ph-git-branch-duotone text-base color-muted" />
                </span>
                <span
                  v-else
                  class="i-ph-globe-duotone text-base color-muted shrink-0 mt-0.5"
                  title="Global"
                  aria-label="Global"
                />
                <span class="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span class="text-sm font-medium truncate" :class="index === highlightedIndex ? 'color-base' : ''">{{ entry.title }}</span>
                  <span class="text-xs color-muted line-clamp-2 whitespace-pre-wrap">{{ entry.resolved }}</span>
                </span>
                <span
                  v-if="index === highlightedIndex"
                  class="i-ph-arrow-bend-down-left-duotone color-active shrink-0 mt-0.5 text-base"
                  aria-hidden="true"
                />
              </button>
            </li>
          </ul>
        </div>

        <!-- Footer hints -->
        <div class="px-3 py-1.5 border-t border-base text-[10px] color-muted flex items-center gap-2 shrink-0">
          <span class="kbd">↑</span><span class="kbd">↓</span>
          <span>navigate</span>
          <span class="color-faint">·</span>
          <span class="kbd">↵</span>
          <span>insert</span>
          <template v-if="showScopeChips">
            <span class="color-faint">·</span>
            <span class="kbd">⇥</span>
            <span>scope</span>
          </template>
          <div class="flex-1" />
          <span class="kbd">Esc</span>
          <span>close</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

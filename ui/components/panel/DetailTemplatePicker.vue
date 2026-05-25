<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Dropdown as VDropdown } from 'floating-vue'
import type { CommentTemplate, RepoTemplate } from '#ghfs/rpc-types'
import { useActiveProjectId, useAppState } from '../../composables/useAppState'
import { useDetailScope } from '../../composables/useDetailScope'
import { useHubSettings } from '../../composables/useHubSettings'
import { useRpc } from '../../composables/useRpc'
import { applyVariables } from '../../utils/templates'
import DisplayProjectIcon from '../display/ProjectIcon.vue'
import UiSearchField from '../ui/SearchField.vue'

const props = defineProps<{
  /** Optional context for `{{author}}`, `{{number}}`, `{{title}}`. */
  context?: { author?: string | null, number?: number | null, title?: string | null }
  /** External search query (e.g., from a slash-command in the textarea). */
  externalQuery?: string
  /** When true, do not autofocus the search field on open (slash-mode). */
  externalFocus?: boolean
}>()

const emit = defineEmits<{
  /** Fired when the user picks a template — `body` already has variables applied. */
  pick: [body: string]
  /** Fired when the popup closes without a selection. */
  cancel: []
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
const detail = useDetailScope()
const effectiveProjectId = computed(() => detail?.projectId ?? activeId.value)
const state = useAppState(detail?.projectId)
const hub = useHubSettings()

const repoProject = computed(() => {
  const payload = state.payload.value
  if (!payload)
    return null
  return { id: payload.projectId, repo: payload.repo.repo }
})

const repoTemplates = computed<RepoTemplate[]>(() => state.payload.value?.repoTemplates?.templates ?? [])
const hubTemplates = computed<CommentTemplate[]>(() => hub.commentTemplates.value)

const searchField = ref<{ focus: () => void } | null>(null)
const listRef = ref<HTMLElement | null>(null)
const internalSearch = ref('')
const highlightedIndex = ref(0)
const scopeFilter = ref<ScopeFilter>('all')

// When `externalQuery` is provided we use it as the search; otherwise fall
// back to the picker's own input.
const search = computed<string>({
  get() {
    return props.externalQuery ?? internalSearch.value
  },
  set(value: string) {
    internalSearch.value = value
  },
})

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

async function onShow() {
  internalSearch.value = ''
  scopeFilter.value = 'all'
  highlightedIndex.value = 0
  if (!hub.templatesHydrated.value)
    void hub.loadCommentTemplates()
  // Fetch latest repo templates if we don't have them yet (file added after initial payload).
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
  if (!props.externalFocus)
    searchField.value?.focus()
}

function onHide() {
  // Reset highlight so the next open starts fresh.
  highlightedIndex.value = 0
}

watch(filtered, () => {
  if (highlightedIndex.value >= filtered.value.length)
    highlightedIndex.value = Math.max(0, filtered.value.length - 1)
})

watch(highlightedIndex, async () => {
  await nextTick()
  const el = listRef.value?.querySelector<HTMLElement>(`[data-index="${highlightedIndex.value}"]`)
  el?.scrollIntoView({ block: 'nearest' })
})

function pick(entry: Entry) {
  emit('pick', entry.resolved)
  open.value = false
}

function next() {
  if (filtered.value.length)
    highlightedIndex.value = (highlightedIndex.value + 1) % filtered.value.length
}

function prev() {
  if (filtered.value.length)
    highlightedIndex.value = (highlightedIndex.value - 1 + filtered.value.length) % filtered.value.length
}

function confirm(): boolean {
  const target = filtered.value[highlightedIndex.value]
  if (target) {
    pick(target)
    return true
  }
  return false
}

function close() {
  open.value = false
  emit('cancel')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }
  if (event.key === 'ArrowDown' || (event.key === 'j' && !isTypingInSearch(event))) {
    event.preventDefault()
    next()
    return
  }
  if (event.key === 'ArrowUp' || (event.key === 'k' && !isTypingInSearch(event))) {
    event.preventDefault()
    prev()
    return
  }
  if ((event.key === 'Tab' && !event.shiftKey) && showScopeChips.value) {
    event.preventDefault()
    cycleScope(1)
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    confirm()
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

defineExpose({
  toggle() {
    open.value = !open.value
  },
  openPicker() {
    open.value = true
  },
  next,
  prev,
  confirm,
  close,
})
</script>

<template>
  <VDropdown
    v-model:shown="open"
    :distance="8"
    :triggers="[]"
    :placement="'top-start'"
    :auto-hide="!externalFocus"
    class="block"
    @apply-show="onShow"
    @apply-hide="onHide"
  >
    <slot />

    <template #popper>
      <div
        class="w-[min(32rem,92vw)] flex flex-col"
        data-testid="comment-template-menu"
        @keydown="onKeydown"
      >
        <!-- Search (hidden when slash-mode external query controls it) -->
        <div v-if="!externalFocus" class="px-3 py-2 border-b border-base shrink-0">
          <UiSearchField
            ref="searchField"
            v-model="internalSearch"
            placeholder="Search saved replies…"
            data-testid="comment-template-search"
          />
        </div>
        <div v-else class="px-3 py-2 border-b border-base text-xs color-muted flex items-center gap-1.5">
          <span class="i-ph-slash-duotone" />
          <span>Filtering by</span>
          <code class="font-mono color-base">/{{ externalQuery }}</code>
          <span class="color-faint ml-auto">type to filter · <span class="kbd">↵</span> to insert</span>
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
          <div v-if="entries.length === 0" class="px-4 py-8 text-center flex flex-col items-center gap-2">
            <span class="i-ph-chat-circle-text-duotone text-3xl color-faint" />
            <p class="text-sm color-muted">No saved replies yet</p>
            <p class="text-xs color-faint">Add some in <span class="kbd">Settings</span> → Saved replies.</p>
          </div>

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
                <span class="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span class="flex items-center gap-1.5 min-w-0">
                    <span class="text-sm font-medium truncate" :class="index === highlightedIndex ? 'color-base' : ''">{{ entry.title }}</span>
                    <span
                      v-if="entry.scope === 'global'"
                      class="shrink-0 inline-flex items-center gap-1 px-1.5 py-px text-[10px] uppercase tracking-wide rounded color-muted bg-active/40"
                      data-testid="comment-template-global-badge"
                    >
                      <span class="i-ph-globe-duotone text-[10px]" />
                      <span>global</span>
                    </span>
                  </span>
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
    </template>
  </VDropdown>
</template>

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
  body: string
}

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
const search = ref('')
const highlightedIndex = ref(0)

const entries = computed<Entry[]>(() => {
  return [
    ...repoTemplates.value.map((t): Entry => ({ scope: 'repo', title: t.title, body: t.body })),
    ...hubTemplates.value.map((t): Entry => ({ scope: 'global', title: t.title, body: t.body })),
  ]
})

const filtered = computed<Entry[]>(() => {
  const q = search.value.trim().toLowerCase()
  if (!q)
    return entries.value
  return entries.value.filter(e => e.title.toLowerCase().includes(q) || e.body.toLowerCase().includes(q))
})

watch(open, async (v) => {
  if (!v) {
    return
  }
  search.value = ''
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

function close() {
  open.value = false
  triggerRef.value?.focus()
}

function pick(entry: Entry) {
  open.value = false
  const body = applyVariables(entry.body, props.context ?? {})
  emit('pick', body)
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
  if (event.key === 'Enter') {
    event.preventDefault()
    const target = filtered.value[highlightedIndex.value]
    if (target)
      pick(target)
  }
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
        class="absolute z-dropdown top-full right-0 mt-1 w-[min(28rem,90vw)] panel-card !rounded-lg shadow-xl overflow-hidden"
        data-testid="comment-template-menu"
        @keydown="onKeydown"
      >
        <div class="px-3 py-2 border-b border-base">
          <UiSearchField
            ref="searchField"
            v-model="search"
            placeholder="Search saved replies…"
            data-testid="comment-template-search"
          />
        </div>
        <div class="max-h-80 overflow-y-auto py-1">
          <div v-if="filtered.length === 0" class="px-3 py-6 text-center text-xs color-muted">
            <p v-if="entries.length === 0">
              No saved replies yet. Add some in <span class="kbd">Settings</span>.
            </p>
            <p v-else>
              No matching saved reply.
            </p>
          </div>

          <ul v-else role="listbox">
            <li
              v-for="(entry, index) in filtered"
              :key="`${entry.scope}-${index}-${entry.title}`"
              role="option"
              :aria-selected="index === highlightedIndex"
              class="px-2"
            >
              <button
                type="button"
                class="w-full text-left flex items-start gap-2 px-2 py-1.5 rounded transition outline-none"
                :class="index === highlightedIndex ? 'bg-active' : 'hover:bg-active'"
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
                  <DisplayProjectIcon v-if="repoProject" :project="repoProject" :size="14" fallback-class="color-muted" />
                  <span v-else class="i-ph-git-branch-duotone text-sm color-muted" />
                </span>
                <span
                  v-else
                  class="i-ph-globe-duotone text-sm color-muted shrink-0 mt-0.5"
                  title="Global"
                  aria-label="Global"
                />
                <span class="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span class="text-sm font-medium truncate">{{ entry.title }}</span>
                  <span class="text-xs color-muted line-clamp-2 whitespace-pre-wrap">{{ entry.body }}</span>
                </span>
              </button>
            </li>
          </ul>
        </div>
        <div class="px-3 py-1.5 border-t border-base text-[10px] color-muted flex items-center justify-between">
          <span>
            <span class="kbd">↑</span><span class="kbd">↓</span> navigate · <span class="kbd">↵</span> insert · <span class="kbd">Esc</span> close
          </span>
        </div>
      </div>
    </Transition>
  </div>
</template>

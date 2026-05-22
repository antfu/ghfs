<script setup lang="ts">
import type { ProjectSummary } from '#ghfs/rpc-types'

const props = defineProps<{
  projectId: string
}>()

const hub = useHubState()
const router = useRouter()

const open = ref(false)
const triggerRef = ref<HTMLButtonElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const search = ref('')

const projects = computed<ProjectSummary[]>(() => hub.projects.value)
const current = computed(() => projects.value.find(p => p.id === props.projectId))
const filtered = computed<ProjectSummary[]>(() => {
  const q = search.value.trim().toLowerCase()
  if (!q)
    return projects.value
  return projects.value.filter(p => p.repo.toLowerCase().includes(q))
})

const highlightedIndex = ref(0)

watch(open, (v) => {
  if (v) {
    search.value = ''
    highlightedIndex.value = Math.max(0, filtered.value.findIndex(p => p.id === props.projectId))
    nextTick(() => {
      const inputEl = menuRef.value?.querySelector<HTMLInputElement>('input')
      inputEl?.focus()
    })
  }
})

watch(filtered, () => {
  if (highlightedIndex.value >= filtered.value.length)
    highlightedIndex.value = Math.max(0, filtered.value.length - 1)
})

function close() {
  open.value = false
  triggerRef.value?.focus()
}

function toggle() {
  open.value = !open.value
}

function select(id: string) {
  open.value = false
  if (id === props.projectId)
    return
  const target = projects.value.find(p => p.id === id)
  if (target)
    router.push(`/${target.repo}`)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }
  if (event.key === 'ArrowDown' || event.key === 'j') {
    event.preventDefault()
    if (filtered.value.length)
      highlightedIndex.value = (highlightedIndex.value + 1) % filtered.value.length
    return
  }
  if (event.key === 'ArrowUp' || event.key === 'k') {
    event.preventDefault()
    if (filtered.value.length)
      highlightedIndex.value = (highlightedIndex.value - 1 + filtered.value.length) % filtered.value.length
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    const target = filtered.value[highlightedIndex.value]
    if (target)
      select(target.id)
  }
}

function onTriggerKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    open.value = true
  }
}

const root = ref<HTMLElement | null>(null)
onClickOutside(root, () => {
  open.value = false
})
</script>

<template>
  <div ref="root" class="relative">
    <button
      ref="triggerRef"
      type="button"
      class="inline-flex items-center gap-1.5 max-w-60 font-mono text-sm truncate rounded-md px-1.5 py-0.5 hover:bg-active focus-visible:ring-2 focus-visible:ring-primary-500/40 outline-none transition"
      data-testid="navbar-project-switcher"
      :aria-haspopup="true"
      :aria-expanded="open"
      @click="toggle"
      @keydown="onTriggerKeydown"
    >
      <DisplayProjectIcon v-if="current" :project="current" :size="16" fallback-class="color-active" />
      <span class="truncate" data-testid="navbar-repo">{{ current?.repo ?? props.projectId }}</span>
      <span class="i-ph-caret-down-duotone text-xs shrink-0 op70" />
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
        class="absolute z-dropdown top-full left-0 mt-1 min-w-72 max-w-[24rem] panel-card !rounded-lg shadow-xl overflow-hidden"
        data-testid="navbar-project-switcher-menu"
        @keydown="onKeydown"
      >
        <div class="px-3 py-2 border-b border-base">
          <UiSearchField v-model="search" placeholder="Switch to…" />
        </div>
        <ul class="flex flex-col max-h-80 overflow-y-auto py-1" role="listbox">
          <li v-if="filtered.length === 0" class="px-3 py-2 text-xs color-muted">
            No matching project.
          </li>
          <li
            v-for="(project, index) in filtered"
            :key="project.id"
            role="option"
            :aria-selected="index === highlightedIndex"
            class="px-2"
          >
            <button
              type="button"
              class="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded transition outline-none"
              :class="[
                index === highlightedIndex ? 'bg-active' : 'hover:bg-active',
                project.id === props.projectId ? 'color-active' : '',
              ]"
              data-testid="navbar-project-switcher-item"
              :data-project-id="project.id"
              @click="select(project.id)"
              @mouseenter="highlightedIndex = index"
            >
              <DisplayProjectIcon :project="project" :size="16" :fallback-class="project.id === props.projectId ? 'color-active' : 'color-muted'" />
              <span class="font-mono text-xs truncate flex-1">{{ project.repo }}</span>
              <span class="text-[10px] color-muted tabular-nums shrink-0">
                {{ project.openIssues }}<span class="mx-0.5">·</span>{{ project.openPulls }}
              </span>
              <span
                v-if="project.id === props.projectId"
                class="i-ph-check-bold text-xs color-active shrink-0"
                aria-label="current"
              />
            </button>
          </li>
        </ul>
        <div class="px-3 py-2 border-t border-base flex items-center justify-between text-[10px] color-muted">
          <span>
            <span class="kbd">↑</span><span class="kbd">↓</span> navigate · <span class="kbd">↵</span> select · <span class="kbd">Esc</span> close
          </span>
          <NuxtLink
            to="/"
            class="hover:color-active transition inline-flex items-center gap-1"
            @click="close()"
          >
            <span class="i-ph-arrow-left-duotone text-[10px]" />
            <span>hub home</span>
          </NuxtLink>
        </div>
      </div>
    </Transition>
  </div>
</template>

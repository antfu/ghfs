<script setup lang="ts">
const state = useAppState()
const { filteredItems, allItems } = useFilteredItems()

const repoName = computed(() => state.payload.value?.repo.repo ?? 'Connecting…')
const lastSyncedAt = computed(() => state.payload.value?.repo.lastSyncedAt)
const totalItems = computed(() => allItems.value.length)
const shownItems = computed(() => filteredItems.value.length)

const stateOptions = [
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
] as const

const kindOptions = [
  { value: 'all', label: 'All' },
  { value: 'issue', label: 'Issues' },
  { value: 'pull', label: 'PRs' },
] as const

function relativeTime(iso: string | undefined): string {
  if (!iso)
    return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.round(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return `${d}d ago`
}
</script>

<template>
  <aside class="sidepanel p-4 flex flex-col gap-4 max-h-[calc(100vh-6.5rem)] overflow-y-auto">
    <header class="flex items-start gap-2">
      <span class="i-ph-github-logo-duotone text-2xl mt-0.5 color-active" />
      <div class="flex-1 min-w-0">
        <div class="font-mono text-sm truncate" :title="repoName">{{ repoName }}</div>
        <div class="text-xs color-muted mt-0.5">
          Synced {{ relativeTime(lastSyncedAt) }}
        </div>
      </div>
    </header>

    <div class="h-px bg-neutral-200 dark:bg-neutral-800" />

    <section class="flex flex-col gap-3">
      <label class="flex items-center gap-2 border border-base rounded px-2 py-1.5 focus-within:border-active transition">
        <span class="i-carbon-search color-muted flex-none" />
        <input
          v-model="state.filters.search"
          type="text"
          placeholder="Search title, author, labels…"
          class="bg-transparent outline-none w-full font-sans text-sm"
        >
        <button
          v-if="state.filters.search"
          class="color-muted hover:color-base flex-none"
          aria-label="Clear"
          @click="state.filters.search = ''"
        ><span class="i-carbon-close text-sm" /></button>
      </label>

      <div>
        <div class="text-xs uppercase tracking-wide color-muted mb-1.5 font-medium">State</div>
        <div class="flex items-center gap-1">
          <button
            v-for="opt in stateOptions"
            :key="opt.value"
            class="flex-1 px-2 py-1 rounded text-sm transition"
            :class="state.filters.state === opt.value ? 'bg-primary-500/15 color-active border border-active' : 'border border-transparent color-muted hover:color-base hover:bg-active'"
            @click="state.filters.state = opt.value"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>

      <div>
        <div class="text-xs uppercase tracking-wide color-muted mb-1.5 font-medium">Kind</div>
        <div class="flex items-center gap-1">
          <button
            v-for="opt in kindOptions"
            :key="opt.value"
            class="flex-1 px-2 py-1 rounded text-sm transition"
            :class="state.filters.kind === opt.value ? 'bg-primary-500/15 color-active border border-active' : 'border border-transparent color-muted hover:color-base hover:bg-active'"
            @click="state.filters.kind = opt.value"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
    </section>

    <div class="h-px bg-neutral-200 dark:bg-neutral-800" />

    <footer class="flex items-center justify-between text-xs color-muted">
      <span>
        <span class="color-base font-medium tabular-nums">{{ shownItems }}</span>
        <span v-if="shownItems !== totalItems"> of {{ totalItems }}</span>
        <span v-else> items</span>
      </span>
      <span class="flex items-center gap-1">
        <kbd class="kbd">↑↓</kbd>
        <span>navigate</span>
      </span>
    </footer>
  </aside>
</template>

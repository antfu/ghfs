<script setup lang="ts">
import type { HubRecentItem } from '../composables/useRpc'
import { useVirtualizer } from '@tanstack/vue-virtual'

const hub = useHubState()
const recent = useHubRecent()
const router = useRouter()

const repoMap = computed(() => {
  const m = new Map<string, string>()
  for (const p of hub.projects.value)
    m.set(p.id, p.repo)
  return m
})

const items = computed<HubRecentItem[]>(() => recent.items.value)

onMounted(() => {
  // Always refresh on enter — module state is shared across navigations and
  // can be stale; reloading on mount is cheap (server walks sync state).
  recent.load()
})

const scrollRef = ref<HTMLDivElement | null>(null)
// Reactive options so the virtualizer picks up the count once items load.
const virtualizer = useVirtualizer(computed(() => ({
  count: items.value.length,
  getScrollElement: () => scrollRef.value,
  estimateSize: () => 52,
  overscan: 8,
  getItemKey: (index: number) => {
    const it = items.value[index]
    return it ? `${it.projectId}-${it.kind}-${it.number}` : index
  },
})))

function openItem(it: HubRecentItem) {
  router.push(`/${it.repo}/${it.number}`)
}

function measureRow(el: Element | { $el?: Element } | null): void {
  if (!el)
    return
  const target = (el as { $el?: Element }).$el ?? (el as Element)
  if (target && typeof (target as HTMLElement).getBoundingClientRect === 'function')
    virtualizer.value.measureElement(target as HTMLElement)
}

const totalSize = computed(() => virtualizer.value.getTotalSize())
const virtualItems = computed(() => virtualizer.value.getVirtualItems())
</script>

<template>
  <div class="h-full flex flex-col" data-testid="hub-recent-page">
    <AppNavbar mode="hub" />
    <main class="flex-1 min-h-0 flex flex-col">
      <header class="px-5 py-4 border-b border-base flex items-center gap-3">
        <span class="i-octicon-history-16 text-xl color-active" />
        <div class="flex flex-col">
          <h1 class="text-lg font-semibold">Recent activity</h1>
          <span class="text-xs color-muted">{{ items.length }} items across all projects, sorted by last update</span>
        </div>
        <div class="flex-1" />
        <button
          type="button"
          class="btn-action-sm"
          :disabled="recent.loading.value"
          @click="recent.load()"
        >
          <span :class="recent.loading.value ? 'i-octicon-sync-16 animate-spin' : 'i-octicon-sync-16'" />
          <span>Refresh</span>
        </button>
      </header>

      <EmptyState
        v-if="recent.loading.value && items.length === 0"
        icon="i-octicon-sync-16"
        title="Loading recent activity…"
      />
      <EmptyState
        v-else-if="recent.error.value"
        icon="i-ph-warning-duotone"
        :title="`Failed to load: ${recent.error.value}`"
      />
      <EmptyState
        v-else-if="items.length === 0"
        icon="i-octicon-inbox-16"
        title="No recent activity"
        message="Enable projects in the hub and sync them to see items here."
      />

      <div v-else ref="scrollRef" class="flex-1 min-h-0 overflow-y-auto" data-testid="hub-recent-list">
        <div :style="{ height: `${totalSize}px`, position: 'relative', width: '100%' }">
          <button
            v-for="virtualRow in virtualItems"
            :key="virtualRow.key"
            :ref="measureRow"
            type="button"
            class="absolute left-0 right-0 px-5 py-2 border-b border-base hover:bg-active transition flex items-start gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/40"
            :style="{ top: 0, transform: `translateY(${virtualRow.start}px)` }"
            :data-index="virtualRow.index"
            data-testid="hub-recent-row"
            @click="openItem(items[virtualRow.index]!)"
          >
            <ProjectIcon
              :project="{ id: items[virtualRow.index]!.projectId, repo: repoMap.get(items[virtualRow.index]!.projectId) ?? items[virtualRow.index]!.repo }"
              :size="16"
              class="mt-0.5 shrink-0"
            />
            <span class="font-mono text-xs color-muted shrink-0 truncate max-w-32" :title="items[virtualRow.index]!.repo">{{ items[virtualRow.index]!.repo }}</span>
            <span
              :class="items[virtualRow.index]!.kind === 'pull' ? 'i-octicon-git-pull-request-16' : 'i-octicon-issue-opened-16'"
              class="mt-0.5 shrink-0"
              :title="items[virtualRow.index]!.kind"
            />
            <span class="font-mono text-xs color-muted tabular-nums shrink-0">#{{ items[virtualRow.index]!.number }}</span>
            <span class="flex-1 min-w-0 truncate text-sm">{{ items[virtualRow.index]!.title }}</span>
            <AuthorEntry
              v-if="items[virtualRow.index]!.author"
              :author="items[virtualRow.index]!.author!"
              :size="16"
              :link="false"
              class="shrink-0"
            />
            <DateBadge :time="items[virtualRow.index]!.updatedAt" mode="day" class="shrink-0" />
          </button>
        </div>
      </div>
    </main>
  </div>
</template>

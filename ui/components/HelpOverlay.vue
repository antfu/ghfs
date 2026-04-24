<script setup lang="ts">
import type { Shortcut } from '../composables/useShortcuts'

const ui = useUiState()

const groupOrder = [
  'nav',
  'list',
  'panel',
  'tab',
  'pr-tabs',
  'search',
  'comment',
  'action',
  'item',
  'help',
] as const

type GroupId = typeof groupOrder[number]

const groupTitle: Record<GroupId, string> = {
  'nav': 'Navigate',
  'list': 'List',
  'panel': 'Panels',
  'tab': 'Top-level tabs',
  'pr-tabs': 'PR detail tabs',
  'search': 'Search',
  'comment': 'Comment',
  'action': 'Actions',
  'item': 'Item actions',
  'help': 'Help',
}

function groupOf(id: string): GroupId {
  if (id.startsWith('pr.tab.')) return 'pr-tabs'
  const head = id.split('.')[0] ?? ''
  return (groupOrder as readonly string[]).includes(head) ? head as GroupId : 'action'
}

const grouped = computed<Array<{ id: GroupId, title: string, items: Shortcut[] }>>(() => {
  const all = getAllShortcuts()
  const map = new Map<GroupId, Shortcut[]>()
  for (const sc of all) {
    const g = groupOf(sc.id)
    const bucket = map.get(g) ?? []
    bucket.push(sc)
    map.set(g, bucket)
  }
  return groupOrder
    .filter(id => map.has(id))
    .map(id => ({ id, title: groupTitle[id], items: map.get(id)! }))
})

function displayKeys(sc: Shortcut): string[] {
  return sc.label ?? sc.keys.map(humanize)
}

function humanize(key: string): string {
  if (key === 'Escape') return 'Esc'
  if (key === 'Enter') return '↵'
  if (key === 'ArrowUp') return '↑'
  if (key === 'ArrowDown') return '↓'
  if (key === ' ') return 'Space'
  return key
}
</script>

<template>
  <DialogRoot v-model:open="ui.helpOpen.value">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 bg-black/40 backdrop-blur-sm z-60" />
      <DialogContent
        class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-base border border-base rounded-lg shadow-xl w-[min(92vw,40rem)] max-h-[80vh] z-60 flex flex-col overflow-hidden"
      >
        <header class="px-6 py-4 border-b border-base flex items-center gap-2">
          <span class="i-octicon-question-16 color-active" />
          <DialogTitle class="font-medium">Keyboard shortcuts</DialogTitle>
          <div class="flex-1" />
          <span class="text-xs color-muted">Press <span class="kbd">?</span> anytime · <span class="kbd">Esc</span> to close</span>
        </header>

        <div class="flex-1 overflow-y-auto px-6 py-4 grid grid-cols-2 gap-x-6 gap-y-4">
          <section v-for="group in grouped" :key="group.id">
            <h3 class="text-xs color-muted uppercase tracking-wide font-medium mb-2">{{ group.title }}</h3>
            <ul class="flex flex-col gap-1.5">
              <li
                v-for="sc in group.items"
                :key="sc.id"
                class="flex items-center gap-3 text-sm"
                :class="{ 'op40': sc.enabled && !sc.enabled() }"
              >
                <span class="flex-1 min-w-0">{{ sc.description }}</span>
                <Kbd :keys="displayKeys(sc)" :active="sc.enabled ? sc.enabled() : true" />
              </li>
              <li
                v-if="group.id === 'comment'"
                class="flex items-center gap-3 text-sm"
              >
                <span class="flex-1 min-w-0">Submit comment</span>
                <Kbd keys="⌘ ↵" />
              </li>
            </ul>
          </section>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

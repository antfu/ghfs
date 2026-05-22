<script setup lang="ts">
import type { Command } from '../composables/useCommands'
import { diagnostics } from '../utils/logger'

const palette = useCommandPalette()
const ctx = useWhenContext()

const open = computed({
  get: () => palette.paletteOpen.value,
  set: v => (palette.paletteOpen.value = v),
})

interface PaletteEntry {
  command: Command
  score: number
  keyLabel: string[]
}

const allEntries = computed(() => {
  const compiled = getCompiledCommands()
  const ctxObj = ctx.value as unknown as Record<string, unknown>
  const visible: PaletteEntry[] = []
  for (const c of compiled) {
    if (!evalWhen(c.whenNode, ctxObj)) continue
    const kbs = getKeybindingsFor(c.command.id)
    const first = kbs[0]
    const keyLabel = first ? (first.label ?? bindingDisplay(first.key)) : []
    visible.push({ command: c.command, score: 0, keyLabel })
  }
  return visible
})

const filtered = computed(() => {
  const q = palette.query.value.trim().toLowerCase()
  if (!q) {
    return allEntries.value.map(e => ({ ...e, score: 1 }))
  }
  const out: PaletteEntry[] = []
  for (const entry of allEntries.value) {
    const score = scoreCommand(entry.command, q)
    if (score > 0)
      out.push({ ...entry, score })
  }
  out.sort((a, b) => b.score - a.score)
  return out
})

interface PaletteGroup {
  title: string
  entries: PaletteEntry[]
  /** Index of the first entry within `flatEntries`. */
  startIndex: number
}

const flatEntries = computed(() => filtered.value)

const grouped = computed<PaletteGroup[]>(() => {
  const groups = new Map<string, PaletteEntry[]>()
  for (const entry of filtered.value) {
    const cat = entry.command.category || 'Other'
    const bucket = groups.get(cat) ?? []
    bucket.push(entry)
    groups.set(cat, bucket)
  }
  let cursor = 0
  const out: PaletteGroup[] = []
  for (const [title, entries] of groups) {
    out.push({ title, entries, startIndex: cursor })
    cursor += entries.length
  }
  return out
})

watch(filtered, (next) => {
  if (next.length === 0) {
    palette.setSelectedIndex(0)
    return
  }
  if (palette.selectedIndex.value >= next.length)
    palette.setSelectedIndex(0)
})

function move(delta: number) {
  const total = flatEntries.value.length
  if (total === 0) return
  const next = (palette.selectedIndex.value + delta + total) % total
  palette.setSelectedIndex(next)
  scrollSelectedIntoView()
}

function setIndex(i: number) {
  const total = flatEntries.value.length
  if (total === 0) return
  palette.setSelectedIndex(Math.max(0, Math.min(total - 1, i)))
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    move(1)
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    move(-1)
    return
  }
  if (event.key === 'Home') {
    event.preventDefault()
    setIndex(0)
    scrollSelectedIntoView()
    return
  }
  if (event.key === 'End') {
    event.preventDefault()
    setIndex(flatEntries.value.length - 1)
    scrollSelectedIntoView()
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    runSelected()
  }
}

async function runSelected() {
  const entry = flatEntries.value[palette.selectedIndex.value]
  if (!entry) return
  // Close before running so the command can open another overlay without race.
  palette.close()
  try {
    await entry.command.run()
  }
  catch (err) {
    diagnostics.GHFS0901({
      shortcut: entry.command.id,
      detail: String((err as Error)?.message ?? err),
      cause: err,
    })
  }
}

const listRef = ref<HTMLElement | null>(null)
function scrollSelectedIntoView() {
  nextTick(() => {
    const el = listRef.value?.querySelector<HTMLElement>('[data-selected="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  })
}

watch(open, (value) => {
  if (value) {
    nextTick(() => {
      const input = document.querySelector<HTMLInputElement>('[data-testid="command-palette-input"]')
      input?.focus()
    })
  }
})

function scoreCommand(cmd: Command, query: string): number {
  const title = cmd.title.toLowerCase()
  const cat = cmd.category.toLowerCase()
  let score = 0
  if (title.startsWith(query)) score += 100
  else if (title.includes(query)) score += 50
  if (cat.startsWith(query)) score += 20
  else if (cat.includes(query)) score += 10
  // Initials match: 'sf' matches 'Sync from GitHub'.
  const initials = title.split(/\s+/).map(w => w[0] ?? '').join('')
  if (initials.startsWith(query)) score += 30
  // Token contains: any word starts with query.
  if (title.split(/\s+/).some(w => w.startsWith(query))) score += 15
  return score
}
</script>

<template>
  <Modal
    v-model:open="open"
    width="w-[min(92vw,40rem)]"
    max-height="max-h-[70vh]"
    hide-close
    data-testid="command-palette"
    @keydown="onKeydown"
  >
    <template #header>
      <div class="flex items-center gap-2 w-full">
        <span class="i-ph-magnifying-glass-duotone color-active shrink-0" />
        <input
          v-model="palette.query.value"
          type="text"
          placeholder="Type a command…"
          aria-label="Command palette"
          data-testid="command-palette-input"
          autofocus
          class="bg-transparent outline-none w-full font-sans text-sm color-base"
        >
        <span class="text-xs color-muted">
          <span class="kbd">↑</span> <span class="kbd">↓</span> navigate ·
          <span class="kbd">↵</span> run ·
          <span class="kbd">Esc</span> close
        </span>
      </div>
    </template>

    <div ref="listRef" class="px-2 py-2">
      <div v-if="flatEntries.length === 0" class="px-3 py-6 text-center color-muted text-sm">
        No matching commands.
      </div>
      <template v-else>
        <section v-for="group in grouped" :key="group.title" class="mb-3 last:mb-0">
          <h3 class="px-3 pt-1 pb-1 text-xs color-muted uppercase tracking-wide font-medium">
            {{ group.title }}
          </h3>
          <ul>
            <li
              v-for="(entry, i) in group.entries"
              :key="entry.command.id"
              :data-selected="(group.startIndex + i) === palette.selectedIndex.value"
              :data-testid="`command-palette-row-${entry.command.id}`"
              class="flex items-center gap-2 px-3 py-1.5 rounded text-sm cursor-pointer"
              :class="(group.startIndex + i) === palette.selectedIndex.value ? 'bg-active color-base' : 'color-base hover:bg-active'"
              @mousemove="setIndex(group.startIndex + i)"
              @click="runSelected"
            >
              <span v-if="entry.command.icon" :class="entry.command.icon" class="shrink-0 color-muted" />
              <span v-else class="w-4 h-4 shrink-0" aria-hidden="true" />
              <span class="flex-1 min-w-0 truncate">{{ entry.command.title }}</span>
              <span class="shrink-0 text-xs color-muted">{{ entry.command.category }}</span>
              <span v-if="entry.keyLabel.length" class="inline-flex items-center gap-0.5 shrink-0">
                <kbd v-for="(k, j) in entry.keyLabel" :key="j" class="kbd">{{ k }}</kbd>
              </span>
            </li>
          </ul>
        </section>
      </template>
    </div>
  </Modal>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { evalWhen, getCompiledCommands, getKeybindingsFor } from '../../composables/useCommands'
import type { Command } from '../../composables/useCommands'
import { useUiState } from '../../composables/useUiState'
import { useWhenContext } from '../../composables/useWhenContext'
import { bindingDisplay } from '../../utils/parseKey'
import UiModal from '../ui/Modal.vue'

const ui = useUiState()
const ctx = useWhenContext()

interface HelpRow {
  command: Command
  active: boolean
  keys: string[]
}

interface HelpGroup {
  title: string
  rows: HelpRow[]
}

const grouped = computed<HelpGroup[]>(() => {
  const ctxObj = ctx.value as unknown as Record<string, unknown>
  const order: string[] = []
  const buckets = new Map<string, HelpRow[]>()
  for (const c of getCompiledCommands()) {
    const cmd = c.command
    // help flag: true (default) → show; false → hide; string → eval as whenexpr
    if (cmd.help === false) continue
    if (typeof cmd.help === 'string' && !evalWhen(c.helpNode, ctxObj)) continue
    const cat = cmd.category || 'Other'
    if (!buckets.has(cat)) {
      buckets.set(cat, [])
      order.push(cat)
    }
    const kbs = getKeybindingsFor(cmd.id)
    const first = kbs[0]
    const keys = first ? (first.label ?? bindingDisplay(first.key)) : []
    buckets.get(cat)!.push({
      command: cmd,
      active: evalWhen(c.whenNode, ctxObj),
      keys,
    })
  }
  return order.map(title => ({ title, rows: buckets.get(title)! }))
})
</script>

<template>
  <UiModal
    v-model:open="ui.helpOpen.value"
    title="Keyboard shortcuts"
    icon="i-ph-question-duotone"
    width="w-[min(92vw,42rem)]"
    data-testid="help-overlay"
  >
    <template #actions>
      <span class="text-xs color-muted">
        Press <span class="kbd">?</span> anytime · <span class="kbd">Esc</span> to close
      </span>
    </template>
    <div class="px-6 py-4 grid grid-cols-2 gap-x-6 gap-y-4">
      <section v-for="group in grouped" :key="group.title">
        <h3 class="text-xs color-muted uppercase tracking-wide font-medium mb-2">
          {{ group.title }}
        </h3>
        <ul class="flex flex-col gap-1.5">
          <li
            v-for="row in group.rows"
            :key="row.command.id"
            class="flex items-center gap-3 text-sm"
            :class="{ 'op40': !row.active }"
          >
            <span class="flex-1 min-w-0">{{ row.command.title }}</span>
            <span v-if="row.keys.length" class="inline-flex items-center gap-0.5 shrink-0">
              <kbd v-for="(k, i) in row.keys" :key="i" class="kbd">{{ k }}</kbd>
            </span>
            <span v-else class="color-faint text-xs">—</span>
          </li>
          <li
            v-if="group.title === 'Item'"
            class="flex items-center gap-3 text-sm"
          >
            <span class="flex-1 min-w-0">Submit comment</span>
            <span class="inline-flex items-center gap-0.5 shrink-0">
              <kbd class="kbd">⌘</kbd><kbd class="kbd">↵</kbd>
            </span>
          </li>
        </ul>
      </section>
    </div>
  </UiModal>
</template>

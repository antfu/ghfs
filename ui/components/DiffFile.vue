<script setup lang="ts">
import type { File as ParsedDiffFile } from 'parse-diff'

interface Props {
  file: ParsedDiffFile
  defaultOpen?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  defaultOpen: true,
})

const open = ref(props.defaultOpen)

const title = computed(() => {
  const { from, to } = props.file
  if (props.file.deleted && from)
    return from
  if (props.file.new && to)
    return to
  if (from && to && from !== to)
    return `${from} → ${to}`
  return to ?? from ?? '(unknown)'
})

const statusLabel = computed(() => {
  if (props.file.deleted) return 'deleted'
  if (props.file.new) return 'added'
  if (props.file.from && props.file.to && props.file.from !== props.file.to) return 'renamed'
  return ''
})
</script>

<template>
  <div class="border border-base rounded-lg bg-base overflow-hidden">
    <button
      type="button"
      class="w-full flex items-center gap-2 px-3 py-2 bg-subtle text-left hover:bg-secondary"
      @click="open = !open"
    >
      <span :class="open ? 'i-octicon-chevron-down-16' : 'i-octicon-chevron-right-16'" class="text-xs color-muted shrink-0" />
      <span class="i-octicon-file-diff-16 color-muted shrink-0" />
      <span class="font-mono text-xs truncate flex-1">{{ title }}</span>
      <span v-if="statusLabel" class="text-[10px] uppercase tracking-wide color-muted badge-color-neutral">{{ statusLabel }}</span>
      <span class="text-xs color-green-600 dark:color-green-500 font-mono">+{{ file.additions }}</span>
      <span class="text-xs color-red-600 dark:color-red-500 font-mono">-{{ file.deletions }}</span>
    </button>
    <div v-if="open" class="overflow-x-auto">
      <table class="w-full font-mono text-xs border-collapse">
        <tbody>
          <template v-for="(chunk, ci) in file.chunks" :key="ci">
            <tr class="bg-blue-500/10">
              <td colspan="3" class="px-3 py-1 color-muted text-[11px]">{{ chunk.content }}</td>
            </tr>
            <tr
              v-for="(change, gi) in chunk.changes"
              :key="`${ci}-${gi}`"
              :class="{
                'bg-green-500/10': change.type === 'add',
                'bg-red-500/10': change.type === 'del',
              }"
            >
              <td class="w-10 text-right px-2 py-0.5 color-faint select-none tabular-nums border-r border-base">
                <template v-if="change.type === 'normal'">{{ (change as any).ln1 }}</template>
                <template v-else-if="change.type === 'del'">{{ (change as any).ln }}</template>
              </td>
              <td class="w-10 text-right px-2 py-0.5 color-faint select-none tabular-nums border-r border-base">
                <template v-if="change.type === 'normal'">{{ (change as any).ln2 }}</template>
                <template v-else-if="change.type === 'add'">{{ (change as any).ln }}</template>
              </td>
              <td class="px-3 py-0.5 whitespace-pre">{{ change.content }}</td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

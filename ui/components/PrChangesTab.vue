<script setup lang="ts">
interface Props {
  number: number
  hasPatch: boolean
}

const props = defineProps<Props>()

const numberRef = computed(() => props.hasPatch ? props.number : null)
const { entry, load } = usePullPatch(numberRef)

const patchText = computed(() => entry.value.state === 'loaded' ? entry.value.text ?? '' : '')
const files = useParsedDiff(patchText)

const totalAdditions = computed(() => files.value.reduce((sum, f) => sum + (f.additions ?? 0), 0))
const totalDeletions = computed(() => files.value.reduce((sum, f) => sum + (f.deletions ?? 0), 0))
</script>

<template>
  <div class="px-6 py-5 flex flex-col gap-4">
    <EmptyState
      v-if="!hasPatch"
      icon="i-ph-file-diff-duotone"
      title="Patch not synced for this pull request"
    >
      <template #hint>
        <p class="text-xs color-muted max-w-md">
          Set <code class="font-mono text-[11px] bg-#8881 px-1 py-0.5 rounded">sync.patches</code> to <code class="font-mono text-[11px] bg-#8881 px-1 py-0.5 rounded">'all'</code> in your ghfs config to include closed PR patches.
        </p>
      </template>
    </EmptyState>

    <EmptyState
      v-else-if="entry.state === 'loading'"
      size="sm"
      message="Loading patch…"
    >
      <span class="i-octicon-sync-16 animate-spin color-active text-xl" />
    </EmptyState>

    <EmptyState
      v-else-if="entry.state === 'missing'"
      icon="i-ph-file-x-duotone"
      title="Patch file is missing"
      message="Run `ghfs sync` to re-download."
    />

    <div v-else-if="entry.state === 'error'" class="rounded-lg border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm">
      <p class="font-medium color-red-600 dark:color-red-400 mb-1">Failed to load patch</p>
      <p class="color-muted">{{ entry.error }}</p>
      <button type="button" class="btn-action-sm mt-2" @click="load(true)">
        <span class="i-octicon-sync-16" />
        Retry
      </button>
    </div>

    <template v-else-if="entry.state === 'loaded'">
      <EmptyState
        v-if="files.length === 0"
        icon="i-ph-empty-duotone"
        message="No file changes found in the patch."
      />
      <template v-else>
        <div class="flex items-center gap-3 text-xs color-muted px-1">
          <span><strong class="color-active">{{ files.length }}</strong> file{{ files.length === 1 ? '' : 's' }} changed</span>
          <span class="color-faint">·</span>
          <span class="color-green-600 dark:color-green-500 font-mono">+{{ totalAdditions }}</span>
          <span class="color-red-600 dark:color-red-500 font-mono">-{{ totalDeletions }}</span>
        </div>
        <DiffFile v-for="(file, i) in files" :key="`${file.from ?? ''}-${file.to ?? ''}-${i}`" :file="file" />
      </template>
    </template>
  </div>
</template>

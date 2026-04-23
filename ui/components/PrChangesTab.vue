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
    <div v-if="!hasPatch" class="rounded-lg border border-base bg-base px-4 py-6 text-sm color-muted text-center">
      <p class="font-medium mb-1">Patch not synced for this pull request.</p>
      <p>Set <code class="font-mono text-xs bg-subtle px-1 py-0.5 rounded">sync.patches</code> to <code class="font-mono text-xs bg-subtle px-1 py-0.5 rounded">'all'</code> in your ghfs config to include closed PR patches.</p>
    </div>

    <template v-else-if="entry.state === 'loading'">
      <div class="flex items-center justify-center gap-2 py-8 color-muted text-sm">
        <span class="i-octicon-sync-16 animate-spin" />
        Loading patch…
      </div>
    </template>

    <template v-else-if="entry.state === 'missing'">
      <div class="rounded-lg border border-base bg-base px-4 py-6 text-sm color-muted text-center">
        Patch file is missing on disk. Run <code class="font-mono text-xs bg-subtle px-1 py-0.5 rounded">ghfs sync</code> to re-download.
      </div>
    </template>

    <template v-else-if="entry.state === 'error'">
      <div class="rounded-lg border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm">
        <p class="font-medium color-red-600 dark:color-red-400 mb-1">Failed to load patch</p>
        <p class="color-muted">{{ entry.error }}</p>
        <button type="button" class="btn-action text-xs mt-2" @click="load(true)">
          <span class="i-octicon-sync-16" />
          Retry
        </button>
      </div>
    </template>

    <template v-else-if="entry.state === 'loaded'">
      <div v-if="files.length === 0" class="rounded-lg border border-base bg-base px-4 py-6 text-sm color-muted text-center">
        No file changes found in the patch.
      </div>
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

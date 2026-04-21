<script setup lang="ts">
const state = useAppState()

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
</script>

<template>
  <div class="flex items-center gap-3 px-4 py-2 border-b border-base text-sm">
    <div class="flex items-center gap-1">
      <span class="color-muted text-xs uppercase tracking-wide mr-1">State</span>
      <button
        v-for="opt in stateOptions"
        :key="opt.value"
        class="px-2 py-0.5 rounded text-sm"
        :class="state.filters.state === opt.value ? 'bg-primary-500/15 text-primary-600 dark:text-primary-400' : 'color-muted hover:color-base'"
        @click="state.filters.state = opt.value"
      >
        {{ opt.label }}
      </button>
    </div>

    <div class="flex items-center gap-1">
      <span class="color-muted text-xs uppercase tracking-wide mr-1">Kind</span>
      <button
        v-for="opt in kindOptions"
        :key="opt.value"
        class="px-2 py-0.5 rounded text-sm"
        :class="state.filters.kind === opt.value ? 'bg-primary-500/15 text-primary-600 dark:text-primary-400' : 'color-muted hover:color-base'"
        @click="state.filters.kind = opt.value"
      >
        {{ opt.label }}
      </button>
    </div>

    <div class="flex-1" />

    <label class="flex items-center gap-2 flex-none w-72">
      <span class="i-carbon-search color-muted" />
      <input
        v-model="state.filters.search"
        type="text"
        placeholder="Search title, labels, author…"
        class="bg-transparent outline-none w-full font-sans"
      >
    </label>
  </div>
</template>

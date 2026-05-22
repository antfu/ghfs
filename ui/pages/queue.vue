<script setup lang="ts">
const hubQueue = useHubQueue()
</script>

<template>
  <div class="h-full flex flex-col" data-testid="hub-queue-page">
    <AppNavbar mode="hub" />
    <main class="flex-1 overflow-y-auto">
      <div class="max-w-5xl mx-auto px-5 py-6 flex flex-col gap-5">
        <header class="flex items-center gap-3">
          <span class="i-octicon-list-unordered-16 text-xl color-active" />
          <div class="flex flex-col">
            <h1 class="text-lg font-semibold">Queue</h1>
            <span class="text-xs color-muted">
              {{ hubQueue.totalCount.value }} queued
              op{{ hubQueue.totalCount.value === 1 ? '' : 's' }}
              across {{ hubQueue.groups.value.length }}
              project{{ hubQueue.groups.value.length === 1 ? '' : 's' }}
            </span>
          </div>
          <div class="flex-1" />
          <button
            type="button"
            class="btn-primary text-sm"
            :disabled="hubQueue.totalCount.value === 0 || hubQueue.executing.value !== null"
            data-testid="hub-queue-page-execute-all"
            @click="hubQueue.executeAll()"
          >
            <span :class="hubQueue.executing.value === 'all' ? 'i-octicon-sync-16 animate-spin' : 'i-ph-play-duotone'" />
            <span>Execute all</span>
          </button>
        </header>

        <HubQueueGroupedList />
      </div>
    </main>
  </div>
</template>

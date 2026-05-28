<script setup lang="ts">
import { computed } from 'vue'
import type { MergeMethod } from '#ghfs/execute-types'
import OpBody from './Body.vue'

const props = defineProps<{
  method?: MergeMethod
  commitTitle?: string
  commitMessage?: string
}>()

const method = computed<MergeMethod>(() => props.method ?? 'squash')

const METHOD_ICON: Record<MergeMethod, string> = {
  squash: 'i-octicon-stack-16',
  merge: 'i-octicon-git-merge-16',
  rebase: 'i-octicon-git-branch-16',
}
const methodIcon = computed(() => METHOD_ICON[method.value])
</script>

<template>
  <div class="flex flex-col gap-2" data-testid="queue-op-merge">
    <div class="flex items-center gap-1.5">
      <span class="badge bg-#8881 dark:bg-#fff1 color-muted gap-1">
        <span :class="methodIcon" />
        <span class="font-mono">{{ method }}</span>
      </span>
    </div>
    <div v-if="commitTitle" class="text-sm color-base font-medium">{{ commitTitle }}</div>
    <OpBody v-if="commitMessage" :body="commitMessage" />
  </div>
</template>

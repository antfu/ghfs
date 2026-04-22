<script setup lang="ts">
import type { ProviderItem, ProviderPullMetadata } from '../../src/types/provider'
import type { PendingDirection } from '../composables/usePendingOps'

interface Props {
  item: ProviderItem
  pull?: ProviderPullMetadata
  /** Pending close/reopen overlays the rendered state. */
  pending?: PendingDirection
  size?: 'sm' | 'md' | 'lg'
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
})

const effectiveState = computed<'open' | 'closed'>(() => {
  if (props.pending === 'close') return 'closed'
  if (props.pending === 'reopen') return 'open'
  return props.item.state
})

const info = computed(() => {
  const { item, pull } = props
  const state = effectiveState.value

  if (item.kind === 'pull') {
    if (state === 'open') {
      if (pull?.isDraft) return { icon: 'i-octicon-git-pull-request-draft-16', color: 'color-neutral-500 dark:color-neutral-400', label: 'Draft' }
      return { icon: 'i-octicon-git-pull-request-16', color: 'color-green-600 dark:color-green-500', label: 'Open' }
    }
    if (pull?.merged) return { icon: 'i-octicon-git-merge-16', color: 'color-purple-600 dark:color-purple-400', label: 'Merged' }
    return { icon: 'i-octicon-git-pull-request-closed-16', color: 'color-red-600 dark:color-red-400', label: 'Closed' }
  }
  if (state === 'closed') {
    if (item.stateReason === 'not_planned')
      return { icon: 'i-octicon-skip-16', color: 'color-neutral-500 dark:color-neutral-400', label: 'Closed as not planned' }
    return { icon: 'i-octicon-issue-closed-16', color: 'color-purple-600 dark:color-purple-400', label: 'Closed as completed' }
  }
  return { icon: 'i-octicon-issue-opened-16', color: 'color-green-600 dark:color-green-500', label: 'Open' }
})

const sizeClass = computed(() => {
  if (props.size === 'sm') return 'text-sm'
  if (props.size === 'lg') return 'text-xl'
  return 'text-base'
})
</script>

<template>
  <span class="relative inline-flex items-center justify-center">
    <span :class="[info.icon, info.color, sizeClass]" :aria-label="info.label" />
    <span
      v-if="pending"
      class="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-yellow-500 ring-2 ring-base"
      title="Pending change"
    />
  </span>
</template>

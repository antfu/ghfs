<script setup lang="ts">
import { computed } from 'vue'
import type { ReactionContent } from '../../../../src/utils/reactions'
import { REACTION_EMOJI } from '../../../../src/utils/reactions'

interface Target {
  kind: 'item' | 'comment' | 'review'
  commentId?: number
  reviewId?: string
}

const props = defineProps<{
  reaction: ReactionContent
  target?: Target
}>()

const target = computed<Target>(() => props.target ?? { kind: 'item' })

const targetLabel = computed(() => {
  switch (target.value.kind) {
    case 'item': return 'on this item'
    case 'comment': return target.value.commentId != null ? `on comment #${target.value.commentId}` : 'on a comment'
    case 'review': return 'on a review'
  }
})

const emoji = computed(() => REACTION_EMOJI[props.reaction])
</script>

<template>
  <div class="flex items-center gap-2.5" data-testid="queue-op-reaction">
    <span class="text-2xl leading-none">{{ emoji }}</span>
    <div class="flex flex-col">
      <span class="text-sm font-mono color-base">{{ reaction }}</span>
      <span class="text-xs color-muted">{{ targetLabel }}</span>
    </div>
  </div>
</template>

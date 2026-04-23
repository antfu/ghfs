<script setup lang="ts">
import type { QueueEntry } from '#ghfs/server-types'
import type {
  ProviderComment,
  ProviderItem,
  ProviderTimelineEvent,
} from '../../src/types/provider'

interface Props {
  item: ProviderItem
  comments: ProviderComment[]
  timeline?: ProviderTimelineEvent[]
  pendingComments?: QueueEntry[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  editPending: [entry: QueueEntry]
  removePending: [entry: QueueEntry]
}>()

const renderedBody = computed(() => renderMarkdown(props.item.body))
const hasAnyActivity = computed(() =>
  props.comments.length > 0
  || (props.timeline?.length ?? 0) > 0
  || (props.pendingComments?.length ?? 0) > 0,
)
</script>

<template>
  <div class="flex flex-col">
    <section class="px-6 py-5">
      <div class="rounded-lg border border-base bg-base overflow-hidden">
        <div class="flex items-center gap-2 px-4 py-2 border-b border-base bg-subtle">
          <Avatar :login="item.author" :size="20" />
          <span class="text-sm">
            <span class="font-medium">@{{ item.author || 'ghost' }}</span>
            <span class="color-muted"> opened this {{ item.kind === 'pull' ? 'pull request' : 'issue' }} {{ formatRelative(item.createdAt) }}</span>
          </span>
        </div>
        <div class="px-4 py-4">
          <div v-if="item.body" class="markdown-body text-sm" v-html="renderedBody" />
          <p v-else class="text-sm color-muted italic">No description provided.</p>
        </div>
      </div>
    </section>

    <section v-if="hasAnyActivity" class="px-6 pb-6">
      <TimelineStream
        :comments="comments"
        :timeline="timeline"
        :pending-comments="pendingComments"
        @edit-pending="emit('editPending', $event)"
        @remove-pending="emit('removePending', $event)"
      />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { QueueEntry } from '#ghfs/server-types'
import type {
  ProviderComment,
  ProviderItem,
  ProviderTimelineEvent,
} from '../../../src/types/provider'
import { renderMarkdown } from '../../composables/useMarkdown'
import DisplayAuthor from '../display/Author.vue'
import DisplayDateBadge from '../display/DateBadge.vue'
import PanelDetailMergeWidget from './DetailMergeWidget.vue'
import PanelDetailReactions from './DetailReactions.vue'
import PanelDetailTimeline from './DetailTimeline.vue'

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
        <div class="flex items-center gap-2 px-4 py-2 border-b border-base bg-#8881 dark:bg-#fff1">
          <DisplayAuthor :author="item.author ? { login: item.author, avatarUrl: item.authorAvatarUrl } : 'ghost'" :size="20" />
          <span class="text-sm color-muted flex items-center gap-1.5">
            <span>opened this {{ item.kind === 'pull' ? 'pull request' : 'issue' }}</span>
            <DisplayDateBadge :time="item.createdAt" colorize="text" />
          </span>
        </div>
        <div class="px-4 py-4">
          <div v-if="item.body" class="markdown-body text-sm" v-html="renderedBody" />
          <p v-else class="text-sm color-muted italic">No description provided.</p>
          <PanelDetailReactions
            :item-number="item.number"
            :target="{ kind: 'item' }"
            :reactions="item.reactions"
          />
        </div>
      </div>
    </section>

    <section v-if="hasAnyActivity" class="px-6 pb-6">
      <PanelDetailTimeline
        :item="item"
        :comments="comments"
        :timeline="timeline"
        :pending-comments="pendingComments"
        @edit-pending="emit('editPending', $event)"
        @remove-pending="emit('removePending', $event)"
      />
    </section>

    <PanelDetailMergeWidget v-if="item.kind === 'pull'" :number="item.number" />
  </div>
</template>

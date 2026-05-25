<script setup lang="ts">
import type { ListItem } from '../../types/list-item'
import { computed } from 'vue'
import { isUnchangedSince } from '../../composables/useCardsMode'
import { highlight, snippet } from '../../composables/useHighlight'
import { renderMarkdownInline } from '../../composables/useMarkdown'
import { usePendingOps } from '../../composables/usePendingOps'
import { useSeenHistory } from '../../composables/useSeenHistory'
import DisplayAuthor from '../display/Author.vue'
import DisplayDateBadge from '../display/DateBadge.vue'
import DisplayItemActivitySparkline from '../display/ItemActivitySparkline.vue'
import DisplayItemStateIcon from '../display/ItemStateIcon.vue'
import DisplayLabel from '../display/Label.vue'
import DisplayProjectIcon from '../display/ProjectIcon.vue'
import UiAvatar from '../ui/Avatar.vue'
import UiBadge from '../ui/Badge.vue'

const props = withDefaults(defineProps<{
  item: ListItem
  selected?: boolean
  showRepoName?: boolean
  searchHighlight?: string
}>(), {
  searchHighlight: '',
})

const emit = defineEmits<{
  select: [item: ListItem]
}>()

const seenHistory = useSeenHistory()

const rawItem = computed(() => props.item.raw?.data.item)
const rawPull = computed(() => props.item.raw?.data.pull)

const iconItem = computed(() => rawItem.value ?? {
  kind: props.item.kind,
  state: props.item.state ?? 'open',
  stateReason: props.item.stateReason ?? null,
})
const iconPull = computed(() => {
  if (rawPull.value)
    return rawPull.value
  if (props.item.kind !== 'pull')
    return undefined
  return { isDraft: props.item.pullIsDraft, merged: props.item.pullMerged }
})

const labels = computed(() => props.item.labels ?? [])
const assignees = computed(() => props.item.assignees ?? [])

/**
 * True when the item has activity the user hasn't yet caught up on — either
 * they've never opened it, or something has changed since `lastSeenAt`.
 * Drives the unread dot in the top-right and the bold title weight.
 */
const hasUnseenActivity = computed(() => {
  const seen = seenHistory.getSeenEntry(`${props.item.projectId}#${props.item.number}`)
  if (!seen)
    return true
  return !isUnchangedSince(props.item, seen)
})

// Pending ops are per-active-project (via useAppState). They only make sense
// when this row belongs to the active project — i.e. when `raw` is present.
const pendingNumber = computed(() => props.item.raw ? props.item.number : null)
const pending = usePendingOps(pendingNumber)

const titleText = computed(() => pending.pendingTitle.value?.op.action === 'set-title'
  ? (pending.pendingTitle.value.op as { title: string }).title
  : props.item.title,
)
const titleHtml = computed(() => {
  if (props.searchHighlight.trim())
    return highlight(titleText.value, props.searchHighlight)
  return renderMarkdownInline(titleText.value)
})
const bodySnippetHtml = computed(() => {
  const q = props.searchHighlight.trim()
  if (!q)
    return ''
  if ((titleText.value ?? '').toLowerCase().includes(q.toLowerCase()))
    return ''
  return snippet(props.item.body ?? null, q, 80)
})
</script>

<template>
  <div class="border-b border-base">
 <button
    type="button"
    class="group w-full text-left flex flex-col gap-1 px-3 py-2 text-sm transition-colors relative outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/40 overflow-hidden"
    :class="props.selected
      ? 'bg-primary-500/8 dark:bg-primary-400/8 border-l-2 border-l-primary-500 dark:border-l-primary-400 pl-[10px]'
      : 'hover:bg-active'"
    :data-unseen="hasUnseenActivity || undefined"
    data-testid="item-row"
    :data-item-number="item.number"
    @click="emit('select', item)"
  >
    <div
      v-if="item.activityBuckets && item.activityBuckets.length"
      class="absolute inset-0 op-25 dark:op-20 pointer-events-none color-active"
    >
      <DisplayItemActivitySparkline
        :points="item.activityBuckets"
        :created-index="item.activityCreatedIndex"
      />
    </div>

    <span
      v-if="hasUnseenActivity"
      class="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary-500 dark:bg-primary-400"
      aria-label="Unseen"
      data-testid="item-row-unseen-dot"
    />


    <div
      v-if="showRepoName"
      class="relative z-1 flex items-center gap-1.5 min-w-0 pl7"
    >
      <DisplayProjectIcon
        :project="{ id: item.projectId, repo: item.repo }"
        :size="14"
        class="shrink-0"
      />
      <span class="font-mono text-xs color-muted truncate" :title="item.repo">
        {{ item.repo }}
      </span>
    </div>

    <div class="relative z-1 flex items-start gap-2.5">
      <DisplayItemStateIcon
        :item="iconItem"
        :pull="iconPull"
        :pending="pending.direction.value"
        class="mt-0.5 shrink-0"
      />

      <div class="flex-1 min-w-0">
        <div class="flex items-baseline gap-2 flex-wrap">
          <span
            class="truncate"
            :class="[
              hasUnseenActivity ? 'font-semibold' : 'font-normal',
              { italic: pending.pendingTitle.value },
            ]"
            v-html="titleHtml"
          />
          <span
            class="font-mono text-xs color-muted tabular-nums"
          >#{{ item.number }}</span>
          <UiBadge
            v-if="pending.hasPending.value"
            color="yellow"
            icon="i-octicon-hourglass-16"
            size="xs"
            :title="`${pending.entries.value.length} pending change(s)`"
            class="uppercase tracking-wide"
          >
            pending
          </UiBadge>
        </div>

        <div v-if="labels.length" class="flex items-center gap-1 flex-wrap mt-0.5">
          <DisplayLabel v-for="label in labels.slice(0, 5)" :key="label" :name="label" :project-id="item.projectId" />
          <span v-if="labels.length > 5" class="text-[10px] color-faint">+{{ labels.length - 5 }}</span>
        </div>

        <div v-if="bodySnippetHtml" class="text-xs color-muted mt-1 leading-relaxed" v-html="bodySnippetHtml" />

        <div class="flex items-center gap-2 flex-wrap text-xs color-muted mt-1">
          <DisplayAuthor
            v-if="item.author"
            :author="{ login: item.author, avatarUrl: item.authorAvatarUrl }"
            :size="14"
            :link="false"
          />
          <template v-if="item.updatedAt">
            <span v-if="item.author" class="color-faint">·</span>
            <DisplayDateBadge :time="item.updatedAt" />
          </template>
          <template v-if="assignees.length">
            <span class="color-faint">·</span>
            <span class="flex items-center gap-1">
              <UiAvatar
                v-for="a in assignees.slice(0, 3)"
                :key="a"
                :login="a"
                :size="14"
              />
              <span v-if="assignees.length > 3" class="font-mono">+{{ assignees.length - 3 }}</span>
            </span>
          </template>
          <template v-if="item.reactionsTotal && item.reactionsTotal > 0">
            <span class="color-faint">·</span>
            <span class="font-mono">{{ item.reactionsTotal }}</span>
          </template>
        </div>
      </div>
    </div>
  </button>
  </div>
</template>

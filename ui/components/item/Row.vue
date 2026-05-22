<script setup lang="ts">
import type { ListItem } from '../../types/list-item'

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

const rawItem = computed(() => props.item.raw?.data.item)
const rawPull = computed(() => props.item.raw?.data.pull)

const labels = computed(() => props.item.labels ?? [])
const assignees = computed(() => props.item.assignees ?? [])

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
    class="group w-full text-left flex items-start gap-2.5 px-3 py-2 text-sm transition-colors relative outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/40"
    :class="props.selected
      ? 'bg-primary-500/8 dark:bg-primary-400/8 border-l-2 border-l-primary-500 dark:border-l-primary-400 pl-[10px]'
      : 'hover:bg-active'"
    data-testid="item-row"
    :data-item-number="item.number"
    @click="emit('select', item)"
  >
    <template v-if="showRepoName">
      <DisplayProjectIcon
        :project="{ id: item.projectId, repo: item.repo }"
        :size="16"
        class="mt-0.5 shrink-0"
      />
    </template>
    <DisplayItemStateIcon
      v-if="rawItem"
      :item="rawItem"
      :pull="rawPull"
      :pending="pending.direction.value"
      class="mt-0.5 shrink-0"
    />
    <span
      v-else
      :class="item.kind === 'pull' ? 'i-octicon-git-pull-request-16' : 'i-octicon-issue-opened-16'"
      class="mt-0.5 shrink-0"
      :title="item.kind"
    />

    <div class="flex-1 min-w-0">
      <div class="flex items-baseline gap-2 flex-wrap">
        <span
          v-if="showRepoName"
          class="font-mono text-xs color-muted truncate max-w-40"
          :title="item.repo"
        >{{ item.repo }}</span>
        <span
          class="font-medium truncate"
          :class="{ 'italic': pending.pendingTitle.value }"
          v-html="titleHtml"
        />
        <a
          v-if="item.url"
          :href="item.url"
          target="_blank"
          rel="noreferrer"
          tabindex="-1"
          class="font-mono text-xs color-muted hover:color-active hover:underline tabular-nums"
          :aria-label="`Open #${item.number} on GitHub`"
          @click.stop
        >#{{ item.number }}</a>
        <span
          v-else
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
        <DisplayLabel v-for="label in labels.slice(0, 5)" :key="label" :name="label" />
        <span v-if="labels.length > 5" class="text-[10px] color-faint">+{{ labels.length - 5 }}</span>
      </div>

      <div v-if="bodySnippetHtml" class="text-xs color-muted mt-1 leading-relaxed" v-html="bodySnippetHtml" />

      <div class="flex items-center gap-2 flex-wrap text-xs color-muted mt-1">
        <DisplayAuthor
          v-if="item.author"
          :author="item.author"
          :size="14"
          :link="false"
        />
        <template v-if="item.updatedAt">
          <span v-if="item.author" class="color-faint">·</span>
          <DisplayDateBadge :time="item.updatedAt" mode="day" />
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
  </button>
  </div>
</template>

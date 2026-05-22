<script setup lang="ts">
import type { QueueEntry } from '#ghfs/server-types'
import type {
  ProviderComment,
  ProviderTimelineEvent,
  ProviderTimelineEventKind,
} from '../../src/types/provider'

interface Props {
  comments: ProviderComment[]
  timeline?: ProviderTimelineEvent[]
  pendingComments?: QueueEntry[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  editPending: [entry: QueueEntry]
  removePending: [entry: QueueEntry]
}>()

const { currentUser } = useCurrentUser()

interface StreamComment {
  kind: 'comment'
  id: string
  createdAt: string
  author: string | null
  body: string | null
}

interface StreamEvent {
  kind: 'event'
  id: string
  createdAt: string
  event: ProviderTimelineEvent
}

type StreamEntry = StreamComment | StreamEvent

const entries = computed<StreamEntry[]>(() => {
  const seenCommentIds = new Set<number>()
  const out: StreamEntry[] = []

  for (const comment of props.comments) {
    seenCommentIds.add(comment.id)
    out.push({
      kind: 'comment',
      id: `comment-${comment.id}`,
      createdAt: comment.createdAt,
      author: comment.author,
      body: comment.body,
    })
  }

  for (const event of props.timeline ?? []) {
    if (event.kind === 'commented' && event.commentId != null && seenCommentIds.has(event.commentId))
      continue
    out.push({
      kind: 'event',
      id: `event-${event.id}`,
      createdAt: event.createdAt,
      event,
    })
  }

  out.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return out
})

function reviewStyle(state: string): { border: string, icon: string, color: string, label: string } {
  if (state === 'approved')
    return { border: 'border-green-500/40', icon: 'i-octicon-check-circle-fill-16', color: 'color-green-600 dark:color-green-500', label: 'approved these changes' }
  if (state === 'changes_requested')
    return { border: 'border-red-500/40', icon: 'i-octicon-file-diff-16', color: 'color-red-600 dark:color-red-500', label: 'requested changes' }
  if (state === 'dismissed')
    return { border: 'border-neutral-500/40', icon: 'i-octicon-x-16', color: 'color-neutral-500 dark:color-neutral-400', label: 'dismissed a review' }
  return { border: 'border-blue-500/40', icon: 'i-octicon-comment-16', color: 'color-blue-600 dark:color-blue-500', label: 'reviewed' }
}

const eventIcon: Partial<Record<ProviderTimelineEventKind, string>> = {
  committed: 'i-octicon-git-commit-16',
  closed: 'i-octicon-issue-closed-16',
  reopened: 'i-octicon-issue-reopened-16',
  merged: 'i-octicon-git-merge-16',
  labeled: 'i-octicon-tag-16',
  unlabeled: 'i-octicon-tag-16',
  assigned: 'i-octicon-person-16',
  unassigned: 'i-octicon-person-16',
  review_requested: 'i-octicon-eye-16',
  review_request_removed: 'i-octicon-eye-closed-16',
  renamed: 'i-octicon-pencil-16',
  head_ref_force_pushed: 'i-octicon-repo-push-16',
  head_ref_deleted: 'i-octicon-trash-16',
  head_ref_restored: 'i-octicon-history-16',
  locked: 'i-octicon-lock-16',
  unlocked: 'i-octicon-lock-16',
  ready_for_review: 'i-octicon-git-pull-request-16',
  convert_to_draft: 'i-octicon-git-pull-request-draft-16',
  referenced: 'i-octicon-bookmark-16',
  'cross-referenced': 'i-octicon-cross-reference-16',
  mentioned: 'i-octicon-mention-16',
  pinned: 'i-octicon-pin-16',
  unpinned: 'i-octicon-pin-slash-16',
  transferred: 'i-octicon-arrow-right-16',
  milestoned: 'i-octicon-milestone-16',
  demilestoned: 'i-octicon-milestone-16',
  marked_as_duplicate: 'i-octicon-copy-16',
  unmarked_as_duplicate: 'i-octicon-copy-16',
  connected: 'i-octicon-link-16',
  disconnected: 'i-octicon-link-slash-16',
  auto_merge_enabled: 'i-octicon-git-merge-16',
  auto_merge_disabled: 'i-octicon-git-merge-16',
  auto_squash_enabled: 'i-octicon-git-merge-16',
  auto_squash_disabled: 'i-octicon-git-merge-16',
  auto_rebase_enabled: 'i-octicon-git-merge-16',
  auto_rebase_disabled: 'i-octicon-git-merge-16',
  base_ref_changed: 'i-octicon-git-branch-16',
  subscribed: 'i-octicon-bell-16',
  unsubscribed: 'i-octicon-bell-slash-16',
  unknown: 'i-octicon-dot-16',
}

const eventLabel: Partial<Record<ProviderTimelineEventKind, string>> = {
  mentioned: 'was mentioned',
  subscribed: 'subscribed',
  unsubscribed: 'unsubscribed',
  pinned: 'pinned this',
  unpinned: 'unpinned this',
  transferred: 'transferred this',
  milestoned: 'added this to the milestone',
  demilestoned: 'removed this from the milestone',
  marked_as_duplicate: 'marked this as a duplicate',
  unmarked_as_duplicate: 'unmarked this as a duplicate',
  connected: 'linked an item',
  disconnected: 'unlinked an item',
  auto_merge_enabled: 'enabled auto-merge',
  auto_merge_disabled: 'disabled auto-merge',
  auto_squash_enabled: 'enabled auto-squash',
  auto_squash_disabled: 'disabled auto-squash',
  auto_rebase_enabled: 'enabled auto-rebase',
  auto_rebase_disabled: 'disabled auto-rebase',
  base_ref_changed: 'changed the base branch',
}

const eventColor: Partial<Record<ProviderTimelineEventKind, string>> = {
  merged: 'color-purple-600 dark:color-purple-400',
  closed: 'color-red-600 dark:color-red-500',
  reopened: 'color-green-600 dark:color-green-500',
  ready_for_review: 'color-green-600 dark:color-green-500',
  convert_to_draft: 'color-neutral-500 dark:color-neutral-400',
}

function iconFor(event: ProviderTimelineEvent): string {
  return eventIcon[event.kind] ?? 'i-octicon-dot-16'
}

function colorFor(event: ProviderTimelineEvent): string {
  return eventColor[event.kind] ?? 'color-muted'
}

function fallbackLabel(event: ProviderTimelineEvent): string {
  return eventLabel[event.kind] ?? (event.rawKind ?? event.kind).replace(/_/g, ' ')
}
</script>

<template>
  <div class="relative">
    <!-- vertical guide line -->
    <div class="absolute left-[15px] top-0 bottom-0 w-px bg-#8882" aria-hidden="true" />

    <div class="flex flex-col gap-4">
      <template v-for="entry in entries" :key="entry.id">
        <!-- Full comment card -->
        <div v-if="entry.kind === 'comment'" class="relative pl-10">
          <span
            class="absolute left-0 top-3 inline-flex items-center justify-center w-8 h-8 rounded-full bg-base border border-base"
          >
            <Avatar :login="entry.author" :size="38" />
          </span>
          <div class="border border-base rounded-lg bg-base overflow-hidden">
            <div class="flex items-center gap-2 px-4 py-2 border-b border-base bg-#8881 dark:bg-#fff1">
              <span class="text-sm">
                <span class="font-medium">@{{ entry.author || 'ghost' }}</span>
                <span class="color-muted inline-flex items-center gap-1"> commented <DateBadge :time="entry.createdAt" mode="day" /></span>
              </span>
            </div>
            <div class="px-4 py-3">
              <div v-if="entry.body" class="markdown-body text-sm" v-html="renderMarkdown(entry.body)" />
              <p v-else class="text-sm color-muted italic">Empty comment.</p>
            </div>
          </div>
        </div>

        <!-- Timeline event -->
        <div v-else class="relative pl-10">
          <!-- Review with body -->
          <template v-if="entry.event.kind === 'reviewed' && entry.event.review?.body">
            <span
              class="absolute left-0 top-3 inline-flex items-center justify-center w-8 h-8 rounded-full bg-base border border-base"
            >
              <Avatar :login="entry.event.actor" :size="24" />
            </span>
            <div class="border-2 rounded-lg bg-base overflow-hidden" :class="reviewStyle(entry.event.review.state).border">
              <div class="flex items-center gap-2 px-4 py-2 border-b border-base bg-#8881 dark:bg-#fff1">
                <span :class="[reviewStyle(entry.event.review.state).icon, reviewStyle(entry.event.review.state).color]" />
                <span class="text-sm">
                  <span class="font-medium">@{{ entry.event.actor || 'ghost' }}</span>
                  <span class="color-muted inline-flex items-center gap-1"> {{ reviewStyle(entry.event.review.state).label }} <DateBadge :time="entry.createdAt" mode="day" /></span>
                </span>
              </div>
              <div class="px-4 py-3">
                <div class="markdown-body text-sm" v-html="renderMarkdown(entry.event.review.body)" />
              </div>
            </div>
          </template>

          <!-- Review without body → single line -->
          <div v-else-if="entry.event.kind === 'reviewed'" class="flex items-center gap-2 text-sm py-1">
            <span
              class="absolute left-0 top-0.5 inline-flex items-center justify-center w-8 h-8 rounded-full bg-base"
            >
              <span class="w-6 h-6 rounded-full bg-#8881 dark:bg-#fff1 inline-flex items-center justify-center">
                <span :class="[reviewStyle(entry.event.review?.state ?? 'commented').icon, reviewStyle(entry.event.review?.state ?? 'commented').color, 'text-xs']" />
              </span>
            </span>
            <AuthorEntry :author="entry.event.actor || 'ghost'" :size="16" />
            <span class="color-muted">{{ reviewStyle(entry.event.review?.state ?? 'commented').label }}</span>
            <span class="color-faint">·</span>
            <DateBadge :time="entry.createdAt" mode="day" />
          </div>

          <!-- Committed event -->
          <div v-else-if="entry.event.kind === 'committed'" class="flex items-start gap-2 text-sm py-1">
            <span
              class="absolute left-0 top-0.5 inline-flex items-center justify-center w-8 h-8 rounded-full bg-base"
            >
              <span class="w-6 h-6 rounded-full bg-#8881 dark:bg-#fff1 inline-flex items-center justify-center">
                <span class="i-octicon-git-commit-16 color-muted text-xs" />
              </span>
            </span>
            <span class="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
              <span class="font-medium">{{ entry.event.actor || 'unknown' }}</span>
              <span class="color-muted">committed</span>
              <code class="font-mono text-xs color-muted">{{ entry.event.sha?.slice(0, 7) }}</code>
              <span class="truncate">{{ entry.event.commitMessage }}</span>
              <span class="color-faint">·</span>
              <DateBadge :time="entry.createdAt" mode="day" />
            </span>
          </div>

          <!-- Generic single-line events -->
          <div v-else class="flex items-center gap-2 text-sm py-1 flex-wrap">
            <span
              class="absolute left-0 top-0.5 inline-flex items-center justify-center w-8 h-8 rounded-full bg-base"
            >
              <span class="w-6 h-6 rounded-full bg-#8881 dark:bg-#fff1 inline-flex items-center justify-center">
                <span :class="[iconFor(entry.event), colorFor(entry.event), 'text-xs']" />
              </span>
            </span>
            <AuthorEntry v-if="entry.event.actor" :author="entry.event.actor" :size="16" />

            <template v-if="entry.event.kind === 'labeled' || entry.event.kind === 'unlabeled'">
              <span class="color-muted">{{ entry.event.kind === 'labeled' ? 'added' : 'removed' }}</span>
              <Label
                v-if="entry.event.label"
                :name="entry.event.label.name"
                :fallback-color="entry.event.label.color"
              />
              <span class="color-muted">label</span>
            </template>

            <template v-else-if="entry.event.kind === 'assigned' || entry.event.kind === 'unassigned'">
              <span class="color-muted">{{ entry.event.kind === 'assigned' ? 'assigned' : 'unassigned' }}</span>
              <AuthorEntry v-if="entry.event.assignee" :author="entry.event.assignee" :size="16" />
            </template>

            <template v-else-if="entry.event.kind === 'review_requested' || entry.event.kind === 'review_request_removed'">
              <span class="color-muted">{{ entry.event.kind === 'review_requested' ? 'requested review from' : 'removed review request for' }}</span>
              <span v-if="entry.event.requestedReviewer" class="font-mono">@{{ entry.event.requestedReviewer }}</span>
            </template>

            <template v-else-if="entry.event.kind === 'renamed'">
              <span class="color-muted">renamed</span>
              <span class="italic color-muted line-through">{{ entry.event.rename?.from }}</span>
              <span class="color-muted">→</span>
              <span class="italic">{{ entry.event.rename?.to }}</span>
            </template>

            <template v-else-if="entry.event.kind === 'cross-referenced' || entry.event.kind === 'referenced'">
              <span class="color-muted">{{ entry.event.kind === 'cross-referenced' ? 'mentioned this from' : 'referenced this in' }}</span>
              <template v-if="entry.event.source">
                <a
                  v-if="entry.event.source.url"
                  :href="entry.event.source.url"
                  target="_blank"
                  rel="noreferrer"
                  class="font-mono color-active hover:underline"
                  @click.stop
                >#{{ entry.event.source.number }}</a>
                <span v-else class="font-mono color-muted">#{{ entry.event.source.number }}</span>
                <span v-if="entry.event.source.title" class="truncate max-w-md color-muted">{{ entry.event.source.title }}</span>
                <span v-if="entry.event.source.repo" class="font-mono text-[11px] color-faint">{{ entry.event.source.repo }}</span>
              </template>
              <span v-else class="color-faint italic">another item</span>
            </template>

            <template v-else-if="entry.event.kind === 'milestoned' || entry.event.kind === 'demilestoned'">
              <span class="color-muted">{{ entry.event.kind === 'milestoned' ? 'added this to the milestone' : 'removed this from the milestone' }}</span>
              <span v-if="entry.event.milestone" class="font-mono italic">{{ entry.event.milestone }}</span>
            </template>

            <template v-else-if="entry.event.kind === 'merged'">
              <span class="color-muted">merged this pull request</span>
              <span v-if="entry.event.sha"> via commit</span>
              <code v-if="entry.event.sha" class="font-mono text-xs color-muted">{{ entry.event.sha.slice(0, 7) }}</code>
            </template>

            <template v-else-if="entry.event.kind === 'closed'">
              <span class="color-muted">closed this</span>
            </template>

            <template v-else-if="entry.event.kind === 'reopened'">
              <span class="color-muted">reopened this</span>
            </template>

            <template v-else-if="entry.event.kind === 'ready_for_review'">
              <span class="color-muted">marked this as ready for review</span>
            </template>

            <template v-else-if="entry.event.kind === 'convert_to_draft'">
              <span class="color-muted">converted this to draft</span>
            </template>

            <template v-else-if="entry.event.kind === 'head_ref_force_pushed'">
              <span class="color-muted">force-pushed the branch</span>
            </template>

            <template v-else-if="entry.event.kind === 'head_ref_deleted'">
              <span class="color-muted">deleted the branch</span>
            </template>

            <template v-else-if="entry.event.kind === 'head_ref_restored'">
              <span class="color-muted">restored the branch</span>
            </template>

            <template v-else-if="entry.event.kind === 'locked'">
              <span class="color-muted">locked this conversation</span>
            </template>

            <template v-else-if="entry.event.kind === 'unlocked'">
              <span class="color-muted">unlocked this conversation</span>
            </template>

            <template v-else>
              <span class="color-muted">{{ fallbackLabel(entry.event) }}</span>
            </template>

            <span class="color-faint">·</span>
            <DateBadge :time="entry.createdAt" mode="day" />
          </div>
        </div>
      </template>

      <!-- Pending queued comments -->
      <div
        v-for="entry in pendingComments ?? []"
        :key="`pending-${entry.id}`"
        class="relative pl-10"
      >
        <span
          class="absolute left-0 top-3 inline-flex items-center justify-center w-8 h-8 rounded-full bg-base border border-dashed border-yellow-500/60"
        >
          <Avatar
            v-if="currentUser?.login"
            :login="currentUser.login"
            :src="currentUser.avatarUrl"
            :size="30"
          />
          <span v-else class="i-octicon-hourglass-16 color-yellow-600 dark:color-yellow-400" />
        </span>
        <div class="rounded-lg border-2 border-dashed border-yellow-500/60 bg-yellow-500/5 overflow-hidden">
          <div class="flex items-center gap-2 px-4 py-2 border-b border-dashed border-yellow-500/40">
            <span class="text-sm">
              <span class="font-medium">@{{ currentUser?.login ?? 'you' }}</span>
              <span class="color-muted"> · pending comment</span>
              <span v-if="entry.op.action === 'close-with-comment'" class="color-muted"> · will also close</span>
            </span>
            <div class="flex-1" />
            <IconButton
              icon="i-ph-pencil-simple-duotone"
              size="sm"
              tooltip="Edit"
              aria-label="Edit pending comment"
              @click="emit('editPending', entry)"
            />
            <IconButton
              icon="i-ph-trash-duotone"
              size="sm"
              tooltip="Remove"
              aria-label="Remove pending comment"
              @click="emit('removePending', entry)"
            />
          </div>
          <div class="px-4 py-3">
            <p class="text-sm whitespace-pre-wrap font-sans">{{ (entry.op as { body?: string }).body || '(empty)' }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

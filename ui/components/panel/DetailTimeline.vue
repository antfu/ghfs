<script setup lang="ts">
import type { QueueEntry } from '#ghfs/server-types'
import type {
  ProviderComment,
  ProviderItem,
  ProviderReactions,
  ProviderTimelineEvent,
} from '../../../src/types/provider'
import { isBotLogin } from '../../../src/utils/bot'
import {
  colorFor,
  commitUrlFor,
  humanize,
  iconFor,
  isHiddenEvent,
  reviewStyle,
} from './DetailTimeline.helpers'

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

const { currentUser } = useCurrentUser()
const appState = useAppState()
const repo = computed(() => appState.payload.value?.repo.repo ?? null)
const collapseBotComments = useCollapseBotComments()
const bots = computed(() => appState.payload.value?.bots ?? [])
const expanded = reactive(new Set<string>())

function toggleExpanded(id: string): void {
  if (expanded.has(id))
    expanded.delete(id)
  else
    expanded.add(id)
}

interface StreamComment {
  kind: 'comment'
  id: string
  commentId: number
  createdAt: string
  author: string | null
  authorAvatarUrl?: string
  body: string | null
  reactions?: ProviderReactions
}

interface StreamEvent {
  kind: 'event'
  id: string
  createdAt: string
  event: ProviderTimelineEvent
}

type StreamEntry = StreamComment | StreamEvent

function isBotEntry(entry: StreamEntry): boolean {
  if (entry.kind === 'comment')
    return isBotLogin(entry.author, bots.value)
  if (entry.event.kind === 'reviewed')
    return isBotLogin(entry.event.actor, bots.value)
  return false
}

function isCollapsed(entry: StreamEntry): boolean {
  return collapseBotComments.value && isBotEntry(entry) && !expanded.has(entry.id)
}

const entries = computed<StreamEntry[]>(() => {
  const seenCommentIds = new Set<number>()
  const out: StreamEntry[] = []

  for (const comment of props.comments) {
    seenCommentIds.add(comment.id)
    out.push({
      kind: 'comment',
      id: `comment-${comment.id}`,
      commentId: comment.id,
      createdAt: comment.createdAt,
      author: comment.author,
      authorAvatarUrl: comment.authorAvatarUrl,
      body: comment.body,
      reactions: comment.reactions,
    })
  }

  for (const event of props.timeline ?? []) {
    if (isHiddenEvent(event))
      continue
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

function commitLink(sha: string | undefined, explicit?: string | null): string | null {
  if (explicit)
    return explicit
  return commitUrlFor(repo.value, sha)
}

function shortSha(sha: string | undefined): string {
  return sha ? sha.slice(0, 7) : ''
}
</script>

<template>
  <div class="relative">
    <!-- vertical guide line -->
    <div class="absolute left-[15px] top-0 bottom-0 w-px bg-#8882" aria-hidden="true" />

    <div class="flex flex-col gap-4">
      <template v-for="entry in entries" :key="entry.id">
        <!-- Comment -->
        <div v-if="entry.kind === 'comment'" class="relative pl-10" :data-comment-id="entry.id">
          <!-- Collapsed bot comment -->
          <button
            v-if="isCollapsed(entry)"
            type="button"
            class="w-full flex items-center gap-2 text-sm py-1 text-left hover:bg-active rounded transition"
            data-testid="collapsed-bot-comment"
            @click="toggleExpanded(entry.id)"
          >
            <span
              class="absolute left-0 top-0.5 inline-flex items-center justify-center w-8 h-8 rounded-full bg-base"
            >
              <UiAvatar :login="entry.author" :src="entry.authorAvatarUrl" :size="24" />
            </span>
            <span class="font-mono font-medium">@{{ entry.author || 'ghost' }}</span>
            <span class="color-muted">commented</span>
            <span class="color-faint">·</span>
            <DisplayDateBadge :time="entry.createdAt" />
            <span class="i-ph-caret-right-duotone color-faint text-xs ml-auto shrink-0" />
          </button>

          <!-- Full comment card -->
          <template v-else>
            <span
              class="absolute left-0 top-3 inline-flex items-center justify-center w-8 h-8 rounded-full bg-base border border-base"
            >
              <UiAvatar :login="entry.author" :src="entry.authorAvatarUrl" :size="38" />
            </span>
            <div class="border border-base rounded-lg bg-base overflow-hidden">
              <div
                class="flex items-center gap-2 px-4 py-2 border-b border-base bg-#8881 dark:bg-#fff1"
                :class="isBotEntry(entry) ? 'cursor-pointer hover:bg-#8882 dark:hover:bg-#fff2' : ''"
                @click="isBotEntry(entry) && toggleExpanded(entry.id)"
              >
                <span class="text-sm">
                  <span class="font-medium">@{{ entry.author || 'ghost' }}</span>
                  <span class="color-muted inline-flex items-center gap-1"> commented <DisplayDateBadge :time="entry.createdAt" /></span>
                </span>
                <span v-if="isBotEntry(entry)" class="i-ph-caret-down-duotone color-faint text-xs ml-auto" />
              </div>
              <div class="px-4 py-3">
                <div v-if="entry.body" class="markdown-body text-sm" v-html="renderMarkdown(entry.body)" />
                <p v-else class="text-sm color-muted italic">Empty comment.</p>
                <PanelDetailReactions
                  :item-number="item.number"
                  :target="{ kind: 'comment', commentId: entry.commentId }"
                  :reactions="entry.reactions"
                />
              </div>
            </div>
          </template>
        </div>

        <!-- Review with body → card -->
        <template v-else-if="entry.event.kind === 'reviewed' && entry.event.review?.body">
          <div class="relative pl-10">
            <!-- Collapsed bot review -->
            <button
              v-if="isCollapsed(entry)"
              type="button"
              class="w-full flex items-center gap-2 text-sm py-1 text-left hover:bg-active rounded transition"
              data-testid="collapsed-bot-review"
              @click="toggleExpanded(entry.id)"
            >
              <span
                class="absolute left-0 top-0.5 inline-flex items-center justify-center w-8 h-8 rounded-full bg-base"
              >
                <span class="w-6 h-6 rounded-full bg-#8881 dark:bg-#fff1 inline-flex items-center justify-center">
                  <span :class="[reviewStyle(entry.event.review.state).icon, reviewStyle(entry.event.review.state).color, 'text-xs']" />
                </span>
              </span>
              <DisplayAuthor :author="entry.event.actor ? { login: entry.event.actor, avatarUrl: entry.event.actorAvatarUrl } : 'ghost'" :size="16" />
              <span class="color-muted">{{ reviewStyle(entry.event.review.state).label }}</span>
              <span class="color-faint">·</span>
              <DisplayDateBadge :time="entry.createdAt" />
              <span class="i-ph-caret-right-duotone color-faint text-xs ml-auto shrink-0" />
            </button>

            <!-- Full review card -->
            <template v-else>
              <span
                class="absolute left-0 top-3 inline-flex items-center justify-center w-8 h-8 rounded-full bg-base border border-base"
              >
                <UiAvatar :login="entry.event.actor" :src="entry.event.actorAvatarUrl" :size="24" />
              </span>
              <div class="border-2 rounded-lg bg-base overflow-hidden" :class="reviewStyle(entry.event.review.state).border">
                <div
                  class="flex items-center gap-2 px-4 py-2 border-b border-base bg-#8881 dark:bg-#fff1"
                  :class="isBotEntry(entry) ? 'cursor-pointer hover:bg-#8882 dark:hover:bg-#fff2' : ''"
                  @click="isBotEntry(entry) && toggleExpanded(entry.id)"
                >
                  <span :class="[reviewStyle(entry.event.review.state).icon, reviewStyle(entry.event.review.state).color]" />
                  <span class="text-sm">
                    <span class="font-medium">@{{ entry.event.actor || 'ghost' }}</span>
                    <span class="color-muted inline-flex items-center gap-1"> {{ reviewStyle(entry.event.review.state).label }} <DisplayDateBadge :time="entry.createdAt" /></span>
                  </span>
                  <span v-if="isBotEntry(entry)" class="i-ph-caret-down-duotone color-faint text-xs ml-auto" />
                </div>
                <div class="px-4 py-3">
                  <div class="markdown-body text-sm" v-html="renderMarkdown(entry.event.review.body)" />
                  <PanelDetailReactions
                    v-if="entry.event.review.nodeId"
                    :item-number="item.number"
                    :target="{ kind: 'review', reviewId: entry.event.review.nodeId }"
                    :reactions="entry.event.review.reactions"
                  />
                </div>
              </div>
            </template>
          </div>
        </template>

        <!-- Review without body -->
        <PanelDetailTimelineEventRow
          v-else-if="entry.event.kind === 'reviewed'"
          :icon="reviewStyle(entry.event.review?.state ?? 'commented').icon"
          :color="reviewStyle(entry.event.review?.state ?? 'commented').color"
          :actor="entry.event.actor"
          :created-at="entry.createdAt"
        >
          <span class="color-muted">{{ reviewStyle(entry.event.review?.state ?? 'commented').label }}</span>
        </PanelDetailTimelineEventRow>

        <!-- Committed -->
        <PanelDetailTimelineEventRow
          v-else-if="entry.event.kind === 'committed'"
          icon="i-octicon-git-commit-16"
          :actor="null"
          :created-at="entry.createdAt"
        >
          <span class="font-medium">{{ entry.event.actor || 'unknown' }}</span>
          <span class="color-muted">committed</span>
          <a
            v-if="commitLink(entry.event.sha, entry.event.commitUrl)"
            :href="commitLink(entry.event.sha, entry.event.commitUrl)!"
            target="_blank"
            rel="noreferrer"
            class="color-active hover:underline"
            @click.stop
          ><code class="font-mono text-xs">{{ shortSha(entry.event.sha) }}</code></a>
          <code v-else class="font-mono text-xs color-muted">{{ shortSha(entry.event.sha) }}</code>
          <span class="truncate">{{ entry.event.commitMessage }}</span>
        </PanelDetailTimelineEventRow>

        <!-- Labeled / unlabeled -->
        <PanelDetailTimelineEventRow
          v-else-if="entry.event.kind === 'labeled' || entry.event.kind === 'unlabeled'"
          :icon="iconFor(entry.event)"
          :color="colorFor(entry.event)"
          :actor="entry.event.actor"
          :created-at="entry.createdAt"
        >
          <span class="color-muted">{{ entry.event.kind === 'labeled' ? 'added' : 'removed' }}</span>
          <DisplayLabel :name="entry.event.label.name" :fallback-color="entry.event.label.color" />
          <span class="color-muted">label</span>
        </PanelDetailTimelineEventRow>

        <!-- Assigned / unassigned -->
        <PanelDetailTimelineEventRow
          v-else-if="entry.event.kind === 'assigned' || entry.event.kind === 'unassigned'"
          :icon="iconFor(entry.event)"
          :color="colorFor(entry.event)"
          :actor="entry.event.actor"
          :created-at="entry.createdAt"
        >
          <span class="color-muted">{{ entry.event.kind === 'assigned' ? 'assigned' : 'unassigned' }}</span>
          <DisplayAuthor :author="entry.event.assignee" :size="16" />
        </PanelDetailTimelineEventRow>

        <!-- Review requested / removed -->
        <PanelDetailTimelineEventRow
          v-else-if="entry.event.kind === 'review_requested' || entry.event.kind === 'review_request_removed'"
          :icon="iconFor(entry.event)"
          :color="colorFor(entry.event)"
          :actor="entry.event.actor"
          :created-at="entry.createdAt"
        >
          <span class="color-muted">{{ entry.event.kind === 'review_requested' ? 'requested review from' : 'removed review request for' }}</span>
          <DisplayAuthor v-if="!entry.event.isTeam" :author="entry.event.requestedReviewer" :size="16" />
          <span v-else class="font-mono">@{{ entry.event.requestedReviewer }}</span>
        </PanelDetailTimelineEventRow>

        <!-- Renamed -->
        <PanelDetailTimelineEventRow
          v-else-if="entry.event.kind === 'renamed'"
          :icon="iconFor(entry.event)"
          :color="colorFor(entry.event)"
          :actor="entry.event.actor"
          :created-at="entry.createdAt"
        >
          <span class="color-muted">renamed</span>
          <span class="italic color-muted line-through">{{ entry.event.rename.from }}</span>
          <span class="color-muted">→</span>
          <span class="italic">{{ entry.event.rename.to }}</span>
        </PanelDetailTimelineEventRow>

        <!-- Source-bearing: referenced / cross-referenced / connected / disconnected / marked_as_duplicate / unmarked_as_duplicate -->
        <PanelDetailTimelineEventRow
          v-else-if="entry.event.kind === 'referenced' || entry.event.kind === 'cross-referenced'
            || entry.event.kind === 'connected' || entry.event.kind === 'disconnected'
            || entry.event.kind === 'marked_as_duplicate' || entry.event.kind === 'unmarked_as_duplicate'"
          :icon="iconFor(entry.event)"
          :color="colorFor(entry.event)"
          :actor="entry.event.actor"
          :created-at="entry.createdAt"
        >
          <span class="color-muted">
            {{
              entry.event.kind === 'cross-referenced' ? 'mentioned this from'
              : entry.event.kind === 'referenced' ? 'referenced this in'
                : entry.event.kind === 'connected' ? 'linked'
                  : entry.event.kind === 'disconnected' ? 'unlinked'
                    : entry.event.kind === 'marked_as_duplicate' ? 'marked this as a duplicate of'
                      : 'unmarked this as a duplicate of'
            }}
          </span>
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
        </PanelDetailTimelineEventRow>

        <!-- Milestoned / demilestoned -->
        <PanelDetailTimelineEventRow
          v-else-if="entry.event.kind === 'milestoned' || entry.event.kind === 'demilestoned'"
          :icon="iconFor(entry.event)"
          :color="colorFor(entry.event)"
          :actor="entry.event.actor"
          :created-at="entry.createdAt"
        >
          <span class="color-muted">{{ entry.event.kind === 'milestoned' ? 'added this to the milestone' : 'removed this from the milestone' }}</span>
          <span v-if="entry.event.milestone" class="font-mono italic">{{ entry.event.milestone }}</span>
        </PanelDetailTimelineEventRow>

        <!-- Merged -->
        <PanelDetailTimelineEventRow
          v-else-if="entry.event.kind === 'merged'"
          :icon="iconFor(entry.event)"
          :color="colorFor(entry.event)"
          :actor="entry.event.actor"
          :created-at="entry.createdAt"
        >
          <span class="color-muted">merged this pull request</span>
          <template v-if="entry.event.sha">
            <span class="color-muted">via commit</span>
            <a
              v-if="commitLink(entry.event.sha, entry.event.commitUrl)"
              :href="commitLink(entry.event.sha, entry.event.commitUrl)!"
              target="_blank"
              rel="noreferrer"
              class="color-active hover:underline"
              @click.stop
            ><code class="font-mono text-xs">{{ shortSha(entry.event.sha) }}</code></a>
            <code v-else class="font-mono text-xs color-muted">{{ shortSha(entry.event.sha) }}</code>
          </template>
        </PanelDetailTimelineEventRow>

        <!-- Closed -->
        <PanelDetailTimelineEventRow
          v-else-if="entry.event.kind === 'closed'"
          :icon="iconFor(entry.event)"
          :color="colorFor(entry.event)"
          :actor="entry.event.actor"
          :created-at="entry.createdAt"
        >
          <span class="color-muted">closed this{{ entry.event.stateReason === 'not_planned' ? ' as not planned' : '' }}</span>
          <template v-if="entry.event.sha">
            <span class="color-muted">via</span>
            <a
              v-if="commitLink(entry.event.sha, entry.event.commitUrl)"
              :href="commitLink(entry.event.sha, entry.event.commitUrl)!"
              target="_blank"
              rel="noreferrer"
              class="color-active hover:underline"
              @click.stop
            ><code class="font-mono text-xs">{{ shortSha(entry.event.sha) }}</code></a>
            <code v-else class="font-mono text-xs color-muted">{{ shortSha(entry.event.sha) }}</code>
          </template>
        </PanelDetailTimelineEventRow>

        <!-- Reopened -->
        <PanelDetailTimelineEventRow
          v-else-if="entry.event.kind === 'reopened'"
          :icon="iconFor(entry.event)"
          :color="colorFor(entry.event)"
          :actor="entry.event.actor"
          :created-at="entry.createdAt"
        >
          <span class="color-muted">reopened this</span>
        </PanelDetailTimelineEventRow>

        <!-- Ready for review / convert to draft -->
        <PanelDetailTimelineEventRow
          v-else-if="entry.event.kind === 'ready_for_review' || entry.event.kind === 'convert_to_draft'"
          :icon="iconFor(entry.event)"
          :color="colorFor(entry.event)"
          :actor="entry.event.actor"
          :created-at="entry.createdAt"
        >
          <span class="color-muted">{{ entry.event.kind === 'ready_for_review' ? 'marked this as ready for review' : 'converted this to draft' }}</span>
        </PanelDetailTimelineEventRow>

        <!-- Head ref force pushed -->
        <PanelDetailTimelineEventRow
          v-else-if="entry.event.kind === 'head_ref_force_pushed'"
          :icon="iconFor(entry.event)"
          :color="colorFor(entry.event)"
          :actor="entry.event.actor"
          :created-at="entry.createdAt"
        >
          <span class="color-muted">force-pushed the branch</span>
          <template v-if="entry.event.sha">
            <span class="color-muted">to</span>
            <a
              v-if="commitLink(entry.event.sha, entry.event.commitUrl)"
              :href="commitLink(entry.event.sha, entry.event.commitUrl)!"
              target="_blank"
              rel="noreferrer"
              class="color-active hover:underline"
              @click.stop
            ><code class="font-mono text-xs">{{ shortSha(entry.event.sha) }}</code></a>
            <code v-else class="font-mono text-xs color-muted">{{ shortSha(entry.event.sha) }}</code>
          </template>
        </PanelDetailTimelineEventRow>

        <!-- Head ref deleted / restored -->
        <PanelDetailTimelineEventRow
          v-else-if="entry.event.kind === 'head_ref_deleted' || entry.event.kind === 'head_ref_restored'"
          :icon="iconFor(entry.event)"
          :color="colorFor(entry.event)"
          :actor="entry.event.actor"
          :created-at="entry.createdAt"
        >
          <span class="color-muted">{{ entry.event.kind === 'head_ref_deleted' ? 'deleted the branch' : 'restored the branch' }}</span>
        </PanelDetailTimelineEventRow>

        <!-- Locked / unlocked -->
        <PanelDetailTimelineEventRow
          v-else-if="entry.event.kind === 'locked'"
          :icon="iconFor(entry.event)"
          :color="colorFor(entry.event)"
          :actor="entry.event.actor"
          :created-at="entry.createdAt"
        >
          <span class="color-muted">locked this conversation</span>
          <span v-if="entry.event.lockReason" class="color-muted">as <span class="italic">{{ entry.event.lockReason }}</span></span>
        </PanelDetailTimelineEventRow>

        <PanelDetailTimelineEventRow
          v-else-if="entry.event.kind === 'unlocked'"
          :icon="iconFor(entry.event)"
          :color="colorFor(entry.event)"
          :actor="entry.event.actor"
          :created-at="entry.createdAt"
        >
          <span class="color-muted">unlocked this conversation</span>
        </PanelDetailTimelineEventRow>

        <!-- Pinned / unpinned -->
        <PanelDetailTimelineEventRow
          v-else-if="entry.event.kind === 'pinned' || entry.event.kind === 'unpinned'"
          :icon="iconFor(entry.event)"
          :color="colorFor(entry.event)"
          :actor="entry.event.actor"
          :created-at="entry.createdAt"
        >
          <span class="color-muted">{{ entry.event.kind === 'pinned' ? 'pinned this' : 'unpinned this' }}</span>
        </PanelDetailTimelineEventRow>

        <!-- Transferred -->
        <PanelDetailTimelineEventRow
          v-else-if="entry.event.kind === 'transferred'"
          :icon="iconFor(entry.event)"
          :color="colorFor(entry.event)"
          :actor="entry.event.actor"
          :created-at="entry.createdAt"
        >
          <span class="color-muted">transferred this {{ item.kind === 'pull' ? 'pull request' : 'issue' }}</span>
          <template v-if="entry.event.fromRepo">
            <span class="color-muted">from</span>
            <a
              :href="`https://github.com/${entry.event.fromRepo}`"
              target="_blank"
              rel="noreferrer"
              class="color-active hover:underline"
              @click.stop
            ><code class="font-mono text-xs">{{ entry.event.fromRepo }}</code></a>
          </template>
        </PanelDetailTimelineEventRow>

        <!-- Base ref changed -->
        <PanelDetailTimelineEventRow
          v-else-if="entry.event.kind === 'base_ref_changed'"
          :icon="iconFor(entry.event)"
          :color="colorFor(entry.event)"
          :actor="entry.event.actor"
          :created-at="entry.createdAt"
        >
          <span class="color-muted">changed the base branch</span>
          <template v-if="entry.event.oldRef && entry.event.newRef">
            <span class="color-muted">from</span>
            <code class="font-mono text-xs color-muted">{{ entry.event.oldRef }}</code>
            <span class="color-muted">to</span>
            <code class="font-mono text-xs">{{ entry.event.newRef }}</code>
          </template>
        </PanelDetailTimelineEventRow>

        <!-- Auto merge / squash / rebase -->
        <PanelDetailTimelineEventRow
          v-else-if="entry.event.kind === 'auto_merge_enabled' || entry.event.kind === 'auto_merge_disabled'
            || entry.event.kind === 'auto_squash_enabled' || entry.event.kind === 'auto_squash_disabled'
            || entry.event.kind === 'auto_rebase_enabled' || entry.event.kind === 'auto_rebase_disabled'"
          :icon="iconFor(entry.event)"
          :color="colorFor(entry.event)"
          :actor="entry.event.actor"
          :created-at="entry.createdAt"
        >
          <span class="color-muted">{{ humanize(entry.event.kind) }}</span>
          <span v-if="entry.event.commitTitle" class="color-muted">with commit</span>
          <span v-if="entry.event.commitTitle" class="italic">{{ entry.event.commitTitle }}</span>
        </PanelDetailTimelineEventRow>

        <!-- Review dismissed -->
        <PanelDetailTimelineEventRow
          v-else-if="entry.event.kind === 'review_dismissed'"
          :icon="iconFor(entry.event)"
          :color="colorFor(entry.event)"
          :actor="entry.event.actor"
          :created-at="entry.createdAt"
        >
          <span class="color-muted">dismissed</span>
          <DisplayAuthor v-if="entry.event.reviewedBy" :author="entry.event.reviewedBy" :size="16" />
          <span class="color-muted">{{ entry.event.reviewedBy ? "'s review" : 'a review' }}</span>
          <span v-if="entry.event.dismissedReview.dismissalMessage" class="color-muted italic">— {{ entry.event.dismissedReview.dismissalMessage }}</span>
        </PanelDetailTimelineEventRow>

        <!-- Commented (only renders if not deduped against a full comment) -->
        <PanelDetailTimelineEventRow
          v-else-if="entry.event.kind === 'commented'"
          :icon="iconFor(entry.event)"
          :color="colorFor(entry.event)"
          :actor="entry.event.actor"
          :created-at="entry.createdAt"
        >
          <span class="color-muted">commented</span>
        </PanelDetailTimelineEventRow>

        <!-- Unknown / fallback -->
        <PanelDetailTimelineEventRow
          v-else
          :icon="iconFor(entry.event)"
          :color="colorFor(entry.event)"
          :actor="entry.event.actor"
          :created-at="entry.createdAt"
        >
          <span class="color-muted">{{ humanize(entry.event.kind === 'unknown' ? (entry.event.rawKind ?? 'unknown') : entry.event.kind) }}</span>
        </PanelDetailTimelineEventRow>
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
          <UiAvatar
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
            <UiIconButton
              icon="i-ph-pencil-simple-duotone"
              size="sm"
              tooltip="Edit"
              aria-label="Edit pending comment"
              @click="emit('editPending', entry)"
            />
            <UiIconButton
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

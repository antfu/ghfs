<script setup lang="ts">
import { computed, ref } from 'vue'
import { Dropdown as VDropdown } from 'floating-vue'
import type { QueueEntry } from '#ghfs/server-types'
import type { PendingReactionOp } from '../../../src/execute/types'
import type { ProviderReactions, ReactionTarget } from '../../../src/types/provider'
import type { ReactionContent } from '../../../src/utils/reactions'
import { REACTION_CONTENTS, REACTION_EMOJI, reactionKeyFromContent } from '../../../src/utils/reactions'
import { useActiveProjectId, useAppState } from '../../composables/useAppState'
import { useDetailScope } from '../../composables/useDetailScope'
import { useOnlineState } from '../../composables/useOnlineState'
import { usePendingOps } from '../../composables/usePendingOps'
import { useRpc } from '../../composables/useRpc'

interface Props {
  itemNumber: number
  target: ReactionTarget
  reactions?: ProviderReactions
}

const props = defineProps<Props>()

const activeId = useActiveProjectId()
const scope = useDetailScope()
const effectiveProjectId = computed(() => scope?.projectId ?? activeId.value)
const rpc = useRpc()
const state = useAppState(scope?.projectId)
const pending = usePendingOps(computed(() => props.itemNumber), scope?.projectId)
const { offline } = useOnlineState()

const viewerReactions = ref<Set<ReactionContent>>(new Set())
const viewerLoaded = ref(false)
const viewerLoading = ref(false)

const pendingForTarget = computed<QueueEntry[]>(() => {
  return pending.entries.value.filter((entry) => {
    const op = entry.op
    if (op.action !== 'add-reaction' && op.action !== 'remove-reaction')
      return false
    return targetMatches((op as PendingReactionOp).target, props.target)
  })
})

function targetMatches(a: ReactionTarget | undefined, b: ReactionTarget): boolean {
  const ta = a ?? { kind: 'item' as const }
  if (ta.kind !== b.kind)
    return false
  if (ta.kind === 'item' && b.kind === 'item')
    return true
  if (ta.kind === 'comment' && b.kind === 'comment')
    return ta.commentId === b.commentId
  if (ta.kind === 'review' && b.kind === 'review')
    return ta.reviewId === b.reviewId
  return false
}

function countFor(content: ReactionContent): number {
  if (!props.reactions)
    return 0
  return props.reactions[reactionKeyFromContent(content)] ?? 0
}

function pendingFor(content: ReactionContent): { entry: QueueEntry, kind: 'add' | 'remove' } | null {
  for (const entry of pendingForTarget.value) {
    const op = entry.op as PendingReactionOp
    if (op.reaction !== content)
      continue
    return { entry, kind: op.action === 'add-reaction' ? 'add' : 'remove' }
  }
  return null
}

/** Counts adjusted by pending ops, so chips reflect the queued intent. */
function effectiveCountFor(content: ReactionContent): number {
  const base = countFor(content)
  const p = pendingFor(content)
  if (!p)
    return base
  if (p.kind === 'add' && !viewerReactions.value.has(content))
    return base + 1
  if (p.kind === 'remove' && viewerReactions.value.has(content))
    return Math.max(0, base - 1)
  return base
}

const visibleContents = computed<ReactionContent[]>(() => {
  return REACTION_CONTENTS.filter(c => effectiveCountFor(c) > 0 || pendingFor(c) !== null)
})

const hasAnything = computed(() => visibleContents.value.length > 0)

async function ensureViewerLoaded(): Promise<void> {
  if (viewerLoaded.value || viewerLoading.value)
    return
  if (offline.value)
    return
  viewerLoading.value = true
  try {
    const result = await rpc.$call(
      'ghfs:get-viewer-reactions',
      effectiveProjectId.value ?? '__default__',
      props.itemNumber,
      props.target,
    )
    viewerReactions.value = new Set(result)
    viewerLoaded.value = true
  }
  catch {
    viewerReactions.value = new Set()
    viewerLoaded.value = true
  }
  finally {
    viewerLoading.value = false
  }
}

async function toggle(content: ReactionContent): Promise<void> {
  await ensureViewerLoaded()
  const p = pendingFor(content)
  if (p) {
    try {
      await rpc.$call('ghfs:remove-queue-op', effectiveProjectId.value ?? '__default__', p.entry.id)
    }
    catch (err) {
      state.setError((err as Error).message)
    }
    return
  }
  const isReacted = viewerReactions.value.has(content)
  const action: 'add-reaction' | 'remove-reaction' = isReacted ? 'remove-reaction' : 'add-reaction'
  const op: PendingReactionOp = {
    action,
    number: props.itemNumber,
    reaction: content,
    ...(props.target.kind !== 'item' ? { target: props.target } : {}),
  }
  try {
    await rpc.$call('ghfs:add-queue-op', effectiveProjectId.value ?? '__default__', op)
  }
  catch (err) {
    state.setError((err as Error).message)
  }
}

function chipClass(content: ReactionContent): string {
  const p = pendingFor(content)
  if (p?.kind === 'add')
    return 'border-dashed border-yellow-500/60 bg-yellow-500/10 color-yellow-700 dark:color-yellow-300'
  if (p?.kind === 'remove')
    return 'border-dashed border-orange-500/60 bg-orange-500/10 color-orange-700 dark:color-orange-300 line-through'
  if (viewerLoaded.value && viewerReactions.value.has(content))
    return 'border-primary-500/40 bg-primary-500/10 color-active'
  return 'border-base hover:bg-active'
}

function pickerChipClass(content: ReactionContent): string {
  const p = pendingFor(content)
  if (p?.kind === 'add')
    return 'bg-yellow-500/15 ring-1 ring-yellow-500/50'
  if (p?.kind === 'remove')
    return 'bg-orange-500/15 ring-1 ring-orange-500/50'
  if (viewerLoaded.value && viewerReactions.value.has(content))
    return 'bg-primary-500/15 ring-1 ring-primary-500/40'
  return 'hover:bg-active'
}

function chipTooltip(content: ReactionContent): string {
  const p = pendingFor(content)
  if (p?.kind === 'add')
    return `pending add :${content}: — click to cancel`
  if (p?.kind === 'remove')
    return `pending remove :${content}: — click to cancel`
  if (viewerLoaded.value && viewerReactions.value.has(content))
    return `you reacted :${content}: — click to queue removal`
  return `:${content}: — click to queue add`
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-1.5 mt-3 pt-2 border-t border-base">
    <button
      v-for="content in visibleContents"
      :key="content"
      type="button"
      :title="chipTooltip(content)"
      class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs leading-none transition"
      :class="chipClass(content)"
      @click="toggle(content)"
    >
      <span>{{ REACTION_EMOJI[content] }}</span>
      <span v-if="effectiveCountFor(content) > 0" class="font-medium">{{ effectiveCountFor(content) }}</span>
    </button>

    <VDropdown :distance="6" :triggers="['click']" @show="ensureViewerLoaded">
      <button
        type="button"
        aria-label="Add reaction"
        :title="hasAnything ? 'Add reaction' : 'React'"
        class="inline-flex items-center justify-center rounded-full border border-base px-2 py-0.5 text-xs leading-none op-fade hover:op100 hover:bg-active transition"
      >
        <span class="i-octicon-smiley-16" />
      </button>
      <template #popper="{ hide }">
        <div class="flex items-center gap-0.5 p-1">
          <button
            v-for="content in REACTION_CONTENTS"
            :key="content"
            type="button"
            :title="chipTooltip(content)"
            class="inline-flex items-center justify-center w-8 h-8 rounded-full text-lg transition"
            :class="pickerChipClass(content)"
            @click="toggle(content).then(() => hide())"
          >
            {{ REACTION_EMOJI[content] }}
          </button>
        </div>
      </template>
    </VDropdown>
  </div>
</template>

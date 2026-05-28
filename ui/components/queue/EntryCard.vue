<script setup lang="ts">
import { computed } from 'vue'
import { ACTIONS_COLOR_HEX } from '#ghfs/action-colors'
import type { ActionName } from '#ghfs/action-colors'
import type { QueueEntry } from '#ghfs/server-types'
import { EXECUTE_FILE_NAME, EXECUTE_MD_FILE_NAME } from '../../../src/constants'
import { useActiveProjectId, useAppState } from '../../composables/useAppState'
import { useRpc } from '../../composables/useRpc'
import { actionMeta } from '../../utils/actionMeta'
import DisplayDateBadge from '../display/DateBadge.vue'
import UiIconButton from '../ui/IconButton.vue'
import OpBody from './op/Body.vue'
import OpLabels from './op/Labels.vue'
import OpMerge from './op/Merge.vue'
import OpReaction from './op/Reaction.vue'
import OpUsers from './op/Users.vue'

interface Props {
  entry: QueueEntry
  projectId?: string
  showNumber?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{ remove: [entry: QueueEntry] }>()

const activeId = useActiveProjectId()
const state = useAppState()
const rpc = useRpc()

const op = computed(() => props.entry.op)
const meta = computed(() => actionMeta(op.value.action))
const accent = computed(() => (ACTIONS_COLOR_HEX as Record<string, string>)[op.value.action] ?? '#6b7280')

const SOURCE_ICON: Record<QueueEntry['source'], string> = {
  'execute.yml': 'i-octicon-file-code-16',
  'execute.md': 'i-octicon-markdown-16',
  'per-item': 'i-octicon-file-16',
}

const sourcePath = computed<string>(() => {
  switch (props.entry.source) {
    case 'execute.yml': return EXECUTE_FILE_NAME
    case 'execute.md': return EXECUTE_MD_FILE_NAME
    case 'per-item': return props.entry.filePath ?? ''
  }
})

// Untyped accessor: narrowing a discriminated union through a computed
// is awkward in template land, so we expose fields the section needs.
const opAny = computed(() => op.value as unknown as Record<string, unknown>)

const titleValue = computed(() => opAny.value.title as string | undefined)
const bodyValue = computed(() => opAny.value.body as string | undefined)
const labelsValue = computed(() => (opAny.value.labels as string[] | undefined) ?? [])
const assigneesValue = computed(() => (opAny.value.assignees as string[] | undefined) ?? [])
const reviewersValue = computed(() => (opAny.value.reviewers as string[] | undefined) ?? [])
const milestoneValue = computed(() => opAny.value.milestone as string | number | undefined)
const lockReasonValue = computed(() => opAny.value.reason as string | undefined)

const isSimple = computed<boolean>(() => {
  const SIMPLE: ActionName[] = ['close', 'reopen', 'unlock', 'mark-ready-for-review', 'convert-to-draft', 'enqueue-merge', 'clear-milestone']
  return (SIMPLE as readonly string[]).includes(op.value.action)
})

async function openSource() {
  if (!sourcePath.value)
    return
  const id = props.projectId ?? activeId.value ?? '__default__'
  state.setError(null)
  try {
    await rpc.$call('ghfs:open-in-editor', id, sourcePath.value)
  }
  catch (error) {
    state.setError(`${(error as Error).message}`)
  }
}
</script>

<template>
  <article
    class="panel-card overflow-hidden"
    data-testid="queue-entry-card"
    :data-action="op.action"
    :data-entry-id="entry.id"
    :data-source="entry.source"
  >
    <header class="flex items-center gap-2 px-3 py-2">
      <span
        class="badge gap-1 text-xs"
        :style="{ backgroundColor: `${accent}22`, color: accent }"
      >
        <span :class="meta.icon" />
        <span>{{ meta.label }}</span>
      </span>
      <div class="flex items-center gap-1.5 min-w-0 flex-1">
        <span
          v-if="showNumber"
          class="font-mono text-xs color-muted tabular-nums shrink-0"
        >#{{ op.number }}</span>
        <span
          v-if="entry.title"
          class="text-xs color-base truncate"
        >{{ entry.title }}</span>
      </div>
      <span
        v-if="op.ifUnchangedSince"
        class="inline-flex items-center gap-1 text-xs color-muted shrink-0"
        :title="`Only execute if the item is unchanged since ${op.ifUnchangedSince}`"
      >
        <span class="i-octicon-clock-16" />
        <DisplayDateBadge :time="op.ifUnchangedSince" />
      </span>
      <UiIconButton
        v-if="sourcePath"
        :icon="SOURCE_ICON[entry.source]"
        size="sm"
        :tooltip="`Open ${sourcePath} in editor`"
        class="hover-fade"
        data-testid="queue-entry-source-link"
        @click.stop="openSource"
      />
      <UiIconButton
        icon="i-ph-trash-duotone"
        size="sm"
        tooltip="Remove from queue"
        class="hover-fade"
        data-testid="queue-entry-remove"
        @click.stop="emit('remove', entry)"
      />
    </header>

    <div v-if="!isSimple" class="px-3 pb-3">
      <!-- set-title -->
      <div
        v-if="op.action === 'set-title' && titleValue"
        class="text-sm color-base font-medium border-l-2 border-base pl-3 italic"
      >{{ titleValue }}</div>

      <!-- body-carrying actions -->
      <OpBody
        v-else-if="(op.action === 'set-body' || op.action === 'add-comment' || op.action === 'close-with-comment' || op.action === 'review-comment' || op.action === 'request-changes' || op.action === 'approve') && bodyValue"
        :body="bodyValue"
      />
      <p
        v-else-if="op.action === 'approve' && !bodyValue"
        class="text-xs color-muted italic"
      >(no comment)</p>

      <!-- labels -->
      <OpLabels
        v-else-if="op.action === 'add-labels' || op.action === 'remove-labels' || op.action === 'set-labels'"
        :labels="labelsValue"
        :project-id="projectId"
      />

      <!-- assignees / reviewers -->
      <OpUsers
        v-else-if="op.action === 'add-assignees' || op.action === 'remove-assignees' || op.action === 'set-assignees'"
        :users="assigneesValue"
      />
      <OpUsers
        v-else-if="op.action === 'request-reviewers' || op.action === 'remove-reviewers'"
        :users="reviewersValue"
      />

      <!-- set-milestone -->
      <span
        v-else-if="op.action === 'set-milestone' && milestoneValue != null"
        class="badge bg-#8881 dark:bg-#fff1 color-muted gap-1 text-xs"
      >
        <span class="i-octicon-milestone-16" />
        <span>{{ milestoneValue }}</span>
      </span>

      <!-- lock reason -->
      <span
        v-else-if="op.action === 'lock'"
        class="badge bg-#8881 dark:bg-#fff1 color-muted gap-1 text-xs"
      >
        <span class="i-octicon-lock-16" />
        <span>{{ lockReasonValue ?? 'no reason specified' }}</span>
      </span>

      <!-- merge -->
      <OpMerge
        v-else-if="op.action === 'merge'"
        :method="opAny.method as ('squash' | 'merge' | 'rebase' | undefined)"
        :commit-title="opAny.commitTitle as (string | undefined)"
        :commit-message="opAny.commitMessage as (string | undefined)"
      />

      <!-- reactions -->
      <OpReaction
        v-else-if="op.action === 'add-reaction' || op.action === 'remove-reaction'"
        :reaction="opAny.reaction as any"
        :target="opAny.target as any"
      />
    </div>

  </article>
</template>

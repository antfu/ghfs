<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Dropdown as VDropdown } from 'floating-vue'
import { useActiveProjectId, useAppState } from '../../composables/useAppState'
import { useDetailScope } from '../../composables/useDetailScope'
import { usePendingOps } from '../../composables/usePendingOps'
import { useRpc } from '../../composables/useRpc'

type MergeMethod = 'squash' | 'merge' | 'rebase'

const props = defineProps<{
  number: number
}>()

const METHOD_LABELS: Record<MergeMethod, string> = {
  squash: 'Squash and merge',
  merge: 'Create a merge commit',
  rebase: 'Rebase and merge',
}
const METHOD_ICONS: Record<MergeMethod, string> = {
  squash: 'i-octicon-git-pull-request-16',
  merge: 'i-octicon-git-merge-16',
  rebase: 'i-octicon-git-branch-16',
}
const METHOD_PRIORITY: MergeMethod[] = ['squash', 'merge', 'rebase']

const activeId = useActiveProjectId()
const scope = useDetailScope()
const projectId = computed(() => scope?.projectId ?? activeId.value)
const state = useAppState(scope?.projectId)
const rpc = useRpc()
const pending = usePendingOps(computed(() => props.number), scope?.projectId)

const selected = computed(() => state.payload.value?.syncState.items[String(props.number)] ?? null)
const item = computed(() => selected.value?.data.item ?? null)
const pullMeta = computed(() => selected.value?.data.pull)
const repoSettings = computed(() => state.payload.value?.repoSettings)

const mergeQueueEnabled = computed(() => repoSettings.value?.mergeQueueEnabled === true)

/**
 * Methods this repo allows. When repoSettings is absent (snapshot not yet
 * written), fall back to all three to avoid blocking the merge button.
 */
const allowedMethods = computed<MergeMethod[]>(() => {
  const r = repoSettings.value
  if (!r)
    return [...METHOD_PRIORITY]
  return METHOD_PRIORITY.filter((m) => {
    if (m === 'squash') return r.allowSquashMerge
    if (m === 'merge') return r.allowMergeCommit
    return r.allowRebaseMerge
  })
})

const defaultMethod = computed<MergeMethod>(() => allowedMethods.value[0] ?? 'squash')

const pendingMerge = computed(() =>
  pending.entries.value.find(e => e.op.action === 'merge' || e.op.action === 'enqueue-merge') ?? null,
)
const pendingMergeMethod = computed<MergeMethod | 'queue'>(() => {
  const op = pendingMerge.value?.op
  if (!op) return 'queue'
  if (op.action === 'enqueue-merge') return 'queue'
  return ((op as { method?: MergeMethod }).method) ?? defaultMethod.value
})

const visible = computed(() => {
  if (!item.value || item.value.kind !== 'pull')
    return false
  if (pullMeta.value?.merged)
    return false
  return item.value.state === 'open'
})

const isDraft = computed(() => pullMeta.value?.isDraft === true)
const mergeable = computed(() => pullMeta.value?.mergeable ?? null)
const mergeableState = computed(() => pullMeta.value?.mergeableState ?? 'unknown')

interface Status {
  icon: string
  iconColor: string
  title: string
  description: string
  canMerge: boolean
}

const status = computed<Status>(() => {
  if (isDraft.value) {
    return {
      icon: 'i-octicon-git-pull-request-16',
      iconColor: 'color-muted',
      title: 'This pull request is still a draft',
      description: 'Mark it as ready for review before merging.',
      canMerge: false,
    }
  }
  if (mergeable.value === false || mergeableState.value === 'dirty') {
    return {
      icon: 'i-octicon-alert-16',
      iconColor: 'color-red-500 dark:color-red-400',
      title: 'Conflicts must be resolved',
      description: 'Resolve the merge conflicts on GitHub before merging.',
      canMerge: false,
    }
  }
  if (mergeableState.value === 'blocked') {
    return {
      icon: 'i-octicon-shield-16',
      iconColor: 'color-yellow-500 dark:color-yellow-400',
      title: 'Merging is blocked',
      description: mergeQueueEnabled.value
        ? 'Queue this PR to merge once required checks pass.'
        : 'Required reviews or status checks must pass first — GitHub may still reject the merge.',
      canMerge: true,
    }
  }
  if (mergeableState.value === 'behind') {
    return {
      icon: 'i-octicon-git-pull-request-16',
      iconColor: 'color-yellow-500 dark:color-yellow-400',
      title: 'This branch is out of date',
      description: 'Update the branch with the latest changes from the base branch.',
      canMerge: true,
    }
  }
  if (mergeableState.value === 'unstable') {
    return {
      icon: 'i-octicon-alert-16',
      iconColor: 'color-yellow-500 dark:color-yellow-400',
      title: 'This branch has not succeeded',
      description: 'Some checks have not succeeded — review before merging.',
      canMerge: true,
    }
  }
  if (mergeable.value === null || mergeableState.value === 'unknown') {
    return {
      icon: 'i-octicon-sync-16',
      iconColor: 'color-muted',
      title: 'Checking if this branch can be merged…',
      description: 'GitHub has not finished computing the merge status yet.',
      canMerge: true,
    }
  }
  return {
    icon: 'i-octicon-check-16',
    iconColor: 'color-green-500 dark:color-green-400',
    title: 'This branch has no conflicts with the base branch',
    description: 'Merging can be performed automatically.',
    canMerge: true,
  }
})

const methodMenuOpen = ref(false)
const selectedMethod = ref<MergeMethod>(defaultMethod.value)

// Keep the selected method valid when repo settings arrive / change.
watch(allowedMethods, (methods) => {
  if (!methods.includes(selectedMethod.value))
    selectedMethod.value = methods[0] ?? 'squash'
}, { immediate: true })

async function queueMerge(method: MergeMethod) {
  methodMenuOpen.value = false
  selectedMethod.value = method
  state.setError(null)
  try {
    await rpc.$call('ghfs:add-queue-op', projectId.value ?? '__default__', {
      action: 'merge',
      number: props.number,
      method,
    })
  }
  catch (error) {
    state.setError((error as Error).message)
  }
}

async function queueEnqueue() {
  state.setError(null)
  try {
    await rpc.$call('ghfs:add-queue-op', projectId.value ?? '__default__', {
      action: 'enqueue-merge',
      number: props.number,
    })
  }
  catch (error) {
    state.setError((error as Error).message)
  }
}

async function cancelPending() {
  if (!pendingMerge.value)
    return
  state.setError(null)
  try {
    await rpc.$call('ghfs:remove-queue-op', projectId.value ?? '__default__', pendingMerge.value.id)
  }
  catch (error) {
    state.setError((error as Error).message)
  }
}

const pendingLabel = computed(() => {
  if (!pendingMerge.value) return ''
  if (pendingMerge.value.op.action === 'enqueue-merge')
    return 'Merge when ready queued'
  return `Merge queued (${pendingMergeMethod.value})`
})
</script>

<template>
  <section v-if="visible" class="px-6 pb-6" data-testid="detail-merge-widget">
    <div class="rounded-lg border border-base bg-base overflow-hidden">
      <div class="flex items-start gap-3 px-4 py-3">
        <span :class="[status.icon, status.iconColor, 'mt-0.5 shrink-0']" />
        <div class="flex-1 min-w-0">
          <div class="font-medium text-sm">
            {{ status.title }}
          </div>
          <p class="text-sm color-muted mt-0.5">
            {{ status.description }}
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2 px-4 py-2.5 border-t border-base bg-#8881 dark:bg-#fff1">
        <template v-if="pendingMerge">
          <span class="i-octicon-hourglass-16 color-yellow-600 dark:color-yellow-400" />
          <span class="text-sm">
            <span class="font-medium">{{ pendingLabel }}</span>
            <span class="color-muted"> — execute to apply</span>
          </span>
          <div class="flex-1" />
          <button
            type="button"
            class="btn-action text-sm"
            @click="cancelPending"
          >
            <span class="i-ph-trash-duotone" />
            Cancel
          </button>
        </template>
        <template v-else-if="mergeQueueEnabled">
          <div class="flex-1" />
          <button
            type="button"
            class="btn-primary text-sm"
            :disabled="!status.canMerge"
            @click="queueEnqueue"
          >
            <span class="i-octicon-git-merge-queue-16" />
            Merge when ready
          </button>
        </template>
        <template v-else-if="allowedMethods.length === 0">
          <div class="flex-1" />
          <span class="text-sm color-muted italic">No merge methods allowed by this repo's settings.</span>
        </template>
        <template v-else>
          <div class="flex-1" />
          <button
            type="button"
            class="btn-primary text-sm"
            :disabled="!status.canMerge"
            @click="queueMerge(selectedMethod)"
          >
            <span :class="METHOD_ICONS[selectedMethod]" />
            {{ METHOD_LABELS[selectedMethod] }}
          </button>
          <VDropdown
            v-if="allowedMethods.length > 1"
            v-model:shown="methodMenuOpen"
            placement="top-end"
            :distance="6"
            :triggers="['click']"
            :auto-hide="true"
          >
            <button
              type="button"
              class="btn-action text-sm"
              aria-label="Choose merge method"
              :disabled="!status.canMerge"
            >
              <span class="i-octicon-triangle-down-16" />
            </button>
            <template #popper>
              <div role="menu" class="min-w-56 p-1 text-sm">
                <button
                  v-for="m in allowedMethods"
                  :key="m"
                  type="button"
                  role="menuitemradio"
                  :aria-checked="selectedMethod === m"
                  class="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-active focus-visible:bg-active outline-none transition"
                  :class="{ 'bg-active': selectedMethod === m }"
                  @click="queueMerge(m)"
                >
                  <span :class="METHOD_ICONS[m]" />
                  <span>{{ METHOD_LABELS[m] }}</span>
                </button>
              </div>
            </template>
          </VDropdown>
        </template>
      </div>
    </div>
  </section>
</template>

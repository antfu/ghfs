<script setup lang="ts">
import type { IssueState, UiItemDetail, UiItemEdits } from '~/types/rpc'

const props = defineProps<{
  item?: UiItemDetail
  submitting?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  queue: [UiItemEdits]
}>()

const title = ref('')
const body = ref('')
const state = ref<IssueState>('open')
const labelsInput = ref('')
const assigneesInput = ref('')
const reviewersInput = ref('')
const milestone = ref('')
const isDraft = ref(false)
const comment = ref('')

const isPull = computed(() => props.item?.kind === 'pull')

watch(
  () => props.item,
  (item) => {
    if (!item)
      return

    title.value = item.title
    body.value = item.body
    state.value = item.state
    labelsInput.value = item.labels.join(', ')
    assigneesInput.value = item.assignees.join(', ')
    reviewersInput.value = (item.requestedReviewers ?? []).join(', ')
    milestone.value = item.milestone ?? ''
    isDraft.value = Boolean(item.isDraft)
    comment.value = ''
  },
  { immediate: true },
)

function queueChanges(): void {
  if (!props.item)
    return

  emit('queue', {
    number: props.item.number,
    title: title.value,
    body: body.value,
    state: state.value,
    labels: parseList(labelsInput.value),
    assignees: parseList(assigneesInput.value),
    milestone: milestone.value.trim() || null,
    reviewers: parseList(reviewersInput.value),
    isDraft: isPull.value ? isDraft.value : undefined,
    comment: comment.value,
  })
}

function parseList(value: string): string[] {
  const unique = new Set<string>()

  for (const token of value.split(/[,\n]/g)) {
    const trimmed = token.trim()
    if (!trimmed)
      continue
    unique.add(trimmed)
  }

  return [...unique]
}
</script>

<template>
  <section class="panel-card h-full min-h-0 p-4 fade-in">
    <div
      v-if="!item"
      class="panel-soft flex h-full min-h-64 items-center justify-center p-6 text-sm text-muted"
    >
      Select an item to inspect and queue edits.
    </div>

    <form
      v-else
      class="grid max-h-[calc(100vh-19rem)] min-h-56 grid-cols-1 gap-3 overflow-y-auto pr-1"
      @submit.prevent="queueChanges"
    >
      <div class="panel-soft p-3">
        <div class="mb-2 flex items-center justify-between gap-2">
          <p class="mono text-xs text-muted">
            #{{ item.number }} · {{ item.kind === 'pull' ? 'PR' : 'Issue' }}
          </p>
          <a
            v-if="item.url"
            :href="item.url"
            target="_blank"
            rel="noreferrer"
            class="mono text-xs text-accent2 hover:underline"
          >
            Open on GitHub
          </a>
        </div>

        <label class="mb-1 block text-xs text-muted">Title</label>
        <input
          v-model="title"
          class="field-base mono"
          :disabled="disabled"
          required
        >
      </div>

      <div class="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div class="panel-soft p-3">
          <label class="mb-1 block text-xs text-muted">State</label>
          <select
            v-model="state"
            class="field-base mono"
            :disabled="disabled"
          >
            <option value="open">
              open
            </option>
            <option value="closed">
              closed
            </option>
          </select>
        </div>

        <div class="panel-soft p-3">
          <label class="mb-1 block text-xs text-muted">Milestone</label>
          <input
            v-model="milestone"
            list="milestones"
            class="field-base mono"
            :disabled="disabled"
            placeholder="Empty to clear"
          >
          <datalist id="milestones">
            <option
              v-for="entry in item.milestonesCatalog"
              :key="entry.number"
              :value="entry.title"
            />
          </datalist>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div class="panel-soft p-3">
          <label class="mb-1 block text-xs text-muted">Labels</label>
          <input
            v-model="labelsInput"
            class="field-base mono"
            :disabled="disabled"
            placeholder="comma-separated"
          >
        </div>

        <div class="panel-soft p-3">
          <label class="mb-1 block text-xs text-muted">Assignees</label>
          <input
            v-model="assigneesInput"
            class="field-base mono"
            :disabled="disabled"
            placeholder="comma-separated"
          >
        </div>
      </div>

      <div
        v-if="isPull"
        class="grid grid-cols-1 gap-3 xl:grid-cols-2"
      >
        <div class="panel-soft p-3">
          <label class="mb-1 block text-xs text-muted">Reviewers</label>
          <input
            v-model="reviewersInput"
            class="field-base mono"
            :disabled="disabled"
            placeholder="comma-separated"
          >
        </div>

        <div class="panel-soft p-3">
          <label class="mb-2 block text-xs text-muted">Draft State</label>
          <label class="inline-flex items-center gap-2 text-sm">
            <input
              v-model="isDraft"
              type="checkbox"
              class="h-4 w-4 rounded border-line bg-panel"
              :disabled="disabled"
            >
            Keep as draft
          </label>
        </div>
      </div>

      <div class="panel-soft p-3">
        <label class="mb-1 block text-xs text-muted">Body</label>
        <textarea
          v-model="body"
          class="field-base mono min-h-34 resize-y leading-relaxed"
          :disabled="disabled"
        />
      </div>

      <div class="panel-soft p-3">
        <label class="mb-1 block text-xs text-muted">Comment (append)</label>
        <textarea
          v-model="comment"
          class="field-base mono min-h-22 resize-y"
          :disabled="disabled"
          placeholder="Optional comment to append"
        />
      </div>

      <div class="flex items-center justify-between gap-3">
        <p class="text-xs text-muted">
          Changes are queued into <span class="mono">execute.yml</span> only.
        </p>
        <button
          type="submit"
          class="btn-primary"
          :disabled="disabled || submitting"
        >
          {{ submitting ? 'Queueing...' : 'Queue Changes' }}
        </button>
      </div>
    </form>
  </section>
</template>

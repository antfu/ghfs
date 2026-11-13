<script setup lang="ts">
import type { ProviderPullChecks } from '../../../src/types/provider'
import { computed } from 'vue'
import DisplayDateBadge from '../display/DateBadge.vue'
import UiBadge from '../ui/Badge.vue'
import UiEmptyState from '../ui/EmptyState.vue'
import UiWithCommand from '../ui/WithCommand.vue'

const props = defineProps<{ checks?: ProviderPullChecks }>()

function presentation(status: string) {
  if (status === 'success')
    return { color: 'green', icon: 'i-octicon-check-circle-fill-16' }
  if (['failure', 'error', 'timed_out', 'action_required', 'startup_failure'].includes(status))
    return { color: 'red', icon: 'i-octicon-x-circle-fill-16' }
  if (['pending', 'queued', 'in_progress', 'waiting', 'requested'].includes(status))
    return { color: 'yellow', icon: 'i-octicon-clock-16' }
  return { color: 'neutral', icon: 'i-octicon-skip-16' }
}

function detailsUrl(value: string | null): string | undefined {
  if (!value)
    return undefined
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined
  }
  catch {
    return undefined
  }
}

const entries = computed(() => [
  ...(props.checks?.checkRuns ?? []).map(run => ({
    key: `check-${run.id}`,
    name: run.name,
    source: 'Check run',
    status: run.status === 'completed' ? run.conclusion ?? 'unknown' : run.status,
    description: null,
    url: detailsUrl(run.detailsUrl),
  })),
  ...(props.checks?.statuses ?? []).map(status => ({
    key: `status-${status.id}`,
    name: status.context,
    source: 'Commit status',
    status: status.state,
    description: status.description,
    url: detailsUrl(status.targetUrl),
  })),
])
</script>

<template>
  <section class="px-6 py-5 min-w-0" aria-label="PR checks" data-testid="pr-checks">
    <UiEmptyState
      v-if="!checks"
      icon="i-octicon-checklist-16"
      title="Checks not synced yet"
      message="Sync this project to fetch CI results for this pull request."
      data-testid="pr-checks-unsynced"
    >
      <template #hint>
        <UiWithCommand command="action.sync" />
      </template>
    </UiEmptyState>
    <template v-else>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2 mb-4 text-xs color-muted">
        <span class="inline-flex items-center gap-1">
          Snapshot fetched
          <DisplayDateBadge :time="checks.fetchedAt" />
        </span>
        <span class="inline-flex items-center gap-1 min-w-0">
          Head
          <code :title="checks.headSha" data-testid="pr-checks-sha">{{ checks.headSha.slice(0, 7) }}</code>
        </span>
        <span>{{ entries.length }} {{ entries.length === 1 ? 'check' : 'checks' }}</span>
      </div>
      <UiEmptyState
        v-if="!entries.length"
        icon="i-octicon-checklist-16"
        title="No checks reported"
        message="GitHub returned no check runs or commit statuses for this commit."
        data-testid="pr-checks-empty"
      />
      <ul v-else class="border border-base rounded-lg divide-y divide-#8882" aria-label="Check results">
        <li v-for="entry in entries" :key="entry.key" class="px-4 py-3 flex flex-wrap items-start gap-3" data-testid="pr-check-row">
          <UiBadge :color="presentation(entry.status).color" :icon="presentation(entry.status).icon" class="shrink-0">
            {{ entry.status.replaceAll('_', ' ') }}
          </UiBadge>
          <div class="flex-1 min-w-0">
            <a
              v-if="entry.url"
              :href="entry.url"
              target="_blank"
              rel="noreferrer"
              class="text-sm font-medium break-words color-active hover:underline rounded outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
              :aria-label="`${entry.name}: open details`"
            >{{ entry.name }} <span class="i-octicon-link-external-16 inline-block align-middle" /></a>
            <p v-else class="text-sm font-medium break-words">{{ entry.name }}</p>
            <p class="text-xs color-muted mt-1 break-words">{{ entry.source }}<template v-if="entry.description"> · {{ entry.description }}</template></p>
          </div>
        </li>
      </ul>
      <p class="mt-4 text-xs color-muted">Results are from the saved snapshot. Sync to refresh them.</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import type { ProviderCommit } from '../../src/types/provider'

interface Props {
  commits?: ProviderCommit[]
}

const props = defineProps<Props>()

const expanded = reactive<Set<string>>(new Set())

function toggle(sha: string) {
  if (expanded.has(sha))
    expanded.delete(sha)
  else
    expanded.add(sha)
}

function firstLine(message: string): string {
  return message.split('\n', 1)[0] ?? ''
}

function rest(message: string): string {
  const nl = message.indexOf('\n')
  if (nl === -1)
    return ''
  return message.slice(nl + 1).trim()
}

async function copy(sha: string) {
  try {
    await navigator.clipboard.writeText(sha)
  }
  catch {}
}
</script>

<template>
  <div class="px-6 py-5">
    <div v-if="!props.commits || props.commits.length === 0" class="rounded-lg border border-base bg-base px-4 py-6 text-sm color-muted text-center">
      No commits synced for this pull request.
    </div>
    <ol v-else class="border border-base rounded-lg bg-base overflow-hidden divide-y divide-[var(--border-base)]">
      <li v-for="commit in props.commits" :key="commit.sha" class="px-4 py-3">
        <div class="flex items-start gap-3">
          <Avatar :login="commit.authorLogin ?? undefined" :size="24" class="mt-0.5" />
          <div class="flex-1 min-w-0">
            <div class="flex items-start gap-2 flex-wrap">
              <button
                v-if="rest(commit.message)"
                type="button"
                class="btn-icon !w-5 !h-5 mt-0.5"
                :aria-label="expanded.has(commit.sha) ? 'Collapse commit body' : 'Expand commit body'"
                @click="toggle(commit.sha)"
              >
                <span :class="expanded.has(commit.sha) ? 'i-octicon-chevron-down-16' : 'i-octicon-chevron-right-16'" class="text-xs" />
              </button>
              <p class="text-sm font-medium flex-1 min-w-0 leading-snug">{{ firstLine(commit.message) }}</p>
            </div>
            <pre v-if="expanded.has(commit.sha) && rest(commit.message)" class="mt-2 text-xs color-muted whitespace-pre-wrap font-sans">{{ rest(commit.message) }}</pre>
            <div class="mt-1 flex items-center gap-2 text-xs color-muted flex-wrap">
              <span v-if="commit.authorLogin">
                <span class="font-mono">@{{ commit.authorLogin }}</span>
              </span>
              <span v-else-if="commit.authorName">{{ commit.authorName }}</span>
              <span class="color-faint">·</span>
              <span>{{ formatRelative(commit.authorDate) }}</span>
            </div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <TooltipButton tooltip="Copy SHA">
              <button
                type="button"
                class="btn-icon !w-7 !h-7"
                :aria-label="`Copy SHA ${commit.sha}`"
                @click="copy(commit.sha)"
              >
                <span class="i-octicon-copy-16 text-xs" />
              </button>
            </TooltipButton>
            <a
              v-if="commit.url"
              :href="commit.url"
              target="_blank"
              rel="noreferrer"
              class="font-mono text-xs color-muted hover:color-active px-2 py-1 rounded bg-subtle"
            >{{ commit.sha.slice(0, 7) }}</a>
            <code v-else class="font-mono text-xs color-muted px-2 py-1 rounded bg-subtle">{{ commit.sha.slice(0, 7) }}</code>
          </div>
        </div>
      </li>
    </ol>
  </div>
</template>

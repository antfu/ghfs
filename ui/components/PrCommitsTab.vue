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
    <EmptyState
      v-if="!props.commits || props.commits.length === 0"
      icon="i-ph-git-commit-duotone"
      message="No commits synced for this pull request."
    />
    <ol v-else class="border border-base rounded-lg bg-base overflow-hidden divide-y divide-#8882">
      <li v-for="commit in props.commits" :key="commit.sha" class="px-4 py-3">
        <div class="flex items-start gap-3">
          <AuthorEntry
            v-if="commit.authorLogin"
            :author="commit.authorLogin"
            :size="24"
            :show-name="false"
            class="mt-0.5"
          />
          <div class="flex-1 min-w-0">
            <div class="flex items-start gap-2 flex-wrap">
              <button
                v-if="rest(commit.message)"
                type="button"
                class="w-5 h-5 mt-0.5 rounded op-fade hover:op100 hover:bg-active flex items-center justify-center transition"
                :aria-label="expanded.has(commit.sha) ? 'Collapse commit body' : 'Expand commit body'"
                @click="toggle(commit.sha)"
              >
                <span :class="expanded.has(commit.sha) ? 'i-ph-caret-down-duotone' : 'i-ph-caret-right-duotone'" class="text-xs" />
              </button>
              <p class="text-sm font-medium flex-1 min-w-0 leading-snug">{{ firstLine(commit.message) }}</p>
            </div>
            <pre v-if="expanded.has(commit.sha) && rest(commit.message)" class="mt-2 text-xs color-muted whitespace-pre-wrap font-sans">{{ rest(commit.message) }}</pre>
            <div class="mt-1 flex items-center gap-2 text-xs color-muted flex-wrap">
              <span v-if="commit.authorLogin" class="font-mono">@{{ commit.authorLogin }}</span>
              <span v-else-if="commit.authorName">{{ commit.authorName }}</span>
              <span class="color-faint">·</span>
              <DateBadge :time="commit.authorDate" mode="day" />
            </div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <IconButton
              icon="i-ph-copy-duotone"
              size="sm"
              tooltip="Copy SHA"
              :aria-label="`Copy SHA ${commit.sha}`"
              @click="copy(commit.sha)"
            />
            <a
              v-if="commit.url"
              :href="commit.url"
              target="_blank"
              rel="noreferrer"
              class="font-mono text-xs color-muted hover:color-active px-2 py-1 rounded bg-#8881"
            >{{ commit.sha.slice(0, 7) }}</a>
            <code v-else class="font-mono text-xs color-muted px-2 py-1 rounded bg-#8881">{{ commit.sha.slice(0, 7) }}</code>
          </div>
        </div>
      </li>
    </ol>
  </div>
</template>

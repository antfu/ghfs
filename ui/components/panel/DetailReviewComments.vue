<script setup lang="ts">
import type { ProviderReviewComment } from '../../../src/types/provider'
import { computed, reactive } from 'vue'
import { renderMarkdown } from '../../composables/useMarkdown'
import DisplayDateBadge from '../display/DateBadge.vue'
import UiAvatar from '../ui/Avatar.vue'

interface Props {
  comments: ProviderReviewComment[]
}

const props = defineProps<Props>()

interface FileGroup {
  path: string
  comments: ProviderReviewComment[]
}

const groups = computed<FileGroup[]>(() => {
  const byPath = new Map<string, ProviderReviewComment[]>()
  const sorted = [...props.comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  for (const c of sorted) {
    const list = byPath.get(c.path) ?? []
    list.push(c)
    byPath.set(c.path, list)
  }
  return [...byPath.entries()].map(([path, comments]) => ({ path, comments }))
})

const collapsedHunks = reactive(new Set<number>())

function toggleHunk(id: number): void {
  if (collapsedHunks.has(id))
    collapsedHunks.delete(id)
  else
    collapsedHunks.add(id)
}

/** Pick a tail of the diff hunk to show — enough context without dominating the card. */
function hunkPreview(diffHunk: string): string {
  if (!diffHunk)
    return ''
  const lines = diffHunk.split('\n')
  return lines.slice(-6).join('\n')
}

/** Format a non-zero reaction count row, GitHub style. Returns null when none. */
const REACTION_EMOJI: Record<string, string> = {
  plusOne: '👍',
  minusOne: '👎',
  laugh: '😄',
  hooray: '🎉',
  confused: '😕',
  heart: '❤️',
  rocket: '🚀',
  eyes: '👀',
}

function reactionEntries(c: ProviderReviewComment): Array<{ emoji: string, count: number }> {
  const r = c.reactions
  if (!r)
    return []
  const out: Array<{ emoji: string, count: number }> = []
  for (const [key, emoji] of Object.entries(REACTION_EMOJI)) {
    const count = (r as unknown as Record<string, number>)[key] ?? 0
    if (count > 0)
      out.push({ emoji, count })
  }
  return out
}
</script>

<template>
  <div class="mt-3 flex flex-col gap-3" data-testid="detail-review-comments">
    <div
      v-for="group in groups"
      :key="group.path"
      class="border border-base rounded-md overflow-hidden"
    >
      <div class="flex items-center gap-2 px-3 py-1.5 bg-#8881 dark:bg-#fff1 border-b border-base">
        <span class="i-octicon-file-16 color-muted text-sm" />
        <code class="font-mono text-xs">{{ group.path }}</code>
      </div>
      <div class="flex flex-col">
        <div
          v-for="(comment, ci) in group.comments"
          :key="comment.id"
          class="px-3 py-2.5"
          :class="ci > 0 ? 'border-t border-base' : ''"
          :data-testid="`review-comment-${comment.id}`"
        >
          <button
            v-if="comment.diffHunk"
            type="button"
            class="block w-full text-left rounded bg-#8881 dark:bg-#fff1 hover:bg-active transition"
            @click="toggleHunk(comment.id)"
          >
            <pre
              class="font-mono text-[11px] leading-snug whitespace-pre overflow-x-auto px-2 py-1.5 m-0"
            ><code>{{ collapsedHunks.has(comment.id) ? '' : hunkPreview(comment.diffHunk) }}</code></pre>
            <div v-if="collapsedHunks.has(comment.id)" class="px-2 py-0.5 text-[11px] color-muted">
              Show diff context
            </div>
          </button>
          <div class="flex items-center gap-2 mt-2">
            <UiAvatar :login="comment.author" :src="comment.authorAvatarUrl" :size="20" />
            <span class="text-xs">
              <span class="font-medium">@{{ comment.author || 'ghost' }}</span>
              <span v-if="comment.line != null" class="color-muted">
                · line {{ comment.startLine != null && comment.startLine !== comment.line ? `${comment.startLine}–${comment.line}` : comment.line }}
              </span>
              <span class="color-muted inline-flex items-center gap-1"> · <DisplayDateBadge :time="comment.createdAt" /></span>
            </span>
          </div>
          <div
            v-if="comment.body"
            class="markdown-body text-sm mt-1.5"
            v-html="renderMarkdown(comment.body)"
          />
          <p v-else class="text-sm color-muted italic mt-1.5">
            Empty comment.
          </p>
          <div
            v-if="reactionEntries(comment).length"
            class="flex items-center gap-1.5 mt-1.5 text-xs color-muted"
          >
            <span
              v-for="r in reactionEntries(comment)"
              :key="r.emoji"
              class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-#8881 dark:bg-#fff1"
            >
              <span>{{ r.emoji }}</span>
              <span class="font-mono tabular-nums">{{ r.count }}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CardRef } from '../../composables/useCardsMode'

const props = withDefaults(defineProps<{
  card: CardRef
  depth: number
  isFront?: boolean
}>(), {
  isFront: false,
})

const { ensureLoaded } = useProjectPayload()
const cards = useCardsMode()
const cardState = computed(() => useAppState(props.card.projectId))
const payloadReady = computed(() => Boolean(cardState.value.payload.value))

/** Show the repo line when the pile spans multiple projects (no single source repo). */
const showRepo = computed(() => !cards.source.value.project)

/**
 * Always pre-load this card's project, even when it's still a peek card.
 * `ensureLoaded` short-circuits once a project is loaded, so it's cheap to
 * call on every peek and avoids a "Loading…" flash when the card slides
 * forward to the front. Without this, a peek card kept its initial component
 * instance after transitioning to `isFront`, and never triggered a load.
 */
onMounted(() => {
  ensureLoaded(props.card.projectId)
})

watch(() => props.card.projectId, (next) => {
  ensureLoaded(next)
})
</script>

<template>
  <div class="card-face">
    <!-- Front card: full detail view in compact mode -->
    <template v-if="isFront">
      <div v-if="payloadReady" class="h-full overflow-hidden rounded-2xl border border-base bg-base">
        <PanelDetail
          :project-id="card.projectId"
          :number="card.number"
          :show-repo="showRepo"
          compact
        />
      </div>
      <div v-else class="h-full flex flex-col items-center justify-center rounded-2xl border border-base bg-base color-muted gap-3">
        <span class="i-octicon-sync-16 animate-spin text-2xl color-active" />
        <p class="text-sm">Loading {{ card.repo }}#{{ card.number }}…</p>
      </div>
    </template>

    <!-- Peek card: just a styled title preview behind the front card -->
    <div
      v-else
      class="h-full rounded-2xl border border-base bg-base px-6 py-4 flex flex-col gap-2"
      aria-hidden="true"
    >
      <div class="flex items-center gap-2 text-xs color-muted">
        <span :class="card.kind === 'pull' ? 'i-octicon-git-pull-request-16' : 'i-octicon-issue-opened-16'" />
        <span class="font-mono">{{ card.repo }} · #{{ card.number }}</span>
      </div>
      <p class="font-medium text-base color-base line-clamp-2">{{ card.title }}</p>
    </div>
  </div>
</template>

<style scoped>
.card-face {
  height: 100%;
  width: 100%;
}
</style>

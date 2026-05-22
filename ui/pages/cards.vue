<script setup lang="ts">
const router = useRouter()
const cards = useCardsMode()
const ui = useUiState()
const hub = useHubState()
const hubUi = useHubUiState()
const state = useAppState()
const isDark = useDark()
const { upCount } = useQueue()
const { totalCount: hubQueueTotal } = useHubQueue()

const isHubMode = computed(() => hub.capabilities.value?.mode === 'hub')
const queueBadge = computed(() => (isHubMode.value ? hubQueueTotal.value : upCount.value))

const currentCard = cards.currentCard
const total = cards.total
const progressIndex = computed(() => Math.min(cards.index.value + 1, total.value))
const advancing = cards.advancing
const showDone = computed(() => total.value > 0 && cards.done.value)
const hasMoreItems = computed(() => total.value > 0)

const source = cards.source
const sourceLabel = computed(() => source.value.label)
const sourceProject = computed(() => source.value.project ?? null)

onMounted(() => {
  if (total.value === 0) {
    // No pile loaded — drop back to the hub home.
    router.replace('/')
  }
})

// When the label editor (re-used from PanelDetail) closes after we opened it
// from a card action, advance to the next card.
watch(() => ui.labelEditorOpen.value, async (next, prev) => {
  if (prev && !next && cards.labelsPendingFor.value) {
    cards.labelsPendingFor.value = null
    await cards.advance()
  }
})

function exit() {
  cards.reset()
  router.push('/')
}
</script>

<template>
  <div class="cards-page h-screen w-full flex flex-col bg-secondary">
    <header class="flex items-center gap-3 px-5 py-3 border-b border-base bg-base">
      <UiWithCommand v-slot="{ execute }" command="cards.exit">
        <button
          type="button"
          class="btn-action-sm"
          title="Exit cards mode"
          data-testid="cards-exit"
          @click="execute"
        >
          <span class="i-ph-arrow-left-duotone" />
          Exit
        </button>
      </UiWithCommand>

      <div class="h-6 border-l border-base mx-1 flex-none" />

      <div class="flex items-center gap-2 text-sm" data-testid="cards-source-title">
        <span class="i-ph-cards-three-duotone color-active" />
        <DisplayProjectIcon
          v-if="sourceProject"
          :project="sourceProject"
          :size="18"
        />
        <span class="font-medium">{{ sourceProject ? sourceProject.repo : sourceLabel }}</span>
        <span v-if="sourceProject" class="color-muted">· {{ sourceLabel }}</span>
      </div>

      <div class="flex-1" />

      <div v-if="!showDone && currentCard" class="flex items-center gap-2 text-sm color-muted">
        <span class="font-mono tabular-nums">{{ progressIndex }} / {{ total }}</span>
      </div>

      <div class="h-6 border-l border-base mx-1 flex-none" />

      <UiWithCommand v-slot="{ execute, disabled }" command="action.queue" placement="badge">
        <UiIconButton
          :icon="isHubMode ? 'i-ph-list-checks-duotone' : 'i-octicon-list-unordered-16'"
          tooltip="Queue"
          :active="isHubMode ? hubUi.queueDrawerOpen.value : state.queueOpen.value"
          data-testid="cards-queue-toggle"
          :disabled="disabled"
          @click="execute"
        >
          <template #badge>
            <span
              v-if="queueBadge > 0"
              class="absolute -top-1 -right-1 badge-color-green !px-1 !py-0 font-mono tabular-nums text-[10px] leading-none min-w-4 h-4 justify-center"
            >{{ queueBadge }}</span>
          </template>
        </UiIconButton>
      </UiWithCommand>

      <UiWithCommand v-slot="{ execute, disabled }" command="settings.open" placement="badge">
        <UiIconButton
          icon="i-ph-gear-six-duotone"
          tooltip="Settings"
          data-testid="cards-settings"
          :disabled="disabled"
          @click="execute"
        />
      </UiWithCommand>

      <UiWithCommand v-slot="{ execute }" command="action.theme" placement="badge">
        <UiIconButton
          :icon="isDark ? 'i-ph-sun-duotone' : 'i-ph-moon-duotone'"
          :tooltip="isDark ? 'Light mode' : 'Dark mode'"
          @click="execute"
        />
      </UiWithCommand>
    </header>

    <main class="flex-1 relative overflow-hidden">
      <!-- While `advancing` is true the last card may still be sliding off,
           so we keep the stack mounted even when showDone has flipped on. -->
      <template v-if="showDone && !advancing">
        <CardsDone
          :pile-size="total"
          :processed-ops="cards.processedOps.value"
          :has-more-items="hasMoreItems"
          @another="cards.anotherPile"
          @done="exit"
        />
      </template>

      <template v-else-if="currentCard || advancing">
        <CardsActions :busy="advancing">
          <CardsStack
            :pile="cards.pile.value"
            :index="cards.index.value"
          />
        </CardsActions>
      </template>

      <template v-else>
        <div class="h-full flex flex-col items-center justify-center gap-3 color-muted">
          <span class="i-ph-cards-duotone text-4xl" />
          <p>No cards to triage. Pick a list and start.</p>
          <button type="button" class="btn-action text-sm" @click="exit">
            <span class="i-ph-arrow-left-duotone" />
            Back
          </button>
        </div>
      </template>
    </main>

    <CardsCommentDialog
      v-if="currentCard"
      v-model:open="cards.commentDialogOpen.value"
      :item-number="currentCard.number"
      :kind="currentCard.kind"
      :can-close="cards.currentCanClose.value"
      @submit="(body: string, options: { close: boolean }) => cards.submitComment(body, options)"
    />
  </div>
</template>

<style scoped>
/* Subtle dot grid so the empty space around the card has some texture. */
.cards-page {
  background-image: radial-gradient(circle, rgb(140 140 140 / 0.14) 1px, transparent 1px);
  background-size: 22px 22px;
  background-position: 0 0;
}

.dark .cards-page {
  background-image: radial-gradient(circle, rgb(220 220 220 / 0.08) 1px, transparent 1px);
}
</style>

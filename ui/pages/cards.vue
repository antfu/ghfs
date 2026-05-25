<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from '#imports'
import { useDark } from '@vueuse/core'
import CardsActions from '../components/cards/Actions.vue'
import CardsCommentDialog from '../components/cards/CommentDialog.vue'
import CardsDone from '../components/cards/Done.vue'
import CardsStack from '../components/cards/Stack.vue'
import DisplayProjectIcon from '../components/display/ProjectIcon.vue'
import UiIconButton from '../components/ui/IconButton.vue'
import UiWithCommand from '../components/ui/WithCommand.vue'
import { useAppState } from '../composables/useAppState'
import { useCardsMode } from '../composables/useCardsMode'
import { useCurrentUser } from '../composables/useCurrentUser'
import { useHubQueue } from '../composables/useHubQueue'
import { useHubRecent } from '../composables/useHubRecent'
import { useHubState } from '../composables/useHubState'
import { useHubTodos } from '../composables/useHubTodos'
import { useHubUiState } from '../composables/useHubUiState'
import { useProjectPayload } from '../composables/useProjectPayload'
import { useQueue } from '../composables/useQueue'
import { useRecentFiltered } from '../composables/useRecentFiltered'
import { useUiState } from '../composables/useUiState'
import type { ListItem } from '../types/list-item'
import { fromSyncItem } from '../types/list-item'

const router = useRouter()
const cards = useCardsMode()
const ui = useUiState()
const hub = useHubState()
const hubUi = useHubUiState()
const state = useAppState()
const isDark = useDark()
const { upCount } = useQueue()
const { totalCount: hubQueueTotal } = useHubQueue()
const { currentUser } = useCurrentUser()
const { ensureLoaded } = useProjectPayload()

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
const userLogin = computed(() => currentUser.value?.login ?? null)

// Sub-label reflects the active kind filter; we hide it when the pile
// includes both kinds since the implicit "everything" needs no qualifier.
const kindSublabel = computed(() => {
  switch (cards.options.value.kind) {
    case 'issue': return 'Issues'
    case 'pull': return 'Pull requests'
    default: return ''
  }
})

const hydrating = ref(true)

onMounted(async () => {
  // Pull any persisted pile state from the server (survives client refresh).
  // When no pile exists the page renders an empty state with a "Create a
  // new pile" affordance instead of redirecting elsewhere.
  await cards.hydrate()
  hydrating.value = false
})

async function createNewPile() {
  const hubRecent = useHubRecent()
  if (hubRecent.items.value.length === 0)
    await hubRecent.load()
  const items = useRecentFiltered().filteredItems.value
  cards.openStartDialog(items, { label: 'Recent' })
}

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

async function onCommentSubmitted(opId: string | null) {
  const card = cards.currentCard.value
  if (card && opId)
    cards.recordOp(card.projectId, opId)
  await cards.advance()
}

/**
 * Re-fetch the source items for the saved pile descriptor. Used by Restart
 * and "Another pile" — neither persists the source snapshot, so we re-pick
 * from the freshest local state.
 */
async function resolveSourceItems(): Promise<ListItem[]> {
  const src = cards.source.value
  if (!src.project && src.label === 'Recent') {
    const hubRecent = useHubRecent()
    if (hubRecent.items.value.length === 0)
      await hubRecent.load()
    return useRecentFiltered().filteredItems.value
  }
  if (!src.project && src.label === 'Todo') {
    const todos = useHubTodos()
    if (todos.items.value.length === 0)
      await todos.load()
    return todos.listItems.value
  }
  if (src.project) {
    await ensureLoaded(src.project.id)
    const payload = useAppState(src.project.id).payload.value
    if (!payload)
      return []
    // Hand both kinds back — the pile's kind option does the actual filtering.
    return Object.values(payload.syncState.items)
      .filter(s => s.data.item.state === 'open' && !ui.isIgnored(s.data.item.number))
      .map(s => fromSyncItem(s, src.project!.id, payload.repo.repo))
  }
  return []
}

async function doAnotherPile() {
  const items = await resolveSourceItems()
  cards.anotherPile(items, userLogin.value)
}

async function doRestart() {
  const items = await resolveSourceItems()
  cards.restartPile(items, userLogin.value)
}

async function doDismiss() {
  await cards.dismiss()
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
          title="Exit card pile"
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
        <span v-if="kindSublabel" class="color-muted">· {{ kindSublabel }}</span>
      </div>

      <div class="flex-1" />

      <div v-if="!showDone && currentCard" class="flex items-center gap-2 text-sm color-muted">
        <span class="font-mono tabular-nums">{{ progressIndex }} / {{ total }}</span>
      </div>

      <UiWithCommand v-if="!showDone" v-slot="{ execute, disabled }" command="cards.previous">
        <button
          type="button"
          class="btn-action-sm"
          title="Previous card"
          data-testid="cards-previous"
          :disabled="disabled"
          @click="execute"
        >
          <span class="i-ph-skip-back-duotone" />
          Previous
        </button>
      </UiWithCommand>

      <button
        v-if="total > 0"
        type="button"
        class="btn-action-sm"
        title="Re-generate the pile with the same options"
        data-testid="cards-restart"
        @click="doRestart"
      >
        <span class="i-ph-arrow-clockwise-duotone" />
        Restart pile
      </button>

      <UiWithCommand v-if="total > 0" v-slot="{ execute, disabled }" command="cards.dismiss">
        <button
          type="button"
          class="btn-action-sm"
          title="Discard this pile"
          data-testid="cards-dismiss"
          :disabled="disabled"
          @click="execute"
        >
          <span class="i-ph-trash-duotone" />
          Discard pile
        </button>
      </UiWithCommand>

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
      <template v-if="hydrating">
        <div class="h-full flex flex-col items-center justify-center gap-3 color-muted">
          <span class="i-octicon-sync-16 animate-spin text-2xl color-active" />
          <p class="text-sm">Loading pile…</p>
        </div>
      </template>

      <!-- While `advancing` is true the last card may still be sliding off,
           so we keep the stack mounted even when showDone has flipped on. -->
      <template v-else-if="showDone && !advancing">
        <CardsDone
          :pile-size="total"
          :processed-ops="cards.processedOps.value"
          :has-more-items="hasMoreItems"
          @another="doAnotherPile"
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
          <p>No card pile loaded.</p>
          <button
            type="button"
            class="btn-action text-sm"
            data-testid="cards-empty-create"
            @click="createNewPile"
          >
            <span class="i-ph-cards-three-duotone" />
            Create a new pile
          </button>
        </div>
      </template>
    </main>

    <CardsCommentDialog
      v-if="currentCard"
      v-model:open="cards.commentDialogOpen.value"
      :project-id="currentCard.projectId"
      :item-number="currentCard.number"
      :kind="currentCard.kind"
      @submitted="onCommentSubmitted"
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

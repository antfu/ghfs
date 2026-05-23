<script setup lang="ts">
import {
  DEFAULT_PILE_OPTIONS,
  filterCandidates,
  PILE_KIND_CHOICES,
  PILE_PICK_CHOICES,
  PILE_SIZE_CHOICES,
} from '../../composables/useCardsMode'

const cards = useCardsMode()
const seenHistory = useSeenHistory()
const { currentUser } = useCurrentUser()

const open = computed({
  get: () => cards.startDialogOpen.value,
  set: v => (cards.startDialogOpen.value = v),
})

const localOptions = ref({ ...DEFAULT_PILE_OPTIONS })

// Each time the dialog opens, seed the form from (in priority order):
// 1. The initial-options override the caller passed (e.g. kind from the
//    active project tab),
// 2. The pile's saved options if there's a pile in flight,
// 3. The defaults.
watch(open, (next) => {
  if (next) {
    const base = cards.total.value > 0
      ? { ...cards.options.value }
      : { ...DEFAULT_PILE_OPTIONS }
    const overrides = cards.pendingInitialOptions.value ?? {}
    localOptions.value = { ...base, ...overrides }
  }
})

const sourceItems = computed(() => cards.pendingSourceItems.value ?? [])
const source = computed(() => cards.pendingSource.value)
const userLogin = computed(() => currentUser.value?.login ?? null)

const candidates = computed(() =>
  filterCandidates(sourceItems.value, localOptions.value, userLogin.value, seenHistory.getSeenEntry),
)
const candidateCount = computed(() => candidates.value.length)
const willPick = computed(() => Math.min(localOptions.value.size, candidateCount.value))

const totalAvailable = computed(() => sourceItems.value.length)
const counts = computed(() => {
  const items = sourceItems.value
  let issues = 0
  let pulls = 0
  for (const it of items) {
    if (it.state !== 'open') continue
    if (it.kind === 'issue') issues++
    else pulls++
  }
  return { issues, pulls, total: items.filter(i => i.state === 'open').length }
})

function onStart() {
  cards.start(sourceItems.value, source.value, localOptions.value, userLogin.value)
}

function onCancel() {
  open.value = false
}
</script>

<template>
  <UiModal
    v-model:open="open"
    title="Start a card pile"
    icon="i-ph-cards-three-duotone"
    width="w-[min(92vw,36rem)]"
  >
    <div class="px-5 py-4 flex flex-col gap-4">
      <!-- Source info -->
      <div class="flex items-center gap-2 text-sm" data-testid="cards-start-source">
        <DisplayProjectIcon
          v-if="source.project"
          :project="source.project"
          :size="18"
        />
        <span v-else class="i-ph-stack-duotone color-active" />
        <span class="font-medium">{{ source.project ? source.project.repo : source.label }}</span>
        <span v-if="source.project" class="color-muted">· {{ source.label }}</span>
        <span class="flex-1" />
        <span class="text-xs color-muted font-mono tabular-nums">
          {{ counts.total }} open ({{ counts.issues }} issue{{ counts.issues === 1 ? '' : 's' }}, {{ counts.pulls }} PR{{ counts.pulls === 1 ? '' : 's' }})
        </span>
      </div>

      <!-- Pile size -->
      <div class="flex flex-col gap-1.5">
        <span class="text-xs color-muted uppercase tracking-wide">Pile size</span>
        <div class="flex gap-1">
          <button
            v-for="n in PILE_SIZE_CHOICES"
            :key="n"
            type="button"
            class="px-3 py-1 rounded text-sm border transition"
            :class="localOptions.size === n
              ? 'border-primary-500/40 bg-primary-500/12 color-active'
              : 'border-base color-muted hover:color-base hover:bg-active'"
            @click="localOptions.size = n"
          >
            {{ n }}
          </button>
        </div>
      </div>

      <!-- Kind filter -->
      <div class="flex flex-col gap-1.5">
        <span class="text-xs color-muted uppercase tracking-wide">Include</span>
        <div class="flex gap-1 flex-wrap">
          <button
            v-for="k in PILE_KIND_CHOICES"
            :key="k.value"
            type="button"
            class="px-3 py-1 rounded text-sm border transition"
            :class="localOptions.kind === k.value
              ? 'border-primary-500/40 bg-primary-500/12 color-active'
              : 'border-base color-muted hover:color-base hover:bg-active'"
            @click="localOptions.kind = k.value"
          >
            {{ k.label }}
          </button>
        </div>
      </div>

      <!-- Pick strategy -->
      <div class="flex flex-col gap-1.5">
        <span class="text-xs color-muted uppercase tracking-wide">Pick</span>
        <div class="flex gap-1 flex-wrap">
          <button
            v-for="p in PILE_PICK_CHOICES"
            :key="p.value"
            type="button"
            class="px-3 py-1 rounded text-sm border transition flex flex-col items-start"
            :class="localOptions.pick === p.value
              ? 'border-primary-500/40 bg-primary-500/12 color-active'
              : 'border-base color-muted hover:color-base hover:bg-active'"
            @click="localOptions.pick = p.value"
          >
            <span>{{ p.label }}</span>
            <span class="text-[10px] color-faint">{{ p.hint }}</span>
          </button>
        </div>
      </div>

      <!-- Filters -->
      <div class="flex flex-col gap-2 text-sm">
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            v-model="localOptions.excludeBots"
            type="checkbox"
            class="accent-primary-500"
          >
          <span>Exclude items created by bots</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            v-model="localOptions.excludeSelfInteracted"
            type="checkbox"
            class="accent-primary-500"
          >
          <span>
            Hide items waiting for someone else to reply
            <span v-if="userLogin" class="color-muted">(I'm <span class="font-mono">@{{ userLogin }}</span>)</span>
          </span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            v-model="localOptions.excludeSeen"
            type="checkbox"
            class="accent-primary-500"
            data-testid="cards-start-exclude-seen"
          >
          <span>
            Exclude seen cards
            <span class="color-muted">(re-appear once they change)</span>
          </span>
        </label>
      </div>

      <!-- Candidates count -->
      <div
        class="text-xs px-3 py-2 rounded border border-base bg-secondary flex items-center gap-2"
        :class="candidateCount === 0 ? 'color-muted' : ''"
        data-testid="cards-start-candidates"
      >
        <span :class="candidateCount === 0 ? 'i-ph-warning-duotone' : 'i-ph-funnel-duotone color-active'" />
        <span>
          <strong>{{ candidateCount }}</strong> candidate{{ candidateCount === 1 ? '' : 's' }}
          <span class="color-muted">of {{ totalAvailable }} total</span>
        </span>
        <span class="flex-1" />
        <span class="color-muted">Will pick <strong>{{ willPick }}</strong></span>
      </div>
    </div>

    <template #footer>
      <button type="button" class="btn-action text-sm" @click="onCancel">
        Cancel
      </button>
      <button
        type="button"
        class="btn-primary text-sm"
        :disabled="candidateCount === 0"
        data-testid="cards-start-confirm"
        @click="onStart"
      >
        <span class="i-ph-cards-three-duotone" />
        Start card pile
      </button>
    </template>
  </UiModal>
</template>

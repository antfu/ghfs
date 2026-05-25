<script setup lang="ts">
import type { QueuedOp } from '../../composables/useCardsMode'

const props = defineProps<{
  pileSize: number
  processedOps: QueuedOp[]
  hasMoreItems: boolean
}>()

const emit = defineEmits<{
  another: []
  done: []
}>()

const rpc = useRpc()
const { offline } = useOnlineState()
const executing = ref(false)
const executeError = ref<string | null>(null)
const executed = ref(false)

const opsCount = computed(() => props.processedOps.length)

async function fireConfetti() {
  const mod = await import('canvas-confetti')
  const confetti = mod.default
  const fire = (delay = 0) => {
    setTimeout(() => {
      confetti({
        particleCount: 120,
        spread: 70,
        startVelocity: 38,
        origin: { x: 0.5, y: 0.55 },
        scalar: 0.9,
        ticks: 220,
      })
    }, delay)
  }
  fire(0)
  fire(280)
  fire(560)
}

onMounted(() => {
  void fireConfetti()
})

async function executeNow() {
  if (executing.value || opsCount.value === 0)
    return
  if (offline.value)
    return
  executing.value = true
  executeError.value = null

  // Group ops by projectId so each project gets one execute-queue call with its own ids.
  const byProject = new Map<string, string[]>()
  for (const op of props.processedOps) {
    const list = byProject.get(op.projectId) ?? []
    list.push(op.opId)
    byProject.set(op.projectId, list)
  }

  try {
    for (const [projectId, ids] of byProject) {
      await rpc.$call('ghfs:execute-queue', projectId, {
        entryIds: ids,
        continueOnError: true,
      })
    }
    executed.value = true
  }
  catch (error) {
    executeError.value = (error as Error).message
  }
  finally {
    executing.value = false
  }
}
</script>

<template>
  <div class="h-full flex flex-col items-center justify-center gap-6 px-6">
    <div class="text-center flex flex-col items-center gap-3">
      <span class="i-ph-trophy-duotone text-6xl color-active" />
      <h2 class="text-2xl font-medium">All done!</h2>
      <p class="color-muted">
        You finished a pile of {{ pileSize }} card{{ pileSize === 1 ? '' : 's' }}.
        <span v-if="opsCount > 0">
          {{ opsCount }} change{{ opsCount === 1 ? '' : 's' }} queued.
        </span>
        <span v-else>
          No changes queued.
        </span>
      </p>
    </div>

    <div v-if="executeError" class="text-sm text-red-500 dark:text-red-400">
      {{ executeError }}
    </div>

    <div v-if="executed" class="text-sm color-active flex items-center gap-2">
      <span class="i-octicon-check-circle-16" />
      Queue executed.
    </div>

    <div class="flex items-center gap-3">
      <button
        v-if="opsCount > 0 && !executed"
        type="button"
        class="btn-primary text-sm"
        :disabled="executing || offline"
        :title="offline ? 'Offline — execute paused' : undefined"
        data-testid="card-done-execute"
        @click="executeNow"
      >
        <span :class="executing ? 'i-octicon-sync-16 animate-spin' : 'i-ph-play-duotone'" />
        <span v-if="executing">Executing…</span>
        <span v-else>Execute now ({{ opsCount }})</span>
      </button>
      <button
        v-if="hasMoreItems"
        type="button"
        class="btn-action text-sm"
        data-testid="card-done-another"
        @click="emit('another')"
      >
        <span class="i-ph-shuffle-duotone" />
        Another pile
      </button>
      <button
        type="button"
        class="btn-action text-sm"
        data-testid="card-done-finish"
        @click="emit('done')"
      >
        <span class="i-ph-house-duotone" />
        Done
      </button>
    </div>
  </div>
</template>

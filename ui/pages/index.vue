<script setup lang="ts">
import type { UiItemEdits } from '~/types/rpc'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'

const rpc = useGhfsRpc()
const { formatAbsolute, formatRelative } = usePrettyTime()

const activeTab = ref<'items' | 'queue'>('items')
const itemFilter = ref('')
const selectedNumber = ref<number>()
const queueing = ref(false)
const infoMessage = ref('')

const bootstrap = computed(() => rpc.bootstrap.value)
const selectedItem = computed(() => rpc.selectedItem.value)
const isBusy = computed(() => queueing.value || rpc.executing.value)
const queueCount = computed(() => bootstrap.value?.queueSummary.total ?? 0)

watch(
  () => bootstrap.value?.items,
  (items) => {
    if (!items || items.length === 0) {
      selectedNumber.value = undefined
      return
    }

    if (selectedNumber.value && items.some(item => item.number === selectedNumber.value))
      return

    selectedNumber.value = items[0].number
  },
  { immediate: true },
)

watch(
  selectedNumber,
  async (number) => {
    if (!number)
      return
    if (selectedItem.value?.number === number)
      return

    await rpc.loadItem(number).catch(() => {})
  },
  { immediate: true },
)

onMounted(async () => {
  if (!bootstrap.value)
    await rpc.refresh().catch(() => {})
})

async function queueEdits(payload: UiItemEdits): Promise<void> {
  queueing.value = true
  infoMessage.value = ''
  try {
    await rpc.queueItemEdits(payload)
    infoMessage.value = `Queued updates for #${payload.number}`
    activeTab.value = 'queue'
  }
  finally {
    queueing.value = false
  }
}

async function refreshState(): Promise<void> {
  infoMessage.value = ''
  await rpc.refresh()
  infoMessage.value = 'State refreshed'
}

async function removeQueueEntry(index: number): Promise<void> {
  infoMessage.value = ''
  await rpc.removeQueueYmlEntry(index)
  infoMessage.value = 'Removed queue entry from execute.yml'
}

async function executeNow(): Promise<void> {
  infoMessage.value = ''
  await rpc.executeNow()
  infoMessage.value = 'Execution completed'
}

function focusItem(number: number): void {
  selectedNumber.value = number
  activeTab.value = 'items'
}
</script>

<template>
  <main class="min-h-screen p-4 md:p-6">
    <section class="panel-card mb-4 p-4 fade-in">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="mono mb-1 text-xs text-muted">
            ghfs web ui
          </p>
          <h1 class="text-lg font-700 md:text-xl">
            {{ bootstrap?.repo || 'Repository not resolved' }}
          </h1>
          <p class="mono mt-1 text-xs text-muted">
            synced {{ formatRelative(bootstrap?.syncedAt) }}
            · {{ formatAbsolute(bootstrap?.syncedAt) }}
          </p>
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            class="btn-ghost"
            :disabled="isBusy"
            @click="refreshState"
          >
            Refresh
          </button>
          <button
            type="button"
            class="btn-primary"
            :disabled="queueCount === 0 || isBusy"
            @click="executeNow"
          >
            {{ rpc.executing.value ? 'Executing...' : `Execute Now (${queueCount})` }}
          </button>
        </div>
      </div>

      <div class="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <div class="panel-soft p-2">
          <p class="mono text-[11px] text-muted">
            tracked
          </p>
          <p class="text-lg font-700">
            {{ bootstrap?.totalTracked ?? 0 }}
          </p>
        </div>
        <div class="panel-soft p-2">
          <p class="mono text-[11px] text-muted">
            open
          </p>
          <p class="text-lg font-700">
            {{ bootstrap?.openCount ?? 0 }}
          </p>
        </div>
        <div class="panel-soft p-2">
          <p class="mono text-[11px] text-muted">
            closed
          </p>
          <p class="text-lg font-700">
            {{ bootstrap?.closedCount ?? 0 }}
          </p>
        </div>
        <div class="panel-soft p-2">
          <p class="mono text-[11px] text-muted">
            connection
          </p>
          <p class="mono text-sm font-700" :class="rpc.status.value === 'connected' ? 'text-accent' : 'text-warning'">
            {{ rpc.status.value }}
          </p>
        </div>
      </div>

      <div
        v-if="bootstrap?.warnings.length"
        class="mt-3 space-y-1 rounded-2 border border-warning/45 bg-warning/10 px-3 py-2 text-sm text-warning"
      >
        <p
          v-for="warning in bootstrap.warnings"
          :key="warning"
        >
          {{ warning }}
        </p>
      </div>

      <p
        v-if="infoMessage"
        class="mt-3 text-sm text-accent"
      >
        {{ infoMessage }}
      </p>
      <p
        v-if="rpc.operationError.value"
        class="mt-1 text-sm text-danger"
      >
        {{ rpc.operationError.value }}
      </p>
    </section>

    <TabsRoot
      v-model="activeTab"
      class="fade-in"
    >
      <TabsList class="panel-card mb-4 inline-flex gap-1 p-1">
        <TabsTrigger
          value="items"
          class="btn-base data-[state=active]:bg-accent data-[state=active]:text-#06210F"
        >
          Items
        </TabsTrigger>
        <TabsTrigger
          value="queue"
          class="btn-base data-[state=active]:bg-accent data-[state=active]:text-#06210F"
        >
          Queue
        </TabsTrigger>
      </TabsList>

      <TabsContent value="items">
        <section class="grid grid-cols-1 gap-4 xl:grid-cols-[370px_minmax(0,1fr)]">
          <IssueListPane
            v-model:filter="itemFilter"
            :items="bootstrap?.items ?? []"
            :selected-number="selectedNumber"
            :loading="rpc.status.value === 'connecting'"
            @select="focusItem"
          />

          <ItemEditorPane
            :item="selectedItem"
            :submitting="queueing"
            :disabled="isBusy"
            @queue="queueEdits"
          />
        </section>
      </TabsContent>

      <TabsContent value="queue">
        <QueuePane
          :bootstrap="bootstrap"
          :executing="rpc.executing.value"
          @refresh="refreshState"
          @execute-now="executeNow"
          @remove="removeQueueEntry"
          @select-item="focusItem"
        />
      </TabsContent>
    </TabsRoot>

    <section
      v-if="rpc.executeProgress.value || rpc.lastExecution.value"
      class="panel-card mt-4 p-3 text-sm fade-in"
    >
      <p class="mono text-xs text-muted">
        execute monitor
      </p>

      <p
        v-if="rpc.executeProgress.value?.type === 'start'"
        class="mt-1"
      >
        Started {{ rpc.executeProgress.value.planned }} operations on {{ rpc.executeProgress.value.repo }}
      </p>

      <p
        v-if="rpc.executeProgress.value?.type === 'progress'"
        class="mt-1"
      >
        {{ rpc.executeProgress.value.completed }}/{{ rpc.executeProgress.value.planned }}
        · applied {{ rpc.executeProgress.value.applied }}
        · failed {{ rpc.executeProgress.value.failed }}
      </p>

      <p
        v-if="rpc.executeProgress.value?.type === 'error'"
        class="mt-1 text-danger"
      >
        {{ rpc.executeProgress.value.message }}
      </p>

      <p
        v-if="rpc.lastExecution.value"
        class="mt-1 text-muted"
      >
        Last run {{ formatRelative(rpc.lastExecution.value.createdAt) }}
        · applied {{ rpc.lastExecution.value.applied }}
        / planned {{ rpc.lastExecution.value.planned }}
      </p>
    </section>
  </main>
</template>

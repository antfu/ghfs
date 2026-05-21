<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const rpc = useRpc()
const hub = useHubState()

const ready = ref(false)
const fatalError = ref<string | null>(null)

const initialNumber = computed(() => {
  const raw = route.params.number
  const n = Array.isArray(raw) ? raw[0] : raw
  const parsed = Number.parseInt(n ?? '', 10)
  return Number.isFinite(parsed) ? parsed : null
})

onMounted(async () => {
  try {
    const caps = await rpc.capabilities()
    hub.setCapabilities(caps)
    if (caps.mode === 'hub') {
      await router.replace('/hub')
      return
    }
    ready.value = true
  }
  catch (error) {
    fatalError.value = (error as Error).message
  }
})

const projectId = computed(() => hub.projects.value[0]?.id ?? '')
</script>

<template>
  <div v-if="fatalError" class="flex flex-col items-center justify-center h-full color-muted">
    <p class="text-sm">{{ fatalError }}</p>
  </div>
  <div v-else-if="!ready" class="flex flex-col items-center justify-center h-full color-muted">
    <span class="i-octicon-sync-16 animate-spin text-2xl mb-3 color-active" />
    <p class="text-sm">Connecting…</p>
  </div>
  <ProjectView v-else-if="projectId" :project-id="projectId" :initial-number="initialNumber" />
  <div v-else class="flex flex-col items-center justify-center h-full color-muted">
    <p class="text-sm">No project configured.</p>
  </div>
</template>

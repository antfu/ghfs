<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const hub = useHubState()

const projectId = computed(() => String(route.params.projectId ?? ''))
const initialNumber = computed(() => {
  const raw = route.params.number
  const n = Array.isArray(raw) ? raw[0] : raw
  const parsed = Number.parseInt(n ?? '', 10)
  return Number.isFinite(parsed) ? parsed : null
})

const exists = computed(() => hub.projects.value.some(p => p.id === projectId.value))

function backToHub() {
  router.push('/hub')
}
</script>

<template>
  <div class="h-full flex flex-col">
    <div v-if="!exists" class="flex flex-col items-center justify-center flex-1 color-muted">
      <p class="text-sm mb-3">Project not found.</p>
      <button class="btn-primary text-xs" @click="backToHub">Back to hub</button>
    </div>
    <ProjectView v-else :project-id="projectId" :initial-number="initialNumber" />
  </div>
</template>

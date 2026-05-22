<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const hub = useHubState()

const isHubMode = computed(() => hub.capabilities.value?.mode === 'hub')

const numberParam = computed(() => {
  const raw = route.params.number
  const n = Array.isArray(raw) ? raw[0] : raw
  const parsed = Number.parseInt(n ?? '', 10)
  return Number.isFinite(parsed) ? parsed : null
})

const projectId = computed(() => hub.projects.value[0]?.id ?? '')

// Hub mode has no /:single-segment shortcut — bounce back to the hub home.
watchEffect(() => {
  if (isHubMode.value)
    router.replace('/')
})
</script>

<template>
  <SingleProjectPage v-if="!isHubMode && projectId" :project-id="projectId" :initial-number="numberParam" />
</template>

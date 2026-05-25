<script setup lang="ts">
import { computed } from 'vue'
import { definePageMeta, useRoute, useRouter } from '#imports'
import PanelSingleProject from '../../../components/panel/SingleProject.vue'
import { useHubState } from '../../../composables/useHubState'

// Stable key so navigation between `/owner/repo` and `/owner/repo/:number`
// reuses the same page instance — without this Nuxt's default key includes
// the optional :number, causing a remount + payload refetch on every select.
definePageMeta({
  key: route => `/${route.params.owner}/${route.params.repo}`,
})

const route = useRoute()
const router = useRouter()
const hub = useHubState()

const ownerParam = computed(() => String(Array.isArray(route.params.owner) ? route.params.owner[0] : route.params.owner ?? ''))
const repoParam = computed(() => String(Array.isArray(route.params.repo) ? route.params.repo[0] : route.params.repo ?? ''))
const numberParam = computed(() => {
  const raw = route.params.number
  const n = Array.isArray(raw) ? raw[0] : raw
  const parsed = Number.parseInt(n ?? '', 10)
  return Number.isFinite(parsed) ? parsed : null
})

const repoSlug = computed(() => `${ownerParam.value}/${repoParam.value}`.toLowerCase())

const project = computed(() => hub.projects.value.find(p => p.repo.toLowerCase() === repoSlug.value))
const projectId = computed(() => project.value?.id ?? '')
const exists = computed(() => Boolean(project.value))

function backHome() {
  router.push('/')
}
</script>

<template>
  <div class="h-full flex flex-col">
    <div v-if="!exists" class="flex flex-col items-center justify-center flex-1 color-muted">
      <p class="text-sm mb-3">Project not found.</p>
      <button class="btn-primary text-xs" @click="backHome">Back to hub</button>
    </div>
    <PanelSingleProject v-else :project-id="projectId" :initial-number="numberParam" />
  </div>
</template>

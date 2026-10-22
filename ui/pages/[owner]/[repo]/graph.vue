<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from '#imports'
import PanelGraph from '../../../components/panel/Graph.vue'
import { useHubState } from '../../../composables/useHubState'

const route = useRoute()
const router = useRouter()
const hub = useHubState()

const repoSlug = computed(() => `${route.params.owner}/${route.params.repo}`.toLowerCase())
const project = computed(() => hub.projects.value.find(p => p.repo.toLowerCase() === repoSlug.value))
</script>

<template>
  <div class="h-full flex flex-col">
    <div v-if="!project" class="flex flex-col items-center justify-center flex-1 color-muted">
      <p class="text-sm mb-3">Project not found.</p>
      <button class="btn-primary text-xs" @click="router.push('/')">Back to hub</button>
    </div>
    <PanelGraph v-else :project-id="project.id" />
  </div>
</template>

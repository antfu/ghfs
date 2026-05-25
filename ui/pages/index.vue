<script setup lang="ts">
import { computed } from 'vue'
import HubHome from '../components/hub/Home.vue'
import PanelSingleProject from '../components/panel/SingleProject.vue'
import { useHubState } from '../composables/useHubState'

const hub = useHubState()
const isHubMode = computed(() => hub.capabilities.value?.mode === 'hub')
const singleProjectId = computed(() => hub.projects.value[0]?.id ?? '')
</script>

<template>
  <HubHome v-if="isHubMode" />
  <PanelSingleProject v-else-if="singleProjectId" :project-id="singleProjectId" :initial-number="null" />
  <div v-else class="flex flex-col items-center justify-center h-full color-muted">
    <p class="text-sm">No project configured.</p>
  </div>
</template>

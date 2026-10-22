<script setup lang="ts">
import { computed } from 'vue'
import PanelGraph from '../components/panel/Graph.vue'
import { useHubState } from '../composables/useHubState'

const hub = useHubState()
const projectId = computed(() => hub.projects.value[0]?.id ?? '')
</script>

<template>
  <PanelGraph v-if="projectId" :project-id="projectId" />
</template>

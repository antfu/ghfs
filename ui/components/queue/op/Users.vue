<script setup lang="ts">
import DisplayAuthor from '../../display/Author.vue'

defineProps<{
  users: string[]
}>()
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5" data-testid="queue-op-users">
    <span
      v-for="login in users"
      :key="login"
      class="inline-flex"
      @click.stop
    >
      <DisplayAuthor :author="login" :size="18" />
    </span>
    <span v-if="users.length === 0" class="text-xs color-faint italic">(none)</span>
  </div>
</template>

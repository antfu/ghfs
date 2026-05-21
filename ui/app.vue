<script setup lang="ts">
useHead({
  htmlAttrs: { lang: 'en' },
  title: 'ghfs',
})

useRpc()

installShortcuts(createAppShortcuts())
useShortcutsHandler()
useShiki()
</script>

<template>
  <div class="h-screen w-screen bg-base color-base font-sans overflow-hidden">
    <NuxtPage />
  </div>
</template>

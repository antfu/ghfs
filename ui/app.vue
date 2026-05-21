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

<style>
html, body, #app {
  height: 100vh;
  overflow: hidden;
}

.ghfs-splitpanes.splitpanes--vertical > .splitpanes__splitter {
  width: 4px;
  min-width: 4px;
  margin-right: -3px;
  background: transparent;
  border-left: 1px solid var(--un-border, #d1d9e0);
  cursor: col-resize;
  transition: background 0.15s;
}
.ghfs-splitpanes.splitpanes--vertical > .splitpanes__splitter:hover,
.ghfs-splitpanes.splitpanes--vertical > .splitpanes__splitter.splitpanes__splitter--active {
  background: rgb(9 105 218 / 0.3);
}
.dark .ghfs-splitpanes.splitpanes--vertical > .splitpanes__splitter {
  border-left-color: #3d444d;
}
.dark .ghfs-splitpanes.splitpanes--vertical > .splitpanes__splitter:hover,
.dark .ghfs-splitpanes.splitpanes--vertical > .splitpanes__splitter.splitpanes__splitter--active {
  background: rgb(68 147 248 / 0.3);
}
</style>

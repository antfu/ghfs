<script setup lang="ts">
interface Props {
  login?: string | null
  size?: number
}

const props = withDefaults(defineProps<Props>(), {
  size: 20,
})

const url = computed(() => {
  if (!props.login)
    return ''
  const retinaSize = Math.ceil(props.size * 2)
  return `https://avatars.githubusercontent.com/${props.login}?size=${retinaSize}`
})

const initial = computed(() => (props.login?.[0] ?? '?').toUpperCase())
const imgFailed = ref(false)

watch(() => props.login, () => {
  imgFailed.value = false
})
</script>

<template>
  <span
    :style="{ width: `${props.size}px`, height: `${props.size}px` }"
    class="inline-flex shrink-0 items-center justify-center rounded-full overflow-hidden bg-secondary color-muted font-mono text-[10px] select-none align-middle"
  >
    <img
      v-if="props.login && !imgFailed"
      :src="url"
      :alt="`@${props.login}`"
      :width="props.size"
      :height="props.size"
      loading="lazy"
      class="h-full w-full object-cover"
      @error="imgFailed = true"
    >
    <span v-else>{{ initial }}</span>
  </span>
</template>

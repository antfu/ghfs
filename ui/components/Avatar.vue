<script setup lang="ts">
interface Props {
  login?: string | null
  size?: number
  /** Explicit avatar URL override. When set, used verbatim instead of the GH CDN. */
  src?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  size: 20,
})

const url = computed(() => {
  if (props.src && props.src.startsWith('https://'))
    return props.src
  if (!props.login)
    return ''
  return `https://avatars.githubusercontent.com/${props.login}`
})

const initial = computed(() => (props.login?.[0] ?? '?').toUpperCase())
const imgFailed = ref(false)

watch(() => [props.login, props.src], () => {
  imgFailed.value = false
})
</script>

<template>
  <span
    :style="{ width: `${props.size}px`, height: `${props.size}px` }"
    class="inline-flex shrink-0 items-center justify-center rounded-full overflow-hidden bg-secondary color-muted font-mono text-[10px] select-none align-middle"
  >
    <img
      v-if="url && !imgFailed"
      :src="url"
      :alt="`@${props.login ?? ''}`"
      :width="props.size"
      :height="props.size"
      loading="lazy"
      class="h-full w-full object-cover"
      @error="imgFailed = true"
    >
    <span v-else>{{ initial }}</span>
  </span>
</template>

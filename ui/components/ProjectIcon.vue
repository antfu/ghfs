<script setup lang="ts">
import type { ProjectSummary } from '#ghfs/shared-rpc'

const props = withDefaults(defineProps<{
  project: Pick<ProjectSummary, 'id' | 'repo'>
  size?: number
  /** Tailwind/icon utility classes applied to the fallback octicon (e.g. color-active). */
  fallbackClass?: string
}>(), {
  size: 20,
  fallbackClass: 'color-muted',
})

const icon = useProjectIcon(() => props.project.id)

const owner = computed(() => props.project.repo.split('/')[0] ?? '')
const avatarSrc = computed(() => owner.value ? `https://avatars.githubusercontent.com/${owner.value}` : '')

const localFailed = ref(false)
const avatarFailed = ref(false)

watch(() => props.project.id, () => {
  localFailed.value = false
  avatarFailed.value = false
})

const showLocal = computed(() =>
  !icon.value.pending && !!icon.value.dataUrl && !localFailed.value,
)
const showAvatar = computed(() =>
  !showLocal.value && !!avatarSrc.value && !avatarFailed.value,
)
</script>

<template>
  <span
    :style="{ width: `${size}px`, height: `${size}px` }"
    class="inline-flex shrink-0 items-center justify-center rounded-md overflow-hidden bg-#8881 align-middle"
  >
    <img
      v-if="showLocal"
      :src="(icon as { dataUrl: string }).dataUrl"
      :alt="project.repo"
      :width="size"
      :height="size"
      loading="lazy"
      class="h-full w-full object-contain"
      @error="localFailed = true"
    >
    <img
      v-else-if="showAvatar"
      :src="avatarSrc"
      :alt="owner"
      :width="size"
      :height="size"
      loading="lazy"
      class="h-full w-full object-cover"
      @error="avatarFailed = true"
    >
    <span v-else :class="['i-octicon-repo-16', fallbackClass]" />
  </span>
</template>

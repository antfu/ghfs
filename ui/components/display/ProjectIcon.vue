<script setup lang="ts">
import type { ProjectSummary } from '#ghfs/rpc-types'

const props = withDefaults(defineProps<{
  project: Pick<ProjectSummary, 'id' | 'repo'>
  size?: number
  /** Tailwind/icon utility classes applied to the fallback octicon (e.g. color-active). */
  fallbackClass?: string
  /**
   * Pre-resolved icon data URL. When set, skips the project-icon lookup and
   * GitHub-avatar fallback. Used by HubProjectPicker where the scanned project
   * has no id yet and the server already produced the icon.
   */
  iconDataUrl?: string | null
}>(), {
  size: 20,
  fallbackClass: 'color-muted',
  iconDataUrl: null,
})

const icon = useProjectIcon(() => props.project.id)

const owner = computed(() => props.project.repo.split('/')[0] ?? '')
const avatarSrc = computed(() => owner.value ? `https://avatars.githubusercontent.com/${owner.value}` : '')

const localFailed = ref(false)
const avatarFailed = ref(false)
const explicitFailed = ref(false)

watch(() => props.project.id, () => {
  localFailed.value = false
  avatarFailed.value = false
})

watch(() => props.iconDataUrl, () => {
  explicitFailed.value = false
})

const showExplicit = computed(() => !!props.iconDataUrl && !explicitFailed.value)
const showLocal = computed(() =>
  !showExplicit.value && !icon.value.pending && !!icon.value.dataUrl && !localFailed.value,
)
const showAvatar = computed(() =>
  !showExplicit.value && !showLocal.value && !!avatarSrc.value && !avatarFailed.value,
)
</script>

<template>
  <span
    :style="{ width: `${size}px`, height: `${size}px` }"
    class="inline-flex shrink-0 items-center justify-center rounded-md overflow-hidden bg-#8881 align-middle"
  >
    <img
      v-if="showExplicit"
      :src="iconDataUrl!"
      :alt="project.repo"
      :width="size"
      :height="size"
      loading="lazy"
      class="h-full w-full object-contain"
      @error="explicitFailed = true"
    >
    <img
      v-else-if="showLocal"
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

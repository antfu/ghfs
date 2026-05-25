<script setup lang="ts">
import { computed } from 'vue'
import UiSafeImage from '../ui/SafeImage.vue'

interface AuthorObject {
  login: string
  avatarUrl?: string
  name?: string | null
  url?: string
}

const props = withDefaults(
  defineProps<{
    author: AuthorObject | string | null | undefined
    link?: boolean
    size?: number
    showName?: boolean
  }>(),
  {
    link: true,
    size: 20,
    showName: true,
  },
)

const normalized = computed<AuthorObject | null>(() => {
  if (!props.author)
    return null
  if (typeof props.author === 'string')
    return { login: props.author }
  return props.author
})

const avatarUrl = computed(() => {
  const a = normalized.value
  if (!a)
    return undefined
  return a.avatarUrl ?? `https://avatars.githubusercontent.com/${a.login}`
})

const href = computed(() => {
  const a = normalized.value
  if (!props.link || !a)
    return undefined
  return a.url ?? `https://github.com/${a.login}`
})
</script>

<template>
  <component
    :is="href ? 'a' : 'span'"
    v-if="normalized"
    :href="href"
    :target="href ? '_blank' : undefined"
    :rel="href ? 'noopener noreferrer' : undefined"
    class="inline-flex items-center gap-1.5 align-middle of-hidden text-ellipsis rounded-full leading-none"
    :class="href ? 'hover:bg-active transition' : ''"
    data-testid="author-entry"
  >
    <UiSafeImage
      :src="avatarUrl"
      class="rounded-full bg-active border border-base object-cover shrink-0"
      :style="{ width: `${size}px`, height: `${size}px` }"
      crossorigin="anonymous"
      :alt="normalized.login"
    >
      <template #fallback>
        <div
          class="i-ph-user-circle-duotone op-fade shrink-0"
          :style="{ width: `${size}px`, height: `${size}px` }"
        />
      </template>
    </UiSafeImage>
    <span v-if="showName" class="font-mono text-xs truncate">{{ normalized.login }}</span>
  </component>
</template>

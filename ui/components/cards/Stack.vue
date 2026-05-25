<script setup lang="ts">
import { computed } from 'vue'
import type { CardRef } from '../../composables/useCardsMode'
import CardsFace from './Face.vue'

const props = defineProps<{
  pile: CardRef[]
  index: number
}>()

/**
 * Render up to 4 cards from the current index forward. As `index` advances
 * the card at depth 0 leaves the list and TransitionGroup plays the leave
 * transition on it; the card behind it (depth 1) takes over depth 0 and its
 * CSS class change drives a transform transition that slides it into place.
 */
const visible = computed(() => {
  const out: { card: CardRef, depth: number, key: string }[] = []
  for (let depth = 0; depth < 4; depth += 1) {
    const card = props.pile[props.index + depth]
    if (!card)
      break
    out.push({
      card,
      depth,
      key: `${card.projectId}#${card.number}`,
    })
  }
  return out
})
</script>

<template>
  <div class="card-stack relative" data-testid="card-stack">
    <TransitionGroup name="card-flip">
      <div
        v-for="slot in visible"
        :key="slot.key"
        class="card"
        :class="slot.depth === 0 ? 'card-active' : `card-peek-${slot.depth}`"
        :style="{ zIndex: 4 - slot.depth }"
      >
        <CardsFace
          :card="slot.card"
          :depth="slot.depth"
          :is-front="slot.depth === 0"
        />
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.card-stack {
  /* Reserve generous gutters left/right so the edge-action labels
     ("Mark as todo", "Skip", …) have visible breathing room beside the
     card; vertical headroom stays tighter since the top header is fixed. */
  width: clamp(680px, 78vw, 1280px);
  height: clamp(480px, 86vh, 980px);
  max-width: calc(100vw - 10rem);
  max-height: calc(100vh - 6rem);
}

@media (max-width: 900px) {
  .card-stack {
    width: min(88vw, 720px);
    height: min(80vh, 680px);
    max-width: 88vw;
    max-height: 80vh;
  }
}

.card {
  position: absolute;
  inset: 0;
  border-radius: 16px;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.06),
    0 12px 32px -8px rgba(0, 0, 0, 0.18);
  transition: transform 320ms cubic-bezier(0.22, 0.61, 0.36, 1),
    opacity 280ms ease-out;
  will-change: transform, opacity;
}

.card-active {
  transform: translateY(0) rotate(0deg) scale(1);
  opacity: 1;
}

.card-peek-1 {
  transform: translateY(-10px) rotate(-1.2deg) scale(0.97);
  opacity: 0.86;
}

.card-peek-2 {
  transform: translateY(-20px) rotate(1.4deg) scale(0.94);
  opacity: 0.7;
}

.card-peek-3 {
  transform: translateY(-30px) rotate(-0.6deg) scale(0.91);
  opacity: 0.5;
}

/* TransitionGroup leave: slide off to the right with a tilt. Vue applies
   these classes when a v-for item disappears from the list. The starting
   state is the element's current `.card-active` transform; `leave-to` is
   what we transition into. */
.card-flip-leave-active {
  transition: transform 360ms cubic-bezier(0.55, 0.05, 0.35, 1),
    opacity 360ms ease-in;
  pointer-events: none;
  z-index: 5;
}

.card-flip-leave-to {
  transform: translateX(140%) rotate(18deg) scale(0.95);
  opacity: 0;
}
</style>

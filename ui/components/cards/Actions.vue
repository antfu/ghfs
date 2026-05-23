<script setup lang="ts">
withDefaults(defineProps<{
  /** True while a card is sliding off — suspends hover feedback to keep things calm. */
  busy?: boolean
}>(), {
  busy: false,
})

type Zone = 'top' | 'left' | 'right' | 'bottom'

const cards = useCardsMode()
const todoCmd = useCommand('cards.todo')
const ignoreCmd = useCommand('cards.ignore')
const skipCmd = useCommand('cards.skip')
const commentCmd = useCommand('cards.comment')

const isTodo = computed(() => cards.currentIsTodo.value)
const isIgnored = computed(() => cards.currentIsIgnored.value)
const hasPendingComment = computed(() => Boolean(cards.currentPendingComment.value))

function commandFor(zone: Zone) {
  return zone === 'top'
    ? todoCmd
    : zone === 'left'
      ? ignoreCmd
      : zone === 'right'
        ? skipCmd
        : commentCmd
}

function fireZone(zone: Zone) {
  const cmd = commandFor(zone)
  if (!cmd.active.value)
    return
  void cmd.command.value?.run()
}

const arena = ref<HTMLElement | null>(null)
const arenaSize = ref({ w: 0, h: 0 })

let resizeObserver: ResizeObserver | null = null

function syncSize() {
  const el = arena.value
  if (!el)
    return
  arenaSize.value = { w: el.clientWidth, h: el.clientHeight }
}

onMounted(() => {
  syncSize()
  if (typeof ResizeObserver !== 'undefined' && arena.value) {
    resizeObserver = new ResizeObserver(syncSize)
    resizeObserver.observe(arena.value)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})

/** How far inward from the edge the hover zone reaches. */
const EDGE_DEPTH = 260
/**
 * A square in each corner where the cursor is too ambiguous to pick a zone —
 * top-vs-left, top-vs-right, etc. Inside this box we deactivate everything so
 * the user has to commit to one direction before the bloom + tilt fire.
 */
const CORNER_DEAD = 160

/** Which zone the cursor is currently inside (binary, not a magnitude). */
const activeZone = ref<Zone | null>(null)

function onMove(e: MouseEvent) {
  const rect = arena.value?.getBoundingClientRect()
  if (!rect)
    return
  // Cursor over the card body — neutral, no zone active.
  const target = e.target as HTMLElement | null
  if (target?.closest('[data-cards-passthrough]')) {
    activeZone.value = null
    return
  }
  const { w, h } = arenaSize.value
  if (w === 0 || h === 0)
    return
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  // Dead corner: if both the nearest horizontal *and* vertical edge are this
  // close, the user could be heading toward either zone — don't pick one for
  // them.
  const distV = Math.min(y, h - y)
  const distH = Math.min(x, w - x)
  if (distV < CORNER_DEAD && distH < CORNER_DEAD) {
    activeZone.value = null
    return
  }
  // Nearest edge wins, but only if we're actually within the zone depth and
  // the corresponding command is currently active.
  const dists: Array<{ zone: Zone, dist: number }> = [
    { zone: 'top', dist: y },
    { zone: 'bottom', dist: h - y },
    { zone: 'left', dist: x },
    { zone: 'right', dist: w - x },
  ]
  dists.sort((a, b) => a.dist - b.dist)
  const nearest = dists[0]
  if (!nearest || nearest.dist > EDGE_DEPTH) {
    activeZone.value = null
    return
  }
  if (!commandFor(nearest.zone).active.value) {
    activeZone.value = null
    return
  }
  activeZone.value = nearest.zone
}

function onLeave() {
  activeZone.value = null
}

/**
 * Up/down lean as a 3D tilt; left/right slide-and-spin. Magnitudes kept
 * deliberately subtle — the gradients and label colour are the primary cue.
 */
const cardTilt = computed(() => {
  const zone = activeZone.value
  if (!zone)
    return 'rotateX(0deg)'
  switch (zone) {
    case 'top': return 'rotateX(-3.5deg)'
    case 'bottom': return 'rotateX(3.5deg)'
    case 'left': return 'translateX(-18px) rotateZ(-2.5deg)'
    case 'right': return 'translateX(18px) rotateZ(2.5deg)'
  }
  return 'rotateX(0deg)'
})

/** Desaturate-and-fade the card when the cursor sits in the ignore zone. */
const cardFilter = computed(() => {
  if (activeZone.value !== 'left')
    return 'grayscale(0) opacity(1)'
  return 'grayscale(0.75) opacity(0.6)'
})

function onClick(e: MouseEvent) {
  const target = e.target as HTMLElement | null
  if (target?.closest('[data-cards-passthrough]'))
    return
  const zone = activeZone.value
  if (!zone)
    return
  fireZone(zone)
}
</script>

<template>
  <div
    ref="arena"
    class="cards-arena"
    @mousemove="onMove"
    @mouseleave="onLeave"
    @click="onClick"
  >
    <!-- Edge overlays — CSS transitions handle the bloom on activate/deactivate. -->
    <div
      class="edge-overlay edge-overlay-top edge-zone-todo"
      :class="{ 'edge-overlay-active': activeZone === 'top' }"
    />
    <div
      class="edge-overlay edge-overlay-left edge-zone-ignore"
      :class="{ 'edge-overlay-active': activeZone === 'left' }"
    />
    <div
      class="edge-overlay edge-overlay-right edge-zone-skip"
      :class="{ 'edge-overlay-active': activeZone === 'right' }"
    />
    <div
      class="edge-overlay edge-overlay-bottom edge-zone-comment"
      :class="{ 'edge-overlay-active': activeZone === 'bottom' }"
    />

    <!-- Edge labels: tinted text in each zone's colour, brighter when active.
         Labels switch to past-tense ("Marked as todo" / "Edit comment") so
         the user can tell the card is already in that state and the click
         will toggle it off / re-open in edit mode. -->
    <div
      class="edge-label edge-label-top edge-zone-todo"
      :class="[{ 'edge-label-active': activeZone === 'top' }, !todoCmd.active.value && 'edge-label-disabled']"
      data-testid="card-edge-todo"
    >
      <span :class="isTodo ? 'i-ph-bookmark-simple-fill' : 'i-ph-bookmark-simple-duotone'" />
      <span>{{ isTodo ? 'Marked as todo' : 'Mark as todo' }}</span>
      <UiKbd command="cards.todo" />
    </div>
    <div
      class="edge-label edge-label-left edge-zone-ignore"
      :class="[{ 'edge-label-active': activeZone === 'left' }, !ignoreCmd.active.value && 'edge-label-disabled']"
      data-testid="card-edge-ignore"
    >
      <span :class="isIgnored ? 'i-ph-eye-slash-fill' : 'i-ph-eye-slash-duotone'" />
      <span>{{ isIgnored ? 'Marked as ignore' : 'Mark as ignore' }}</span>
      <UiKbd command="cards.ignore" />
    </div>
    <div
      class="edge-label edge-label-right edge-zone-skip"
      :class="[{ 'edge-label-active': activeZone === 'right' }, !skipCmd.active.value && 'edge-label-disabled']"
      data-testid="card-edge-skip"
    >
      <span class="i-ph-skip-forward-duotone" />
      <span>Skip</span>
      <UiKbd command="cards.skip" />
    </div>
    <div
      class="edge-label edge-label-bottom edge-zone-comment"
      :class="[{ 'edge-label-active': activeZone === 'bottom' }, !commentCmd.active.value && 'edge-label-disabled']"
      data-testid="card-edge-comment"
    >
      <span :class="hasPendingComment ? 'i-octicon-pencil-16' : 'i-octicon-comment-16'" />
      <span>{{ hasPendingComment ? 'Edit comment' : 'Comment' }}</span>
      <UiKbd command="cards.comment" />
    </div>

    <!-- The card stack with the tilt applied. Uses `data-cards-passthrough` so
         click events on the card body aren't intercepted as zone clicks. -->
    <div
      class="card-stack-wrapper"
      :style="{
        transform: cardTilt,
        filter: cardFilter,
        opacity: busy ? 0.85 : 1,
      }"
      data-cards-passthrough
    >
      <slot />
    </div>
  </div>
</template>

<style scoped>
.cards-arena {
  position: absolute;
  inset: 0;
  perspective: 1600px;
  user-select: none;
}

/* Per-zone colour tokens, mapped to the UnoCSS / Tailwind palette so the
   gradients and labels stay in sync with the rest of the app's theme.
   `--zone-rgb`  — base hue used by the radial gradient (always with alpha)
   `--zone-text` — high-contrast hue for label + kbd text (deeper in light
                   mode, lighter in dark mode so it reads on both surfaces). */
.edge-zone-todo {
  --zone-rgb: 34 197 94;       /* green-500 — "save for later" */
  --zone-text: 21 128 61;      /* green-700 */
}
.edge-zone-ignore {
  --zone-rgb: 239 68 68;       /* red-500 — "dismiss" */
  --zone-text: 185 28 28;      /* red-700 */
}
.edge-zone-skip {
  --zone-rgb: 245 158 11;      /* amber-500 — "pass" */
  --zone-text: 180 83 9;       /* amber-700 */
}
.edge-zone-comment {
  --zone-rgb: 9 105 218;       /* primary-500 — "interact" */
  --zone-text: 5 80 174;       /* primary-600 */
}

/* Dark mode: lift the base hue toward the 400 shade so the gradient still
   reads against the dark background, and lift the text toward 300 for
   readability. */
.dark .edge-zone-todo {
  --zone-rgb: 74 222 128;      /* green-400 */
  --zone-text: 134 239 172;    /* green-300 */
}
.dark .edge-zone-ignore {
  --zone-rgb: 248 113 113;     /* red-400 */
  --zone-text: 252 165 165;    /* red-300 */
}
.dark .edge-zone-skip {
  --zone-rgb: 251 191 36;      /* amber-400 */
  --zone-text: 252 211 77;     /* amber-300 */
}
.dark .edge-zone-comment {
  --zone-rgb: 33 139 255;      /* primary-400 */
  --zone-text: 84 174 255;     /* primary-300 */
}

.edge-overlay {
  position: absolute;
  pointer-events: none;
  z-index: 1;
  opacity: 0;
  transition: width 320ms cubic-bezier(0.22, 0.61, 0.36, 1),
    height 320ms cubic-bezier(0.22, 0.61, 0.36, 1),
    opacity 280ms ease-out;
}

.edge-overlay-top {
  top: 0; left: 0; right: 0;
  height: 0;
  background: radial-gradient(
    ellipse 75% 100% at 50% 0%,
    rgb(var(--zone-rgb) / 0.5) 0%,
    rgb(var(--zone-rgb) / 0.18) 50%,
    transparent 100%
  );
}
.edge-overlay-top.edge-overlay-active {
  height: 320px;
  opacity: 0.6;
}

.edge-overlay-bottom {
  bottom: 0; left: 0; right: 0;
  height: 0;
  background: radial-gradient(
    ellipse 75% 100% at 50% 100%,
    rgb(var(--zone-rgb) / 0.5) 0%,
    rgb(var(--zone-rgb) / 0.18) 50%,
    transparent 100%
  );
}
.edge-overlay-bottom.edge-overlay-active {
  height: 320px;
  opacity: 0.6;
}

.edge-overlay-left {
  top: 0; bottom: 0; left: 0;
  width: 0;
  background: radial-gradient(
    ellipse 100% 75% at 0% 50%,
    rgb(var(--zone-rgb) / 0.5) 0%,
    rgb(var(--zone-rgb) / 0.18) 50%,
    transparent 100%
  );
}
.edge-overlay-left.edge-overlay-active {
  width: 320px;
  opacity: 0.6;
}

.edge-overlay-right {
  top: 0; bottom: 0; right: 0;
  width: 0;
  background: radial-gradient(
    ellipse 100% 75% at 100% 50%,
    rgb(var(--zone-rgb) / 0.5) 0%,
    rgb(var(--zone-rgb) / 0.18) 50%,
    transparent 100%
  );
}
.edge-overlay-right.edge-overlay-active {
  width: 320px;
  opacity: 0.6;
}

/* Labels — flat text near each edge, tinted with the zone's text shade so
   the user reads the option's identity at a glance. */
.edge-label {
  position: absolute;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8125rem;
  color: rgb(var(--zone-text));
  pointer-events: none;
  z-index: 2;
  letter-spacing: 0.01em;
  transition: color 180ms ease, opacity 180ms ease, transform 180ms ease;
  opacity: 0.7;
}

.edge-label-active {
  opacity: 1;
}

/* Kbd hints — text uses the readable text shade, background uses the
   gradient hue at low alpha so the chip feels related to the bloom. */
.edge-label :deep(.kbd) {
  color: rgb(var(--zone-text));
  background: rgb(var(--zone-rgb) / 0.12);
  border-color: rgb(var(--zone-rgb) / 0.32);
  border-bottom-color: rgb(var(--zone-rgb) / 0.45);
  transition: background-color 180ms ease, border-color 180ms ease, color 180ms ease;
}

.edge-label-active :deep(.kbd) {
  background: rgb(var(--zone-rgb) / 0.2);
  border-color: rgb(var(--zone-rgb) / 0.5);
}

.edge-label-disabled {
  opacity: 0.2;
}

.edge-label-top {
  top: 1.25rem;
  left: 50%;
  transform: translateX(-50%);
}
.edge-label-top.edge-label-active {
  transform: translateX(-50%) translateY(2px);
}

.edge-label-bottom {
  bottom: 1.25rem;
  left: 50%;
  transform: translateX(-50%);
}
.edge-label-bottom.edge-label-active {
  transform: translateX(-50%) translateY(-2px);
}

.edge-label-left {
  top: 50%;
  left: 1.5rem;
  transform: translateY(-50%);
}
.edge-label-left.edge-label-active {
  transform: translateY(-50%) translateX(2px);
}

.edge-label-right {
  top: 50%;
  right: 1.5rem;
  transform: translateY(-50%);
}
.edge-label-right.edge-label-active {
  transform: translateY(-50%) translateX(-2px);
}

/* The wrapper around the card stack — receives the cursor-driven tilt. */
.card-stack-wrapper {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transform-style: preserve-3d;
  transition: transform 260ms cubic-bezier(0.22, 0.61, 0.36, 1),
    filter 260ms ease-out,
    opacity 220ms ease-out;
  z-index: 3;
  pointer-events: none;
}

/* But the actual card frame inside the wrapper needs pointer-events back on. */
.card-stack-wrapper :deep(.card-stack) {
  pointer-events: auto;
}
</style>

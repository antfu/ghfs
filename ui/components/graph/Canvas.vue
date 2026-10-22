<script setup lang="ts">
import type { GraphEdge, GraphModel, GraphNode } from '#ghfs/graph-model'
import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3-force'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useDark, useResizeObserver } from '@vueuse/core'
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3-force'
import { labelStyle } from '../../composables/useLabelColor'

interface SimNode extends SimulationNodeDatum {
  id: string
  ref: GraphNode
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  edge: GraphEdge
}

const props = defineProps<{
  model: GraphModel
  selectedNumber?: number | null
  dataTestid?: string
}>()

const emit = defineEmits<{
  select: [number: number]
  dropOnLabel: [number: number, label: string]
  edgeClick: [edge: GraphEdge]
  hover: [target: { node?: GraphNode, edge?: GraphEdge, x: number, y: number } | null]
}>()

const ITEM_RADIUS = 6
const LABEL_RADIUS = 13
const DROP_RADIUS = 30
const STATE_COLORS = { open: '#1a7f37', closed: '#cf222e', merged: '#8250df', draft: '#59636e' }

const container = ref<HTMLDivElement>()
const canvas = ref<HTMLCanvasElement>()
const isDark = useDark()

const nodes = shallowRef<SimNode[]>([])
const links = shallowRef<SimLink[]>([])
const byId = new Map<string, SimNode>()
const transform = ref({ x: 0, y: 0, k: 1 })
const hovered = shallowRef<SimNode | SimLink | null>(null)
let size = { width: 0, height: 0 }
let frame = 0

const simulation = forceSimulation<SimNode>()
  .force('charge', forceManyBody<SimNode>().strength(node => (node.ref.kind === 'label' ? -260 : -28)))
  .force('collide', forceCollide<SimNode>().radius(node => (node.ref.kind === 'label' ? LABEL_RADIUS + 6 : ITEM_RADIUS + 2)))
  .force('link', forceLink<SimNode, SimLink>().id(node => node.id)
    .distance(link => (link.edge.kind === 'label' ? 70 : 40))
    .strength(link => (link.edge.kind === 'label' ? 0.35 : 0.7)))
  .on('tick', scheduleDraw)

/** Keep positions of nodes that survive a model change so the layout doesn't restart from scratch. */
function syncModel(model: GraphModel) {
  const previous = new Map(nodes.value.map(node => [node.id, node]))
  byId.clear()
  const next = model.nodes.map((node) => {
    const existing = previous.get(node.id)
    const sim: SimNode = existing ? { ...existing, ref: node } : { id: node.id, ref: node, x: (Math.random() - 0.5) * 200, y: (Math.random() - 0.5) * 200 }
    byId.set(node.id, sim)
    return sim
  })
  nodes.value = next
  links.value = model.edges
    .filter(edge => byId.has(edge.source) && byId.has(edge.target))
    .map(edge => ({ source: edge.source, target: edge.target, edge }))
  simulation.nodes(next)
  simulation.force<ReturnType<typeof forceLink<SimNode, SimLink>>>('link')!.links(links.value)
  simulation.alpha(previous.size ? 0.5 : 1).restart()
}

watch(() => props.model, syncModel, { immediate: true })

function fit() {
  if (!container.value)
    return
  size = { width: container.value.clientWidth, height: container.value.clientHeight }
  simulation.force('center', forceCenter(0, 0))
  transform.value = { x: size.width / 2, y: size.height / 2, k: transform.value.k }
  if (canvas.value) {
    const dpr = window.devicePixelRatio || 1
    canvas.value.width = size.width * dpr
    canvas.value.height = size.height * dpr
  }
  scheduleDraw()
}

useResizeObserver(container, fit)
onMounted(fit)
onBeforeUnmount(() => {
  simulation.stop()
  cancelAnimationFrame(frame)
})

function scheduleDraw() {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(draw)
}

const edgeStyles = computed<Record<GraphEdge['kind'], { color: string, dash: number[], width: number }>>(() => ({
  'label': { color: isDark.value ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)', dash: [], width: 1 },
  'reference': { color: 'rgba(136,136,136,0.45)', dash: [], width: 1 },
  'closes': { color: `${STATE_COLORS.open}aa`, dash: [], width: 1.5 },
  'duplicate': { color: `${STATE_COLORS.closed}cc`, dash: [4, 3], width: 1.5 },
  'closed-together': { color: `${STATE_COLORS.merged}aa`, dash: [1, 3], width: 1.5 },
  'suspected-duplicate': { color: '#bc4c00', dash: [6, 4], width: 1.5 },
}))

function nodeFill(node: GraphNode): string {
  if (node.kind === 'label')
    return labelStyle(node.color, isDark.value).backgroundColor
  const first = node.labels[0]
  const anchor = first ? byId.get(`label:${first}`)?.ref : undefined
  return anchor?.kind === 'label' ? labelStyle(anchor.color, isDark.value).color : (isDark.value ? '#484f58' : '#d0d7de')
}

function nodeStroke(node: GraphNode): string {
  if (node.kind === 'label')
    return labelStyle(node.color, isDark.value).borderColor
  if (node.itemKind === 'pull' && node.merged)
    return STATE_COLORS.merged
  if (node.itemKind === 'pull' && node.draft)
    return STATE_COLORS.draft
  return STATE_COLORS[node.state]
}

function draw() {
  const ctx = canvas.value?.getContext('2d')
  if (!ctx)
    return
  const dpr = window.devicePixelRatio || 1
  const { x, y, k } = transform.value
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, size.width, size.height)
  ctx.translate(x, y)
  ctx.scale(k, k)

  const selectedId = props.selectedNumber == null ? null : `#${props.selectedNumber}`
  const hover = hovered.value

  for (const link of links.value) {
    const source = link.source as SimNode
    const target = link.target as SimNode
    const style = edgeStyles.value[link.edge.kind]
    ctx.beginPath()
    ctx.moveTo(source.x!, source.y!)
    ctx.lineTo(target.x!, target.y!)
    ctx.setLineDash(style.dash)
    ctx.lineWidth = (style.width + (link.edge.kind === 'suspected-duplicate' ? (link.edge.confidence ?? 0) * 2 : 0)) / k
    ctx.strokeStyle = style.color
    ctx.globalAlpha = hover === link ? 1 : (link.edge.kind === 'label' ? 1 : 0.9)
    ctx.stroke()
  }
  ctx.setLineDash([])
  ctx.globalAlpha = 1

  for (const node of nodes.value) {
    const { ref } = node
    const radius = ref.kind === 'label' ? LABEL_RADIUS : ITEM_RADIUS
    ctx.beginPath()
    ctx.arc(node.x!, node.y!, radius, 0, Math.PI * 2)
    ctx.fillStyle = nodeFill(ref)
    ctx.fill()
    ctx.lineWidth = (node.id === selectedId || hover === node ? 2.5 : 1.25) / Math.sqrt(k)
    ctx.strokeStyle = node.id === selectedId ? '#0969da' : nodeStroke(ref)
    ctx.stroke()
    if (ref.kind === 'label') {
      ctx.font = `600 ${11 / k}px ui-sans-serif, system-ui, sans-serif`
      ctx.textBaseline = 'middle'
      ctx.fillStyle = labelStyle(ref.color, isDark.value).color
      ctx.fillText(ref.name, node.x! + radius + 4 / k, node.y!)
    }
  }
}

watch([isDark, () => props.selectedNumber, transform, hovered], scheduleDraw, { deep: true })

// ─── Interaction ───────────────────────────────────────────────────────────

function toWorld(event: MouseEvent): { x: number, y: number } {
  const rect = canvas.value!.getBoundingClientRect()
  const { x, y, k } = transform.value
  return { x: (event.clientX - rect.left - x) / k, y: (event.clientY - rect.top - y) / k }
}

function nodeAt(point: { x: number, y: number }): SimNode | null {
  let best: SimNode | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const node of nodes.value) {
    const radius = (node.ref.kind === 'label' ? LABEL_RADIUS : ITEM_RADIUS) + 3 / transform.value.k
    const distance = Math.hypot(node.x! - point.x, node.y! - point.y)
    if (distance <= radius && distance < bestDistance) {
      best = node
      bestDistance = distance
    }
  }
  return best
}

function linkAt(point: { x: number, y: number }): SimLink | null {
  const tolerance = 5 / transform.value.k
  for (const link of links.value) {
    if (link.edge.kind === 'label')
      continue
    const a = link.source as SimNode
    const b = link.target as SimNode
    const dx = b.x! - a.x!
    const dy = b.y! - a.y!
    const lengthSquared = dx * dx + dy * dy || 1
    const t = Math.max(0, Math.min(1, ((point.x - a.x!) * dx + (point.y - a.y!) * dy) / lengthSquared))
    if (Math.hypot(a.x! + t * dx - point.x, a.y! + t * dy - point.y) <= tolerance)
      return link
  }
  return null
}

function nearestLabel(node: SimNode): SimNode | null {
  let best: SimNode | null = null
  let bestDistance = DROP_RADIUS
  for (const candidate of nodes.value) {
    if (candidate.ref.kind !== 'label' || candidate.ref.id === 'label:')
      continue
    const distance = Math.hypot(candidate.x! - node.x!, candidate.y! - node.y!)
    if (distance < bestDistance) {
      best = candidate
      bestDistance = distance
    }
  }
  return best
}

let drag: { node: SimNode | null, startX: number, startY: number, originX: number, originY: number, moved: boolean } | null = null

function onPointerDown(event: PointerEvent) {
  const node = nodeAt(toWorld(event))
  drag = { node, startX: event.clientX, startY: event.clientY, originX: transform.value.x, originY: transform.value.y, moved: false }
  canvas.value!.setPointerCapture(event.pointerId)
  if (node) {
    node.fx = node.x
    node.fy = node.y
    simulation.alphaTarget(0.3).restart()
  }
}

function onPointerMove(event: PointerEvent) {
  if (!drag) {
    const point = toWorld(event)
    const target = nodeAt(point) ?? linkAt(point)
    if (target !== hovered.value) {
      hovered.value = target
      emit('hover', target ? { ...(('ref' in target) ? { node: target.ref } : { edge: target.edge }), x: event.clientX, y: event.clientY } : null)
    }
    return
  }
  const dx = event.clientX - drag.startX
  const dy = event.clientY - drag.startY
  if (Math.hypot(dx, dy) > 3)
    drag.moved = true
  if (drag.node) {
    const point = toWorld(event)
    drag.node.fx = point.x
    drag.node.fy = point.y
  }
  else {
    transform.value = { ...transform.value, x: drag.originX + dx, y: drag.originY + dy }
  }
}

function onPointerUp(event: PointerEvent) {
  if (!drag)
    return
  const { node, moved } = drag
  drag = null
  simulation.alphaTarget(0)
  if (!node) {
    if (!moved) {
      const link = linkAt(toWorld(event))
      if (link)
        emit('edgeClick', link.edge)
    }
    return
  }
  if (node.ref.kind === 'item') {
    node.fx = null
    node.fy = null
    if (!moved) {
      emit('select', node.ref.number)
      return
    }
    const label = nearestLabel(node)
    if (label?.ref.kind === 'label' && !node.ref.labels.includes(label.ref.name))
      emit('dropOnLabel', node.ref.number, label.ref.name)
  }
  // Label anchors stay where the user put them.
}

function onPointerLeave() {
  hovered.value = null
  emit('hover', null)
}

function onWheel(event: WheelEvent) {
  event.preventDefault()
  const rect = canvas.value!.getBoundingClientRect()
  const px = event.clientX - rect.left
  const py = event.clientY - rect.top
  const { x, y, k } = transform.value
  const next = Math.min(4, Math.max(0.2, k * (event.deltaY < 0 ? 1.1 : 1 / 1.1)))
  transform.value = { k: next, x: px - (px - x) * (next / k), y: py - (py - y) * (next / k) }
}

function resetView() {
  transform.value = { x: size.width / 2, y: size.height / 2, k: 1 }
  simulation.alpha(0.3).restart()
}

defineExpose({ resetView })
</script>

<template>
  <div ref="container" class="relative w-full h-full overflow-hidden" :data-testid="dataTestid">
    <canvas
      ref="canvas"
      class="absolute inset-0 w-full h-full touch-none"
      :class="hovered ? 'cursor-pointer' : 'cursor-grab'"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @pointerleave="onPointerLeave"
      @wheel="onWheel"
    />
  </div>
</template>

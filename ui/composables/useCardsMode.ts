import type { QueueEntry } from '#ghfs/server-types'
import type { ListItem } from '../types/list-item'

export interface CardRef {
  projectId: string
  repo: string
  kind: 'issue' | 'pull'
  number: number
  title: string
  authorAvatarUrl?: string
  author?: string | null
}

export interface QueuedOp {
  projectId: string
  opId: string
}

/**
 * Describes where the current pile came from. Drives the title shown in the
 * cards page header — e.g. "Recent" for the hub recent list, or a project's
 * repo for a single-project list.
 */
export interface CardsSource {
  /** Free-form label, displayed when there's no single repo (e.g. "Recent"). */
  label: string
  /** When set, the header renders a ProjectIcon + this repo's owner/name. */
  project?: { id: string, repo: string }
}

const PILE_SIZE = 10
const TRANSITION_MS = 360

const pile = ref<CardRef[]>([])
const index = ref(0)
const processedOps = ref<QueuedOp[]>([])
const sourceItems = ref<ListItem[] | null>(null)
const source = ref<CardsSource>({ label: 'Cards' })
const processedKeys = ref<Set<string>>(new Set())

// UI state — exposed so the cards page renders them and commands gate on them.
const advancing = ref(false)
const commentDialogOpen = ref(false)
const labelsPendingFor = ref<CardRef | null>(null)

function shuffle<T>(input: T[]): T[] {
  const arr = [...input]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = arr[i] as T
    arr[i] = arr[j] as T
    arr[j] = tmp
  }
  return arr
}

function itemKey(it: { projectId: string, number: number }): string {
  return `${it.projectId}#${it.number}`
}

function toCardRef(it: ListItem): CardRef {
  return {
    projectId: it.projectId,
    repo: it.repo,
    kind: it.kind,
    number: it.number,
    title: it.title,
    authorAvatarUrl: it.authorAvatarUrl,
    author: it.author,
  }
}

function pickPile(items: ListItem[]): CardRef[] {
  const usable = items.filter(it => !processedKeys.value.has(itemKey(it)))
  return shuffle(usable).slice(0, PILE_SIZE).map(toCardRef)
}

function currentCardSync(): CardRef | null {
  if (index.value >= pile.value.length)
    return null
  return pile.value[index.value] ?? null
}

async function performAdvance(): Promise<void> {
  if (advancing.value)
    return
  advancing.value = true
  const card = currentCardSync()
  if (card)
    processedKeys.value.add(itemKey(card))
  index.value += 1
  await new Promise(resolve => setTimeout(resolve, TRANSITION_MS))
  advancing.value = false
}

export function useCardsMode() {
  const router = useRouter()
  const ui = useUiState()
  const rpc = useRpc()
  const { ensureLoaded } = useProjectPayload()

  const currentCard = computed<CardRef | null>(() => currentCardSync())
  const total = computed(() => pile.value.length)
  const remaining = computed(() => Math.max(0, pile.value.length - index.value))
  const done = computed(() => pile.value.length > 0 && index.value >= pile.value.length)

  /**
   * Is the current card in a state where a "close" op is meaningful — i.e.
   * the underlying item is open and has no pending close already queued?
   */
  const currentCanClose = computed<boolean>(() => {
    const card = currentCard.value
    if (!card)
      return false
    const state = useAppState(card.projectId)
    const entry = state.payload.value?.syncState.items[String(card.number)]
    if (!entry)
      return true
    if (entry.data.item.state === 'closed')
      return false
    const ops = (state.payload.value?.queue.entries ?? []) as QueueEntry[]
    return !ops.some((e: QueueEntry) =>
      e.op.number === card.number
      && (e.op.action === 'close' || e.op.action === 'close-with-comment'),
    )
  })

  const currentIsTodo = computed<boolean>(() => {
    const card = currentCard.value
    if (!card)
      return false
    // Reads the singleton ui-state which is hydrated to the card's project
    // once `doMarkTodo`/`ensureLoaded` has run for that project. May briefly
    // be stale on the first card; ok for MVP.
    return ui.isTodo(card.number)
  })

  const currentIsIgnored = computed<boolean>(() => {
    const card = currentCard.value
    if (!card)
      return false
    return ui.isIgnored(card.number)
  })

  async function start(items: ListItem[], next?: CardsSource): Promise<void> {
    sourceItems.value = items
    processedOps.value = []
    processedKeys.value = new Set()
    pile.value = pickPile(items)
    index.value = 0
    source.value = next ?? { label: 'Cards' }
    await router.push('/cards')
  }

  /**
   * Resolve a source list from the current route and start cards mode. Lets
   * a single global command (`cards.start`) wire up correctly from any list.
   */
  async function startFromCurrentContext(): Promise<void> {
    const route = useRoute()
    if (route.path === '/recent') {
      const recent = useRecentFiltered()
      const items = recent.filteredItems.value
      if (items.length === 0)
        return
      await start(items, { label: 'Recent' })
      return
    }
    if (route.path === '/todo') {
      const todos = useHubTodos()
      const items = todos.listItems.value
      if (items.length === 0)
        return
      await start(items, { label: 'Todo' })
      return
    }
    const { filteredItems } = useFilteredItems()
    const items = filteredItems.value
    if (items.length === 0)
      return
    const state = useAppState()
    const activeId = useActiveProjectId().value
    if (activeId && state.payload.value) {
      const kindLabel = state.filters.kind === 'pull' ? 'Pull requests' : 'Issues'
      await start(items, {
        label: kindLabel,
        project: { id: activeId, repo: state.payload.value.repo.repo },
      })
      return
    }
    await start(items, { label: 'Cards' })
  }

  function recordOp(projectId: string, opId: string): void {
    processedOps.value.push({ projectId, opId })
  }

  function anotherPile(): void {
    if (!sourceItems.value)
      return
    processedOps.value = []
    pile.value = pickPile(sourceItems.value)
    index.value = 0
  }

  function reset(): void {
    pile.value = []
    index.value = 0
    processedOps.value = []
    sourceItems.value = null
    processedKeys.value = new Set()
    source.value = { label: 'Cards' }
    commentDialogOpen.value = false
    labelsPendingFor.value = null
  }

  async function doSkip(): Promise<void> {
    if (!currentCard.value)
      return
    await performAdvance()
  }

  async function doMarkTodo(): Promise<void> {
    const card = currentCard.value
    if (!card)
      return
    await ensureLoaded(card.projectId)
    if (!ui.isTodo(card.number))
      ui.addTodo(card.number)
    await performAdvance()
  }

  async function doMarkIgnore(): Promise<void> {
    const card = currentCard.value
    if (!card)
      return
    await ensureLoaded(card.projectId)
    if (!ui.isIgnored(card.number))
      ui.addIgnored(card.number)
    await performAdvance()
  }

  async function doOpenLabels(): Promise<void> {
    const card = currentCard.value
    if (!card)
      return
    await ensureLoaded(card.projectId)
    labelsPendingFor.value = card
    const state = useAppState(card.projectId)
    state.selectItem(card.number)
    ui.labelEditorOpen.value = true
  }

  function doOpenComment(): void {
    if (!currentCard.value)
      return
    commentDialogOpen.value = true
  }

  async function submitComment(body: string, options: { close: boolean }): Promise<void> {
    const card = currentCard.value
    if (!card)
      return
    const trimmed = body.trim()
    try {
      if (options.close) {
        const queue = trimmed.length > 0
          ? await rpc.$call('ghfs:add-queue-op', card.projectId, {
              action: 'close-with-comment',
              number: card.number,
              body: trimmed,
            })
          : await rpc.$call('ghfs:add-queue-op', card.projectId, {
              action: 'close',
              number: card.number,
            })
        const newest = newestOpId(queue.entries, card.number, [
          'close-with-comment',
          'close',
        ])
        if (newest)
          recordOp(card.projectId, newest)
      }
      else if (trimmed.length > 0) {
        const queue = await rpc.$call('ghfs:add-queue-op', card.projectId, {
          action: 'add-comment',
          number: card.number,
          body: trimmed,
        })
        const newest = newestOpId(queue.entries, card.number, ['add-comment'])
        if (newest)
          recordOp(card.projectId, newest)
      }
    }
    catch (error) {
      // eslint-disable-next-line no-console
      console.error('Cards: failed to queue op', error)
    }
    commentDialogOpen.value = false
    await performAdvance()
  }

  return {
    pile: computed(() => pile.value),
    currentCard,
    index: computed(() => index.value),
    total,
    remaining,
    done,
    advancing: computed(() => advancing.value),
    source: computed(() => source.value),
    commentDialogOpen,
    labelsPendingFor,
    processedOps: computed(() => processedOps.value),
    currentCanClose,
    currentIsTodo,
    currentIsIgnored,
    start,
    startFromCurrentContext,
    advance: performAdvance,
    recordOp,
    anotherPile,
    reset,
    doSkip,
    doMarkTodo,
    doMarkIgnore,
    doOpenLabels,
    doOpenComment,
    submitComment,
  }
}

function newestOpId(
  entries: { id: string, op: { number: number, action: string } }[],
  number: number,
  actions: string[],
): string | null {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i]
    if (!entry)
      continue
    if (entry.op.number === number && actions.includes(entry.op.action))
      return entry.id
  }
  return null
}

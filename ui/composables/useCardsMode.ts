import type {
  CardRef,
  CardsPileState,
  CardsSource,
  PileKindFilter,
  PileOptions,
  PilePick,
  QueueEntry,
  QueuedCardOp,
} from '#ghfs/server-types'
import type { ListItem } from '../types/list-item'
import { useDebounceFn } from '@vueuse/core'

export type { CardRef, CardsSource, PileKindFilter, PileOptions, PilePick, QueuedCardOp }

export const PILE_SIZE_CHOICES = [5, 10, 15, 30, 50] as const
export const PILE_PICK_CHOICES: ReadonlyArray<{ value: PilePick, label: string, hint: string }> = [
  { value: 'random', label: 'Random', hint: 'pick at random' },
  { value: 'recent', label: 'Most recent', hint: 'latest activity first' },
  { value: 'stale', label: 'Least active', hint: 'fewest comments + events' },
]
export const PILE_KIND_CHOICES: ReadonlyArray<{ value: PileKindFilter, label: string }> = [
  { value: 'all', label: 'Issues + PRs' },
  { value: 'issue', label: 'Issues only' },
  { value: 'pull', label: 'PRs only' },
]

export const DEFAULT_PILE_OPTIONS: PileOptions = {
  size: 10,
  pick: 'random',
  kind: 'all',
  excludeBots: true,
  excludeSelfInteracted: true,
}

const TRANSITION_MS = 360

const pile = ref<CardRef[]>([])
const index = ref(0)
const processedOps = ref<QueuedCardOp[]>([])
const source = ref<CardsSource>({ label: 'Cards' })
const options = ref<PileOptions>({ ...DEFAULT_PILE_OPTIONS })
const processedKeys = ref<Set<string>>(new Set())

// UI state — exposed so the cards page renders them and commands gate on them.
const advancing = ref(false)
const commentDialogOpen = ref(false)
const labelsPendingFor = ref<CardRef | null>(null)

// Pending source for the StartDialog: when the user clicks "Cards mode", the
// caller stashes the candidate items + descriptor here for the dialog to pick
// from. Becomes null again after the dialog closes.
const startDialogOpen = ref(false)
const pendingSourceItems = ref<ListItem[] | null>(null)
const pendingSource = ref<CardsSource>({ label: 'Cards' })

let hydrated = false
let hydratingPromise: Promise<void> | null = null
let saveFn: (() => void) | null = null

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

function isBotAuthor(it: ListItem): boolean {
  const author = it.author
  if (!author)
    return false
  const lower = author.toLowerCase()
  if (lower.endsWith('[bot]') || lower.endsWith('-bot') || lower === 'github-actions')
    return true
  // Project's bots list (only available when item.raw is present).
  // The raw sync state doesn't directly include the bots list; we approximate
  // by checking suffix above. The full bot list comes from project config and
  // applies to timeline rendering, not pile filtering — this stays best-effort.
  return false
}

/**
 * Was the current user the last person to interact with this item — i.e.
 * the user's reply (or other action) is the newest comment/event and nobody
 * else has chimed in since? Used by the "I'm waiting for a reply" filter.
 *
 * Falls back to checking the item creator when the full sync state isn't
 * loaded (hub-recent items don't carry comments + timeline).
 */
function isLatestInteractionByUser(it: ListItem, login: string): boolean {
  if (!login)
    return false
  const raw = it.raw
  if (!raw)
    return it.author === login

  let latestAt = ''
  let latestActor: string | null = null

  for (const c of raw.data.comments ?? []) {
    if (!c.createdAt)
      continue
    if (c.createdAt > latestAt) {
      latestAt = c.createdAt
      latestActor = c.author ?? null
    }
  }
  for (const e of raw.data.timeline ?? []) {
    if (!e.createdAt)
      continue
    if (e.createdAt > latestAt) {
      latestAt = e.createdAt
      latestActor = e.actor ?? null
    }
  }

  if (latestAt === '') {
    // No comments / events — the only "interaction" is the creation itself.
    return raw.data.item.author === login
  }
  return latestActor === login
}

/** Total interaction count — comments + timeline events. Used by "least active" pick. */
function activityCount(it: ListItem): number {
  const raw = it.raw
  if (!raw)
    return Number.POSITIVE_INFINITY // unknown → treat as "lots of activity"
  return (raw.data.comments?.length ?? 0) + (raw.data.timeline?.length ?? 0)
}

export function filterCandidates(
  items: ListItem[],
  opts: PileOptions,
  currentUserLogin: string | null,
): ListItem[] {
  let usable = items.filter(it => it.state === 'open')
  if (opts.kind === 'issue')
    usable = usable.filter(it => it.kind === 'issue')
  else if (opts.kind === 'pull')
    usable = usable.filter(it => it.kind === 'pull')
  if (opts.excludeBots)
    usable = usable.filter(it => !isBotAuthor(it))
  if (opts.excludeSelfInteracted && currentUserLogin)
    usable = usable.filter(it => !isLatestInteractionByUser(it, currentUserLogin))
  return usable
}

function pickFromCandidates(
  candidates: ListItem[],
  opts: PileOptions,
  excludeKeys: Set<string>,
): CardRef[] {
  const usable = candidates.filter(it => !excludeKeys.has(itemKey(it)))
  let ordered: ListItem[]
  switch (opts.pick) {
    case 'recent':
      ordered = [...usable].sort((a, b) =>
        (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
      )
      break
    case 'stale':
      // "Least active" — fewest comments + events first; tiebreak by oldest update.
      ordered = [...usable].sort((a, b) => {
        const ca = activityCount(a)
        const cb = activityCount(b)
        if (ca !== cb)
          return ca - cb
        return (a.updatedAt ?? '').localeCompare(b.updatedAt ?? '')
      })
      break
    case 'random':
    default:
      ordered = shuffle(usable)
      break
  }
  return ordered.slice(0, opts.size).map(toCardRef)
}

function snapshot(): CardsPileState {
  return {
    pile: pile.value,
    index: index.value,
    processedOps: processedOps.value,
    source: source.value,
    options: options.value,
  }
}

function applyServerState(next: CardsPileState | null): void {
  if (!next) {
    pile.value = []
    index.value = 0
    processedOps.value = []
    source.value = { label: 'Cards' }
    options.value = { ...DEFAULT_PILE_OPTIONS }
    processedKeys.value = new Set()
    return
  }
  pile.value = next.pile
  index.value = next.index
  processedOps.value = next.processedOps
  source.value = next.source
  options.value = next.options
  // Rebuild processedKeys from the cards we've already moved past so
  // anotherPile() / restartPile() exclude them.
  const keys = new Set<string>()
  for (let i = 0; i < Math.min(next.index, next.pile.length); i += 1) {
    const c = next.pile[i]
    if (c)
      keys.add(itemKey(c))
  }
  processedKeys.value = keys
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
  scheduleSave()
  await new Promise(resolve => setTimeout(resolve, TRANSITION_MS))
  advancing.value = false
}

function ensureSaver(): () => void {
  if (saveFn)
    return saveFn
  const rpc = useRpc()
  saveFn = useDebounceFn(() => {
    if (pile.value.length === 0)
      return
    rpc.$call('ghfs:cards-pile-set', snapshot()).catch(() => {})
  }, 300)
  return saveFn
}

function scheduleSave(): void {
  ensureSaver()()
}

export function useCardsMode() {
  const router = useRouter()
  const ui = useUiState()
  const { ensureLoaded } = useProjectPayload()
  const rpc = useRpc()

  const currentCard = computed<CardRef | null>(() => currentCardSync())
  const total = computed(() => pile.value.length)
  const remaining = computed(() => Math.max(0, pile.value.length - index.value))
  const done = computed(() => pile.value.length > 0 && index.value >= pile.value.length)

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
    return ui.isTodo(card.number)
  })

  const currentIsIgnored = computed<boolean>(() => {
    const card = currentCard.value
    if (!card)
      return false
    return ui.isIgnored(card.number)
  })

  async function hydrate(): Promise<void> {
    if (hydrated)
      return
    if (hydratingPromise)
      return hydratingPromise
    hydratingPromise = (async () => {
      try {
        const fetched = await rpc.$call('ghfs:cards-pile-get')
        applyServerState(fetched ?? null)
        hydrated = true
      }
      catch {
        // Treat hydration failure as an empty pile — user can start fresh.
        applyServerState(null)
      }
      finally {
        hydratingPromise = null
      }
    })()
    return hydratingPromise
  }

  /** Open the start dialog. Stash the candidate items + source for the dialog. */
  function openStartDialog(items: ListItem[], src: CardsSource): void {
    pendingSourceItems.value = items
    pendingSource.value = src
    startDialogOpen.value = true
  }

  /**
   * Generate a pile from `items` using `opts`, persist server-side, and
   * navigate to /cards. Used both by the start dialog (initial start) and
   * Restart (re-generate with same options).
   */
  async function start(
    items: ListItem[],
    src: CardsSource,
    opts: PileOptions,
    currentUserLogin: string | null,
  ): Promise<void> {
    const candidates = filterCandidates(items, opts, currentUserLogin)
    const next = pickFromCandidates(candidates, opts, new Set())
    if (next.length === 0)
      return
    pile.value = next
    index.value = 0
    processedOps.value = []
    processedKeys.value = new Set()
    source.value = src
    options.value = { ...opts }
    hydrated = true
    await rpc.$call('ghfs:cards-pile-set', snapshot()).catch(() => {})
    startDialogOpen.value = false
    pendingSourceItems.value = null
    if (router.currentRoute.value.path !== '/cards')
      await router.push('/cards')
  }

  function recordOp(projectId: string, opId: string): void {
    processedOps.value = [...processedOps.value, { projectId, opId }]
    scheduleSave()
  }

  /** Re-pick from the original source items, excluding cards already touched. */
  function anotherPile(items: ListItem[], currentUserLogin: string | null): void {
    const candidates = filterCandidates(items, options.value, currentUserLogin)
    const fresh = pickFromCandidates(candidates, options.value, processedKeys.value)
    if (fresh.length === 0)
      return
    pile.value = fresh
    index.value = 0
    processedOps.value = []
    scheduleSave()
  }

  /** Re-generate using the same options but a fresh source snapshot. */
  function restartPile(items: ListItem[], currentUserLogin: string | null): void {
    const candidates = filterCandidates(items, options.value, currentUserLogin)
    const fresh = pickFromCandidates(candidates, options.value, new Set())
    if (fresh.length === 0)
      return
    pile.value = fresh
    index.value = 0
    processedOps.value = []
    processedKeys.value = new Set()
    scheduleSave()
  }

  /** Clear pile both client- and server-side. */
  async function dismiss(): Promise<void> {
    pile.value = []
    index.value = 0
    processedOps.value = []
    processedKeys.value = new Set()
    options.value = { ...DEFAULT_PILE_OPTIONS }
    source.value = { label: 'Cards' }
    commentDialogOpen.value = false
    labelsPendingFor.value = null
    await rpc.$call('ghfs:cards-pile-clear').catch(() => {})
  }

  /** Local reset (no server clear) — used when navigating away mid-pile. */
  function reset(): void {
    commentDialogOpen.value = false
    labelsPendingFor.value = null
  }

  async function doSkip(): Promise<void> {
    if (!currentCard.value)
      return
    await performAdvance()
  }

  function goBack(): void {
    if (index.value <= 0)
      return
    index.value -= 1
    scheduleSave()
  }

  const canGoBack = computed(() => index.value > 0)

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

  /**
   * Resolve a source list from the current route and open the start dialog.
   * Lets a single global command (`cards.start`) wire up correctly from any
   * list.
   */
  function startFromCurrentContext(): void {
    const route = useRoute()
    if (route.path === '/recent') {
      const recent = useRecentFiltered()
      openStartDialog(recent.filteredItems.value, { label: 'Recent' })
      return
    }
    if (route.path === '/todo') {
      const todos = useHubTodos()
      openStartDialog(todos.listItems.value, { label: 'Todo' })
      return
    }
    const { filteredItems } = useFilteredItems()
    const state = useAppState()
    const activeId = useActiveProjectId().value
    if (activeId && state.payload.value) {
      const kindLabel = state.filters.kind === 'pull' ? 'Pull requests' : 'Issues'
      openStartDialog(filteredItems.value, {
        label: kindLabel,
        project: { id: activeId, repo: state.payload.value.repo.repo },
      })
      return
    }
    openStartDialog(filteredItems.value, { label: 'Cards' })
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
    options: computed(() => options.value),
    commentDialogOpen,
    labelsPendingFor,
    processedOps: computed(() => processedOps.value),
    currentCanClose,
    currentIsTodo,
    currentIsIgnored,
    startDialogOpen,
    pendingSourceItems: computed(() => pendingSourceItems.value),
    pendingSource: computed(() => pendingSource.value),
    hydrate,
    openStartDialog,
    startFromCurrentContext,
    start,
    advance: performAdvance,
    recordOp,
    anotherPile,
    restartPile,
    dismiss,
    reset,
    doSkip,
    doMarkTodo,
    doMarkIgnore,
    doOpenLabels,
    doOpenComment,
    goBack,
    canGoBack,
  }
}

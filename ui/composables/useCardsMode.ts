import type {
  CardRef,
  CardsPileState,
  CardsSharedState,
  CardsSource,
  PileKindFilter,
  PileOptions,
  PilePick,
  QueuedCardOp,
} from '#ghfs/rpc-types'
import type { QueueEntry, SeenEntry } from '#ghfs/server-types'
import type { SharedState } from 'devframe/utils/shared-state'
import type { ListItem } from '../types/list-item'
import { useDebounceFn } from '@vueuse/core'
import { fromSyncItem } from '../types/list-item'

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
  pick: 'recent',
  kind: 'all',
  excludeBots: true,
  excludeSelfInteracted: true,
  excludeSeen: true,
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
/** Initial option overrides for the dialog — e.g. kind seeded from active tab. */
const pendingInitialOptions = ref<Partial<PileOptions> | null>(null)

let sharedHandle: SharedState<CardsSharedState> | null = null
let sharedHandlePromise: Promise<SharedState<CardsSharedState>> | null = null
let saveFn: (() => void) | null = null

/**
 * Resolve once `state` has emitted its first `updated` event (the server's
 * reply to the initial `get`). Falls back to a timeout so a server that
 * has nothing saved still releases the hydrate spinner.
 */
function waitForFirstUpdate<T>(state: SharedState<T>, timeoutMs = 1500): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false
    const finish = () => {
      if (settled)
        return
      settled = true
      off()
      resolve()
    }
    const off = state.on('updated', finish)
    setTimeout(finish, timeoutMs)
  })
}

async function ensureShared(): Promise<SharedState<CardsSharedState>> {
  if (sharedHandle)
    return sharedHandle
  if (sharedHandlePromise)
    return sharedHandlePromise
  sharedHandlePromise = (async () => {
    const client = await useRpcClient()
    const state = await client.sharedState.get('ghfs:cards-pile', {
      initialValue: { pile: null },
    })
    // The client returns the local initialValue immediately; the server
    // reply arrives asynchronously and fires `updated`. Block hydrate
    // on it so the page doesn't flash empty → loaded for a saved pile.
    await waitForFirstUpdate(state)
    applyServerState(state.value().pile ?? null)
    state.on('updated', (next) => applyServerState(next.pile ?? null))
    sharedHandle = state
    return state
  })()
  return sharedHandlePromise
}

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

/**
 * True when no activity newer than `seen.lastSeenAt` exists on the item —
 * i.e. the user has effectively already triaged this in its current shape.
 * `updatedAt` covers body/title/state edits, the comment scan catches new
 * comments, the timeline scan catches label/assignee/close events. Items
 * without `raw` (e.g. hub-recent rows) fall back to the bare `updatedAt`.
 */
export function isUnchangedSince(it: ListItem, seen: SeenEntry): boolean {
  const lastSeenAt = seen.lastSeenAt
  if (!lastSeenAt)
    return false
  const raw = it.raw
  const itemUpdated = raw?.data.item.updatedAt ?? it.updatedAt ?? ''
  if (itemUpdated > lastSeenAt)
    return false
  if (raw) {
    for (const c of raw.data.comments ?? []) {
      if (c.createdAt && c.createdAt > lastSeenAt)
        return false
    }
    for (const e of raw.data.timeline ?? []) {
      if (e.createdAt && e.createdAt > lastSeenAt)
        return false
    }
  }
  return true
}

export function filterCandidates(
  items: ListItem[],
  opts: PileOptions,
  currentUserLogin: string | null,
  seenLookup?: (key: string) => SeenEntry | undefined,
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
  if (opts.excludeSeen && seenLookup) {
    usable = usable.filter((it) => {
      const seen = seenLookup(itemKey(it))
      return !seen || !isUnchangedSince(it, seen)
    })
  }
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
  // Marking the card as "seen" is driven by `Detail.vue` watching its
  // active item — that path covers both card pile and normal detail views
  // with the latest comment id needed for the timeline marker.
  index.value += 1
  scheduleSave()
  await new Promise(resolve => setTimeout(resolve, TRANSITION_MS))
  advancing.value = false
}

function ensureSaver(): () => void {
  if (saveFn)
    return saveFn
  saveFn = useDebounceFn(async () => {
    if (pile.value.length === 0)
      return
    const state = await ensureShared()
    state.mutate((draft) => { draft.pile = snapshot() })
  }, 300)
  return saveFn
}

function scheduleSave(): void {
  ensureSaver()()
}

export function useCardsMode() {
  const router = useRouter()
  const ui = useUiState()
  const seenHistory = useSeenHistory()
  const { ensureLoaded } = useProjectPayload()

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

  /**
   * The pending add-comment / close-with-comment op for the current card, if
   * one was queued during this session. Drives the "Edit comment" affordance:
   * coming back to a card with a pending comment re-opens the dialog in edit
   * mode rather than queuing a second comment.
   */
  const currentPendingComment = computed<QueueEntry | null>(() => {
    const card = currentCard.value
    if (!card)
      return null
    const state = useAppState(card.projectId)
    const ops = (state.payload.value?.queue.entries ?? []) as QueueEntry[]
    for (const e of ops) {
      if (e.op.number !== card.number)
        continue
      if (e.op.action === 'add-comment' || e.op.action === 'close-with-comment')
        return e
    }
    return null
  })

  async function hydrate(): Promise<void> {
    try {
      await ensureShared()
    }
    catch {
      // Connection failure: behave as empty pile so the user can start fresh.
      applyServerState(null)
    }
  }

  /** Open the start dialog. Stash the candidate items + source for the dialog. */
  function openStartDialog(
    items: ListItem[],
    src: CardsSource,
    initialOptions?: Partial<PileOptions>,
  ): void {
    pendingSourceItems.value = items
    pendingSource.value = src
    pendingInitialOptions.value = initialOptions ?? null
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
    const candidates = filterCandidates(items, opts, currentUserLogin, seenHistory.getSeenEntry)
    const next = pickFromCandidates(candidates, opts, new Set())
    if (next.length === 0)
      return
    pile.value = next
    index.value = 0
    processedOps.value = []
    processedKeys.value = new Set()
    source.value = src
    options.value = { ...opts }
    try {
      const state = await ensureShared()
      state.mutate((draft) => { draft.pile = snapshot() })
    }
    catch {
      // Persistence failure is non-fatal — the pile still renders locally.
    }
    startDialogOpen.value = false
    pendingSourceItems.value = null
    if (router.currentRoute.value.path !== '/cards')
      await router.push('/cards')
  }

  function recordOp(projectId: string, opId: string): void {
    // Deduplicate — editing a pending comment re-uses the same op id, and
    // going back over a card already acted on can replay the submit path.
    if (processedOps.value.some(o => o.projectId === projectId && o.opId === opId))
      return
    processedOps.value = [...processedOps.value, { projectId, opId }]
    scheduleSave()
  }

  /** Re-pick from the original source items, excluding cards already touched. */
  function anotherPile(items: ListItem[], currentUserLogin: string | null): void {
    const candidates = filterCandidates(items, options.value, currentUserLogin, seenHistory.getSeenEntry)
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
    const candidates = filterCandidates(items, options.value, currentUserLogin, seenHistory.getSeenEntry)
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
    try {
      const state = await ensureShared()
      state.mutate((draft) => { draft.pile = null })
    }
    catch {
      // Local state is already cleared; server may be unreachable but we
      // don't want to fail the dismiss action.
    }
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

  /**
   * Toggle the current card's todo state. Adding advances to the next card
   * (the usual triage flow); removing stays on the card so the user can do
   * something else (e.g. comment, ignore, or change their mind back).
   */
  async function doMarkTodo(): Promise<void> {
    const card = currentCard.value
    if (!card)
      return
    await ensureLoaded(card.projectId)
    if (ui.isTodo(card.number)) {
      ui.removeTodo(card.number)
      return
    }
    ui.addTodo(card.number)
    await performAdvance()
  }

  async function doMarkIgnore(): Promise<void> {
    const card = currentCard.value
    if (!card)
      return
    await ensureLoaded(card.projectId)
    if (ui.isIgnored(card.number)) {
      ui.removeIgnored(card.number)
      return
    }
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
    const state = useAppState()
    const activeId = useActiveProjectId().value
    const payload = state.payload.value
    if (activeId && payload) {
      // Hand the dialog both issues and PRs so the user can switch the kind
      // filter from there. Seed the kind from the tab they're currently on.
      const items: ListItem[] = []
      for (const sync of Object.values(payload.syncState.items)) {
        const data = sync.data.item
        if (data.state !== 'open')
          continue
        if (ui.isIgnored(data.number))
          continue
        items.push(fromSyncItem(sync, payload.projectId, payload.repo.repo))
      }
      const initialKind: PileKindFilter = state.filters.kind === 'pull' ? 'pull' : 'issue'
      openStartDialog(
        items,
        { label: payload.repo.repo, project: { id: activeId, repo: payload.repo.repo } },
        { kind: initialKind },
      )
      return
    }
    const { filteredItems } = useFilteredItems()
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
    currentPendingComment,
    startDialogOpen,
    pendingSourceItems: computed(() => pendingSourceItems.value),
    pendingSource: computed(() => pendingSource.value),
    pendingInitialOptions: computed(() => pendingInitialOptions.value),
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

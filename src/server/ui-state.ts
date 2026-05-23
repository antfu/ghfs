import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'pathe'

export const UI_STATE_FILE = '.ui.json'

export type PrTabId = 'conversation' | 'commits' | 'changes'

export interface UserOverride {
  login?: string
  name?: string
  avatarUrl?: string
}

export interface UiState {
  /** Map of issue number (string) → pending comment draft body. */
  drafts: Record<string, string>
  /** Size (in percent) of the list pane in the Splitpanes layout. */
  listPaneSize?: number
  /** Last tab selected on the PR detail panel. */
  lastPrTab?: PrTabId
  /** Override for the authenticated user info shown in the UI. */
  userOverride?: UserOverride
  /** When set, the server triggers `sync` on this interval. Honoured in ui mode. */
  autoSyncIntervalMs?: number
  /** Issue/PR numbers saved to the todo list. Auto-pruned when items close/merge. */
  todos?: number[]
  /** Issue/PR numbers hidden from list views via cards mode "mark as ignore". */
  ignored?: number[]
  /**
   * Map of `${projectId}#${number}` → last-view record. `lastSeenAt` is the
   * wall-clock timestamp the user last had the item open; activity newer
   * than this is treated as unseen by the pile filter, the row gray-out
   * and the timeline "Last seen" marker. `lastCommentId` pins the marker
   * position to the comment that was the most recent at the time of view.
   */
  seenHistory?: Record<string, SeenEntry>
}

export interface SeenEntry {
  /** GitHub comment id of the most recent comment when last viewed, or null if the item had no comments. */
  lastCommentId: number | null
  /** ISO timestamp of the last detail/card-pile view. */
  lastSeenAt: string
}

export function createEmptyUiState(): UiState {
  return { drafts: {} }
}

function normalizeNumberArray(value: unknown): number[] | undefined {
  if (!Array.isArray(value))
    return undefined
  const out: number[] = []
  const seen = new Set<number>()
  for (const entry of value) {
    const n = typeof entry === 'number' ? entry : Number(entry)
    if (!Number.isInteger(n) || n <= 0 || seen.has(n))
      continue
    seen.add(n)
    out.push(n)
  }
  return out.length > 0 ? out : undefined
}

function normalizePrTab(value: unknown): PrTabId | undefined {
  if (value === 'conversation' || value === 'commits' || value === 'changes')
    return value
  return undefined
}

function normalizeSeenHistory(value: unknown): Record<string, SeenEntry> | undefined {
  if (!value || typeof value !== 'object')
    return undefined
  const out: Record<string, SeenEntry> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof key !== 'string' || key.length === 0)
      continue
    if (!raw || typeof raw !== 'object')
      continue
    const entry = raw as Record<string, unknown>
    const lastSeenAt = typeof entry.lastSeenAt === 'string' && entry.lastSeenAt.length > 0
      ? entry.lastSeenAt
      : null
    if (!lastSeenAt)
      continue
    const lastCommentId = typeof entry.lastCommentId === 'number' && Number.isFinite(entry.lastCommentId)
      ? entry.lastCommentId
      : null
    out[key] = { lastCommentId, lastSeenAt }
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function normalizeUserOverride(value: unknown): UserOverride | undefined {
  if (!value || typeof value !== 'object')
    return undefined
  const raw = value as Record<string, unknown>
  const out: UserOverride = {}
  if (typeof raw.login === 'string' && raw.login.trim())
    out.login = raw.login.trim()
  if (typeof raw.name === 'string' && raw.name.trim())
    out.name = raw.name.trim()
  if (typeof raw.avatarUrl === 'string' && raw.avatarUrl.startsWith('https://'))
    out.avatarUrl = raw.avatarUrl.trim()
  return Object.keys(out).length > 0 ? out : undefined
}

export async function loadUiState(storageDirAbsolute: string): Promise<UiState> {
  try {
    const raw = await readFile(join(storageDirAbsolute, UI_STATE_FILE), 'utf8')
    const parsed = JSON.parse(raw) as Partial<UiState>
    const drafts: Record<string, string> = {}
    if (parsed.drafts && typeof parsed.drafts === 'object') {
      for (const [key, value] of Object.entries(parsed.drafts)) {
        if (typeof value === 'string' && value.length > 0)
          drafts[key] = value
      }
    }
    return {
      drafts,
      listPaneSize: typeof parsed.listPaneSize === 'number' ? parsed.listPaneSize : undefined,
      lastPrTab: normalizePrTab(parsed.lastPrTab),
      userOverride: normalizeUserOverride(parsed.userOverride),
      autoSyncIntervalMs: normalizeAutoSyncInterval(parsed.autoSyncIntervalMs),
      todos: normalizeNumberArray(parsed.todos),
      ignored: normalizeNumberArray(parsed.ignored),
      seenHistory: normalizeSeenHistory(parsed.seenHistory),
    }
  }
  catch {
    return createEmptyUiState()
  }
}

function normalizeAutoSyncInterval(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value))
    return undefined
  if (value < 60_000 || value > 3_600_000)
    return undefined
  return Math.round(value)
}

export async function saveUiState(storageDirAbsolute: string, state: UiState): Promise<void> {
  await mkdir(storageDirAbsolute, { recursive: true })
  const tab = normalizePrTab(state.lastPrTab)
  const override = normalizeUserOverride(state.userOverride)
  const interval = normalizeAutoSyncInterval(state.autoSyncIntervalMs)
  const todos = normalizeNumberArray(state.todos)
  const ignored = normalizeNumberArray(state.ignored)
  const seenHistory = normalizeSeenHistory(state.seenHistory)
  const clean: UiState = {
    drafts: { ...state.drafts },
    ...(state.listPaneSize != null ? { listPaneSize: state.listPaneSize } : {}),
    ...(tab ? { lastPrTab: tab } : {}),
    ...(override ? { userOverride: override } : {}),
    ...(interval != null ? { autoSyncIntervalMs: interval } : {}),
    ...(todos ? { todos } : {}),
    ...(ignored ? { ignored } : {}),
    ...(seenHistory ? { seenHistory } : {}),
  }
  await writeFile(
    join(storageDirAbsolute, UI_STATE_FILE),
    `${JSON.stringify(clean, null, 2)}\n`,
    'utf8',
  )
}

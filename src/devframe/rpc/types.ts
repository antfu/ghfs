import type { PendingOp } from '../../execute/types'
import type { CommentTemplate } from '../../hub/config'
import type { RepoTemplate, RepoTemplatesCache } from '../../server/repo-templates'
import type { ExecuteTriggerOptions, InitialPayload, QueueState, RemoteStatus, RepoLabel, RepoMeta, SeenEntry, SyncTriggerOptions, UiState } from '../../server/types'
import type { ActivityResult } from '../../sync/activity'
import type { SyncProgressSnapshot, SyncStage, SyncSummary } from '../../sync/contracts'
import type { ExecutionResult } from '../../types/execution'
import type { IssueStateReason, ProviderReviewDecision, ReactionTarget } from '../../types/provider'
import type { SyncState } from '../../types/sync-state'
import type { ReactionContent } from '../../utils/reactions'

export type { ActivityResult, CommentTemplate, RepoTemplate, RepoTemplatesCache }

export interface ProjectSummary {
  id: string
  path: string
  name: string
  repo: string
  storageDir: string
  hasToken: boolean
  itemCount: number
  openIssues: number
  openPulls: number
  /** Items with `createdAt` in today's UTC day, regardless of state. */
  newIssuesToday: number
  newPullsToday: number
  lastSyncedAt?: string
  /** Most recent `item.updatedAt` across the project's tracked items. */
  lastActivityAt?: string
  /**
   * Repository label registry (names, colors, descriptions) from the most
   * recent repo snapshot. Consumed by hub-level views (recent, todos) to
   * color labels correctly for items belonging to non-active projects.
   */
  labels?: RepoLabel[]
}

export interface ProjectInitialPayload extends InitialPayload {
  projectId: string
  /** Cached `.github/replies.yml` content; hydrates the comment template picker. */
  repoTemplates: RepoTemplatesCache
}

export interface GhfsCapabilities {
  mode: 'ui' | 'hub'
  ghfsVersion: string
  projects: ProjectSummary[]
}

export interface HubInfo {
  roots: string[]
  launchCwd: string
  launchCwdInRoots: boolean
}

export interface HubSettings {
  autoSyncIntervalMs?: number
  swrSyncEnabled?: boolean
  swrCacheTimeoutMs?: number
}

/**
 * Patch shape for `ghfs:hub-set-settings`. Each field is treated as:
 * - omitted / `undefined` → don't touch
 * - `null` → clear (back to the implicit default)
 * - value → set to value
 */
export interface HubSettingsPatch {
  autoSyncIntervalMs?: number | null
  swrSyncEnabled?: boolean | null
  swrCacheTimeoutMs?: number | null
}

export interface HubScannedProject {
  path: string
  name: string
  /** Resolved `owner/repo` from git remotes / package.json. Scans drop repos that can't be resolved. */
  repo: string
  enabled: boolean
  /** Data URL of a logo found in the project directory, or null. */
  iconDataUrl: string | null
}

export interface HubRecentItem {
  projectId: string
  repo: string
  kind: 'issue' | 'pull'
  number: number
  title: string
  state: 'open' | 'closed'
  stateReason?: IssueStateReason | null
  pullIsDraft?: boolean
  pullMerged?: boolean
  pullReviewDecision?: ProviderReviewDecision | null
  updatedAt: string
  author: string | null
  authorAvatarUrl?: string
  labels: string[]
}

export interface HubTodoItem {
  projectId: string
  repo: string
  kind: 'issue' | 'pull'
  number: number
  title: string
  state: 'open' | 'closed'
  updatedAt: string
  author: string | null
  authorAvatarUrl?: string
  labels: string[]
}

export interface CardRef {
  projectId: string
  repo: string
  kind: 'issue' | 'pull'
  number: number
  title: string
  authorAvatarUrl?: string
  author?: string | null
}

export interface CardsSource {
  /** Human-readable label, displayed in the cards page header. */
  label: string
  /** When set, the header renders a ProjectIcon + this repo's owner/name. */
  project?: { id: string, repo: string }
}

export type PilePick = 'recent' | 'random' | 'stale'

/**
 * Which kinds of items to include in the pile.
 * - `issue` / `pull` restrict to that kind
 * - `all` includes both
 */
export type PileKindFilter = 'issue' | 'pull' | 'all'

export interface PileOptions {
  size: number
  pick: PilePick
  kind: PileKindFilter
  excludeBots: boolean
  excludeSelfInteracted: boolean
  /**
   * Skip items the user has already triaged in a previous pile, until they
   * change upstream (new comment, body edit, timeline event). The "seen"
   * fingerprint is stored under `ui.json#seenHistory`.
   */
  excludeSeen: boolean
}

export interface QueuedCardOp {
  projectId: string
  opId: string
}

export interface CardsPileState {
  pile: CardRef[]
  index: number
  processedOps: QueuedCardOp[]
  source: CardsSource
  options: PileOptions
}

export interface HubQueueGroup {
  projectId: string
  repo: string
  queue: QueueState
}

/**
 * Event names broadcast from the server to all clients. Each payload is
 * `{ projectId, ...event }` so the client can route updates to the
 * right project bucket.
 */
export const PROJECT_EVENT_NAMES = [
  'ghfs:onSyncStageStart',
  'ghfs:onSyncProgress',
  'ghfs:onSyncStageEnd',
  'ghfs:onSyncComplete',
  'ghfs:onSyncError',
  'ghfs:onExecuteStart',
  'ghfs:onExecuteProgress',
  'ghfs:onExecuteComplete',
  'ghfs:onExecuteError',
  'ghfs:onSyncStateChange',
  'ghfs:onQueueChange',
  'ghfs:onRemoteStatusChange',
] as const

export type ProjectEventName = typeof PROJECT_EVENT_NAMES[number]

export interface GhfsServerFunctions {
  'ghfs:capabilities': () => Promise<GhfsCapabilities>
  'ghfs:list-projects': () => Promise<ProjectSummary[]>
  'ghfs:initial-payload': (projectId: string) => Promise<ProjectInitialPayload>
  'ghfs:sync-state': (projectId: string) => Promise<SyncState>
  'ghfs:queue-state': (projectId: string) => Promise<QueueState>
  'ghfs:repo-meta': (projectId: string) => Promise<RepoMeta>
  'ghfs:trigger-sync': (projectId: string, options: SyncTriggerOptions) => Promise<SyncSummary>
  'ghfs:force-sync': (projectId: string) => Promise<SyncSummary>
  'ghfs:execute-queue': (projectId: string, options: ExecuteTriggerOptions) => Promise<ExecutionResult>
  'ghfs:add-queue-op': (projectId: string, op: PendingOp) => Promise<QueueState>
  'ghfs:update-queue-op': (projectId: string, id: string, op: PendingOp) => Promise<QueueState>
  'ghfs:remove-queue-op': (projectId: string, id: string) => Promise<QueueState>
  'ghfs:clear-queue': (projectId: string) => Promise<QueueState>
  'ghfs:check-remote': (projectId: string) => Promise<RemoteStatus>
  'ghfs:open-in-editor': (projectId: string, filePath: string) => Promise<void>
  'ghfs:open-folder': (projectId: string) => Promise<void>
  'ghfs:save-ui-state': (projectId: string, state: UiState) => Promise<void>
  'ghfs:get-pull-patch': (projectId: string, number: number) => Promise<string | null>
  'ghfs:get-viewer-reactions': (projectId: string, number: number, target: ReactionTarget) => Promise<ReactionContent[]>
  'ghfs:get-project-icon': (projectId: string) => Promise<string | null>
  'ghfs:project-activity': (projectId: string, days?: number) => Promise<ActivityResult>
  'ghfs:hub-activity': (days?: number) => Promise<ActivityResult>
  'ghfs:hub-info': () => Promise<HubInfo>
  'ghfs:hub-scan': () => Promise<HubScannedProject[]>
  'ghfs:hub-enable': (path: string) => Promise<{ id: string }>
  'ghfs:hub-disable': (id: string) => Promise<{ removed: boolean }>
  'ghfs:hub-add-root': (path: string) => Promise<HubInfo>
  'ghfs:hub-remove-root': (path: string) => Promise<HubInfo>
  'ghfs:hub-recent-items': (limit?: number) => Promise<HubRecentItem[]>
  'ghfs:hub-todos': () => Promise<HubTodoItem[]>
  'ghfs:hub-queue': () => Promise<HubQueueGroup[]>
  'ghfs:hub-execute-queue': (options: { projectId?: string }) => Promise<ExecutionResult[]>
  'ghfs:hub-settings': () => Promise<HubSettings>
  'ghfs:hub-set-settings': (patch: HubSettingsPatch) => Promise<HubSettings>
  'ghfs:hub-seen-history': () => Promise<Record<string, SeenEntry>>
  'ghfs:hub-comment-templates': () => Promise<CommentTemplate[]>
  'ghfs:set-hub-comment-templates': (templates: CommentTemplate[]) => Promise<CommentTemplate[]>
  'ghfs:repo-templates': (projectId: string) => Promise<RepoTemplatesCache>
  'ghfs:set-repo-templates': (projectId: string, templates: RepoTemplate[]) => Promise<RepoTemplatesCache>
}

export interface GhfsClientFunctions {
  'ghfs:onSyncStageStart': (event: { projectId: string, stage: SyncStage, message: string }) => void
  'ghfs:onSyncProgress': (event: { projectId: string, stage: SyncStage, message?: string, snapshot: SyncProgressSnapshot }) => void
  'ghfs:onSyncStageEnd': (event: { projectId: string, stage: SyncStage, durationMs: number }) => void
  'ghfs:onSyncComplete': (event: { projectId: string, summary: SyncSummary }) => void
  'ghfs:onSyncError': (event: { projectId: string, message: string }) => void
  'ghfs:onExecuteStart': (event: { projectId: string, planned: number }) => void
  'ghfs:onExecuteProgress': (event: { projectId: string, completed: number, planned: number, applied: number, failed: number, detail: ExecutionResult['details'][number] }) => void
  'ghfs:onExecuteComplete': (event: { projectId: string, result: ExecutionResult }) => void
  'ghfs:onExecuteError': (event: { projectId: string, message: string }) => void
  'ghfs:onSyncStateChange': (event: { projectId: string, state: SyncState }) => void
  'ghfs:onQueueChange': (event: { projectId: string, queue: QueueState }) => void
  'ghfs:onRemoteStatusChange': (event: { projectId: string, status: RemoteStatus }) => void
  'ghfs:onProjectsChange': () => void
  'ghfs:onHubInfoChange': (event: HubInfo) => void
}

/**
 * The card pile is a singleton synced via devframe's `sharedState` host so
 * that page refreshes return to the same pile + progress. `pile === null`
 * means no pile is loaded; otherwise it carries the full triage session.
 */
export interface CardsSharedState {
  pile: CardsPileState | null
}

declare module 'devframe/types' {
  interface DevToolsRpcSharedStates {
    'ghfs:cards-pile': CardsSharedState
  }
}

import type { DevToolsNodeContext } from 'devframe'
import { addQueueOp } from './add-queue-op'
import { capabilities } from './capabilities'
import { checkRemote } from './check-remote'
import { clearQueue } from './clear-queue'
import { executeQueue } from './execute-queue'
import { forceSync } from './force-sync'
import { getProjectIcon } from './get-project-icon'
import { getPullPatch } from './get-pull-patch'
import { getViewerReactions } from './get-viewer-reactions'
import { hubActivity } from './hub-activity'
import { hubAddRoot } from './hub-add-root'
import { hubCommentTemplates, setHubCommentTemplatesRpc } from './hub-comment-templates'
import { hubDisable } from './hub-disable'
import { hubEnable } from './hub-enable'
import { hubExecuteQueue } from './hub-execute-queue'
import { hubInfo } from './hub-info'
import { hubQueue } from './hub-queue'
import { hubRecentItems } from './hub-recent-items'
import { hubRemoveRoot } from './hub-remove-root'
import { hubScan } from './hub-scan'
import { hubSeenHistory } from './hub-seen-history'
import { hubSetSettings } from './hub-set-settings'
import { hubSettings } from './hub-settings'
import { hubTodos } from './hub-todos'
import { initialPayload } from './initial-payload'
import { listProjects } from './list-projects'
import { openFolder } from './open-folder'
import { openInEditor } from './open-in-editor'
import { projectActivity } from './project-activity'
import { queueState } from './queue-state'
import { removeQueueOp } from './remove-queue-op'
import { repoMeta } from './repo-meta'
import { repoTemplates, setRepoTemplates } from './repo-templates'
import { saveUiState } from './save-ui-state'
import { syncState } from './sync-state'
import { triggerSync } from './trigger-sync'
import { updateQueueOp } from './update-queue-op'

export * from './types'
export { setHubContext, setProjectRegistry, setUiStateSavedCallback } from './utils'

export const rpcFunctions = [
  capabilities,
  listProjects,
  initialPayload,
  syncState,
  queueState,
  repoMeta,
  triggerSync,
  forceSync,
  executeQueue,
  addQueueOp,
  updateQueueOp,
  removeQueueOp,
  clearQueue,
  checkRemote,
  openInEditor,
  openFolder,
  saveUiState,
  getPullPatch,
  getViewerReactions,
  getProjectIcon,
  projectActivity,
  hubActivity,
  hubQueue,
  hubExecuteQueue,
  hubRecentItems,
  hubTodos,
  hubInfo,
  hubScan,
  hubEnable,
  hubDisable,
  hubAddRoot,
  hubRemoveRoot,
  hubSettings,
  hubSetSettings,
  hubSeenHistory,
  hubCommentTemplates,
  setHubCommentTemplatesRpc,
  repoTemplates,
  setRepoTemplates,
] as const

export function registerGhfsRpc(ctx: DevToolsNodeContext): void {
  for (const fn of rpcFunctions)
    ctx.rpc.register(fn as any)
}

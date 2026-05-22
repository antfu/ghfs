import type { DevToolsNodeContext } from 'devframe'
import type { GhfsResolvedConfig } from '../types'
import type { ProjectRegistry } from './project-context'
import { createAutoSyncTimer } from '../hub/auto-sync'
import { slugifyRepoName } from '../server/portless'
import { loadUiState } from '../server/ui-state'
import { buildProjectContext, closeProjectContext } from './project-factory'
import { registerGhfsRpc, setProjectRegistry, setUiStateSavedCallback } from './rpc'

export interface UiModeFlags {
  cwd: string
  repo: string
  initialToken?: string
}

export interface UiModeOptions {
  config: GhfsResolvedConfig
  repo: string
  initialToken?: string
  onRequestToken?: () => Promise<string>
}

export interface UiModeHandle {
  registry: ProjectRegistry
  close: () => Promise<void>
}

export async function setupUiMode(
  devframeCtx: DevToolsNodeContext,
  options: UiModeOptions,
): Promise<UiModeHandle> {
  const project = await buildProjectContext({
    id: slugifyRepoName(options.repo) || 'default',
    name: options.repo,
    path: options.config.cwd,
    config: options.config,
    repo: options.repo,
    initialToken: options.initialToken,
    onRequestToken: options.onRequestToken,
    devframeCtx,
  })

  const registry: ProjectRegistry = {
    mode: 'ui',
    getProject: id => (id === project.id ? project : null),
    listProjects: () => [project],
    close: async () => closeProjectContext(project),
  }

  // UI mode persists the auto-sync interval in the project's per-UI state.
  const uiState = await loadUiState(project.storageDirAbsolute)
  const autoSync = createAutoSyncTimer({
    registry,
    initialIntervalMs: uiState.autoSyncIntervalMs,
  })

  setProjectRegistry(devframeCtx, registry)
  setUiStateSavedCallback(devframeCtx, (next) => {
    autoSync.setInterval(next.autoSyncIntervalMs)
  })
  registerGhfsRpc(devframeCtx)

  return {
    registry,
    close: async () => {
      autoSync.close()
      await registry.close()
    },
  }
}

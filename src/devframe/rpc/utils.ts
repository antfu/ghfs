import type { DevToolsNodeContext } from 'devframe'
import type { UiState } from '../../server/types'
import type { ProjectRegistry } from '../project-context'
import type { HubRpcContext } from './hub-context'
import { diagnostics } from '../../logger'

const registryMap = new WeakMap<DevToolsNodeContext, ProjectRegistry>()
const hubMap = new WeakMap<DevToolsNodeContext, HubRpcContext>()
const uiStateSavedMap = new WeakMap<DevToolsNodeContext, (state: UiState, projectId: string) => void>()

export function getProjectRegistry(ctx: DevToolsNodeContext): ProjectRegistry {
  const reg = registryMap.get(ctx)
  if (!reg)
    throw diagnostics.GHFS0206({ detail: 'Project registry not initialized for this devframe context.' })
  return reg
}

export function setProjectRegistry(ctx: DevToolsNodeContext, registry: ProjectRegistry): void {
  registryMap.set(ctx, registry)
}

export function getHubContext(ctx: DevToolsNodeContext): HubRpcContext {
  const hub = hubMap.get(ctx)
  if (!hub)
    throw diagnostics.GHFS0206({ detail: 'Hub context not initialized for this devframe context.' })
  return hub
}

export function setHubContext(ctx: DevToolsNodeContext, hub: HubRpcContext): void {
  hubMap.set(ctx, hub)
}

export function getUiStateSavedCallback(ctx: DevToolsNodeContext): ((state: UiState, projectId: string) => void) | undefined {
  return uiStateSavedMap.get(ctx)
}

export function setUiStateSavedCallback(ctx: DevToolsNodeContext, cb: (state: UiState, projectId: string) => void): void {
  uiStateSavedMap.set(ctx, cb)
}

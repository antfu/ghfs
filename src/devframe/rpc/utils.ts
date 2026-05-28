import type { DevframeNodeContext } from 'devframe'
import type { UiState } from '../../server/types'
import type { ProjectRegistry } from '../project-context'
import type { HubRpcContext } from './hub-context'
import { diagnostics } from '../../logger'

const registryMap = new WeakMap<DevframeNodeContext, ProjectRegistry>()
const hubMap = new WeakMap<DevframeNodeContext, HubRpcContext>()
const uiStateSavedMap = new WeakMap<DevframeNodeContext, (state: UiState, projectId: string) => void>()

export function getProjectRegistry(ctx: DevframeNodeContext): ProjectRegistry {
  const reg = registryMap.get(ctx)
  if (!reg)
    throw diagnostics.GHFS0206({ detail: 'Project registry not initialized for this devframe context.' })
  return reg
}

export function setProjectRegistry(ctx: DevframeNodeContext, registry: ProjectRegistry): void {
  registryMap.set(ctx, registry)
}

export function getHubContext(ctx: DevframeNodeContext): HubRpcContext {
  const hub = hubMap.get(ctx)
  if (!hub)
    throw diagnostics.GHFS0206({ detail: 'Hub context not initialized for this devframe context.' })
  return hub
}

export function setHubContext(ctx: DevframeNodeContext, hub: HubRpcContext): void {
  hubMap.set(ctx, hub)
}

export function getUiStateSavedCallback(ctx: DevframeNodeContext): ((state: UiState, projectId: string) => void) | undefined {
  return uiStateSavedMap.get(ctx)
}

export function setUiStateSavedCallback(ctx: DevframeNodeContext, cb: (state: UiState, projectId: string) => void): void {
  uiStateSavedMap.set(ctx, cb)
}

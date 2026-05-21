import type { DevToolsNodeContext } from 'devframe'
import type { GhfsResolvedConfig } from '../types'
import type { ProjectRegistry } from './project-context'
import { slugifyRepoName } from '../server/portless'
import { buildProjectContext, closeProjectContext } from './project-factory'
import { registerProjectRpc } from './shared-rpc'

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

  registerProjectRpc(devframeCtx, registry)

  return {
    registry,
    close: () => registry.close(),
  }
}

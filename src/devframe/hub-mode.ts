import type { DevToolsNodeContext } from 'devframe'
import type { ProjectContext, ProjectRegistry } from './project-context'
import type { HubInfo } from './rpc/types'
import { resolve } from 'pathe'
import { resolveConfig } from '../config/load'
import { resolveRepo } from '../config/repo'
import { createAutoSyncTimer } from '../hub/auto-sync'
import {
  addHubRoot,
  loadHubConfig,
  setEnabledProjects,
} from '../hub/config'
import { slugifyRepoName } from '../server/portless'
import { buildProjectContext, closeProjectContext } from './project-factory'
import { registerGhfsRpc, setHubContext, setProjectRegistry } from './rpc'

export interface HubModeOptions {
  /**
   * The cwd the CLI was launched from. Used to seed the roots list on first
   * launch and to drive the onboarding prompt on subsequent launches.
   */
  cwd: string
  /** Override for the user home directory (tests). */
  homeDir?: string
  /** Token shared across all projects. */
  initialToken?: string
  /** Re-prompt callback if a project needs a fresher token. */
  onRequestToken?: () => Promise<string>
}

export interface HubModeHandle {
  registry: ProjectRegistry
  close: () => Promise<void>
}

export async function setupHubMode(
  devframeCtx: DevToolsNodeContext,
  options: HubModeOptions,
): Promise<HubModeHandle> {
  const launchCwd = resolve(options.cwd)
  const homeDir = options.homeDir
  const roots = new Set<string>()
  const projects = new Map<string, ProjectContext>()

  // Single in-flight promise serializes config-mutating operations so two
  // concurrent RPCs don't race on the shared hub.json file.
  let mutating: Promise<void> = Promise.resolve()
  async function withLock<T>(fn: () => Promise<T>): Promise<T> {
    const next = mutating.then(fn, fn)
    mutating = next.then(() => {}, () => {})
    return next
  }

  function buildHubInfo(): HubInfo {
    const sorted = Array.from(roots).sort()
    return {
      roots: sorted,
      launchCwd,
      launchCwdInRoots: roots.has(launchCwd),
    }
  }

  function broadcastProjectsChange(): void {
    devframeCtx.rpc.broadcast({
      method: 'ghfs:onProjectsChange' as never,
      args: [{}] as never,
    })
  }

  function broadcastHubInfoChange(): void {
    devframeCtx.rpc.broadcast({
      method: 'ghfs:onHubInfoChange' as never,
      args: [buildHubInfo()] as never,
    })
  }

  async function loadProjectByPath(path: string): Promise<ProjectContext> {
    const absolutePath = resolve(path)
    const config = await resolveConfig({ cwd: absolutePath })
    const repo = await resolveRepo({
      cwd: absolutePath,
      configRepo: config.repo,
      interactive: false,
    })
    const repoName = repo.repo
    let id = slugifyRepoName(repoName) || absolutePath.split('/').pop() || 'project'
    // Ensure uniqueness in case two enabled projects share the same trailing name.
    while (projects.has(id))
      id = `${id}-${Math.random().toString(36).slice(2, 6)}`

    const project = await buildProjectContext({
      id,
      name: repoName,
      path: absolutePath,
      config: { ...config, repo: repoName },
      repo: repoName,
      initialToken: options.initialToken,
      onRequestToken: options.onRequestToken,
      // Slower polling in hub mode to avoid hammering the API across N repos.
      pollerIntervalMs: 120_000,
      devframeCtx,
    })
    return project
  }

  async function loadEnabledProjects(paths: string[]): Promise<void> {
    for (const path of paths) {
      try {
        const ctx = await loadProjectByPath(path)
        projects.set(ctx.id, ctx)
      }
      catch (error) {
        console.warn(`[ghfs hub] skipped ${path}: ${(error as Error).message}`)
      }
    }
  }

  async function clearProjects(): Promise<void> {
    const all = Array.from(projects.values())
    projects.clear()
    await Promise.all(all.map(closeProjectContext))
  }

  // Boot: load config, auto-add launchCwd on first launch, hydrate projects.
  let config = await loadHubConfig({ homeDir })
  if (config.roots.length === 0)
    config = await addHubRoot({ homeDir, path: launchCwd })
  for (const root of config.roots)
    roots.add(root)
  await loadEnabledProjects(config.enabledProjects.map(p => p.path))

  const registry: ProjectRegistry = {
    mode: 'hub',
    getProject: id => projects.get(id) ?? null,
    listProjects: () => Array.from(projects.values()),
    close: clearProjects,
  }

  const autoSync = createAutoSyncTimer({
    registry,
    initialIntervalMs: config.autoSyncIntervalMs,
  })

  async function persistEnabled(): Promise<void> {
    await setEnabledProjects({
      homeDir,
      paths: Array.from(projects.values()).map(p => p.path),
    })
  }

  setProjectRegistry(devframeCtx, registry)
  setHubContext(devframeCtx, {
    devframeCtx,
    homeDir,
    launchCwd,
    roots,
    projects,
    withLock,
    buildHubInfo,
    broadcastProjectsChange,
    broadcastHubInfoChange,
    loadProjectByPath,
    persistEnabled,
    autoSync,
  })
  registerGhfsRpc(devframeCtx)
  await devframeCtx.rpc.sharedState.get('ghfs:cards-pile', {
    initialValue: { pile: null },
  })

  return {
    registry,
    close: async () => {
      autoSync.close()
      await clearProjects()
    },
  }
}

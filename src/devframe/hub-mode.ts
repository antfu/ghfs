import type { DevToolsNodeContext } from 'devframe'
import type { HubProjectEntry } from '../hub/config'
import type { ProjectContext, ProjectRegistry } from './project-context'
import { stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import process from 'node:process'
import { defineRpcFunction } from 'devframe'
import { isAbsolute, resolve } from 'pathe'
import { resolveConfig } from '../config/load'
import { resolveRepo } from '../config/repo'
import { createAutoSyncTimer } from '../hub/auto-sync'
import { loadHubConfig, patchHubSettings, saveHubConfig } from '../hub/config'
import { scanGitRepos } from '../hub/scanner'
import { CodedError, log } from '../logger'
import { slugifyRepoName } from '../server/portless'
import { findProjectIcon } from '../utils/project-icon'
import { buildProjectContext, closeProjectContext } from './project-factory'
import { registerProjectRpc } from './shared-rpc'

export interface HubSettings {
  autoSyncIntervalMs?: number
}

export interface HubScannedProject {
  path: string
  name: string
  enabled: boolean
  /** Data URL of a logo found in the project directory, or null. */
  iconDataUrl: string | null
}

export interface HubModeOptions {
  /** Hub root: the parent directory of multiple project checkouts. */
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
  let hubCwd = resolve(options.cwd)
  const homeDir = options.homeDir
  const projects = new Map<string, ProjectContext>()

  function broadcastProjectsChange(): void {
    // Signal-only — clients re-fetch via `ghfs:list-projects` for full
    // summaries (item counts, sync timestamps, token status).
    devframeCtx.rpc.broadcast({
      method: 'ghfs:onProjectsChange' as never,
      args: [{}] as never,
    })
  }

  function broadcastHubInfoChange(): void {
    devframeCtx.rpc.broadcast({
      method: 'ghfs:onHubInfoChange' as never,
      args: [{ cwd: hubCwd }] as never,
    })
  }

  async function loadProjectByPath(path: string): Promise<ProjectContext> {
    const absolutePath = resolve(hubCwd, path)
    const config = await resolveConfig({ cwd: absolutePath })
    const repo = await resolveRepo({
      cwd: absolutePath,
      configRepo: config.repo,
      interactive: false,
    })
    const repoName = repo.repo
    let id = slugifyRepoName(repoName) || absolutePath.split('/').pop() || 'project'
    // Ensure uniqueness in case two projects share the same trailing name.
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

  async function loadEnabledProjects(): Promise<void> {
    const entry = await loadHubConfig({ hubCwd, homeDir })
    for (const proj of entry.enabledProjects) {
      try {
        const ctx = await loadProjectByPath(proj.path)
        projects.set(ctx.id, ctx)
      }
      catch (error) {
        console.warn(`[ghfs hub] skipped ${proj.path}: ${(error as Error).message}`)
      }
    }
  }

  async function clearProjects(): Promise<void> {
    const all = Array.from(projects.values())
    projects.clear()
    await Promise.all(all.map(closeProjectContext))
  }

  await loadEnabledProjects()

  const initialEntry = await loadHubConfig({ hubCwd, homeDir })

  const registry: ProjectRegistry = {
    mode: 'hub',
    getProject: id => projects.get(id) ?? null,
    listProjects: () => Array.from(projects.values()),
    close: clearProjects,
  }

  const autoSync = createAutoSyncTimer({
    registry,
    initialIntervalMs: initialEntry.autoSyncIntervalMs,
  })

  registerProjectRpc(devframeCtx, registry)

  // Hub-specific RPC functions
  const def = defineRpcFunction

  devframeCtx.rpc.register(def({
    name: 'ghfs:hub-info',
    type: 'query',
    handler: async () => ({
      cwd: hubCwd,
    }),
  }))

  devframeCtx.rpc.register(def({
    name: 'ghfs:hub-scan',
    type: 'query',
    handler: async (): Promise<HubScannedProject[]> => {
      const scanned = await scanGitRepos(hubCwd)
      const enabledPaths = new Set(Array.from(projects.values()).map(p => p.path))
      return Promise.all(scanned.map(async s => ({
        path: s.path,
        name: s.name,
        enabled: enabledPaths.has(s.path),
        iconDataUrl: await findProjectIcon(s.path).catch(() => null),
      })))
    },
  }))

  devframeCtx.rpc.register(def({
    name: 'ghfs:hub-enable',
    type: 'action',
    handler: async (path: string): Promise<{ id: string }> => {
      const ctx = await loadProjectByPath(path)
      projects.set(ctx.id, ctx)
      await persist()
      broadcastProjectsChange()
      return { id: ctx.id }
    },
  }))

  devframeCtx.rpc.register(def({
    name: 'ghfs:hub-disable',
    type: 'action',
    handler: async (id: string): Promise<{ removed: boolean }> => {
      const ctx = projects.get(id)
      if (!ctx)
        return { removed: false }
      projects.delete(id)
      await closeProjectContext(ctx)
      await persist()
      broadcastProjectsChange()
      return { removed: true }
    },
  }))

  devframeCtx.rpc.register(def({
    name: 'ghfs:hub-set-root',
    type: 'action',
    handler: async (rawPath: string): Promise<{ cwd: string }> => {
      const next = resolveHubRoot(rawPath)
      await assertDirectory(next)
      if (next === hubCwd)
        return { cwd: hubCwd }
      // Tear down all current project watchers/pollers, swap the root,
      // then re-hydrate from the new hub's saved config.
      await clearProjects()
      hubCwd = next
      await loadEnabledProjects()
      const entry = await loadHubConfig({ hubCwd, homeDir })
      autoSync.setInterval(entry.autoSyncIntervalMs)
      broadcastHubInfoChange()
      broadcastProjectsChange()
      return { cwd: hubCwd }
    },
  }))

  devframeCtx.rpc.register(def({
    name: 'ghfs:hub-settings',
    type: 'query',
    handler: async (): Promise<HubSettings> => {
      const entry = await loadHubConfig({ hubCwd, homeDir })
      return { autoSyncIntervalMs: entry.autoSyncIntervalMs }
    },
  }))

  devframeCtx.rpc.register(def({
    name: 'ghfs:hub-set-settings',
    type: 'action',
    handler: async (patch: { autoSyncIntervalMs?: number | null }): Promise<HubSettings> => {
      const entry = await patchHubSettings({ hubCwd, homeDir, patch })
      autoSync.setInterval(entry.autoSyncIntervalMs)
      return { autoSyncIntervalMs: entry.autoSyncIntervalMs }
    },
  }))

  async function persist(): Promise<void> {
    const enabledProjects: HubProjectEntry[] = Array.from(projects.values()).map(p => ({ path: p.path }))
    await saveHubConfig({
      hubCwd,
      homeDir,
      enabledProjects,
    })
  }

  return {
    registry,
    close: async () => {
      autoSync.close()
      await clearProjects()
    },
  }
}

function resolveHubRoot(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed)
    throw new CodedError(log.GHFS0206({ detail: 'Hub root cannot be empty.' }))
  // Expand `~` to the user's home directory.
  if (trimmed === '~')
    return homedir()
  if (trimmed.startsWith('~/'))
    return resolve(homedir(), trimmed.slice(2))
  return isAbsolute(trimmed) ? resolve(trimmed) : resolve(process.cwd(), trimmed)
}

async function assertDirectory(path: string): Promise<void> {
  let stats: Awaited<ReturnType<typeof stat>>
  try {
    stats = await stat(path)
  }
  catch {
    throw new CodedError(log.GHFS0206({ detail: `Hub root does not exist: ${path}` }))
  }
  if (!stats.isDirectory())
    throw new CodedError(log.GHFS0206({ detail: `Hub root is not a directory: ${path}` }))
}

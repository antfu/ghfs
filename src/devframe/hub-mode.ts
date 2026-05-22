import type { DevToolsNodeContext } from 'devframe'
import type { ProjectContext, ProjectRegistry } from './project-context'
import { stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import process from 'node:process'
import { defineRpcFunction } from 'devframe'
import { isAbsolute, resolve, sep } from 'pathe'
import { resolveConfig } from '../config/load'
import { resolveRepo } from '../config/repo'
import { createAutoSyncTimer } from '../hub/auto-sync'
import {
  addHubRoot,
  loadHubConfig,
  removeHubRoot,
  setEnabledProjects,
  setHubAutoSyncInterval,
} from '../hub/config'
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

export interface HubInfo {
  roots: string[]
  launchCwd: string
  launchCwdInRoots: boolean
}

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

  registerProjectRpc(devframeCtx, registry)

  const def = defineRpcFunction

  devframeCtx.rpc.register(def({
    name: 'ghfs:hub-info',
    type: 'query',
    handler: async (): Promise<HubInfo> => buildHubInfo(),
  }))

  devframeCtx.rpc.register(def({
    name: 'ghfs:hub-scan',
    type: 'query',
    handler: async (rootPath?: string): Promise<HubScannedProject[]> => {
      const targets: string[] = rootPath ? [resolveHubRoot(rootPath)] : Array.from(roots).sort()
      const enabledPaths = new Set(Array.from(projects.values()).map(p => p.path))
      const collected = new Map<string, HubScannedProject>()
      for (const target of targets) {
        let scanned: Awaited<ReturnType<typeof scanGitRepos>>
        try {
          scanned = await scanGitRepos(target)
        }
        catch {
          continue
        }
        for (const repo of scanned) {
          if (collected.has(repo.path))
            continue
          collected.set(repo.path, {
            path: repo.path,
            name: repo.name,
            enabled: enabledPaths.has(repo.path),
            iconDataUrl: await findProjectIcon(repo.path).catch(() => null),
          })
        }
      }
      const out = Array.from(collected.values())
      out.sort((a, b) => a.path.localeCompare(b.path))
      return out
    },
  }))

  devframeCtx.rpc.register(def({
    name: 'ghfs:hub-enable',
    type: 'action',
    handler: async (path: string): Promise<{ id: string }> => {
      return withLock(async () => {
        const absolutePath = resolve(path)
        const existing = Array.from(projects.values()).find(p => p.path === absolutePath)
        if (existing)
          return { id: existing.id }
        const ctx = await loadProjectByPath(absolutePath)
        projects.set(ctx.id, ctx)
        await persistEnabled()
        broadcastProjectsChange()
        return { id: ctx.id }
      })
    },
  }))

  devframeCtx.rpc.register(def({
    name: 'ghfs:hub-disable',
    type: 'action',
    handler: async (id: string): Promise<{ removed: boolean }> => {
      return withLock(async () => {
        const ctx = projects.get(id)
        if (!ctx)
          return { removed: false }
        projects.delete(id)
        await closeProjectContext(ctx)
        await persistEnabled()
        broadcastProjectsChange()
        return { removed: true }
      })
    },
  }))

  devframeCtx.rpc.register(def({
    name: 'ghfs:hub-add-root',
    type: 'action',
    handler: async (rawPath: string): Promise<HubInfo> => {
      return withLock(async () => {
        const next = resolveHubRoot(rawPath)
        await assertDirectory(next)
        if (roots.has(next))
          return buildHubInfo()
        await addHubRoot({ homeDir, path: next })
        roots.add(next)
        broadcastHubInfoChange()
        return buildHubInfo()
      })
    },
  }))

  devframeCtx.rpc.register(def({
    name: 'ghfs:hub-remove-root',
    type: 'action',
    handler: async (rawPath: string): Promise<HubInfo> => {
      return withLock(async () => {
        const target = resolveHubRoot(rawPath)
        if (!roots.has(target))
          throw new CodedError(log.GHFS0206({ detail: `Hub root not registered: ${target}` }))
        // Close + drop projects whose paths fall under the removed root.
        const toRemove: ProjectContext[] = []
        for (const ctx of projects.values()) {
          if (isUnder(ctx.path, target))
            toRemove.push(ctx)
        }
        for (const ctx of toRemove) {
          projects.delete(ctx.id)
          await closeProjectContext(ctx)
        }
        await removeHubRoot({ homeDir, path: target })
        roots.delete(target)
        broadcastHubInfoChange()
        if (toRemove.length > 0)
          broadcastProjectsChange()
        return buildHubInfo()
      })
    },
  }))

  devframeCtx.rpc.register(def({
    name: 'ghfs:hub-settings',
    type: 'query',
    handler: async (): Promise<HubSettings> => {
      const current = await loadHubConfig({ homeDir })
      return { autoSyncIntervalMs: current.autoSyncIntervalMs }
    },
  }))

  devframeCtx.rpc.register(def({
    name: 'ghfs:hub-set-settings',
    type: 'action',
    handler: async (patch: { autoSyncIntervalMs?: number | null }): Promise<HubSettings> => {
      return withLock(async () => {
        const value = patch.autoSyncIntervalMs ?? undefined
        const next = await setHubAutoSyncInterval({ homeDir, intervalMs: value })
        autoSync.setInterval(next.autoSyncIntervalMs)
        return { autoSyncIntervalMs: next.autoSyncIntervalMs }
      })
    },
  }))

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

function isUnder(child: string, parent: string): boolean {
  if (child === parent)
    return true
  return child.startsWith(parent.endsWith(sep) ? parent : parent + sep)
}

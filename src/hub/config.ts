import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve, sep } from 'pathe'
import * as v from 'valibot'

const ProjectEntrySchema = v.object({
  path: v.string(),
})

const CommentTemplateSchema = v.object({
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  body: v.pipe(v.string(), v.minLength(1), v.maxLength(10_000)),
})

const ConfigSchema = v.object({
  roots: v.optional(v.array(v.string())),
  enabledProjects: v.optional(v.array(ProjectEntrySchema)),
  autoSyncIntervalMs: v.optional(v.pipe(v.number(), v.minValue(60_000), v.maxValue(3_600_000))),
  commentTemplates: v.optional(v.array(CommentTemplateSchema)),
  swrSyncEnabled: v.optional(v.boolean()),
  swrCacheTimeoutMs: v.optional(v.pipe(v.number(), v.minValue(30_000), v.maxValue(3_600_000))),
})

const LegacyEntrySchema = v.object({
  enabledProjects: v.array(ProjectEntrySchema),
  lastScanAt: v.optional(v.string()),
  autoSyncIntervalMs: v.optional(v.pipe(v.number(), v.minValue(60_000), v.maxValue(3_600_000))),
})

const LegacyConfigSchema = v.object({
  hubs: v.record(v.string(), LegacyEntrySchema),
})

export interface HubProjectEntry {
  /** Absolute path to the project's working directory. */
  path: string
}

export interface CommentTemplate {
  title: string
  body: string
}

export interface HubConfig {
  /** Directories scanned for git repos. Order is meaningful (insertion order). */
  roots: string[]
  /** Absolute paths of projects the user has enabled. Independent of `roots`. */
  enabledProjects: HubProjectEntry[]
  /** Global auto-sync interval applied to every project. */
  autoSyncIntervalMs?: number
  /** Global comment templates surfaced in the composer's template picker. */
  commentTemplates?: CommentTemplate[]
  /** When false, disables SWR background refresh in the detail view. Default on. */
  swrSyncEnabled?: boolean
  /** Cache TTL for SWR background refreshes, in ms. Defaults to 5 min when undefined. */
  swrCacheTimeoutMs?: number
}

export interface ResolveHubConfigPathOptions {
  /** Override the user's home directory (used by tests). */
  homeDir?: string
}

export function resolveHubConfigPath(options: ResolveHubConfigPathOptions = {}): string {
  const home = options.homeDir ?? homedir()
  return join(home, '.config', 'ghfs', 'hub.json')
}

function normalizePath(path: string): string {
  return resolve(path)
}

function dedupePaths(paths: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const path of paths) {
    if (seen.has(path))
      continue
    seen.add(path)
    out.push(path)
  }
  return out
}

function dedupeProjects(projects: HubProjectEntry[]): HubProjectEntry[] {
  const seen = new Set<string>()
  const out: HubProjectEntry[] = []
  for (const entry of projects) {
    if (seen.has(entry.path))
      continue
    seen.add(entry.path)
    out.push({ path: entry.path })
  }
  return out
}

function isUnder(child: string, parent: string): boolean {
  if (child === parent)
    return true
  return child.startsWith(parent.endsWith(sep) ? parent : parent + sep)
}

async function readRaw(path: string): Promise<unknown> {
  try {
    const raw = await readFile(path, 'utf8')
    return JSON.parse(raw)
  }
  catch {
    return null
  }
}

function parseConfig(raw: unknown): HubConfig {
  if (raw == null || typeof raw !== 'object')
    return { roots: [], enabledProjects: [] }

  // Try the modern flat shape first.
  const flat = v.safeParse(ConfigSchema, raw)
  if (flat.success && (flat.output.roots !== undefined || flat.output.enabledProjects !== undefined)) {
    const config: HubConfig = {
      roots: dedupePaths((flat.output.roots ?? []).map(normalizePath)),
      enabledProjects: dedupeProjects((flat.output.enabledProjects ?? []).map(e => ({ path: normalizePath(e.path) }))),
      autoSyncIntervalMs: flat.output.autoSyncIntervalMs,
      swrSyncEnabled: flat.output.swrSyncEnabled,
      swrCacheTimeoutMs: flat.output.swrCacheTimeoutMs,
    }
    if (flat.output.commentTemplates !== undefined)
      config.commentTemplates = flat.output.commentTemplates.map(t => ({ title: t.title, body: t.body }))
    return config
  }

  // Migration: legacy `hubs: Record<path, { enabledProjects, autoSyncIntervalMs }>`.
  const legacy = v.safeParse(LegacyConfigSchema, raw)
  if (legacy.success) {
    const roots: string[] = []
    const projects: HubProjectEntry[] = []
    let interval: number | undefined
    for (const [key, entry] of Object.entries(legacy.output.hubs)) {
      roots.push(normalizePath(key))
      for (const p of entry.enabledProjects)
        projects.push({ path: normalizePath(p.path) })
      if (entry.autoSyncIntervalMs !== undefined && (interval === undefined || entry.autoSyncIntervalMs > interval))
        interval = entry.autoSyncIntervalMs
    }
    return {
      roots: dedupePaths(roots),
      enabledProjects: dedupeProjects(projects),
      autoSyncIntervalMs: interval,
    }
  }

  return { roots: [], enabledProjects: [] }
}

export async function loadHubConfig(options: ResolveHubConfigPathOptions = {}): Promise<HubConfig> {
  const path = resolveHubConfigPath(options)
  const raw = await readRaw(path)
  return parseConfig(raw)
}

export interface SaveHubConfigOptions extends ResolveHubConfigPathOptions {
  config: HubConfig
}

export async function saveHubConfig(options: SaveHubConfigOptions): Promise<void> {
  const path = resolveHubConfigPath(options)
  const next: HubConfig = {
    roots: dedupePaths(options.config.roots.map(normalizePath)),
    enabledProjects: dedupeProjects(options.config.enabledProjects.map(e => ({ path: normalizePath(e.path) }))),
    autoSyncIntervalMs: options.config.autoSyncIntervalMs,
    commentTemplates: options.config.commentTemplates,
    swrSyncEnabled: options.config.swrSyncEnabled,
    swrCacheTimeoutMs: options.config.swrCacheTimeoutMs,
  }
  await mkdir(dirname(path), { recursive: true })
  // Strip undefined fields so the JSON stays tidy.
  const json: Record<string, unknown> = {
    roots: next.roots,
    enabledProjects: next.enabledProjects,
  }
  if (next.autoSyncIntervalMs !== undefined)
    json.autoSyncIntervalMs = next.autoSyncIntervalMs
  if (next.commentTemplates !== undefined)
    json.commentTemplates = next.commentTemplates
  if (next.swrSyncEnabled !== undefined)
    json.swrSyncEnabled = next.swrSyncEnabled
  if (next.swrCacheTimeoutMs !== undefined)
    json.swrCacheTimeoutMs = next.swrCacheTimeoutMs
  await writeFile(path, `${JSON.stringify(json, null, 2)}\n`, 'utf8')
}

export interface MutateHubConfigOptions extends ResolveHubConfigPathOptions {
  path: string
}

export async function addHubRoot(options: MutateHubConfigOptions): Promise<HubConfig> {
  const current = await loadHubConfig(options)
  const target = normalizePath(options.path)
  if (current.roots.includes(target))
    return current
  const next: HubConfig = {
    ...current,
    roots: [...current.roots, target],
  }
  await saveHubConfig({ homeDir: options.homeDir, config: next })
  return next
}

export async function removeHubRoot(options: MutateHubConfigOptions): Promise<HubConfig> {
  const current = await loadHubConfig(options)
  const target = normalizePath(options.path)
  const nextRoots = current.roots.filter(r => r !== target)
  const nextProjects = current.enabledProjects.filter(p => !isUnder(p.path, target))
  const next: HubConfig = {
    ...current,
    roots: nextRoots,
    enabledProjects: nextProjects,
  }
  await saveHubConfig({ homeDir: options.homeDir, config: next })
  return next
}

export interface SetEnabledProjectsOptions extends ResolveHubConfigPathOptions {
  paths: string[]
}

export async function setEnabledProjects(options: SetEnabledProjectsOptions): Promise<HubConfig> {
  const current = await loadHubConfig(options)
  const next: HubConfig = {
    ...current,
    enabledProjects: dedupeProjects(options.paths.map(p => ({ path: normalizePath(p) }))),
  }
  await saveHubConfig({ homeDir: options.homeDir, config: next })
  return next
}

export interface SetHubAutoSyncIntervalOptions extends ResolveHubConfigPathOptions {
  intervalMs: number | undefined
}

export async function setHubAutoSyncInterval(options: SetHubAutoSyncIntervalOptions): Promise<HubConfig> {
  const current = await loadHubConfig(options)
  const next: HubConfig = {
    ...current,
    autoSyncIntervalMs: options.intervalMs,
  }
  await saveHubConfig({ homeDir: options.homeDir, config: next })
  return next
}

export interface SetHubCommentTemplatesOptions extends ResolveHubConfigPathOptions {
  templates: CommentTemplate[]
}

export async function setHubCommentTemplates(options: SetHubCommentTemplatesOptions): Promise<HubConfig> {
  const current = await loadHubConfig(options)
  const sanitized = options.templates
    .map(t => ({ title: t.title.trim(), body: t.body }))
    .filter(t => t.title.length > 0 && t.body.length > 0)
    .slice(0, 200)
  const next: HubConfig = {
    ...current,
    commentTemplates: sanitized,
  }
  await saveHubConfig({ homeDir: options.homeDir, config: next })
  return next
}

export interface SetHubSwrSettingsOptions extends ResolveHubConfigPathOptions {
  swrSyncEnabled?: boolean
  swrCacheTimeoutMs?: number
}

export async function setHubSwrSettings(options: SetHubSwrSettingsOptions): Promise<HubConfig> {
  const current = await loadHubConfig(options)
  const next: HubConfig = {
    ...current,
    swrSyncEnabled: options.swrSyncEnabled,
    swrCacheTimeoutMs: options.swrCacheTimeoutMs,
  }
  await saveHubConfig({ homeDir: options.homeDir, config: next })
  return next
}

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'pathe'
import * as v from 'valibot'

const ConfigSchema = v.object({
  hubs: v.record(
    v.string(),
    v.object({
      enabledProjects: v.array(v.object({
        path: v.string(),
      })),
      lastScanAt: v.optional(v.string()),
      autoSyncIntervalMs: v.optional(v.pipe(v.number(), v.minValue(60_000), v.maxValue(3_600_000))),
    }),
  ),
})

type HubConfigFile = v.InferOutput<typeof ConfigSchema>

export interface HubProjectEntry {
  /** Absolute path to the project's working directory. */
  path: string
}

export interface HubEntry {
  enabledProjects: HubProjectEntry[]
  lastScanAt?: string
  /** When set, the server runs `triggerSync` for every project with a token on this interval. */
  autoSyncIntervalMs?: number
}

export interface ResolveHubConfigPathOptions {
  /** Override the user's home directory (used by tests). */
  homeDir?: string
}

export function resolveHubConfigPath(options: ResolveHubConfigPathOptions = {}): string {
  const home = options.homeDir ?? homedir()
  return join(home, '.config', 'ghfs', 'hub.json')
}

function hubKey(hubCwd: string): string {
  return resolve(hubCwd)
}

async function readConfigFile(path: string): Promise<HubConfigFile> {
  try {
    const raw = await readFile(path, 'utf8')
    const parsed = JSON.parse(raw)
    const result = v.safeParse(ConfigSchema, parsed)
    if (result.success)
      return result.output
    return { hubs: {} }
  }
  catch {
    return { hubs: {} }
  }
}

export interface LoadHubConfigOptions extends ResolveHubConfigPathOptions {
  hubCwd: string
}

export async function loadHubConfig(options: LoadHubConfigOptions): Promise<HubEntry> {
  const path = resolveHubConfigPath(options)
  const file = await readConfigFile(path)
  const entry = file.hubs[hubKey(options.hubCwd)]
  if (!entry)
    return { enabledProjects: [] }
  return {
    enabledProjects: entry.enabledProjects.map(p => ({ path: p.path })),
    lastScanAt: entry.lastScanAt,
    autoSyncIntervalMs: entry.autoSyncIntervalMs,
  }
}

export interface SaveHubConfigOptions extends ResolveHubConfigPathOptions {
  hubCwd: string
  enabledProjects: HubProjectEntry[]
  lastScanAt?: string
  autoSyncIntervalMs?: number
}

export async function saveHubConfig(options: SaveHubConfigOptions): Promise<void> {
  const path = resolveHubConfigPath(options)
  const file = await readConfigFile(path)
  const existing = file.hubs[hubKey(options.hubCwd)]
  file.hubs[hubKey(options.hubCwd)] = {
    enabledProjects: options.enabledProjects.map(p => ({ path: p.path })),
    lastScanAt: options.lastScanAt ?? new Date().toISOString(),
    ...(options.autoSyncIntervalMs !== undefined
      ? { autoSyncIntervalMs: options.autoSyncIntervalMs }
      : existing?.autoSyncIntervalMs !== undefined
        ? { autoSyncIntervalMs: existing.autoSyncIntervalMs }
        : {}),
  }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, 'utf8')
}

export interface PatchHubSettingsOptions extends ResolveHubConfigPathOptions {
  hubCwd: string
  patch: { autoSyncIntervalMs?: number | null }
}

/** Update fields on the hub entry without touching `enabledProjects`. */
export async function patchHubSettings(options: PatchHubSettingsOptions): Promise<HubEntry> {
  const path = resolveHubConfigPath(options)
  const file = await readConfigFile(path)
  const key = hubKey(options.hubCwd)
  const existing = file.hubs[key] ?? { enabledProjects: [], lastScanAt: undefined }
  const next = {
    enabledProjects: existing.enabledProjects.map(p => ({ path: p.path })),
    lastScanAt: existing.lastScanAt,
    autoSyncIntervalMs: 'autoSyncIntervalMs' in options.patch
      ? (options.patch.autoSyncIntervalMs ?? undefined)
      : existing.autoSyncIntervalMs,
  }
  file.hubs[key] = next
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, 'utf8')
  return next
}

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
  }
}

export interface SaveHubConfigOptions extends ResolveHubConfigPathOptions {
  hubCwd: string
  enabledProjects: HubProjectEntry[]
  lastScanAt?: string
}

export async function saveHubConfig(options: SaveHubConfigOptions): Promise<void> {
  const path = resolveHubConfigPath(options)
  const file = await readConfigFile(path)
  file.hubs[hubKey(options.hubCwd)] = {
    enabledProjects: options.enabledProjects.map(p => ({ path: p.path })),
    lastScanAt: options.lastScanAt ?? new Date().toISOString(),
  }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, 'utf8')
}

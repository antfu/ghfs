import type { GhfsResolvedConfig, GhfsUserConfig } from '../types'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { createJiti } from 'jiti'
import {
  CONFIG_FILE_CANDIDATES,
  DEFAULT_STORAGE_DIR,
  EXECUTE_FILE_NAME,
} from '../constants'

export interface ResolveConfigOptions {
  cwd?: string
  overrides?: Partial<GhfsUserConfig>
}

export interface LoadedUserConfig {
  path?: string
  config: GhfsUserConfig
}

export async function loadUserConfig(cwd: string): Promise<LoadedUserConfig> {
  const configPath = findConfigFile(cwd)
  if (!configPath)
    return { config: {} }

  const jiti = createJiti(resolve(cwd, 'ghfs.config.ts'), {
    interopDefault: true,
  })
  const loaded = await jiti.import(configPath) as unknown
  const config = extractUserConfig(loaded)

  return {
    path: configPath,
    config,
  }
}

function extractUserConfig(loaded: unknown): GhfsUserConfig {
  if (!loaded || typeof loaded !== 'object')
    return {}

  if ('default' in loaded) {
    const config = (loaded as { default?: unknown }).default
    if (config && typeof config === 'object')
      return config as GhfsUserConfig
    return {}
  }

  return loaded as GhfsUserConfig
}

export async function resolveConfig(options: ResolveConfigOptions = {}): Promise<GhfsResolvedConfig> {
  const cwd = options.cwd ?? process.cwd()
  const overrides = options.overrides ?? {}
  const { config: userConfig } = await loadUserConfig(cwd)
  const merged = mergeUserConfig(userConfig, overrides)

  const directory = merged.directory ?? DEFAULT_STORAGE_DIR
  const configuredToken = merged.auth?.token?.trim() || ''
  const repo = merged.repo?.trim() || ''
  const issuesEnabled = merged.sync?.issues ?? true
  const pullsEnabled = merged.sync?.pulls ?? true
  const closedMode = merged.sync?.closed ?? 'existing'
  const patchesMode = merged.sync?.patches ?? 'open'

  return {
    cwd,
    repo,
    directory,
    auth: {
      token: configuredToken,
    },
    sync: {
      issues: issuesEnabled,
      pulls: pullsEnabled,
      closed: closedMode,
      patches: patchesMode,
    },
  }
}

export function getStorageDirAbsolute(config: Pick<GhfsResolvedConfig, 'cwd' | 'directory'>): string {
  return resolve(config.cwd, config.directory)
}

export function getExecuteFile(config: Pick<GhfsResolvedConfig, 'directory'>): string {
  return join(config.directory, EXECUTE_FILE_NAME)
}

function findConfigFile(cwd: string): string | undefined {
  for (const candidate of CONFIG_FILE_CANDIDATES) {
    const fullPath = resolve(cwd, candidate)
    if (existsSync(fullPath))
      return fullPath
  }
  return undefined
}

function mergeUserConfig(base: GhfsUserConfig, overrides: Partial<GhfsUserConfig>): GhfsUserConfig {
  return {
    ...base,
    ...overrides,
    auth: {
      ...base.auth,
      ...overrides.auth,
    },
    sync: {
      ...base.sync,
      ...overrides.sync,
    },
  }
}

import type { GhfsResolvedConfig } from '../types'
import { readFile, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative } from 'pathe'
import { getStorageDirAbsolute } from '../config/load'
import { pathExists } from './fs'

export async function ensureGitignoreEntry(
  config: Pick<GhfsResolvedConfig, 'cwd' | 'directory'>,
): Promise<void> {
  const storageDirAbsolute = getStorageDirAbsolute(config)
  const entry = relative(config.cwd, storageDirAbsolute)

  if (!entry || entry.startsWith('..') || isAbsolute(entry))
    return

  const gitignorePath = join(config.cwd, '.gitignore')
  const gitDir = join(config.cwd, '.git')

  const [gitignoreExists, gitExists] = await Promise.all([
    pathExists(gitignorePath),
    pathExists(gitDir),
  ])

  if (!gitignoreExists && !gitExists)
    return

  if (!gitignoreExists) {
    await writeFile(gitignorePath, `${entry}\n`, 'utf8')
    return
  }

  const existing = await readFile(gitignorePath, 'utf8')
  const candidates = new Set([entry, `${entry}/`, `/${entry}`, `/${entry}/`])

  const alreadyPresent = existing.split('\n').some((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#'))
      return false
    return candidates.has(trimmed)
  })

  if (alreadyPresent)
    return

  const needsLeadingNewline = existing.length > 0 && !existing.endsWith('\n')
  const suffix = `${needsLeadingNewline ? '\n' : ''}${entry}\n`
  await writeFile(gitignorePath, `${existing}${suffix}`, 'utf8')
}

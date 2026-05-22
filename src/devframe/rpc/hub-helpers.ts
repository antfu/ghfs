import { stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import process from 'node:process'
import { isAbsolute, resolve, sep } from 'pathe'
import { diagnostics } from '../../logger'

export function resolveHubRoot(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed)
    throw diagnostics.GHFS0206({ detail: 'Hub root cannot be empty.' })
  if (trimmed === '~')
    return homedir()
  if (trimmed.startsWith('~/'))
    return resolve(homedir(), trimmed.slice(2))
  return isAbsolute(trimmed) ? resolve(trimmed) : resolve(process.cwd(), trimmed)
}

export async function assertDirectory(path: string): Promise<void> {
  let stats: Awaited<ReturnType<typeof stat>>
  try {
    stats = await stat(path)
  }
  catch {
    throw diagnostics.GHFS0206({ detail: `Hub root does not exist: ${path}` })
  }
  if (!stats.isDirectory())
    throw diagnostics.GHFS0206({ detail: `Hub root is not a directory: ${path}` })
}

export function isUnder(child: string, parent: string): boolean {
  if (child === parent)
    return true
  return child.startsWith(parent.endsWith(sep) ? parent : parent + sep)
}

import { readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'pathe'

export interface ScannedRepo {
  /** Absolute path to the repo. */
  path: string
  /** Final segment of the path; used as a display name. */
  name: string
}

export interface ScanGitReposOptions {
  /** Maximum depth to descend. Defaults to 1 (immediate children only). */
  maxDepth?: number
}

async function isDir(path: string): Promise<boolean> {
  try {
    const s = await stat(path)
    return s.isDirectory()
  }
  catch {
    return false
  }
}

export async function scanGitRepos(parentDir: string, options: ScanGitReposOptions = {}): Promise<ScannedRepo[]> {
  const maxDepth = options.maxDepth ?? 1
  const root = resolve(parentDir)
  const found: ScannedRepo[] = []
  await walk(root, 0, maxDepth, found)
  found.sort((a, b) => a.name.localeCompare(b.name))
  return found
}

async function walk(dir: string, depth: number, maxDepth: number, out: ScannedRepo[]): Promise<void> {
  if (depth > maxDepth)
    return
  let entries: string[]
  try {
    entries = await readdir(dir)
  }
  catch {
    return
  }
  if (entries.includes('.git') && depth > 0) {
    out.push({ path: dir, name: dir.split('/').pop() ?? dir })
    return
  }
  if (depth === maxDepth)
    return
  for (const entry of entries) {
    if (entry.startsWith('.') || entry === 'node_modules')
      continue
    const full = join(dir, entry)
    if (!(await isDir(full)))
      continue
    await walk(full, depth + 1, maxDepth, out)
  }
}

import type { Dirent } from 'node:fs'
import { access, mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'pathe'
import { PULL_DIR_NAME } from '../constants'

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  }
  catch {
    return false
  }
}

export async function writeFileEnsured(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, 'utf8')
}

export async function removePath(path: string): Promise<void> {
  await rm(path, { force: true })
}

export async function movePath(from: string, to: string): Promise<void> {
  await mkdir(dirname(to), { recursive: true })
  await rename(from, to)
}

export async function removePatchIfExists(storageDirAbsolute: string, number: number): Promise<number> {
  const pullsDir = join(storageDirAbsolute, PULL_DIR_NAME)

  let entries: Dirent[]
  try {
    entries = await readdir(pullsDir, { withFileTypes: true })
  }
  catch {
    return 0
  }

  const padded = String(number).padStart(5, '0')
  let removed = 0

  for (const entry of entries) {
    if (!entry.isFile())
      continue

    const fileName = entry.name
    const isLegacyPatch = fileName === `${number}.patch`
    const isCurrentPatch = fileName.startsWith(`${padded}-`) && fileName.endsWith('.patch')
    if (!isLegacyPatch && !isCurrentPatch)
      continue

    await removePath(join(pullsDir, fileName))
    removed += 1
  }

  return removed
}

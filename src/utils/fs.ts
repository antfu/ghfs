import { access, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { getPrPatchPath } from '../sync/paths'

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
  const patchPath = getPrPatchPath(storageDirAbsolute, number)
  if (!await pathExists(patchPath))
    return 0
  await removePath(patchPath)
  return 1
}

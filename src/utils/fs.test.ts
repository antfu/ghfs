import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { movePath, pathExists, removePatchIfExists, removePath, writeFileEnsured } from './fs'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('pathExists', () => {
  it('returns true for existing paths', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ghfs-utils-fs-'))
    tempDirs.push(dir)

    const file = join(dir, 'file.txt')
    await writeFile(file, 'ok', 'utf8')

    await expect(pathExists(file)).resolves.toBe(true)
  })

  it('returns false for missing paths', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ghfs-utils-fs-'))
    tempDirs.push(dir)

    await expect(pathExists(join(dir, 'missing.txt'))).resolves.toBe(false)
  })
})

describe('writeFileEnsured', () => {
  it('creates parent directories and writes utf8 content', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ghfs-utils-fs-'))
    tempDirs.push(dir)

    const file = join(dir, 'nested', 'path', 'file.txt')
    await writeFileEnsured(file, 'hello')

    await expect(readFile(file, 'utf8')).resolves.toBe('hello')
  })
})

describe('movePath', () => {
  it('moves files and ensures target directory exists', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ghfs-utils-fs-'))
    tempDirs.push(dir)

    const source = join(dir, 'source.txt')
    const target = join(dir, 'nested', 'moved.txt')

    await writeFile(source, 'moved', 'utf8')
    await movePath(source, target)

    await expect(pathExists(source)).resolves.toBe(false)
    await expect(readFile(target, 'utf8')).resolves.toBe('moved')
  })
})

describe('removePath', () => {
  it('removes files and does not fail on missing paths', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ghfs-utils-fs-'))
    tempDirs.push(dir)

    const file = join(dir, 'to-remove.txt')
    await writeFile(file, 'remove', 'utf8')

    await removePath(file)
    await expect(pathExists(file)).resolves.toBe(false)
    await expect(removePath(file)).resolves.toBeUndefined()
  })
})

describe('removePatchIfExists', () => {
  it('removes existing patch files and returns 1', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ghfs-utils-fs-'))
    tempDirs.push(dir)

    const patchPath = join(dir, 'pulls', '42.patch')
    await writeFileEnsured(patchPath, 'patch content')

    await expect(removePatchIfExists(dir, 42)).resolves.toBe(1)
    await expect(pathExists(patchPath)).resolves.toBe(false)
  })

  it('returns 0 when patch file does not exist', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ghfs-utils-fs-'))
    tempDirs.push(dir)

    await expect(removePatchIfExists(dir, 999)).resolves.toBe(0)
  })
})

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import process from 'node:process'
import { dirname, join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import {
  clearDaemonState,
  isProcessAlive,
  readDaemonState,
  resolveDaemonLogPath,
  resolveDaemonStatePath,
  waitForExit,
  writeDaemonState,
} from './daemon'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

async function makeHome(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ghfs-hub-daemon-'))
  tempDirs.push(dir)
  return dir
}

// A PID that is virtually guaranteed to be free on all supported platforms.
// macOS and Linux cap PIDs well below 2^30.
const DEAD_PID = 1 << 30

function makeState(overrides: Partial<{ pid: number, port: number, host: string, cwd: string, startedAt: string }> = {}) {
  return {
    pid: process.pid,
    host: '127.0.0.1',
    port: 7710,
    cwd: '/tmp/ghfs-hub',
    startedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('hub daemon paths', () => {
  it('resolveDaemonStatePath uses ~/.config/ghfs/hub.daemon.json by default', async () => {
    const homeDir = await makeHome()
    expect(resolveDaemonStatePath({ homeDir })).toBe(join(homeDir, '.config', 'ghfs', 'hub.daemon.json'))
  })

  it('resolveDaemonStatePath honors an explicit path override', () => {
    expect(resolveDaemonStatePath({ path: '/custom/state.json' })).toBe('/custom/state.json')
  })

  it('resolveDaemonLogPath uses ~/.config/ghfs/hub.log', async () => {
    const homeDir = await makeHome()
    expect(resolveDaemonLogPath({ homeDir })).toBe(join(homeDir, '.config', 'ghfs', 'hub.log'))
  })
})

describe('isProcessAlive', () => {
  it('returns true for the current process', () => {
    expect(isProcessAlive(process.pid)).toBe(true)
  })

  it('returns false for a PID that does not exist', () => {
    expect(isProcessAlive(DEAD_PID)).toBe(false)
  })

  it('returns false for invalid PIDs', () => {
    expect(isProcessAlive(0)).toBe(false)
    expect(isProcessAlive(-1)).toBe(false)
    expect(isProcessAlive(Number.NaN)).toBe(false)
  })
})

describe('daemon state I/O', () => {
  it('writeDaemonState then readDaemonState round-trips', async () => {
    const homeDir = await makeHome()
    const state = makeState()
    await writeDaemonState(state, { homeDir })
    const read = await readDaemonState({ homeDir })
    expect(read).toEqual(state)
  })

  it('returns null when the state file does not exist', async () => {
    const homeDir = await makeHome()
    expect(await readDaemonState({ homeDir })).toBeNull()
  })

  it('returns null and clears the file when the recorded PID is dead', async () => {
    const homeDir = await makeHome()
    await writeDaemonState(makeState({ pid: DEAD_PID }), { homeDir })

    expect(await readDaemonState({ homeDir })).toBeNull()

    // File should have been removed during the stale check.
    const path = resolveDaemonStatePath({ homeDir })
    await expect(readFile(path, 'utf8')).rejects.toThrow()
  })

  it('returns null and clears the file when the JSON is malformed', async () => {
    const homeDir = await makeHome()
    const path = resolveDaemonStatePath({ homeDir })
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, 'not json', 'utf8')

    expect(await readDaemonState({ homeDir })).toBeNull()
    await expect(readFile(path, 'utf8')).rejects.toThrow()
  })

  it('returns null and clears the file when the shape is wrong', async () => {
    const homeDir = await makeHome()
    const path = resolveDaemonStatePath({ homeDir })
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, JSON.stringify({ foo: 'bar' }), 'utf8')

    expect(await readDaemonState({ homeDir })).toBeNull()
    await expect(readFile(path, 'utf8')).rejects.toThrow()
  })

  it('clearDaemonState is a no-op when the file does not exist', async () => {
    const homeDir = await makeHome()
    await expect(clearDaemonState({ homeDir })).resolves.toBeUndefined()
  })

  it('clearDaemonState removes an existing state file', async () => {
    const homeDir = await makeHome()
    await writeDaemonState(makeState(), { homeDir })
    await clearDaemonState({ homeDir })
    expect(await readDaemonState({ homeDir })).toBeNull()
  })

  it('writes atomically via .tmp + rename (no stray .tmp file on success)', async () => {
    const homeDir = await makeHome()
    await writeDaemonState(makeState(), { homeDir })
    const dir = join(homeDir, '.config', 'ghfs')
    const { readdir } = await import('node:fs/promises')
    const entries = await readdir(dir)
    const strays = entries.filter(e => e.includes('.tmp'))
    expect(strays).toEqual([])
  })

  it('honors an explicit path option', async () => {
    const homeDir = await makeHome()
    const customPath = join(homeDir, 'custom-state.json')
    const state = makeState()
    await writeDaemonState(state, { path: customPath })
    const read = await readDaemonState({ path: customPath })
    expect(read).toEqual(state)
  })
})

describe('waitForExit', () => {
  it('returns true quickly for a PID that is already dead', async () => {
    const start = Date.now()
    const result = await waitForExit(DEAD_PID, 1000)
    expect(result).toBe(true)
    expect(Date.now() - start).toBeLessThan(300)
  })

  it('returns false when the timeout elapses while the PID is alive', async () => {
    const result = await waitForExit(process.pid, 200)
    expect(result).toBe(false)
  })
})

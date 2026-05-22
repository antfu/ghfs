import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { closeSync, openSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import process from 'node:process'
import { dirname, join } from 'pathe'
import * as v from 'valibot'

export interface DaemonState {
  pid: number
  host: string
  port: number
  cwd: string
  startedAt: string
}

const DaemonStateSchema = v.object({
  pid: v.number(),
  host: v.string(),
  port: v.number(),
  cwd: v.string(),
  startedAt: v.string(),
})

export interface DaemonPathOptions {
  /** Override the user's home directory (used by tests). */
  homeDir?: string
  /** Override the full state file path. Takes precedence over `homeDir`. */
  path?: string
}

export function resolveDaemonStatePath(opts: DaemonPathOptions = {}): string {
  if (opts.path)
    return opts.path
  const home = opts.homeDir ?? homedir()
  return join(home, '.config', 'ghfs', 'hub.daemon.json')
}

export function resolveDaemonLogPath(opts: { homeDir?: string } = {}): string {
  const home = opts.homeDir ?? homedir()
  return join(home, '.config', 'ghfs', 'hub.log')
}

export function isProcessAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0)
    return false
  try {
    process.kill(pid, 0)
    return true
  }
  catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    // EPERM means the process exists but we lack permission to signal it.
    return code === 'EPERM'
  }
}

export async function writeDaemonState(state: DaemonState, opts: DaemonPathOptions = {}): Promise<void> {
  const path = resolveDaemonStatePath(opts)
  await mkdir(dirname(path), { recursive: true })
  const tmpPath = `${path}.tmp.${process.pid}.${Date.now()}`
  await writeFile(tmpPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  await rename(tmpPath, path)
}

export async function clearDaemonState(opts: DaemonPathOptions = {}): Promise<void> {
  const path = resolveDaemonStatePath(opts)
  await rm(path, { force: true }).catch(() => {})
}

export async function readDaemonState(opts: DaemonPathOptions = {}): Promise<DaemonState | null> {
  const path = resolveDaemonStatePath(opts)
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  }
  catch {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  }
  catch {
    await clearDaemonState(opts)
    return null
  }
  const result = v.safeParse(DaemonStateSchema, parsed)
  if (!result.success) {
    await clearDaemonState(opts)
    return null
  }
  if (!isProcessAlive(result.output.pid)) {
    await clearDaemonState(opts)
    return null
  }
  return result.output
}

export async function waitForExit(pid: number, timeoutMs: number, intervalMs = 100): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (!isProcessAlive(pid))
      return true
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
  return !isProcessAlive(pid)
}

export class DaemonStartupError extends Error {
  constructor(message: string, readonly logTail: string) {
    super(message)
    this.name = 'DaemonStartupError'
  }
}

export interface SpawnHubDaemonOptions {
  host: string
  port: number
  cwd: string
  /** Maximum ms to wait for the daemon to report readiness via the state file. */
  readyTimeoutMs?: number
  /** Override the entry script path. Defaults to process.argv[1]. */
  entry?: string
  /** Override the node binary. Defaults to process.execPath. */
  nodeBinary?: string
  /** Override the log file path. */
  logPath?: string
  /** Override the state file path. */
  statePath?: string
  /** Override the user's home directory (used when statePath/logPath are absent). */
  homeDir?: string
  /** Override env vars passed to the child. */
  env?: NodeJS.ProcessEnv
}

export async function spawnHubDaemon(opts: SpawnHubDaemonOptions): Promise<DaemonState> {
  const statePath = opts.statePath ?? resolveDaemonStatePath({ homeDir: opts.homeDir })
  const logPath = opts.logPath ?? resolveDaemonLogPath({ homeDir: opts.homeDir })
  const entry = opts.entry ?? process.argv[1]
  const node = opts.nodeBinary ?? process.execPath
  const readyTimeoutMs = opts.readyTimeoutMs ?? 5000

  if (!entry)
    throw new DaemonStartupError('Cannot determine ghfs entry script (process.argv[1] is empty).', '')
  if (entry.endsWith('.ts'))
    throw new DaemonStartupError('ghfs hub daemon mode requires the built CLI (run `pnpm build` first).', '')

  await mkdir(dirname(logPath), { recursive: true })
  await mkdir(dirname(statePath), { recursive: true })

  const args = ['hub', '--no-open', '--host', opts.host, '--port', String(opts.port), '--cwd', opts.cwd]

  const fd = openSync(logPath, 'a')
  let child: ChildProcess
  try {
    child = spawn(node, [entry, ...args], {
      detached: true,
      stdio: ['ignore', fd, fd],
      env: {
        ...(opts.env ?? process.env),
        GHFS_HUB_DAEMON_STATE_FILE: statePath,
      },
    })
  }
  finally {
    closeSync(fd)
  }
  child.unref()

  const childPid = child.pid
  if (childPid === undefined)
    throw new Error('Failed to spawn ghfs hub daemon (no PID)')

  const start = Date.now()
  while (Date.now() - start < readyTimeoutMs) {
    if (!isProcessAlive(childPid)) {
      const tail = await tailLog(logPath, 20)
      throw new DaemonStartupError('ghfs hub daemon exited before becoming ready.', tail)
    }
    const state = await readStateRaw(statePath)
    if (state && state.pid === childPid)
      return state
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  const tail = await tailLog(logPath, 20)
  throw new DaemonStartupError(`ghfs hub daemon did not become ready within ${readyTimeoutMs}ms.`, tail)
}

async function readStateRaw(path: string): Promise<DaemonState | null> {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  }
  catch {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  }
  catch {
    return null
  }
  const result = v.safeParse(DaemonStateSchema, parsed)
  return result.success ? result.output : null
}

async function tailLog(path: string, lines: number): Promise<string> {
  try {
    const raw = await readFile(path, 'utf8')
    const all = raw.split('\n')
    return all.slice(Math.max(0, all.length - lines)).join('\n')
  }
  catch {
    return ''
  }
}

export interface StopHubDaemonOptions extends DaemonPathOptions {
  timeoutMs?: number
}

export interface StopHubDaemonResult {
  /** True if a daemon was running and we stopped it. */
  stopped: boolean
  /** The PID that was killed, if any. */
  pid?: number
  /** True if we had to SIGKILL because SIGTERM didn't take. */
  forced?: boolean
}

export async function stopHubDaemon(opts: StopHubDaemonOptions = {}): Promise<StopHubDaemonResult> {
  const state = await readDaemonState(opts)
  if (!state)
    return { stopped: false }

  const timeoutMs = opts.timeoutMs ?? 5000

  try {
    process.kill(state.pid, 'SIGTERM')
  }
  catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ESRCH') {
      await clearDaemonState(opts)
      return { stopped: false, pid: state.pid }
    }
    throw err
  }

  const exited = await waitForExit(state.pid, timeoutMs)
  let forced = false
  if (!exited) {
    try {
      process.kill(state.pid, 'SIGKILL')
    }
    catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'ESRCH')
        throw err
    }
    await waitForExit(state.pid, 2000)
    forced = true
  }

  await clearDaemonState(opts)
  return { stopped: true, pid: state.pid, forced }
}

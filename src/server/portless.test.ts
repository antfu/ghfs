import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
})

describe('slugifyRepoName', () => {
  it('keeps the repo segment and lowercases', async () => {
    const { slugifyRepoName } = await import('./portless')
    expect(slugifyRepoName('antfu/Ghfs')).toBe('ghfs')
    expect(slugifyRepoName('antfu/ghfs')).toBe('ghfs')
  })

  it('sanitizes non-DNS characters', async () => {
    const { slugifyRepoName } = await import('./portless')
    expect(slugifyRepoName('acme/My.Cool_Repo')).toBe('my-cool-repo')
    expect(slugifyRepoName('acme/--weird--')).toBe('weird')
  })

  it('falls back to "app" for empty input', async () => {
    const { slugifyRepoName } = await import('./portless')
    expect(slugifyRepoName('')).toBe('app')
    expect(slugifyRepoName('acme/___')).toBe('app')
  })

  it('accepts bare names without an owner slash', async () => {
    const { slugifyRepoName } = await import('./portless')
    expect(slugifyRepoName('ghfs')).toBe('ghfs')
  })
})

function mockExecFileOk(stdouts?: Record<string, string>): ReturnType<typeof vi.fn> {
  return vi.fn((_file, args: string[], _opts, cb) => {
    const key = args.slice(1).join(' ')
    const stdout = stdouts?.[key] ?? ''
    cb(null, { stdout, stderr: '' })
  })
}

function mockExecFileErr(stderr: string): ReturnType<typeof vi.fn> {
  return vi.fn((_file, _args, _opts, cb) => {
    const err = new Error('exit 1') as NodeJS.ErrnoException & { stderr?: string, stdout?: string }
    err.stderr = stderr
    cb(err, { stdout: '', stderr })
  })
}

async function loadPortlessModule(execFileMock: ReturnType<typeof vi.fn>) {
  vi.doMock('node:child_process', () => ({ execFile: execFileMock }))
  return await import('./portless')
}

describe('registerPortlessRoute', () => {
  it('shells out to the bundled portless CLI and resolves the URL via `portless get`', async () => {
    const execFileMock = mockExecFileOk({
      'get ghfs.ghfs': 'http://branch.ghfs.ghfs.localhost:1355\n',
    })
    const { registerPortlessRoute } = await loadPortlessModule(execFileMock)

    const route = await registerPortlessRoute({ subdomain: 'ghfs', port: 7710 })

    expect(route.hostname).toBe('ghfs.ghfs')
    expect(route.url).toBe('http://branch.ghfs.ghfs.localhost:1355')
    expect(execFileMock).toHaveBeenCalledTimes(2)
    const aliasCallArgs = execFileMock.mock.calls[0][1] as string[]
    expect(aliasCallArgs[0]).toMatch(/cli\.js$/)
    expect(aliasCallArgs.slice(1)).toEqual(['alias', 'ghfs.ghfs', '7710'])
    const getCallArgs = execFileMock.mock.calls[1][1] as string[]
    expect(getCallArgs.slice(1)).toEqual(['get', 'ghfs.ghfs'])
  })

  it('falls back to https://<name>.<tld> when `portless get` produces nothing', async () => {
    const execFileMock = mockExecFileOk() // both commands succeed with empty stdout
    const { registerPortlessRoute } = await loadPortlessModule(execFileMock)

    const route = await registerPortlessRoute({ subdomain: 'ghfs', port: 7710 })

    expect(route.url).toBe('https://ghfs.ghfs.localhost')
  })

  it('honors a custom namespace', async () => {
    const execFileMock = mockExecFileOk({
      'get acme.demo': 'https://acme.demo.localhost\n',
    })
    const { registerPortlessRoute } = await loadPortlessModule(execFileMock)

    const route = await registerPortlessRoute({ subdomain: 'acme', namespace: 'demo', port: 5173 })

    expect(route.hostname).toBe('acme.demo')
    expect(route.url).toBe('https://acme.demo.localhost')
    const aliasArgs = execFileMock.mock.calls[0][1] as string[]
    expect(aliasArgs.slice(1)).toEqual(['alias', 'acme.demo', '5173'])
  })

  it('throws PortlessUnavailableError with stderr detail on failure', async () => {
    const execFileMock = mockExecFileErr('hostname already registered')
    const { registerPortlessRoute, PortlessUnavailableError } = await loadPortlessModule(execFileMock)

    await expect(registerPortlessRoute({ subdomain: 'ghfs', port: 7710 })).rejects.toBeInstanceOf(PortlessUnavailableError)
    await expect(registerPortlessRoute({ subdomain: 'ghfs', port: 7710 })).rejects.toThrow(/hostname already registered/)
  })

  it('unregister is idempotent and swallows errors', async () => {
    const execFileMock = vi.fn((_file, args: string[], _opts, cb) => {
      const sub = args.slice(1).join(' ')
      if (sub === 'alias ghfs.ghfs 7710' || sub === 'get ghfs.ghfs') {
        cb(null, { stdout: '', stderr: '' })
        return
      }
      const err = new Error('remove failed') as NodeJS.ErrnoException & { stderr?: string }
      err.stderr = 'no such route'
      cb(err, { stdout: '', stderr: 'no such route' })
    })
    const { registerPortlessRoute } = await loadPortlessModule(execFileMock)

    const route = await registerPortlessRoute({ subdomain: 'ghfs', port: 7710 })
    await expect(route.unregister()).resolves.toBeUndefined()
    await expect(route.unregister()).resolves.toBeUndefined()

    expect(execFileMock).toHaveBeenCalledTimes(3)
    const removeArgs = execFileMock.mock.calls[2][1] as string[]
    expect(removeArgs.slice(1)).toEqual(['alias', '--remove', 'ghfs.ghfs'])
  })
})

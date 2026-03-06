import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, describe, expect, it, vi } from 'vitest'

const tempDirs: string[] = []

afterEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.restoreAllMocks()
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('normalizeRepo', () => {
  it('parses supported repo formats', async () => {
    const { normalizeRepo } = await loadRepoModule()

    expect(normalizeRepo('antfu/ghfs')).toBe('antfu/ghfs')
    expect(normalizeRepo('antfu/ghfs.git')).toBe('antfu/ghfs')
    expect(normalizeRepo('github:antfu/ghfs')).toBe('antfu/ghfs')
    expect(normalizeRepo('git@github.com:antfu/ghfs.git')).toBe('antfu/ghfs')
    expect(normalizeRepo('ssh://git@github.com/antfu/ghfs.git')).toBe('antfu/ghfs')
    expect(normalizeRepo('https://github.com/antfu/ghfs.git')).toBe('antfu/ghfs')
    expect(normalizeRepo(' https://github.com/antfu/ghfs/issues ')).toBe('antfu/ghfs')
  })

  it('returns undefined for invalid inputs', async () => {
    const { normalizeRepo } = await loadRepoModule()

    expect(normalizeRepo('')).toBeUndefined()
    expect(normalizeRepo('   ')).toBeUndefined()
    expect(normalizeRepo('not-a-repo')).toBeUndefined()
    expect(normalizeRepo('https://gitlab.com/antfu/ghfs')).toBeUndefined()
    expect(normalizeRepo('https://github.com/antfu')).toBeUndefined()
  })
})

describe('resolveRepo', () => {
  it('uses cli repo first and trims/normalizes it', async () => {
    const cwd = await createTempDir()
    await writeFile(join(cwd, 'package.json'), JSON.stringify({ repository: 'foo/bar' }), 'utf8')

    const { resolveRepo, execFileAsyncMock } = await loadRepoModule({
      remotesOutput: 'origin\n',
      remoteUrls: {
        origin: 'https://github.com/other/repo.git',
      },
    })

    await expect(resolveRepo({
      cwd,
      cliRepo: ' antfu/ghfs.git ',
      configRepo: 'unused/repo',
      interactive: false,
    })).resolves.toEqual({
      repo: 'antfu/ghfs',
      source: 'cli',
      candidates: [],
    })

    expect(execFileAsyncMock).not.toHaveBeenCalled()
  })

  it('throws for invalid cli repo', async () => {
    const cwd = await createTempDir()
    const { resolveRepo } = await loadRepoModule()

    await expect(resolveRepo({
      cwd,
      cliRepo: 'https://gitlab.com/antfu/ghfs',
      interactive: false,
    })).rejects.toThrow('Invalid --repo value')
  })

  it('uses config repo when cli repo is absent', async () => {
    const cwd = await createTempDir()
    const { resolveRepo } = await loadRepoModule()

    await expect(resolveRepo({
      cwd,
      configRepo: 'antfu/ghfs.git',
      interactive: false,
    })).resolves.toEqual({
      repo: 'antfu/ghfs',
      source: 'config',
      candidates: [],
    })
  })

  it('throws for invalid config repo', async () => {
    const cwd = await createTempDir()
    const { resolveRepo } = await loadRepoModule()

    await expect(resolveRepo({
      cwd,
      configRepo: 'invalid-value',
      interactive: false,
    })).rejects.toThrow('Invalid repo in ghfs.config.ts')
  })

  it('detects repository from git remotes', async () => {
    const cwd = await createTempDir()
    const { resolveRepo } = await loadRepoModule({
      remotesOutput: 'origin\nupstream\n',
      remoteUrls: {
        origin: 'https://github.com/antfu/ghfs.git',
      },
    })

    const resolved = await resolveRepo({
      cwd,
      interactive: false,
    })

    expect(resolved.repo).toBe('antfu/ghfs')
    expect(resolved.source).toBe('git')
    expect(resolved.candidates).toEqual([
      {
        source: 'git',
        repo: 'antfu/ghfs',
        detail: 'remote:origin',
      },
    ])
  })

  it('detects repository from package.json string when git is unavailable', async () => {
    const cwd = await createTempDir()
    await writeFile(join(cwd, 'package.json'), JSON.stringify({
      repository: 'https://github.com/antfu/ghfs.git',
    }), 'utf8')

    const { resolveRepo } = await loadRepoModule({
      remoteListError: new Error('not a git repository'),
    })

    await expect(resolveRepo({
      cwd,
      interactive: false,
    })).resolves.toEqual({
      repo: 'antfu/ghfs',
      source: 'package-json',
      candidates: [
        {
          source: 'package-json',
          repo: 'antfu/ghfs',
          detail: 'package.json#repository',
        },
      ],
    })
  })

  it('detects repository from package.json repository.url object', async () => {
    const cwd = await createTempDir()
    await writeFile(join(cwd, 'package.json'), JSON.stringify({
      repository: {
        type: 'git',
        url: 'git@github.com:antfu/ghfs.git',
      },
    }), 'utf8')

    const { resolveRepo } = await loadRepoModule({
      remotesOutput: '',
    })

    const resolved = await resolveRepo({
      cwd,
      interactive: false,
    })

    expect(resolved.repo).toBe('antfu/ghfs')
    expect(resolved.source).toBe('package-json')
  })

  it('throws on repo mismatch in non-interactive mode', async () => {
    const cwd = await createTempDir()
    await writeFile(join(cwd, 'package.json'), JSON.stringify({
      repository: 'https://github.com/other/pkg.git',
    }), 'utf8')

    const { resolveRepo } = await loadRepoModule({
      remotesOutput: 'origin\n',
      remoteUrls: {
        origin: 'https://github.com/antfu/ghfs.git',
      },
      isTTY: false,
    })

    await expect(resolveRepo({
      cwd,
      interactive: false,
    })).rejects.toThrow('Repo mismatch detected')
  })

  it('allows interactive selection when git and package repos mismatch', async () => {
    const cwd = await createTempDir()
    await writeFile(join(cwd, 'package.json'), JSON.stringify({
      repository: 'https://github.com/other/pkg.git',
    }), 'utf8')

    const selectRepoChoice = vi.fn(async () => 'other/pkg')
    const { resolveRepo } = await loadRepoModule({
      remotesOutput: 'origin\n',
      remoteUrls: {
        origin: 'https://github.com/antfu/ghfs.git',
      },
      isTTY: true,
    })

    const resolved = await resolveRepo({
      cwd,
      interactive: true,
      selectRepoChoice,
    })

    expect(selectRepoChoice).toHaveBeenCalledTimes(1)
    expect(resolved.repo).toBe('other/pkg')
    expect(resolved.source).toBe('package-json')
    expect(resolved.candidates).toHaveLength(2)
  })

  it('rejects invalid interactive selection', async () => {
    const cwd = await createTempDir()
    await writeFile(join(cwd, 'package.json'), JSON.stringify({
      repository: 'https://github.com/other/pkg.git',
    }), 'utf8')

    const { resolveRepo } = await loadRepoModule({
      remotesOutput: 'origin\n',
      remoteUrls: {
        origin: 'https://github.com/antfu/ghfs.git',
      },
      isTTY: true,
    })

    await expect(resolveRepo({
      cwd,
      interactive: true,
      selectRepoChoice: async () => 'invalid/repo-name',
    })).rejects.toThrow('Invalid repository selection')
  })

  it('rejects cancelled interactive selection', async () => {
    const cwd = await createTempDir()
    await writeFile(join(cwd, 'package.json'), JSON.stringify({
      repository: 'https://github.com/other/pkg.git',
    }), 'utf8')

    const { resolveRepo } = await loadRepoModule({
      remotesOutput: 'origin\n',
      remoteUrls: {
        origin: 'https://github.com/antfu/ghfs.git',
      },
      isTTY: true,
    })

    await expect(resolveRepo({
      cwd,
      interactive: true,
      selectRepoChoice: async () => undefined,
    })).rejects.toThrow('Repository selection cancelled')
  })

  it('prioritizes origin then upstream before other remotes', async () => {
    const cwd = await createTempDir()
    const { resolveRepo, execFileAsyncMock } = await loadRepoModule({
      remotesOutput: 'fork\nupstream\norigin\n',
      remoteUrls: {
        origin: 'https://gitlab.com/not/github.git',
        upstream: 'git@github.com:antfu/ghfs.git',
        fork: 'git@github.com:someone/fork.git',
      },
    })

    const resolved = await resolveRepo({
      cwd,
      interactive: false,
    })

    expect(resolved.repo).toBe('antfu/ghfs')
    const gitCommands = execFileAsyncMock.mock.calls
      .filter(call => call[0] === 'git')
      .map(call => (call[1] as string[]).join(' '))

    expect(gitCommands).toEqual([
      'remote',
      'remote get-url origin',
      'remote get-url upstream',
    ])
  })

  it('throws when repo cannot be detected', async () => {
    const cwd = await createTempDir()
    const { resolveRepo } = await loadRepoModule({
      remotesOutput: '',
    })

    await expect(resolveRepo({
      cwd,
      interactive: false,
    })).rejects.toThrow('Could not resolve repository')
  })
})

interface LoadRepoModuleOptions {
  remotesOutput?: string
  remoteListError?: Error
  remoteUrls?: Record<string, string | Error>
  isTTY?: boolean
}

async function loadRepoModule(options: LoadRepoModuleOptions = {}) {
  const execFileAsyncMock = vi.fn(async (file: string, args: string[]) => {
    if (file !== 'git')
      throw new Error(`Unexpected binary: ${file}`)

    if (args.length === 1 && args[0] === 'remote') {
      if (options.remoteListError)
        throw options.remoteListError
      return {
        stdout: options.remotesOutput ?? '',
        stderr: '',
      }
    }

    if (args.length === 3 && args[0] === 'remote' && args[1] === 'get-url') {
      const remote = args[2]
      const value = options.remoteUrls?.[remote]
      if (value instanceof Error)
        throw value
      return {
        stdout: typeof value === 'string' ? value : '',
        stderr: '',
      }
    }

    throw new Error(`Unexpected git command: ${args.join(' ')}`)
  })

  vi.doMock('node:util', () => ({
    promisify: vi.fn(() => execFileAsyncMock),
  }))
  vi.doMock('node:child_process', () => ({
    execFile: vi.fn(),
  }))
  vi.doMock('node:process', () => ({
    default: {
      stdin: {
        isTTY: options.isTTY ?? false,
      },
    },
  }))

  const module = await import('./repo')
  return {
    ...module,
    execFileAsyncMock,
  }
}

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ghfs-repo-config-test-'))
  tempDirs.push(dir)
  return dir
}

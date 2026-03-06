import { afterEach, describe, expect, it, vi } from 'vitest'

interface LoadAuthModuleOptions {
  ghToken?: string
  ghError?: Error
  env?: Record<string, string | undefined>
  isTTY?: boolean
}

afterEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('resolveAuthToken', () => {
  it('uses configured token first and trims it', async () => {
    const { resolveAuthToken, execFileAsyncMock, dotenvConfigMock } = await loadAuthModule()

    await expect(resolveAuthToken({
      token: '  configured-token  ',
      interactive: false,
    })).resolves.toBe('configured-token')

    expect(execFileAsyncMock).not.toHaveBeenCalled()
    expect(dotenvConfigMock).not.toHaveBeenCalled()
  })

  it('uses token from gh cli before environment variables', async () => {
    const { resolveAuthToken, dotenvConfigMock } = await loadAuthModule({
      ghToken: ' gh-cli-token \n',
      env: {
        GH_TOKEN: 'env-token',
      },
    })

    await expect(resolveAuthToken({
      interactive: false,
    })).resolves.toBe('gh-cli-token')

    expect(dotenvConfigMock).not.toHaveBeenCalled()
  })

  it('falls back to GH_TOKEN when gh cli is unavailable', async () => {
    const { resolveAuthToken, dotenvConfigMock } = await loadAuthModule({
      ghError: new Error('gh not found'),
      env: {
        GH_TOKEN: '  from-gh-token  ',
      },
    })

    await expect(resolveAuthToken({
      interactive: false,
    })).resolves.toBe('from-gh-token')

    expect(dotenvConfigMock).toHaveBeenCalledTimes(1)
  })

  it('falls back to GITHUB_TOKEN when GH_TOKEN is missing', async () => {
    const { resolveAuthToken } = await loadAuthModule({
      ghToken: '',
      env: {
        GITHUB_TOKEN: '  github-token  ',
      },
    })

    await expect(resolveAuthToken({
      interactive: false,
    })).resolves.toBe('github-token')
  })

  it('throws when token is missing in non-interactive mode', async () => {
    const { resolveAuthToken } = await loadAuthModule({
      ghToken: '',
      env: {},
      isTTY: false,
    })

    await expect(resolveAuthToken({
      interactive: false,
    })).rejects.toThrow('Missing GitHub token')
  })

  it('throws when interactive prompt handler is not provided', async () => {
    const { resolveAuthToken } = await loadAuthModule({
      ghToken: '',
      env: {},
      isTTY: true,
    })

    await expect(resolveAuthToken({
      interactive: true,
    })).rejects.toThrow('Missing GitHub token')
  })

  it('uses prompted token in interactive mode and trims it', async () => {
    const { resolveAuthToken } = await loadAuthModule({
      ghToken: '',
      env: {},
      isTTY: true,
    })
    const promptForToken = vi.fn(async () => '  prompted-token  ')

    await expect(resolveAuthToken({
      interactive: true,
      promptForToken,
    })).resolves.toBe('prompted-token')

    expect(promptForToken).toHaveBeenCalledTimes(1)
  })

  it('throws when prompt is cancelled in interactive mode', async () => {
    const { resolveAuthToken } = await loadAuthModule({
      ghToken: '',
      env: {},
      isTTY: true,
    })

    await expect(resolveAuthToken({
      interactive: true,
      promptForToken: async () => undefined,
    })).rejects.toThrow('Token prompt cancelled')
  })
})

async function loadAuthModule(options: LoadAuthModuleOptions = {}) {
  const execFileAsyncMock = vi.fn(async () => {
    if (options.ghError)
      throw options.ghError
    return {
      stdout: options.ghToken ?? '',
      stderr: '',
    }
  })
  const dotenvConfigMock = vi.fn()
  const processMock = {
    env: {
      ...options.env,
    },
    stdin: {
      isTTY: options.isTTY ?? false,
    },
  }

  vi.doMock('node:util', () => ({
    promisify: vi.fn(() => execFileAsyncMock),
  }))
  vi.doMock('node:child_process', () => ({
    execFile: vi.fn(),
  }))
  vi.doMock('node:process', () => ({
    default: processMock,
  }))
  vi.doMock('dotenv', () => ({
    config: dotenvConfigMock,
  }))

  const module = await import('./auth')
  return {
    ...module,
    execFileAsyncMock,
    dotenvConfigMock,
  }
}

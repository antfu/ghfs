import type { GhfsResolvedConfig } from '../../types'
import type { UiCommandDependencies } from './ui'
import process from 'node:process'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerUiCommand, runUiCommand } from './ui'

describe('registerUiCommand', () => {
  it('registers command with expected options', () => {
    const chain = {
      option: vi.fn(),
      action: vi.fn(),
    }
    vi.mocked(chain.option).mockReturnValue(chain)
    vi.mocked(chain.action).mockReturnValue(chain)

    const cli = {
      command: vi.fn(() => chain),
    }

    registerUiCommand(cli as any)

    expect(cli.command).toHaveBeenCalledWith('ui', 'Serve local Web UI for synced mirror and execute queue')
    expect(chain.option).toHaveBeenCalledWith('--host <host>', 'Host for local UI server', { default: '127.0.0.1' })
    expect(chain.option).toHaveBeenCalledWith('--port <port>', 'Port for local UI server', { default: 3589 })
    expect(chain.action).toHaveBeenCalledTimes(1)
  })
})

describe('runUiCommand', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(process, 'once').mockImplementation(((..._args: any[]) => process) as typeof process.once)
  })

  it('starts ws/http servers and parses numeric port from string', async () => {
    const wsClose = vi.fn(async () => {})
    const httpClose = vi.fn(async () => {})
    const dependencies = createDependencies({
      createWsServer: vi.fn(async () => ({
        wss: {} as any,
        rpc: {} as any,
        serverFunctions: {} as any,
        getMetadata: () => ({ backend: 'websocket' as const, websocket: 49321 }),
        close: wsClose,
      })),
      createUiServer: vi.fn(async () => ({
        url: 'http://localhost:9191',
        close: httpClose,
        server: {} as any,
      })),
    })

    await runUiCommand({ host: '0.0.0.0', port: '9191' as unknown as number }, dependencies)

    expect(dependencies.ensureExecuteArtifacts).toHaveBeenCalledWith('/workspace/.ghfs/execute.yml')
    expect(dependencies.createWsServer).toHaveBeenCalledWith(expect.objectContaining({
      host: '0.0.0.0',
      executeFilePath: '/workspace/.ghfs/execute.yml',
      storageDirAbsolute: '/workspace/.ghfs',
    }))
    expect(dependencies.createUiServer).toHaveBeenCalledWith({
      host: '0.0.0.0',
      port: 9191,
      uiDir: '/workspace/dist/ui',
      getMetadata: expect.any(Function),
    })
  })

  it('closes ws server when http startup fails', async () => {
    const wsClose = vi.fn(async () => {})
    const dependencies = createDependencies({
      createWsServer: vi.fn(async () => ({
        wss: {} as any,
        rpc: {} as any,
        serverFunctions: {} as any,
        getMetadata: () => ({ backend: 'websocket' as const, websocket: 49321 }),
        close: wsClose,
      })),
      createUiServer: vi.fn(async () => {
        throw new Error('missing ui assets')
      }),
    })

    await expect(runUiCommand({}, dependencies)).rejects.toThrow('missing ui assets')
    expect(wsClose).toHaveBeenCalledTimes(1)
  })
})

function createDependencies(overrides: Partial<UiCommandDependencies> = {}): UiCommandDependencies {
  return {
    createCliPrinter: vi.fn(() => ({
      success: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      start: vi.fn(),
      step: vi.fn(),
      done: vi.fn(),
      note: vi.fn(),
      table: vi.fn(),
      print: vi.fn(),
      header: vi.fn(),
      mode: 'plain' as const,
      createSyncReporter: vi.fn(() => ({})),
      createExecuteReporter: vi.fn(() => ({})),
    })),
    resolveConfig: vi.fn(async (): Promise<GhfsResolvedConfig> => ({
      cwd: '/workspace',
      repo: 'owner/repo',
      directory: '.ghfs',
      auth: {
        token: '',
      },
      sync: {
        issues: true,
        pulls: true,
        closed: false,
        patches: 'open',
      },
    })),
    ensureExecuteArtifacts: vi.fn(async (executeFilePath: string) => ({
      executeFilePath,
      schemaPath: '/workspace/.ghfs/schema/execute.schema.json',
    })),
    createUiServer: vi.fn(async () => ({
      close: async () => {},
      url: 'http://localhost:3589',
      server: {} as any,
    })),
    createWsServer: vi.fn(async () => ({
      wss: {} as any,
      rpc: {} as any,
      serverFunctions: {} as any,
      close: async () => {},
      getMetadata: () => ({ backend: 'websocket' as const, websocket: 49321 }),
    })),
    ...overrides,
  }
}

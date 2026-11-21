import type { CliPrinter } from './printer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { formatUnresolvedProjects, reportUnresolvedProjects } from './hub-scan-report'

const scanProjectDirectoriesMock = vi.hoisted(() => vi.fn())

vi.mock('../hub/scan-projects', () => ({ scanProjectDirectories: scanProjectDirectoriesMock }))

function createPrinter(): CliPrinter {
  const noop = () => {}
  return {
    mode: 'plain',
    header: noop,
    start: noop,
    step: noop,
    info: noop,
    success: noop,
    warn: vi.fn(),
    error: noop,
    done: noop,
    note: noop,
    table: noop,
    print: noop,
    createSyncReporter: noop as never,
    createExecuteReporter: noop as never,
  }
}

beforeEach(() => {
  scanProjectDirectoriesMock.mockReset()
})

describe('formatUnresolvedProjects', () => {
  it('prints one name and reason per unresolvable directory', () => {
    const lines = formatUnresolvedProjects([
      { path: '/a/ghfs', name: 'ghfs', repo: 'antfu/ghfs' },
      { path: '/a/fork', name: 'fork', repo: null, error: 'Repo mismatch detected.' },
    ])

    expect(lines).toEqual(['fork: Repo mismatch detected.'])
  })
})

describe('reportUnresolvedProjects', () => {
  it('warns once per hidden directory after a summary line', async () => {
    scanProjectDirectoriesMock.mockResolvedValue([
      { path: '/a/one', name: 'one', repo: null, error: 'Repo mismatch detected. git=fork/one package.json=upstream/one.' },
      { path: '/a/two', name: 'two', repo: null, error: 'Could not resolve repository.' },
      { path: '/a/ghfs', name: 'ghfs', repo: 'antfu/ghfs' },
    ])
    const printer = createPrinter()

    await reportUnresolvedProjects(printer, ['/a'])

    expect(printer.warn).toHaveBeenCalledTimes(3)
    expect(printer.warn).toHaveBeenNthCalledWith(1, '2 hub projects cannot be resolved and stay hidden in the project picker:')
    expect(printer.warn).toHaveBeenNthCalledWith(2, '  one: Repo mismatch detected. git=fork/one package.json=upstream/one.')
    expect(printer.warn).toHaveBeenNthCalledWith(3, '  two: Could not resolve repository.')
  })

  it('stays silent when every directory resolves', async () => {
    scanProjectDirectoriesMock.mockResolvedValue([{ path: '/a/ghfs', name: 'ghfs', repo: 'antfu/ghfs' }])
    const printer = createPrinter()

    await reportUnresolvedProjects(printer, ['/a'])

    expect(printer.warn).not.toHaveBeenCalled()
  })
})

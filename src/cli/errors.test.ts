import process from 'node:process'
import { describe, expect, it, vi } from 'vitest'
import { CodedError, log } from '../logger'
import { withErrorHandling } from './errors'

async function flush(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
  await new Promise(resolve => setTimeout(resolve, 0))
}

describe('withErrorHandling', () => {
  it('renders a CodedError with fix and docs link', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const handler = withErrorHandling(async () => {
      throw new CodedError(log.GHFS0001())
    })
    handler()
    await flush()

    const output = errSpy.mock.calls.flat().join('\n')
    expect(output).toContain('GHFS0001')
    expect(output).toContain('Missing GitHub token')
    expect(output).toContain('fix:')
    expect(output).toContain('https://github.com/antfu/ghfs/blob/main/docs/errors/ghfs0001.md')
    expect(exitSpy).toHaveBeenCalledWith(1)

    errSpy.mockRestore()
    exitSpy.mockRestore()
  })

  it('omits fix/see lines when the diagnostic lacks them', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const handler = withErrorHandling(async () => {
      throw new CodedError({
        code: 'TEST_E0001',
        level: 'error',
        message: 'bare diagnostic',
      })
    })
    handler()
    await flush()

    const lines = errSpy.mock.calls.map(call => call.join(' ')).filter(line => line.trim().length > 0)
    expect(lines.some(line => line.includes('TEST_E0001'))).toBe(true)
    expect(lines.some(line => line.includes('fix:'))).toBe(false)
    expect(lines.some(line => line.includes('see:'))).toBe(false)
    expect(exitSpy).toHaveBeenCalledWith(1)

    errSpy.mockRestore()
    exitSpy.mockRestore()
  })

  it('prints raw errors unchanged when not a CodedError', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const original = new Error('boom')
    const handler = withErrorHandling(async () => {
      throw original
    })
    handler()
    await flush()

    expect(errSpy).toHaveBeenCalledWith(original)
    expect(exitSpy).toHaveBeenCalledWith(1)

    errSpy.mockRestore()
    exitSpy.mockRestore()
  })
})

import type { PendingOp } from '../execute/types'
import c from 'ansis'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createExecutePrompts } from './prompts'

const clackMocks = vi.hoisted(() => ({
  cancel: vi.fn(),
  confirm: vi.fn(),
  multiselect: vi.fn(),
  password: vi.fn(),
  select: vi.fn(),
}))

vi.mock('@clack/prompts', () => ({
  cancel: clackMocks.cancel,
  confirm: clackMocks.confirm,
  isCancel: (value: unknown) => value === Symbol.for('cancel'),
  multiselect: clackMocks.multiselect,
  password: clackMocks.password,
  select: clackMocks.select,
}))

describe('execute prompts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('preselects all operations in multiselect', async () => {
    clackMocks.multiselect.mockResolvedValue([0, 1])

    const prompts = createExecutePrompts()
    await prompts.selectOperations(createOps())

    const call = clackMocks.multiselect.mock.calls[0][0] as {
      options: Array<{ label: string, value: number }>
      initialValues: number[]
      required: boolean
    }

    expect(call.options.map(option => ({
      ...option,
      label: c.strip(option.label),
    }))).toEqual([
      {
        label: '#123 add-labels pr-welcome',
        value: 0,
      },
      {
        label: '#124 close',
        value: 1,
      },
    ])
    expect(call.initialValues).toEqual([0, 1])
    expect(call.required).toBe(false)
  })

  it('uses no as default for run confirmation', async () => {
    clackMocks.confirm.mockResolvedValue(true)

    const prompts = createExecutePrompts()
    await prompts.confirmApply(2)

    expect(clackMocks.confirm).toHaveBeenCalledWith(expect.objectContaining({
      initialValue: false,
      message: 'Run 2 operations on GitHub?',
    }))
  })
})

function createOps(): PendingOp[] {
  return [
    {
      action: 'add-labels',
      number: 123,
      labels: ['pr-welcome'],
    },
    {
      action: 'close',
      number: 124,
    },
  ]
}

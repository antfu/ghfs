import type { PendingOp } from '../execute/types'
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

    expect(clackMocks.multiselect).toHaveBeenCalledWith(expect.objectContaining({
      initialValues: [0, 1],
      required: false,
    }))
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
      action: 'close',
      number: 1,
    },
    {
      action: 'close',
      number: 2,
    },
  ]
}

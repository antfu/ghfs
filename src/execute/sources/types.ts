import type { PendingOp, PendingSimpleOp } from '../types'

export interface ExecuteLoadResult {
  ops: PendingOp[]
  warnings: string[]
  writeRemaining: (remainingIndexes: Set<number>) => Promise<void>
}

export interface ExecuteMdRawLine {
  kind: 'raw'
  raw: string
}

export interface ExecuteMdSingleLine {
  kind: 'single'
  raw: string
  opIndex: number
}

export interface ExecuteMdMultiLine {
  kind: 'multi'
  action: PendingSimpleOp['action']
  opIndexes: number[]
}

export type ExecuteMdLine = ExecuteMdRawLine | ExecuteMdSingleLine | ExecuteMdMultiLine

export interface ExecuteMdParsed {
  ops: PendingOp[]
  warnings: string[]
  lines: ExecuteMdLine[]
}

export type ExecuteMdLineParseResult
  = | { kind: 'single', op: PendingOp }
    | { kind: 'multi', action: PendingSimpleOp['action'], numbers: number[] }
    | { kind: 'warning', message: string }
    | undefined

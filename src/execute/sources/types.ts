import type { PendingOp, PendingSimpleOp } from '../types'

export type ExecuteOpSource = 'execute.yml' | 'execute.md' | 'per-item'

export interface ExecuteSourceEntry {
  op: PendingOp
  source: ExecuteOpSource
  sourceIndex: number
  mergedIndex: number
}

export interface ExecuteLoadResult {
  ops: PendingOp[]
  entries: ExecuteSourceEntry[]
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
  command: string
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
    | { kind: 'multi', action: PendingSimpleOp['action'], command: string, numbers: number[] }
    | { kind: 'warning', message: string }
    | undefined

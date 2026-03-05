import type { PendingOp, PendingSimpleOp } from './types'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'pathe'
import { pathExists } from '../utils/fs'
import { readAndValidateExecuteFile, validateExecuteRules, writeExecuteFile } from './validate'

const MULTI_SIMPLE_ACTIONS = new Set<PendingSimpleOp['action']>([
  'close',
  'reopen',
  'clear-milestone',
  'unlock',
  'mark-ready-for-review',
  'convert-to-draft',
])

interface ExecuteMdRawLine {
  kind: 'raw'
  raw: string
}

interface ExecuteMdSingleLine {
  kind: 'single'
  raw: string
  opIndex: number
}

interface ExecuteMdMultiLine {
  kind: 'multi'
  action: PendingSimpleOp['action']
  opIndexes: number[]
}

type ExecuteMdLine = ExecuteMdRawLine | ExecuteMdSingleLine | ExecuteMdMultiLine

interface ExecuteMdParsed {
  ops: PendingOp[]
  warnings: string[]
  lines: ExecuteMdLine[]
}

export interface ExecuteLoadResult {
  ops: PendingOp[]
  warnings: string[]
  writeRemaining: (remainingIndexes: Set<number>) => Promise<void>
}

export async function loadExecuteSources(executeFilePath: string): Promise<ExecuteLoadResult> {
  const storageDir = dirname(executeFilePath)
  const executeMdPath = join(storageDir, 'execute.md')
  const detailsMdPath = join(storageDir, 'details.md')

  const ymlOps = await readAndValidateExecuteFile(executeFilePath)
  const executeMd = await readExecuteMdFile(executeMdPath)
  const detailsWarnings = await readDetailsMdFile(detailsMdPath)

  const mergedOps = [...ymlOps, ...executeMd.ops]
  const customErrors = validateExecuteRules(mergedOps)
  if (customErrors.length)
    throw new Error(`Invalid execute file: ${customErrors.join('; ')}`)

  return {
    ops: mergedOps,
    warnings: [...executeMd.warnings, ...detailsWarnings],
    async writeRemaining(remainingIndexes) {
      const ymlRemaining = ymlOps.filter((_, index) => remainingIndexes.has(index))
      await writeExecuteFile(executeFilePath, ymlRemaining)

      if (!await pathExists(executeMdPath))
        return

      const mdOffset = ymlOps.length
      const mdRemaining = new Set<number>()
      for (const index of remainingIndexes) {
        if (index >= mdOffset)
          mdRemaining.add(index - mdOffset)
      }
      const content = stringifyExecuteMd(executeMd, mdRemaining)
      await writeFile(executeMdPath, content, 'utf8')
    },
  }
}

async function readExecuteMdFile(path: string): Promise<ExecuteMdParsed> {
  if (!await pathExists(path))
    return { ops: [], warnings: [], lines: [] }

  const raw = await readFile(path, 'utf8')
  const lines = raw.split(/\r?\n/)

  const ops: PendingOp[] = []
  const parsedLines: ExecuteMdLine[] = []
  const warnings: string[] = []

  for (const [lineIndex, rawLine] of lines.entries()) {
    const parsed = parseExecuteMdLine(rawLine)
    if (!parsed) {
      parsedLines.push({ kind: 'raw', raw: rawLine })
      continue
    }

    if (parsed.kind === 'warning') {
      warnings.push(`execute-md line ${lineIndex + 1}: ${parsed.message}`)
      parsedLines.push({ kind: 'raw', raw: rawLine })
      continue
    }

    if (parsed.kind === 'single') {
      const opIndex = ops.length
      ops.push(parsed.op)
      parsedLines.push({ kind: 'single', raw: rawLine, opIndex })
      continue
    }

    const opIndexes: number[] = []
    for (const number of parsed.numbers) {
      opIndexes.push(ops.length)
      ops.push({ action: parsed.action, number })
    }
    parsedLines.push({ kind: 'multi', action: parsed.action, opIndexes })
  }

  return { ops, warnings, lines: parsedLines }
}

function stringifyExecuteMd(parsed: ExecuteMdParsed, remainingOpIndexes: Set<number>): string {
  const lines: string[] = []
  for (const line of parsed.lines) {
    if (line.kind === 'raw') {
      lines.push(line.raw)
      continue
    }

    if (line.kind === 'single') {
      if (remainingOpIndexes.has(line.opIndex))
        lines.push(line.raw)
      continue
    }

    const numbers = line.opIndexes
      .filter(index => remainingOpIndexes.has(index))
      .map(index => parsed.ops[index]?.number)
      .filter((value): value is number => typeof value === 'number')

    if (numbers.length > 0)
      lines.push(`${line.action} ${numbers.map(number => `#${number}`).join(' ')}`)
  }

  return `${lines.join('\n')}\n`
}

async function readDetailsMdFile(path: string): Promise<string[]> {
  if (!await pathExists(path))
    return []

  const raw = await readFile(path, 'utf8')
  if (raw.trim().length === 0)
    return []

  return ['details-md source is currently a placeholder and not executed yet']
}

function parseExecuteMdLine(line: string):
  | { kind: 'single', op: PendingOp }
  | { kind: 'multi', action: PendingSimpleOp['action'], numbers: number[] }
  | { kind: 'warning', message: string }
  | undefined {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#'))
    return undefined

  const tokens = tokenizeCommand(trimmed)
  if (!tokens)
    return { kind: 'warning', message: 'invalid quoted string syntax' }
  if (tokens.length === 0)
    return undefined

  const [command, ...args] = tokens
  if (command === 'set-title') {
    if (args.length !== 2)
      return { kind: 'warning', message: 'set-title expects: set-title #<number> "<title>"' }

    const number = parseIssueRef(args[0])
    if (!number)
      return { kind: 'warning', message: 'set-title expects a single issue reference (#123)' }

    return {
      kind: 'single',
      op: {
        action: 'set-title',
        number,
        title: args[1],
      },
    }
  }

  if (command === 'add-tag') {
    if (args.length < 2)
      return { kind: 'warning', message: 'add-tag expects: add-tag #<number> <tag1, tag2>' }

    const number = parseIssueRef(args[0])
    if (!number)
      return { kind: 'warning', message: 'add-tag expects a single issue reference (#123)' }

    const labels = args
      .slice(1)
      .flatMap(value => value.split(','))
      .map(value => value.trim())
      .filter(Boolean)

    if (labels.length === 0)
      return { kind: 'warning', message: 'add-tag requires at least one tag' }

    return {
      kind: 'single',
      op: {
        action: 'add-labels',
        number,
        labels,
      },
    }
  }

  if (MULTI_SIMPLE_ACTIONS.has(command as PendingSimpleOp['action'])) {
    const action = command as PendingSimpleOp['action']
    const numbers = args.map(parseIssueRef)
    if (numbers.length === 0 || numbers.some(number => !number)) {
      return {
        kind: 'warning',
        message: `${command} expects one or more issue references (#123 #456)`,
      }
    }

    return {
      kind: 'multi',
      action,
      numbers: numbers as number[],
    }
  }

  return { kind: 'warning', message: `unrecognized action pattern: ${command}` }
}

function parseIssueRef(value: string): number | undefined {
  const match = value.match(/^#(\d+)$/)
  if (!match)
    return undefined

  const number = Number.parseInt(match[1], 10)
  if (!Number.isInteger(number) || number <= 0)
    return undefined

  return number
}

function tokenizeCommand(value: string): string[] | undefined {
  const tokens: string[] = []
  let index = 0

  while (index < value.length) {
    while (index < value.length && /\s/.test(value[index]))
      index += 1

    if (index >= value.length)
      break

    if (value[index] === '"') {
      index += 1
      let token = ''
      let closed = false

      while (index < value.length) {
        const char = value[index]
        if (char === '\\') {
          const next = value[index + 1]
          if (next === '"' || next === '\\') {
            token += next
            index += 2
            continue
          }
        }

        if (char === '"') {
          closed = true
          index += 1
          break
        }

        token += char
        index += 1
      }

      if (!closed)
        return undefined

      tokens.push(token)
      continue
    }

    const start = index
    while (index < value.length && !/\s/.test(value[index]))
      index += 1

    tokens.push(value.slice(start, index))
  }

  return tokens
}

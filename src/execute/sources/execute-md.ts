import type { PendingSimpleOp } from '../types'
import type { ExecuteMdLineParseResult, ExecuteMdParsed } from './types'
import { readFile } from 'node:fs/promises'
import { diagnostics, formatInline } from '../../logger'
import { pathExists } from '../../utils/fs'
import { resolveActionName } from '../actions'

const MULTI_SIMPLE_ACTIONS = new Set<PendingSimpleOp['action']>([
  'close',
  'reopen',
  'clear-milestone',
  'unlock',
  'mark-ready-for-review',
  'convert-to-draft',
])

export function parseExecuteMdLine(line: string): ExecuteMdLineParseResult {
  const trimmed = line.trim()
  if (!trimmed || isCommentLine(trimmed))
    return undefined

  const tokens = tokenizeCommand(trimmed)
  if (!tokens)
    return { kind: 'warning', message: formatInline(diagnostics.GHFS0150()) }
  if (tokens.length === 0)
    return undefined

  const [commandInput, ...args] = tokens
  const command = resolveActionName(commandInput)
  if (!command)
    return { kind: 'warning', message: formatInline(diagnostics.GHFS0151({ command: commandInput })) }

  if (command === 'set-title')
    return parseSetTitle(args)

  if (command === 'add-labels')
    return parseAddLabels(args, commandInput)

  if (command === 'add-assignees')
    return parseAddAssignees(args, commandInput)

  if (command === 'add-comment')
    return parseAddComment(args, commandInput)

  if (command === 'close-with-comment')
    return parseCloseWithComment(args, commandInput)

  if (MULTI_SIMPLE_ACTIONS.has(command as PendingSimpleOp['action']))
    return parseMultiSimpleAction(command as PendingSimpleOp['action'], args, commandInput)

  return { kind: 'warning', message: formatInline(diagnostics.GHFS0151({ command: commandInput })) }
}

export async function readExecuteMdFile(path: string): Promise<ExecuteMdParsed> {
  if (!await pathExists(path))
    return parseExecuteMd('')

  const raw = await readFile(path, 'utf8')
  return parseExecuteMd(raw)
}

export function parseExecuteMd(raw: string): ExecuteMdParsed {
  const lines = raw.split(/\r?\n/)

  const ops = [] as ExecuteMdParsed['ops']
  const parsedLines = [] as ExecuteMdParsed['lines']
  const warnings: string[] = []
  let inHtmlCommentBlock = false

  for (const [lineIndex, rawLine] of lines.entries()) {
    const trimmed = rawLine.trim()
    if (inHtmlCommentBlock) {
      parsedLines.push({ kind: 'raw', raw: rawLine })
      if (trimmed.includes('-->'))
        inHtmlCommentBlock = false
      continue
    }

    if (trimmed.startsWith('<!--')) {
      parsedLines.push({ kind: 'raw', raw: rawLine })
      if (!trimmed.includes('-->'))
        inHtmlCommentBlock = true
      continue
    }

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
    parsedLines.push({ kind: 'multi', action: parsed.action, command: parsed.command, opIndexes })
  }

  return { ops, warnings, lines: parsedLines }
}

export function stringifyExecuteMd(parsed: ExecuteMdParsed, remainingOpIndexes: Set<number>): string {
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
      lines.push(`${line.command} ${numbers.map(number => `#${number}`).join(' ')}`)
  }

  return `${lines.join('\n')}\n`
}

function parseSetTitle(args: string[]): ExecuteMdLineParseResult {
  if (args.length !== 2)
    return { kind: 'warning', message: formatInline(diagnostics.GHFS0152({ command: 'set-title', syntax: 'set-title #<number> "<title>"' })) }

  const number = parseIssueRef(args[0])
  if (!number)
    return { kind: 'warning', message: formatInline(diagnostics.GHFS0153({ command: 'set-title' })) }

  return {
    kind: 'single',
    op: {
      action: 'set-title',
      number,
      title: args[1],
    },
  }
}

function parseAddLabels(args: string[], command: string): ExecuteMdLineParseResult {
  if (args.length < 2)
    return { kind: 'warning', message: formatInline(diagnostics.GHFS0152({ command, syntax: `${command} #<number> <label1, label2>` })) }

  const number = parseIssueRef(args[0])
  if (!number)
    return { kind: 'warning', message: formatInline(diagnostics.GHFS0153({ command })) }

  const labels = args
    .slice(1)
    .flatMap(value => value.split(','))
    .map(value => value.trim())
    .filter(Boolean)

  if (labels.length === 0)
    return { kind: 'warning', message: formatInline(diagnostics.GHFS0154({ command })) }

  return {
    kind: 'single',
    op: {
      action: 'add-labels',
      number,
      labels,
    },
  }
}

function parseAddAssignees(args: string[], command: string): ExecuteMdLineParseResult {
  if (args.length < 2)
    return { kind: 'warning', message: formatInline(diagnostics.GHFS0152({ command, syntax: `${command} #<number> <assignee1, assignee2>` })) }

  const number = parseIssueRef(args[0])
  if (!number)
    return { kind: 'warning', message: formatInline(diagnostics.GHFS0153({ command })) }

  const assignees = args
    .slice(1)
    .flatMap(value => value.split(','))
    .map(value => value.trim())
    .filter(Boolean)

  if (assignees.length === 0)
    return { kind: 'warning', message: formatInline(diagnostics.GHFS0155({ command })) }

  return {
    kind: 'single',
    op: {
      action: 'add-assignees',
      number,
      assignees,
    },
  }
}

function parseAddComment(args: string[], command: string): ExecuteMdLineParseResult {
  if (args.length < 2)
    return { kind: 'warning', message: formatInline(diagnostics.GHFS0152({ command, syntax: `${command} #<number> "<comment>"` })) }

  const number = parseIssueRef(args[0])
  if (!number)
    return { kind: 'warning', message: formatInline(diagnostics.GHFS0153({ command })) }

  const body = args.slice(1).join(' ').trim()
  if (!body)
    return { kind: 'warning', message: formatInline(diagnostics.GHFS0156({ command })) }

  return {
    kind: 'single',
    op: {
      action: 'add-comment',
      number,
      body,
    },
  }
}

function parseCloseWithComment(args: string[], command: string): ExecuteMdLineParseResult {
  if (args.length < 2)
    return { kind: 'warning', message: formatInline(diagnostics.GHFS0152({ command, syntax: `${command} #<number> "<comment>"` })) }

  const number = parseIssueRef(args[0])
  if (!number)
    return { kind: 'warning', message: formatInline(diagnostics.GHFS0153({ command })) }

  const body = args.slice(1).join(' ').trim()
  if (!body)
    return { kind: 'warning', message: formatInline(diagnostics.GHFS0156({ command })) }

  return {
    kind: 'single',
    op: {
      action: 'close-with-comment',
      number,
      body,
    },
  }
}

function parseMultiSimpleAction(action: PendingSimpleOp['action'], args: string[], command: string): ExecuteMdLineParseResult {
  const numbers = args.map(parseIssueRef)
  if (numbers.length === 0 || numbers.some(number => !number)) {
    return {
      kind: 'warning',
      message: formatInline(diagnostics.GHFS0157({ command })),
    }
  }

  return {
    kind: 'multi',
    action,
    command,
    numbers: numbers as number[],
  }
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

function isCommentLine(trimmed: string): boolean {
  return trimmed.startsWith('#')
    || trimmed.startsWith('//')
    || trimmed.startsWith('<!--')
}

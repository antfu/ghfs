import type { PendingSimpleOp } from '../types'
import type { ExecuteMdLineParseResult } from './types'

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
  if (!trimmed || trimmed.startsWith('#'))
    return undefined

  const tokens = tokenizeCommand(trimmed)
  if (!tokens)
    return { kind: 'warning', message: 'invalid quoted string syntax' }
  if (tokens.length === 0)
    return undefined

  const [command, ...args] = tokens
  if (command === 'set-title')
    return parseSetTitle(args)

  if (command === 'add-tag')
    return parseAddTag(args)

  if (MULTI_SIMPLE_ACTIONS.has(command as PendingSimpleOp['action']))
    return parseMultiSimpleAction(command as PendingSimpleOp['action'], args)

  return { kind: 'warning', message: `unrecognized action pattern: ${command}` }
}

function parseSetTitle(args: string[]): ExecuteMdLineParseResult {
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

function parseAddTag(args: string[]): ExecuteMdLineParseResult {
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

function parseMultiSimpleAction(action: PendingSimpleOp['action'], args: string[]): ExecuteMdLineParseResult {
  const numbers = args.map(parseIssueRef)
  if (numbers.length === 0 || numbers.some(number => !number)) {
    return {
      kind: 'warning',
      message: `${action} expects one or more issue references (#123 #456)`,
    }
  }

  return {
    kind: 'multi',
    action,
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

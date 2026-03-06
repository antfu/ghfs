import type { ExecuteMdParsed } from './types'
import { readFile } from 'node:fs/promises'
import { pathExists } from '../../utils/fs'
import { parseExecuteMdLine } from './execute-md-parser'

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
      lines.push(`${line.action} ${numbers.map(number => `#${number}`).join(' ')}`)
  }

  return `${lines.join('\n')}\n`
}

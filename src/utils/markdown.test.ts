import { describe, expect, it } from 'vitest'
import { escapeInlineCode, escapeTableCell, getTimestamp, isRecord, renderRowsTable } from './markdown'

describe('isRecord', () => {
  it('accepts plain objects only', () => {
    expect(isRecord({ a: 1 })).toBe(true)
    expect(isRecord(null)).toBe(false)
    expect(isRecord([])).toBe(false)
  })
})

describe('getTimestamp', () => {
  it('parses valid timestamps and falls back for invalid values', () => {
    expect(getTimestamp('2026-02-01T00:00:00.000Z')).toBe(Date.parse('2026-02-01T00:00:00.000Z'))
    expect(getTimestamp('not-a-date')).toBe(Number.NEGATIVE_INFINITY)
  })
})

describe('renderRowsTable', () => {
  it('renders placeholder row when table is empty', () => {
    expect(renderRowsTable([])).toEqual([
      '| Number | Title | Labels | Updated | File |',
      '| --- | --- | --- | --- | --- |',
      '| - | - | - | - | - |',
    ])
  })

  it('escapes markdown-sensitive values', () => {
    const lines = renderRowsTable([
      {
        number: 1,
        title: 'A | B\nC',
        labels: ['bug`one'],
        updatedAt: '2026-02-01T00:00:00.000Z',
        filePath: 'issues/00001-a.md',
      },
    ])

    expect(lines[2]).toBe('| #1 | A \\| B C | `bug\\`one` | 2026-02-01T00:00:00.000Z | [issues/00001-a.md](issues/00001-a.md) |')
  })
})

describe('escapeTableCell', () => {
  it('normalizes newlines, escapes pipes, and trims whitespace', () => {
    expect(escapeTableCell('  A |\n B  ')).toBe('A \\|  B')
    expect(escapeTableCell('   ')).toBe('-')
  })
})

describe('escapeInlineCode', () => {
  it('escapes backticks for markdown inline code', () => {
    expect(escapeInlineCode('bug`fix')).toBe('bug\\`fix')
  })
})

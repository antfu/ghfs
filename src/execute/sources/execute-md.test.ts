import { describe, expect, it } from 'vitest'
import { parseExecuteMd, parseExecuteMdLine, stringifyExecuteMd } from './execute-md'

describe('parseExecuteMdLine', () => {
  it('parses simple multi-target action', () => {
    expect(parseExecuteMdLine('close #1 #2')).toEqual({
      kind: 'multi',
      action: 'close',
      command: 'close',
      numbers: [1, 2],
    })
  })

  it('parses mixed-case and aliases for simple actions', () => {
    expect(parseExecuteMdLine('ClOsEs #1 #2')).toEqual({
      kind: 'multi',
      action: 'close',
      command: 'ClOsEs',
      numbers: [1, 2],
    })
    expect(parseExecuteMdLine('open #3')).toEqual({
      kind: 'multi',
      action: 'reopen',
      command: 'open',
      numbers: [3],
    })
    expect(parseExecuteMdLine('ReAdY #4')).toEqual({
      kind: 'multi',
      action: 'mark-ready-for-review',
      command: 'ReAdY',
      numbers: [4],
    })
  })

  it('parses set-title with quoted value', () => {
    expect(parseExecuteMdLine('set-title #2 "new title"')).toEqual({
      kind: 'single',
      op: {
        action: 'set-title',
        number: 2,
        title: 'new title',
      },
    })
  })

  it('parses set-title alias case-insensitively', () => {
    expect(parseExecuteMdLine('TiTlE #2 "new title"')).toEqual({
      kind: 'single',
      op: {
        action: 'set-title',
        number: 2,
        title: 'new title',
      },
    })
  })

  it('supports escaped quote and slash in quoted values', () => {
    expect(parseExecuteMdLine(String.raw`set-title #2 "a \"quoted\" title"`)).toEqual({
      kind: 'single',
      op: {
        action: 'set-title',
        number: 2,
        title: 'a "quoted" title',
      },
    })
  })

  it('parses add-label aliases and trims labels', () => {
    expect(parseExecuteMdLine('add-tag #3 foo, bar,baz')).toEqual({
      kind: 'single',
      op: {
        action: 'add-labels',
        number: 3,
        labels: ['foo', 'bar', 'baz'],
      },
    })
    expect(parseExecuteMdLine('LaBeL #3 foo, bar,baz')).toEqual({
      kind: 'single',
      op: {
        action: 'add-labels',
        number: 3,
        labels: ['foo', 'bar', 'baz'],
      },
    })
    expect(parseExecuteMdLine('add-labels #3 foo, bar,baz')).toEqual({
      kind: 'single',
      op: {
        action: 'add-labels',
        number: 3,
        labels: ['foo', 'bar', 'baz'],
      },
    })
  })

  it('parses add-assignees aliases', () => {
    expect(parseExecuteMdLine('assign #3 antfu, octocat')).toEqual({
      kind: 'single',
      op: {
        action: 'add-assignees',
        number: 3,
        assignees: ['antfu', 'octocat'],
      },
    })
    expect(parseExecuteMdLine('add-assignees #3 antfu')).toEqual({
      kind: 'single',
      op: {
        action: 'add-assignees',
        number: 3,
        assignees: ['antfu'],
      },
    })
  })

  it('parses add-comment aliases', () => {
    expect(parseExecuteMdLine('comment #3 "looks good"')).toEqual({
      kind: 'single',
      op: {
        action: 'add-comment',
        number: 3,
        body: 'looks good',
      },
    })
    expect(parseExecuteMdLine('add-comment #3 needs follow-up')).toEqual({
      kind: 'single',
      op: {
        action: 'add-comment',
        number: 3,
        body: 'needs follow-up',
      },
    })
  })

  it('parses close-with-comment and its aliases', () => {
    expect(parseExecuteMdLine('close-with-comment #3 "closing now"')).toEqual({
      kind: 'single',
      op: {
        action: 'close-with-comment',
        number: 3,
        body: 'closing now',
      },
    })
    expect(parseExecuteMdLine('close-comment #3 "closing now"')).toEqual({
      kind: 'single',
      op: {
        action: 'close-with-comment',
        number: 3,
        body: 'closing now',
      },
    })
    expect(parseExecuteMdLine('comment-and-close #3 done')).toEqual({
      kind: 'single',
      op: {
        action: 'close-with-comment',
        number: 3,
        body: 'done',
      },
    })
  })

  it('returns warning for malformed quoted text', () => {
    expect(parseExecuteMdLine('set-title #1 "oops')).toEqual({
      kind: 'warning',
      message: '[GHFS_W0150] invalid quoted string syntax',
    })
  })

  it('returns warning for unknown command', () => {
    expect(parseExecuteMdLine('unknown #1')).toEqual({
      kind: 'warning',
      message: '[GHFS_W0151] unrecognized action pattern: unknown',
    })
  })

  it('ignores comments and blank lines', () => {
    expect(parseExecuteMdLine('')).toBeUndefined()
    expect(parseExecuteMdLine('   ')).toBeUndefined()
    expect(parseExecuteMdLine('# close #1')).toBeUndefined()
    expect(parseExecuteMdLine('// close #1')).toBeUndefined()
    expect(parseExecuteMdLine('<!-- close #1 -->')).toBeUndefined()
  })
})

describe('stringifyExecuteMd', () => {
  it('keeps raw lines and only remaining operations', () => {
    const parsed = parseExecuteMd([
      '# header',
      'ClOsEs #1 #2 #3',
      'set-title #4 "new title"',
      'add-tag #5 foo, bar',
      'unknown #6',
    ].join('\n'))

    expect(parsed.warnings).toEqual([
      'execute-md line 5: [GHFS_W0151] unrecognized action pattern: unknown',
    ])

    const output = stringifyExecuteMd(parsed, new Set([1, 3, 4]))
    expect(output).toBe([
      '# header',
      'ClOsEs #2',
      'set-title #4 "new title"',
      'add-tag #5 foo, bar',
      'unknown #6',
      '',
    ].join('\n'))
  })

  it('preserves // and html comments during writeback', () => {
    const parsed = parseExecuteMd([
      '// inline comment',
      '<!--',
      '  html comment block',
      '-->',
      'close #1 #2',
      '',
    ].join('\n'))

    expect(parsed.warnings).toEqual([])

    const output = stringifyExecuteMd(parsed, new Set([1]))
    expect(output).toBe([
      '// inline comment',
      '<!--',
      '  html comment block',
      '-->',
      'close #2',
      '',
      '',
    ].join('\n'))
  })
})

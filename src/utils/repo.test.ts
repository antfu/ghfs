import { describe, expect, it } from 'vitest'
import { splitRepo } from './repo'

describe('splitRepo', () => {
  it('splits owner and repository name from a slug', () => {
    expect(splitRepo('antfu/ghfs')).toEqual({
      owner: 'antfu',
      repo: 'ghfs',
    })
  })

  it('throws on invalid repo slug', () => {
    expect(() => splitRepo('antfu')).toThrowError('Invalid repo slug: antfu')
    expect(() => splitRepo('/ghfs')).toThrowError('Invalid repo slug: /ghfs')
  })
})

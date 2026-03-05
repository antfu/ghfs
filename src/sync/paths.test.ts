import { join } from 'pathe'
import { describe, expect, it } from 'vitest'
import {
  getClosedIssuesDir,
  getClosedPullsDir,
  getIssueMarkdownPath,
  getIssuesDir,
  getItemFileName,
  getItemMarkdownPath,
  getPrPatchPath,
  getPullMarkdownPath,
  getPullsDir,
} from './paths'

describe('sync paths', () => {
  const root = join('/tmp', 'ghfs', '.ghfs')

  it('resolves issue directories', () => {
    expect(getIssuesDir(root)).toBe(join(root, 'issues'))
    expect(getClosedIssuesDir(root)).toBe(join(root, 'issues', 'closed'))
    expect(getPullsDir(root)).toBe(join(root, 'pulls'))
    expect(getClosedPullsDir(root)).toBe(join(root, 'pulls', 'closed'))
  })

  it('resolves markdown paths by issue state', () => {
    expect(getIssueMarkdownPath(root, 12, 'open', 'Fix bug #12')).toBe(join(root, 'issues', '00012-fix-bug-12.md'))
    expect(getIssueMarkdownPath(root, 12, 'closed', 'Fix bug #12')).toBe(join(root, 'issues', 'closed', '00012-fix-bug-12.md'))
    expect(getPullMarkdownPath(root, 12, 'open', 'PR: Fix bug #12')).toBe(join(root, 'pulls', '00012-pr-fix-bug-12.md'))
    expect(getPullMarkdownPath(root, 12, 'closed', 'PR: Fix bug #12')).toBe(join(root, 'pulls', 'closed', '00012-pr-fix-bug-12.md'))
    expect(getItemMarkdownPath(root, 'issue', 12, 'open', 'Fix bug #12')).toBe(join(root, 'issues', '00012-fix-bug-12.md'))
    expect(getItemMarkdownPath(root, 'pull', 12, 'closed', 'PR: Fix bug #12')).toBe(join(root, 'pulls', 'closed', '00012-pr-fix-bug-12.md'))
  })

  it('builds padded slug file names', () => {
    expect(getItemFileName(134, 'Some bug')).toBe('00134-some-bug.md')
    expect(getItemFileName(9, '---')).toBe('00009-item.md')
  })

  it('resolves pull patch path', () => {
    expect(getPrPatchPath(root, 42)).toBe(join(root, 'pulls', '42.patch'))
  })
})

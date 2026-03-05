import { describe, expect, it } from 'vitest'
import { renderIssueMarkdown } from './markdown'

describe('renderIssueMarkdown', () => {
  it('renders compact frontmatter and sections', () => {
    const markdown = renderIssueMarkdown({
      repo: 'antfu/ghfs',
      number: 1,
      kind: 'issue',
      url: 'https://github.com/antfu/ghfs/issues/1',
      state: 'open',
      title: 'Example issue',
      body: 'Body text',
      author: 'antfu',
      labels: ['bug'],
      assignees: ['antfu'],
      milestone: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T01:00:00.000Z',
      closedAt: null,
      lastSyncedAt: '2026-01-01T02:00:00.000Z',
      comments: [
        {
          id: 10,
          author: 'alice',
          body: 'Looks good',
          createdAt: '2026-01-01T03:00:00.000Z',
          updatedAt: '2026-01-01T03:00:00.000Z',
        },
        {
          id: 11,
          author: 'bob',
          body: 'Needs tests',
          createdAt: '2026-01-01T04:00:00.000Z',
          updatedAt: '2026-01-01T04:00:00.000Z',
        },
      ],
    })

    expect(markdown).toContain('schema: ghfs/issue-doc@v1')
    expect(markdown).toContain('url: https://github.com/antfu/ghfs/issues/1')
    expect(markdown).not.toContain('\nrepo:')
    expect(markdown).not.toContain('\nkind:')
    expect(markdown).not.toContain('\nmilestone:')
    expect(markdown).toContain('# Example issue')
    expect(markdown).toContain('## Description')
    expect(markdown).toContain('## Comments')
    expect(markdown).toContain('<!-- comment-id:10')
    expect(markdown).toMatch(/### @alice on 2026-01-01T03:00:00\.000Z[\s\S]*?Looks good\n\n---\n\n### @bob on 2026-01-01T04:00:00\.000Z/)
  })

  it('renders pull request metadata and empty placeholders', () => {
    const markdown = renderIssueMarkdown({
      repo: 'antfu/ghfs',
      number: 2,
      kind: 'pull',
      state: 'closed',
      title: 'PR title',
      body: '',
      author: 'antfu',
      labels: [],
      assignees: [],
      milestone: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T01:00:00.000Z',
      closedAt: '2026-01-01T02:00:00.000Z',
      lastSyncedAt: '2026-01-01T03:00:00.000Z',
      comments: [],
      pr: {
        isDraft: true,
        merged: false,
        mergedAt: null,
        baseRef: 'main',
        headRef: 'feature',
        requestedReviewers: ['alice'],
      },
    })

    expect(markdown).toContain('url: https://github.com/antfu/ghfs/pull/2')
    expect(markdown).toContain('labels: []')
    expect(markdown).toContain('assignees: []')
    expect(markdown).toContain('is_draft: true')
    expect(markdown).not.toContain('\nmerged: false')
    expect(markdown).not.toContain('\nmerged_at:')
    expect(markdown).toContain('_No description._')
    expect(markdown).toContain('_No comments._')
  })
})

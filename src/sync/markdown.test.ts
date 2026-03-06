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
      reactions: {
        totalCount: 2,
        plusOne: 1,
        minusOne: 0,
        laugh: 0,
        hooray: 0,
        confused: 0,
        heart: 1,
        rocket: 0,
        eyes: 0,
      },
      comments: [
        {
          id: 10,
          author: 'alice',
          body: 'Looks good',
          createdAt: '2026-01-01T03:00:00.000Z',
          updatedAt: '2026-01-01T03:00:00.000Z',
          reactions: {
            totalCount: 1,
            plusOne: 0,
            minusOne: 0,
            laugh: 0,
            hooray: 1,
            confused: 0,
            heart: 0,
            rocket: 0,
            eyes: 0,
          },
        },
        {
          id: 11,
          author: 'bob',
          body: 'Needs tests',
          createdAt: '2026-01-01T04:00:00.000Z',
          updatedAt: '2026-01-01T04:00:00.000Z',
          reactions: {
            totalCount: 0,
            plusOne: 0,
            minusOne: 0,
            laugh: 0,
            hooray: 0,
            confused: 0,
            heart: 0,
            rocket: 0,
            eyes: 0,
          },
        },
      ],
    })

    expect(markdown).toContain('url: https://github.com/antfu/ghfs/issues/1')
    expect(markdown).not.toContain('\nrepo:')
    expect(markdown).not.toContain('\nkind:')
    expect(markdown).not.toContain('\nmilestone:')
    expect(markdown).toContain('reactions:')
    expect(markdown).toContain('👍: 1')
    expect(markdown).toContain('❤️: 1')
    expect(markdown).toContain('# Example issue')
    expect(markdown).toContain('## Description')
    expect(markdown).toContain('> `👍 1` | `❤️ 1`')
    expect(markdown).toContain('## Comments')
    expect(markdown).toContain('<!-- comment-id:10')
    expect(markdown).toContain('> `🎉 1`')
    expect(markdown).not.toContain('<table>')
    expect(markdown).toMatch(/### @alice on 2026-01-01T03:00:00\.000Z[\s\S]*?Looks good[\s\S]*?### @bob on 2026-01-01T04:00:00\.000Z/)
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
      reactions: {
        totalCount: 0,
        plusOne: 0,
        minusOne: 0,
        laugh: 0,
        hooray: 0,
        confused: 0,
        heart: 0,
        rocket: 0,
        eyes: 0,
      },
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
    expect(markdown).not.toContain('\nreactions:')
    expect(markdown).toContain('_No description._')
    expect(markdown).not.toContain('> `')
    expect(markdown).toContain('_No comments._')
  })
})

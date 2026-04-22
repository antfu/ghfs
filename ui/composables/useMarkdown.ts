import { Marked } from 'marked'
import { EMOJI_MAP } from './emojiMap'

const marked = new Marked({
  gfm: true,
  breaks: true,
})

marked.use({
  renderer: {
    link({ href, title, tokens }) {
      const parser = (this as unknown as { parser: { parseInline: (t: unknown) => string } }).parser
      const text = parser?.parseInline(tokens) ?? ''
      const titleAttr = title ? ` title="${escapeAttr(title)}"` : ''
      const external = /^https?:\/\//i.test(href)
      const extra = external ? ' target="_blank" rel="noreferrer noopener"' : ''
      return `<a href="${escapeAttr(href)}"${titleAttr}${extra}>${text}</a>`
    },
    image({ href, title, text }) {
      const titleAttr = title ? ` title="${escapeAttr(title)}"` : ''
      return `<img src="${escapeAttr(href)}" alt="${escapeAttr(text)}"${titleAttr} loading="lazy">`
    },
  },
  extensions: [{
    name: 'emoji',
    level: 'inline',
    start(src: string) {
      const match = src.match(/:[a-z0-9_+-]+:/i)
      return match?.index
    },
    tokenizer(src: string) {
      const match = /^:([a-z0-9_+-]+):/i.exec(src)
      if (!match)
        return
      const emoji = EMOJI_MAP[match[1].toLowerCase()]
      if (!emoji)
        return
      return {
        type: 'emoji',
        raw: match[0],
        emoji,
      }
    },
    renderer(token: { emoji?: string }) {
      return `<g-emoji class="emoji">${token.emoji ?? ''}</g-emoji>`
    },
  }],
})

export function renderMarkdown(source: string | null | undefined): string {
  if (!source)
    return ''
  try {
    return marked.parse(source, { async: false }) as string
  }
  catch {
    return escapeHtml(source)
  }
}

export function renderMarkdownInline(source: string | null | undefined): string {
  if (!source)
    return ''
  try {
    return marked.parseInline(source, { async: false }) as string
  }
  catch {
    return escapeHtml(source)
  }
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttr(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

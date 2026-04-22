import { Marked } from 'marked'

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

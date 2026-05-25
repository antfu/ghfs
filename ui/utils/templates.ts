export interface TemplateContext {
  author?: string | null
  number?: number | null
  title?: string | null
}

/**
 * Replace `{{author}}`, `{{number}}`, `{{title}}` placeholders in a template
 * body. Missing values leave the placeholder untouched so a user-visible typo
 * doesn't silently disappear.
 */
export function applyVariables(body: string, ctx: TemplateContext): string {
  let out = body
  if (ctx.author)
    out = out.replaceAll('{{author}}', `@${ctx.author}`)
  if (typeof ctx.number === 'number')
    out = out.replaceAll('{{number}}', String(ctx.number))
  if (ctx.title)
    out = out.replaceAll('{{title}}', ctx.title)
  return out
}

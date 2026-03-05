export function slugifyTitle(title: string, maxLength = 48): string {
  const normalized = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (!normalized)
    return 'item'

  return normalized.slice(0, maxLength).replace(/-+$/g, '') || 'item'
}

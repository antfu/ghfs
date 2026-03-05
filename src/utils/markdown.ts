export interface SyncSnapshotIndexRow {
  number: number
  title: string
  labels: string[]
  updatedAt: string
  filePath: string
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function getTimestamp(value: string): number {
  const timestamp = Date.parse(value)
  if (Number.isFinite(timestamp))
    return timestamp
  return Number.NEGATIVE_INFINITY
}

export function renderRowsTable(rows: SyncSnapshotIndexRow[]): string[] {
  const lines = [
    '| Number | Title | Labels | Updated | File |',
    '| --- | --- | --- | --- | --- |',
  ]

  if (rows.length === 0) {
    lines.push('| - | - | - | - | - |')
    return lines
  }

  for (const row of rows) {
    const labels = row.labels.length
      ? row.labels.map(label => `\`${escapeInlineCode(label)}\``).join(', ')
      : '-'

    lines.push(
      `| #${row.number} | ${escapeTableCell(row.title)} | ${labels} | ${escapeTableCell(row.updatedAt)} | [${row.filePath}](${row.filePath}) |`,
    )
  }

  return lines
}

export function escapeTableCell(value: string): string {
  const normalized = value.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim()
  return normalized || '-'
}

export function escapeInlineCode(value: string): string {
  return value.replace(/`/g, '\\`')
}

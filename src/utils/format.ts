import type { IssueKind } from '../types'

export interface FormatIssueNumberOptions {
  repo?: string
  kind?: IssueKind
}

export function describeAction(action: string, number: number, options: FormatIssueNumberOptions = {}): string {
  return `${action} ${formatIssueNumber(number, options)}`
}

export function formatIssueNumber(number: number, options: FormatIssueNumberOptions = {}): string {
  const label = `#${number}`
  if (!options.repo)
    return label
  return formatTerminalLink(label, toGitHubIssueUrl(options.repo, number, options.kind))
}

export function formatTerminalLink(text: string, url: string): string {
  return `\u001B]8;;${url}\u001B\\${text}\u001B]8;;\u001B\\`
}

export function toGitHubIssueUrl(repo: string, number: number, kind: IssueKind = 'issue'): string {
  const segment = kind === 'pull' ? 'pull' : 'issues'
  return `https://github.com/${repo}/${segment}/${number}`
}

export function formatValue(value: string | number | Date | undefined | null): string {
  if (value == null)
    return ''
  if (value instanceof Date)
    return `${value.toLocaleString()} (${formatRelativeTime(value)})`
  if (typeof value === 'number')
    return formatNumber(value)
  return String(value)
}

export function formatNumber(value: number): string {
  return value.toLocaleString()
}

export function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  if (diff < 1000)
    return 'just now'
  if (diff < 60000)
    return `${Math.round(diff / 1000)}s ago`
  if (diff < 3600000)
    return `${Math.round(diff / 60000)}m ago`
  return date.toLocaleString()
}

export function countNoun(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

export function formatDuration(durationMs: number): string {
  if (durationMs < 1000)
    return `${durationMs}ms`
  return `${(durationMs / 1000).toFixed(2)}s`
}

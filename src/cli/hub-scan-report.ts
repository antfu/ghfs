import type { ScannedProject } from '../hub/scan-projects'
import type { CliPrinter } from './printer'
import { scanProjectDirectories } from '../hub/scan-projects'

/** One `name: reason` line per directory the picker will hide. */
export function formatUnresolvedProjects(projects: ScannedProject[]): string[] {
  return projects
    .filter(project => !project.repo)
    .map(project => `${project.name}: ${project.error}`)
}

/**
 * Tell the user, at hub startup, which directories the project picker will not
 * show and why. Silent when every scanned directory resolves.
 */
export async function reportUnresolvedProjects(printer: CliPrinter, roots: string[]): Promise<void> {
  const projects = await scanProjectDirectories(roots)
  const lines = formatUnresolvedProjects(projects)
  if (lines.length === 0)
    return

  printer.warn(`${lines.length} hub project${lines.length === 1 ? '' : 's'} cannot be resolved and stay hidden in the project picker:`)
  for (const line of lines)
    printer.warn(`  ${line}`)
}

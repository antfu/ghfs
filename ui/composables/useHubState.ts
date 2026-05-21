import type { GhfsCapabilities } from './useRpc'
import type { ProjectSummary } from '#ghfs/shared-rpc'

const capabilities = shallowRef<GhfsCapabilities | null>(null)
const projects = shallowRef<ProjectSummary[]>([])
const hubCwd = ref<string | null>(null)
const loading = ref(false)

/**
 * Order projects by recency: most-recently-active first (by item
 * `updatedAt`), then by last sync time, then by repo name. Projects with
 * no activity sink to the bottom.
 */
export function sortProjectsByActivity(list: ProjectSummary[]): ProjectSummary[] {
  return [...list].sort((a, b) => {
    const aKey = a.lastActivityAt ?? a.lastSyncedAt
    const bKey = b.lastActivityAt ?? b.lastSyncedAt
    if (aKey && bKey) {
      if (aKey === bKey)
        return a.repo.localeCompare(b.repo)
      return bKey.localeCompare(aKey)
    }
    if (aKey)
      return -1
    if (bKey)
      return 1
    return a.repo.localeCompare(b.repo)
  })
}

export function useHubState() {
  return {
    capabilities,
    projects,
    hubCwd,
    loading,
    setCapabilities(next: GhfsCapabilities) {
      capabilities.value = next
      projects.value = sortProjectsByActivity(next.projects)
    },
    setProjects(next: ProjectSummary[]) {
      const sorted = sortProjectsByActivity(next)
      projects.value = sorted
      if (capabilities.value)
        capabilities.value = { ...capabilities.value, projects: sorted }
    },
    setHubCwd(next: string | null) {
      hubCwd.value = next
    },
    setLoading(value: boolean) {
      loading.value = value
    },
  }
}

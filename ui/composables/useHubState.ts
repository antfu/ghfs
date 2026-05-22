import type { GhfsCapabilities, ProjectSummary } from '#ghfs/rpc-types'

const capabilities = shallowRef<GhfsCapabilities | null>(null)
const projects = shallowRef<ProjectSummary[]>([])
const hubRoots = ref<string[]>([])
const launchCwd = ref<string | null>(null)
const launchCwdInRoots = ref<boolean>(true)
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

export interface HubInfoUpdate {
  roots: string[]
  launchCwd: string
  launchCwdInRoots: boolean
}

export function useHubState() {
  return {
    capabilities,
    projects,
    hubRoots,
    launchCwd,
    launchCwdInRoots,
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
    setHubInfo(next: HubInfoUpdate) {
      hubRoots.value = next.roots
      launchCwd.value = next.launchCwd
      launchCwdInRoots.value = next.launchCwdInRoots
    },
    setLoading(value: boolean) {
      loading.value = value
    },
  }
}

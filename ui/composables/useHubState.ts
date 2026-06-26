import { computed, ref, shallowRef } from 'vue'
import type { GhfsCapabilities, ProjectSummary } from '#ghfs/rpc-types'

const capabilities = shallowRef<GhfsCapabilities | null>(null)
// The complete project list (including projects the user has excluded). Most
// hub surfaces should use `visibleProjects`; `projects` is retained for lookups
// and routing where an excluded-but-still-enabled project must still resolve.
const projects = shallowRef<ProjectSummary[]>([])
const hubRoots = ref<string[]>([])
const launchCwd = ref<string | null>(null)
const launchCwdInRoots = ref<boolean>(true)
const loading = ref(false)

// Projects shown on hub surfaces (home grid, aggregates, switcher, nav).
const visibleProjects = computed<ProjectSummary[]>(() => projects.value.filter(p => !p.excluded))
// Projects the user has hidden from the hub — surfaced in settings to restore.
const excludedProjects = computed<ProjectSummary[]>(() => projects.value.filter(p => p.excluded))
// Ids of excluded projects, for filtering aggregate feeds (recent/todo/queue).
const excludedIds = computed<Set<string>>(() => new Set(excludedProjects.value.map(p => p.id)))

// Id of the hub-home project card that currently has keyboard focus, used by
// the `hub.exclude-project` / `hub.sync-project` commands. Null when no card
// is focused (e.g. focus moved to the palette or elsewhere).
const focusedProjectId = ref<string | null>(null)

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
    visibleProjects,
    excludedProjects,
    excludedIds,
    focusedProjectId,
    hubRoots,
    launchCwd,
    launchCwdInRoots,
    loading,
    setFocusedProjectId(id: string | null) {
      focusedProjectId.value = id
    },
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

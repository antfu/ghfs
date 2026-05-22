import type { InjectionKey } from 'vue'

export interface DetailScope {
  /** Project id whose state the detail subtree should read from. */
  projectId: string | null
}

export const DETAIL_SCOPE_KEY: InjectionKey<DetailScope> = Symbol('ghfs-detail-scope')

export function provideDetailScope(scope: DetailScope): void {
  provide(DETAIL_SCOPE_KEY, scope)
}

export function useDetailScope(): DetailScope | null {
  return inject(DETAIL_SCOPE_KEY, null)
}

export function resolveScopedProjectId(): string | null {
  const scope = useDetailScope()
  if (scope?.projectId)
    return scope.projectId
  return useActiveProjectId().value
}

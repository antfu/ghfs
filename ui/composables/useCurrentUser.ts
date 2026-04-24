import type { CurrentUser, UserOverride } from '#ghfs/server-types'

export function useCurrentUser() {
  const state = useAppState()
  const ui = useUiState()

  const currentUser = computed<CurrentUser | null>(() => state.payload.value?.currentUser ?? null)

  function setOverride(next: UserOverride | null): void {
    ui.setUserOverride(next)
    const payload = state.payload.value
    if (!payload)
      return
    const base = payload.currentUser
    if (!next) {
      state.setPayload({ ...payload, currentUser: base })
      return
    }
    const login = next.login ?? base?.login
    if (!login)
      return
    state.setPayload({
      ...payload,
      currentUser: {
        login,
        name: next.name ?? base?.name ?? null,
        avatarUrl: next.avatarUrl ?? base?.avatarUrl ?? `https://avatars.githubusercontent.com/${login}`,
      },
    })
  }

  return {
    currentUser,
    override: computed(() => ui.uiState.userOverride ?? null),
    setOverride,
  }
}

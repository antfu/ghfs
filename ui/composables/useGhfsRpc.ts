import type { GhfsUiRpcClient } from '~/plugins/rpc.client'

export function useGhfsRpc(): GhfsUiRpcClient {
  return useNuxtApp().$ghfsRpc
}

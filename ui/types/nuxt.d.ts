import type { GhfsUiRpcClient } from '~/plugins/rpc.client'

declare module '#app' {
  interface NuxtApp {
    $ghfsRpc: GhfsUiRpcClient
  }
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $ghfsRpc: GhfsUiRpcClient
  }
}

export {}

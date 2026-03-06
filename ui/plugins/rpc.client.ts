import type {
  ClientFunctions,
  ConnectionMeta,
  ExecutionResult,
  ServerFunctions,
  UiBootstrap,
  UiExecuteProgressEvent,
  UiItemDetail,
  UiItemEdits,
} from '~/types/rpc'
import { createBirpc } from 'birpc'
import { parse, stringify } from 'structured-clone-es'
import { ref, shallowRef } from 'vue'

export interface GhfsUiRpcClient {
  status: ReturnType<typeof ref<'idle' | 'connecting' | 'connected' | 'error'>>
  connectionError: ReturnType<typeof shallowRef<unknown | undefined>>
  operationError: ReturnType<typeof shallowRef<string | undefined>>
  bootstrap: ReturnType<typeof shallowRef<UiBootstrap | undefined>>
  selectedItem: ReturnType<typeof shallowRef<UiItemDetail | undefined>>
  executeProgress: ReturnType<typeof shallowRef<UiExecuteProgressEvent | undefined>>
  lastExecution: ReturnType<typeof shallowRef<ExecutionResult | undefined>>
  executing: ReturnType<typeof ref<boolean>>
  connect: () => Promise<void>
  refresh: () => Promise<void>
  loadItem: (number: number) => Promise<void>
  queueItemEdits: (payload: UiItemEdits) => Promise<void>
  removeQueueYmlEntry: (index: number) => Promise<void>
  executeNow: () => Promise<void>
}

export default defineNuxtPlugin(() => {
  const status = ref<'idle' | 'connecting' | 'connected' | 'error'>('idle')
  const connectionError = shallowRef<unknown>()
  const operationError = shallowRef<string>()
  const bootstrap = shallowRef<UiBootstrap>()
  const selectedItem = shallowRef<UiItemDetail>()
  const executeProgress = shallowRef<UiExecuteProgressEvent>()
  const lastExecution = shallowRef<ExecutionResult>()
  const executing = ref(false)

  let connectPromise: Promise<WebSocket> | undefined
  let onMessage: ((data: unknown) => void) = () => {}

  const rpc = createBirpc<ServerFunctions, ClientFunctions>({
    onExecuteProgress: (event) => {
      executeProgress.value = event
      if (event.type === 'start' || event.type === 'progress')
        executing.value = true
      if (event.type === 'error')
        executing.value = false
    },
    onExecuteComplete: (result) => {
      lastExecution.value = result
      executing.value = false
    },
    onStateChanged: (nextBootstrap) => {
      bootstrap.value = nextBootstrap
      if (selectedItem.value)
        void loadItem(selectedItem.value.number)
    },
  }, {
    post: async (data) => {
      const ws = await ensureConnected()
      while (ws.readyState === ws.CONNECTING)
        await delay(100)
      if (ws.readyState !== ws.OPEN)
        throw new Error('WebSocket is not open')
      ws.send(data)
    },
    on: (fn) => {
      onMessage = fn
    },
    serialize: stringify,
    deserialize: parse,
    timeout: 120_000,
    onFunctionError(error, name) {
      connectionError.value = error
      operationError.value = `RPC error on ${name}: ${toErrorMessage(error)}`
      status.value = 'error'
    },
  })

  async function connect() {
    await ensureConnected()
    await refresh()
  }

  async function ensureConnected(): Promise<WebSocket> {
    if (!connectPromise)
      connectPromise = createConnection()

    try {
      return await connectPromise
    }
    catch (error) {
      connectPromise = undefined
      throw error
    }
  }

  async function createConnection(): Promise<WebSocket> {
    status.value = 'connecting'

    const response = await fetch('/api/metadata.json')
    if (!response.ok)
      throw new Error(`Failed to load metadata: HTTP ${response.status}`)

    const metadata = await response.json() as ConnectionMeta
    if (metadata.backend !== 'websocket' || !metadata.websocket)
      throw new Error('Unsupported backend metadata')

    const websocketUrl = `${location.protocol.replace('http', 'ws')}//${location.hostname}:${metadata.websocket}`
    const ws = new WebSocket(websocketUrl)

    ws.addEventListener('open', () => {
      status.value = 'connected'
      connectionError.value = undefined
    })
    ws.addEventListener('close', () => {
      status.value = 'idle'
      connectPromise = undefined
    })
    ws.addEventListener('error', (error) => {
      status.value = 'error'
      connectionError.value = error
    })
    ws.addEventListener('message', (event) => {
      status.value = 'connected'
      onMessage(event.data)
    })

    await new Promise<void>((resolvePromise, reject) => {
      ws.addEventListener('open', () => resolvePromise(), { once: true })
      ws.addEventListener('error', event => reject(event), { once: true })
    })

    return ws
  }

  async function refresh() {
    operationError.value = undefined
    try {
      bootstrap.value = await rpc.getBootstrap()
      if (selectedItem.value)
        await loadItem(selectedItem.value.number)
    }
    catch (error) {
      operationError.value = toErrorMessage(error)
      throw error
    }
  }

  async function loadItem(number: number) {
    operationError.value = undefined
    try {
      selectedItem.value = await rpc.getItemDetail(number)
    }
    catch (error) {
      operationError.value = toErrorMessage(error)
      throw error
    }
  }

  async function queueItemEdits(payload: UiItemEdits) {
    operationError.value = undefined
    try {
      bootstrap.value = await rpc.queueItemEdits(payload)
      await loadItem(payload.number)
    }
    catch (error) {
      operationError.value = toErrorMessage(error)
      throw error
    }
  }

  async function removeQueueYmlEntry(index: number) {
    operationError.value = undefined
    try {
      bootstrap.value = await rpc.removeQueueYmlEntry(index)
      if (selectedItem.value)
        await loadItem(selectedItem.value.number)
    }
    catch (error) {
      operationError.value = toErrorMessage(error)
      throw error
    }
  }

  async function executeNow() {
    operationError.value = undefined
    executing.value = true

    try {
      const result = await rpc.executeNow()
      bootstrap.value = result.bootstrap
      lastExecution.value = result.result
      if (selectedItem.value)
        await loadItem(selectedItem.value.number)
    }
    catch (error) {
      operationError.value = toErrorMessage(error)
      throw error
    }
    finally {
      executing.value = false
    }
  }

  const client: GhfsUiRpcClient = {
    status,
    connectionError,
    operationError,
    bootstrap,
    selectedItem,
    executeProgress,
    lastExecution,
    executing,
    connect,
    refresh,
    loadItem,
    queueItemEdits,
    removeQueueYmlEntry,
    executeNow,
  }

  void connect().catch((error) => {
    status.value = 'error'
    connectionError.value = error
  })

  return {
    provide: {
      ghfsRpc: client,
    },
  }
})

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error)
    return error.message
  return String(error)
}

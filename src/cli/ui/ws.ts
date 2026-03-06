import type { BirpcGroup, ChannelOptions } from 'birpc'
import type { AddressInfo } from 'node:net'
import type { WebSocket } from 'ws'
import type { ClientFunctions, ConnectionMeta, ServerFunctions } from './contracts'
import type { CreateServerFunctionsOptions } from './rpc'
import c from 'ansis'
import { createBirpcGroup } from 'birpc'
import { parse, stringify } from 'structured-clone-es'
import { WebSocketServer } from 'ws'
import { createServerFunctions } from './rpc'

export interface CreateWsServerOptions extends Omit<CreateServerFunctionsOptions, 'onStateChanged' | 'onExecuteProgress' | 'onExecuteComplete'> {
  host: string
  port?: number
}

export async function createWsServer(options: CreateWsServerOptions) {
  const wss = new WebSocketServer({
    host: options.host,
    port: options.port ?? 0,
  })
  await waitForListen(wss)

  const wsClients = new Set<WebSocket>()
  let rpc: BirpcGroup<ClientFunctions, ServerFunctions>

  const serverFunctions = createServerFunctions({
    ...options,
    onStateChanged: bootstrap => rpc.broadcast.onStateChanged.asEvent(bootstrap),
    onExecuteProgress: event => rpc.broadcast.onExecuteProgress.asEvent(event),
    onExecuteComplete: result => rpc.broadcast.onExecuteComplete.asEvent(result),
  })

  rpc = createBirpcGroup(
    serverFunctions,
    [],
    {
      timeout: 120_000,
      onFunctionError(error, name) {
        console.error(c.red(`RPC error on "${name}":`))
        console.error(error)
      },
    },
  )

  wss.on('connection', (ws) => {
    wsClients.add(ws)
    const channel: ChannelOptions = {
      post: d => ws.send(d),
      on: (fn) => {
        ws.on('message', (data) => {
          fn(data)
        })
      },
      serialize: stringify,
      deserialize: parse,
    }

    rpc.updateChannels((channels) => {
      channels.push(channel)
    })

    ws.on('close', () => {
      wsClients.delete(ws)
      rpc.updateChannels((channels) => {
        const index = channels.indexOf(channel)
        if (index >= 0)
          channels.splice(index, 1)
      })
    })
  })

  return {
    wss,
    rpc,
    serverFunctions,
    close: async () => {
      for (const client of wsClients)
        client.terminate()

      await new Promise<void>((resolve, reject) => {
        wss.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      })
    },
    getMetadata(): ConnectionMeta {
      const address = wss.address() as AddressInfo | null
      if (!address)
        throw new Error('WebSocket server is not listening')

      return {
        backend: 'websocket',
        websocket: address.port,
      }
    },
  }
}

async function waitForListen(server: WebSocketServer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once('listening', () => resolve())
    server.once('error', error => reject(error))
  })
}

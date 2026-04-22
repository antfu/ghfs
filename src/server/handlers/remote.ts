import type { ServerContext } from '../context'
import type { RemoteStatus } from '../types'

export function createRemoteHandler(ctx: ServerContext): () => Promise<RemoteStatus> {
  return async function checkRemote() {
    return ctx.poller.checkNow()
  }
}

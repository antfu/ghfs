// Dev-only proxy. Devframe's client (`connectDevframe({ baseURL: '/' })`)
// fetches `/__connection.json` from the SPA origin to discover the WS
// endpoint. In production the SPA is served by the ghfs server itself,
// which already serves this file. In dev the SPA runs on the Nuxt port,
// and `VITE_GHFS_WS_PORT` (set by `scripts/dev.ts`) tells us which port
// the paired ghfs server actually bound to — so we forward the request
// there. A Nitro route is used instead of `vite.server.proxy` because
// Nuxt reserves `/__*` paths and intercepts them before the Vite proxy
// can fire.
export default defineEventHandler(async () => {
  const port = process.env.VITE_GHFS_WS_PORT ?? '47710'
  const response = await fetch(`http://127.0.0.1:${port}/__connection.json`)
  return await response.json()
})

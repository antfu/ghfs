import { defineNuxtRouteMiddleware, navigateTo } from '#imports'

// Rewrite GitHub-shaped URLs (/owner/repo/issues/N, /pull/N, /pulls/N) onto
// the local /owner/repo/N shape so users can swap `github.com` → host and land
// on the right issue. Function-form redirects added via `pages:extend` get
// stripped during static build, so the rewrite lives here at runtime.
export default defineNuxtRouteMiddleware((to) => {
  const m = to.path.match(/^\/([^/]+)\/([^/]+)\/(?:issues|pull|pulls)\/(\d+)\/?$/)
  if (m)
    return navigateTo(`/${m[1]}/${m[2]}/${m[3]}`, { replace: true })
})

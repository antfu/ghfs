import { authentication } from 'vscode'

export async function readTokenFromVSCode() {
  const session = await authentication.getSession('github', ['repo'], {
    createIfNone: true,
  })

  return session?.accessToken
}

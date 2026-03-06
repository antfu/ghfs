import { Uri, workspace } from 'vscode'
import { resolveConfig } from '../../../../src/config'

export async function pathExist(uri: Uri) {
  try {
    await workspace.fs.stat(uri)
    return true
  }
  catch {
    return false
  }
}

export async function isValidWorkspace(cwd: Uri) {
  const config = await resolveConfig({ cwd: cwd.path })
  const folder = Uri.joinPath(cwd, config.directory)

  return await pathExist(folder)
}

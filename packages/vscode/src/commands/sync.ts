import { ProgressLocation, window, workspace } from 'vscode'
import { runSync } from '../sync'

export async function sync(cwd?: string): Promise<void> {
  if (!cwd) {
    const activeEditor = window.activeTextEditor
    const folder = activeEditor
      ? workspace.getWorkspaceFolder(activeEditor.document.uri)
      : workspace.workspaceFolders?.[0]

    if (!folder) {
      window.showWarningMessage('ghfs: Sync failed - workspace folder not found.')
      return
    }

    cwd = folder.uri.path
  }

  await window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: 'ghfs: Syncing repository...',
      cancellable: true,
    },
    async () => {
      try {
        const summary = await runSync({ cwd })
        window.showInformationMessage(
          `ghfs: Sync finished — ${summary.updatedIssues} issues and ${summary.updatedPulls} PRs updated.`,
        )
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        window.showErrorMessage(`ghfs: Sync failed — ${message}`)
      }
    },
  )
}

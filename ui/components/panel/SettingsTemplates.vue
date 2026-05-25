<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CommentTemplate, RepoTemplate } from '#ghfs/rpc-types'
import { useActiveProjectId, useAppState } from '../../composables/useAppState'
import { useHubSettings } from '../../composables/useHubSettings'
import { useRpc } from '../../composables/useRpc'

interface Row { title: string, body: string }

const hubSettings = useHubSettings()
const activeProjectId = useActiveProjectId()
const state = useAppState()

// The repo section only makes sense when we have a current project (always
// true in `ghfs ui`, but only when viewing a project page in `ghfs hub`).
const hasProject = computed(() => Boolean(activeProjectId.value && state.payload.value))

// Hub comment templates live in `~/.config/ghfs/hub.json`. Load them on mount
// (the RPC works in both `ghfs ui` and `ghfs hub` modes).
if (!hubSettings.templatesHydrated.value)
  void hubSettings.loadCommentTemplates()

// ───── Hub (global) templates ─────
const hubDraft = ref<Row[]>([])
const hubDirty = ref(false)
const hubSaving = ref(false)
const hubError = ref<string | null>(null)

watch(
  () => hubSettings.commentTemplates.value,
  (next) => {
    if (!hubDirty.value)
      hubDraft.value = next.map(t => ({ title: t.title, body: t.body }))
  },
  { immediate: true },
)

async function saveHub() {
  if (hubSaving.value)
    return
  hubSaving.value = true
  hubError.value = null
  try {
    const cleaned: CommentTemplate[] = hubDraft.value
      .map(r => ({ title: r.title.trim(), body: r.body }))
      .filter(r => r.title.length > 0 && r.body.length > 0)
    await hubSettings.setCommentTemplates(cleaned)
    hubDirty.value = false
    hubDraft.value = cleaned.map(t => ({ title: t.title, body: t.body }))
  }
  catch (err) {
    hubError.value = (err as Error).message
  }
  finally {
    hubSaving.value = false
  }
}

function addHubRow() {
  hubDraft.value = [...hubDraft.value, { title: '', body: '' }]
  hubDirty.value = true
}

function removeHubRow(index: number) {
  hubDraft.value = hubDraft.value.filter((_, i) => i !== index)
  hubDirty.value = true
}

function onHubInput() {
  hubDirty.value = true
}

// ───── Repo templates ─────
const repoTemplates = computed<RepoTemplate[]>(() => state.payload.value?.repoTemplates?.templates ?? [])
const repoSourcePath = computed(() => state.payload.value?.repoTemplates?.sourcePath ?? '')
const repoWarnings = computed(() => state.payload.value?.repoTemplates?.warnings ?? [])

const repoDraft = ref<Row[]>([])
const repoDirty = ref(false)
const repoSaving = ref(false)
const repoError = ref<string | null>(null)

watch(
  repoTemplates,
  (next) => {
    if (!repoDirty.value)
      repoDraft.value = next.map(t => ({ title: t.title, body: t.body }))
  },
  { immediate: true },
)

async function saveRepo() {
  if (repoSaving.value)
    return
  const projectId = activeProjectId.value
  if (!projectId)
    return
  repoSaving.value = true
  repoError.value = null
  try {
    const cleaned = repoDraft.value
      .map(r => ({ title: r.title.trim(), body: r.body }))
      .filter(r => r.title.length > 0 && r.body.length > 0)
    const next = await useRpc().$call('ghfs:set-repo-templates', projectId, cleaned)
    state.patchRepoTemplates(next)
    repoDirty.value = false
    repoDraft.value = next.templates.map(t => ({ title: t.title, body: t.body }))
  }
  catch (err) {
    repoError.value = (err as Error).message
  }
  finally {
    repoSaving.value = false
  }
}

async function refreshRepo() {
  const projectId = activeProjectId.value
  if (!projectId)
    return
  try {
    const next = await useRpc().$call('ghfs:repo-templates', projectId)
    state.patchRepoTemplates(next)
    if (!repoDirty.value)
      repoDraft.value = next.templates.map(t => ({ title: t.title, body: t.body }))
  }
  catch (err) {
    repoError.value = (err as Error).message
  }
}

function addRepoRow() {
  repoDraft.value = [...repoDraft.value, { title: '', body: '' }]
  repoDirty.value = true
}

function removeRepoRow(index: number) {
  repoDraft.value = repoDraft.value.filter((_, i) => i !== index)
  repoDirty.value = true
}

function onRepoInput() {
  repoDirty.value = true
}
</script>

<template>
  <section class="flex flex-col gap-2" data-testid="settings-templates">
    <header class="flex items-center gap-1.5">
      <span class="i-ph-chat-circle-text-duotone color-active text-sm" />
      <h3 class="text-sm font-medium">Saved replies</h3>
    </header>
    <p class="text-xs color-muted">
      Canned replies for the comment composer. Press <span class="kbd">⌘</span><span class="kbd">.</span> while typing to open the picker. Supported variables in bodies: <code v-text="'{{author}}'" class="text-[11px]" /> <code v-text="'{{number}}'" class="text-[11px]" /> <code v-text="'{{title}}'" class="text-[11px]" />.
    </p>

    <!-- Repo templates -->
    <div v-if="hasProject" class="flex flex-col gap-2 mt-1">
      <div class="flex items-center justify-between">
        <h4 class="text-xs font-medium color-muted uppercase tracking-wide flex items-center gap-1.5">
          <span class="i-ph-git-branch-duotone" />
          <span>This repo</span>
        </h4>
        <button
          type="button"
          class="btn-action-sm text-xs"
          data-testid="settings-templates-repo-refresh"
          @click="refreshRepo"
        >
          <span class="i-octicon-sync-16" />
          Refresh
        </button>
      </div>
      <p class="text-[11px] color-faint">
        Stored in <code>.github/replies.yml</code> (refined-saved-replies convention). Remember to commit changes.
      </p>

      <ul class="flex flex-col gap-2" data-testid="settings-templates-repo-list">
        <li
          v-for="(row, index) in repoDraft"
          :key="`r-${index}`"
          class="flex flex-col gap-1.5 border border-base rounded bg-base/40 p-2"
        >
          <div class="flex items-center gap-2">
            <input
              v-model="row.title"
              type="text"
              maxlength="200"
              placeholder="Template title"
              class="flex-1 border border-base rounded bg-base px-2 py-1 text-sm font-sans outline-none focus:border-active focus:ring-2 focus:ring-primary-500/30"
              data-testid="settings-templates-repo-title"
              @input="onRepoInput"
            >
            <button
              type="button"
              class="btn-action-sm text-xs shrink-0"
              :aria-label="`Remove template ${row.title || 'untitled'}`"
              data-testid="settings-templates-repo-remove"
              @click="removeRepoRow(index)"
            >
              <span class="i-ph-trash-duotone" />
            </button>
          </div>
          <textarea
            v-model="row.body"
            rows="3"
            maxlength="10000"
            placeholder="Body — supports {{author}}, {{number}}, {{title}}"
            class="w-full border border-base rounded bg-base px-2 py-1 text-sm font-sans outline-none resize-y focus:border-active focus:ring-2 focus:ring-primary-500/30"
            data-testid="settings-templates-repo-body"
            @input="onRepoInput"
          />
        </li>
      </ul>

      <div class="flex items-center gap-2">
        <button
          type="button"
          class="btn-action-sm text-xs"
          data-testid="settings-templates-repo-add"
          @click="addRepoRow"
        >
          <span class="i-ph-plus-bold" />
          <span>Add template</span>
        </button>
        <button
          type="button"
          class="btn-action-sm text-xs"
          :disabled="!repoDirty || repoSaving"
          data-testid="settings-templates-repo-save"
          @click="saveRepo"
        >
          <span :class="repoSaving ? 'i-octicon-sync-16 animate-spin' : 'i-ph-floppy-disk-duotone'" />
          <span>Save</span>
        </button>
        <span v-if="repoSourcePath" class="text-[11px] color-faint truncate flex-1" :title="repoSourcePath">
          {{ repoSourcePath }}
        </span>
      </div>

      <p v-if="repoError" class="text-xs color-yellow-700 dark:color-yellow-300 flex items-start gap-1.5">
        <span class="i-ph-warning-duotone mt-0.5 shrink-0" />
        <span>{{ repoError }}</span>
      </p>
      <ul v-if="repoWarnings.length > 0" class="flex flex-col gap-0.5">
        <li v-for="(w, i) in repoWarnings" :key="i" class="text-[11px] color-yellow-700 dark:color-yellow-300 flex items-start gap-1.5">
          <span class="i-ph-warning-duotone mt-0.5 shrink-0" />
          <span>{{ w }}</span>
        </li>
      </ul>
    </div>

    <!-- Hub (global) templates -->
    <div class="flex flex-col gap-2 mt-2">
      <div class="flex items-center justify-between">
        <h4 class="text-xs font-medium color-muted uppercase tracking-wide flex items-center gap-1.5">
          <span class="i-ph-globe-duotone" />
          <span>Global</span>
        </h4>
        <span class="text-[11px] color-faint">Stored in <code>~/.config/ghfs/hub.json</code>.</span>
      </div>

      <ul class="flex flex-col gap-2" data-testid="settings-templates-hub-list">
        <li
          v-for="(row, index) in hubDraft"
          :key="`h-${index}`"
          class="flex flex-col gap-1.5 border border-base rounded bg-base/40 p-2"
        >
          <div class="flex items-center gap-2">
            <input
              v-model="row.title"
              type="text"
              maxlength="200"
              placeholder="Template title"
              class="flex-1 border border-base rounded bg-base px-2 py-1 text-sm font-sans outline-none focus:border-active focus:ring-2 focus:ring-primary-500/30"
              data-testid="settings-templates-hub-title"
              @input="onHubInput"
            >
            <button
              type="button"
              class="btn-action-sm text-xs shrink-0"
              :aria-label="`Remove template ${row.title || 'untitled'}`"
              data-testid="settings-templates-hub-remove"
              @click="removeHubRow(index)"
            >
              <span class="i-ph-trash-duotone" />
            </button>
          </div>
          <textarea
            v-model="row.body"
            rows="3"
            maxlength="10000"
            placeholder="Body — supports {{author}}, {{number}}, {{title}}"
            class="w-full border border-base rounded bg-base px-2 py-1 text-sm font-sans outline-none resize-y focus:border-active focus:ring-2 focus:ring-primary-500/30"
            data-testid="settings-templates-hub-body"
            @input="onHubInput"
          />
        </li>
      </ul>

      <div class="flex items-center gap-2">
        <button
          type="button"
          class="btn-action-sm text-xs"
          data-testid="settings-templates-hub-add"
          @click="addHubRow"
        >
          <span class="i-ph-plus-bold" />
          <span>Add template</span>
        </button>
        <button
          type="button"
          class="btn-action-sm text-xs"
          :disabled="!hubDirty || hubSaving"
          data-testid="settings-templates-hub-save"
          @click="saveHub"
        >
          <span :class="hubSaving ? 'i-octicon-sync-16 animate-spin' : 'i-ph-floppy-disk-duotone'" />
          <span>Save</span>
        </button>
      </div>

      <p v-if="hubError" class="text-xs color-yellow-700 dark:color-yellow-300 flex items-start gap-1.5">
        <span class="i-ph-warning-duotone mt-0.5 shrink-0" />
        <span>{{ hubError }}</span>
      </p>
    </div>
  </section>
</template>

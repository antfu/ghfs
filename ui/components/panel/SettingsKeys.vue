<script setup lang="ts">
import type { CredentialsPatch, CredentialsView } from '#ghfs/rpc-types'
import { computed, ref, watch } from 'vue'
import { useActiveProjectId, useAppState } from '../../composables/useAppState'
import { useRpc } from '../../composables/useRpc'
import UiIconButton from '../ui/IconButton.vue'

const props = defineProps<{
  /** Whether the parent dialog is open and this tab is active. */
  active: boolean
}>()

const rpc = useRpc()
const activeId = useActiveProjectId()

const view = ref<CredentialsView | null>(null)
const error = ref<string | null>(null)
const saving = ref(false)

const githubToken = ref('')
const aiGatewayApiKey = ref('')
const aiModel = ref('')
const aiAgentModel = ref('')
const reveal = ref(false)

const INPUT_CLASS = 'flex-1 min-w-0 border border-base rounded bg-base px-2.5 py-1.5 text-sm font-mono outline-none focus:border-active focus:ring-2 focus:ring-primary-500/30'

async function load() {
  try {
    view.value = await rpc.$call('ghfs:credentials')
    aiModel.value = view.value.aiModel ?? ''
    aiAgentModel.value = view.value.aiAgentModel ?? ''
    githubToken.value = ''
    aiGatewayApiKey.value = ''
    error.value = null
  }
  catch (err) {
    error.value = (err as Error).message
  }
}

watch(() => props.active, (value) => {
  if (value)
    load()
}, { immediate: true })

const dirty = computed(() => Boolean(
  githubToken.value.trim()
  || aiGatewayApiKey.value.trim()
  || aiModel.value.trim() !== (view.value?.aiModel ?? '')
  || aiAgentModel.value.trim() !== (view.value?.aiAgentModel ?? ''),
))

/** Project summaries cache `hasToken` / `hasAi`; refetch so gated actions light up without a reload. */
async function refreshRepoMeta() {
  const id = activeId.value
  if (!id)
    return
  const state = useAppState(id)
  const payload = state.payload.value
  if (!payload)
    return
  const repo = await rpc.$call('ghfs:repo-meta', id)
  state.setPayload({ ...payload, repo })
}

async function apply(patch: CredentialsPatch) {
  saving.value = true
  try {
    view.value = await rpc.$call('ghfs:set-credentials', patch)
    githubToken.value = ''
    aiGatewayApiKey.value = ''
    aiModel.value = view.value.aiModel ?? ''
    aiAgentModel.value = view.value.aiAgentModel ?? ''
    error.value = null
    await refreshRepoMeta()
  }
  catch (err) {
    error.value = (err as Error).message
  }
  finally {
    saving.value = false
  }
}

function save() {
  const patch: CredentialsPatch = {}
  if (githubToken.value.trim())
    patch.githubToken = githubToken.value
  if (aiGatewayApiKey.value.trim())
    patch.aiGatewayApiKey = aiGatewayApiKey.value
  if (aiModel.value.trim() !== (view.value?.aiModel ?? ''))
    patch.aiModel = aiModel.value.trim() || null
  if (aiAgentModel.value.trim() !== (view.value?.aiAgentModel ?? ''))
    patch.aiAgentModel = aiAgentModel.value.trim() || null
  return apply(patch)
}

function describeKey(hint: string | null, fromEnv: boolean, envName: string): string {
  if (hint)
    return `Saved key ${hint} in use.`
  if (fromEnv)
    return `Using ${envName} from the environment.`
  return 'Not set.'
}
</script>

<template>
  <div class="flex flex-col gap-4" data-testid="settings-keys">
    <p class="text-xs color-muted">
      Keys are stored in <code class="font-mono">~/.config/ghfs/hub.json</code>, outside any repository.
      A project's <code class="font-mono">ghfs.config.ts</code> still takes precedence; saved keys win over environment variables.
    </p>

    <section class="flex flex-col gap-2">
      <header class="flex items-center gap-1.5">
        <span class="i-octicon-mark-github-16 color-active text-sm" />
        <h3 class="text-sm font-medium">GitHub token</h3>
      </header>
      <p class="text-xs color-muted" data-testid="settings-github-token-status">
        {{ view ? describeKey(view.githubTokenHint, view.githubTokenFromEnv, 'GH_TOKEN') : 'Loading…' }}
      </p>
      <div class="flex items-center gap-2">
        <input
          v-model="githubToken"
          :type="reveal ? 'text' : 'password'"
          autocomplete="off"
          spellcheck="false"
          :placeholder="view?.githubTokenHint ? 'Replace saved token…' : 'ghp_…'"
          :class="INPUT_CLASS"
          data-testid="settings-github-token-input"
        >
        <UiIconButton
          :icon="reveal ? 'i-ph-eye-slash-duotone' : 'i-ph-eye-duotone'"
          size="sm"
          :tooltip="reveal ? 'Hide keys' : 'Show keys'"
          @click="reveal = !reveal"
        />
        <button
          v-if="view?.githubTokenHint"
          type="button"
          class="btn-action-sm"
          :disabled="saving"
          data-testid="settings-github-token-clear"
          @click="apply({ githubToken: null })"
        >
          Clear
        </button>
      </div>
    </section>

    <section class="flex flex-col gap-2">
      <header class="flex items-center gap-1.5">
        <span class="i-ph-sparkle-duotone color-active text-sm" />
        <h3 class="text-sm font-medium">Vercel AI Gateway</h3>
      </header>
      <p class="text-xs color-muted" data-testid="settings-ai-key-status">
        {{ view ? describeKey(view.aiGatewayApiKeyHint, view.aiGatewayApiKeyFromEnv, 'AI_GATEWAY_API_KEY') : 'Loading…' }}
      </p>
      <div class="flex items-center gap-2">
        <input
          v-model="aiGatewayApiKey"
          :type="reveal ? 'text' : 'password'"
          autocomplete="off"
          spellcheck="false"
          :placeholder="view?.aiGatewayApiKeyHint ? 'Replace saved key…' : 'vck_…'"
          :class="INPUT_CLASS"
          data-testid="settings-ai-key-input"
        >
        <UiIconButton
          :icon="reveal ? 'i-ph-eye-slash-duotone' : 'i-ph-eye-duotone'"
          size="sm"
          :tooltip="reveal ? 'Hide keys' : 'Show keys'"
          @click="reveal = !reveal"
        />
        <button
          v-if="view?.aiGatewayApiKeyHint"
          type="button"
          class="btn-action-sm"
          :disabled="saving"
          data-testid="settings-ai-key-clear"
          @click="apply({ aiGatewayApiKey: null })"
        >
          Clear
        </button>
      </div>
      <label class="flex items-center gap-3 text-sm">
        <span class="color-muted w-28 shrink-0">Decision model</span>
        <input
          v-model="aiModel"
          type="text"
          spellcheck="false"
          :placeholder="view?.defaults.aiModel"
          :class="INPUT_CLASS"
          data-testid="settings-ai-model-input"
        >
      </label>
      <label class="flex items-center gap-3 text-sm">
        <span class="color-muted w-28 shrink-0">Agent model</span>
        <input
          v-model="aiAgentModel"
          type="text"
          spellcheck="false"
          :placeholder="view?.defaults.aiAgentModel"
          :class="INPUT_CLASS"
          data-testid="settings-ai-agent-model-input"
        >
      </label>
      <p class="text-[11px] color-faint">Gateway model ids. Leave empty for the defaults.</p>
    </section>

    <div class="flex items-center gap-2">
      <div class="flex-1" />
      <span v-if="error" class="text-xs color-red-600 dark:color-red-400" data-testid="settings-keys-error">{{ error }}</span>
      <button
        type="button"
        class="btn-primary text-xs"
        :disabled="!dirty || saving"
        data-testid="settings-keys-save"
        @click="save"
      >
        <span v-if="saving" class="i-ph-circle-notch-duotone animate-spin" />
        Save
      </button>
    </div>
  </div>
</template>

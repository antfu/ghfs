<script setup lang="ts">
import type { ProjectSummary } from '#ghfs/rpc-types'
import { computed } from 'vue'
import UiSearchField from '../ui/SearchField.vue'
import UiWithCommand from '../ui/WithCommand.vue'

const props = withDefaults(defineProps<{
  variant: 'project' | 'recent' | 'todo'
  project?: ProjectSummary | null
  projects?: ProjectSummary[]
  search?: string
  kind?: 'issue' | 'pull'
  counts?: { issues: number, pulls: number }
  searching?: boolean
  title?: string
  itemTotal?: number
  searchPlaceholder?: string
}>(), {
  project: null,
  projects: () => [],
  searching: false,
})

const emit = defineEmits<{
  'update:search': [value: string]
}>()

const searchModel = computed<string>({
  get: () => props.search ?? '',
  set: (v) => emit('update:search', v),
})

const showSearch = computed(() => props.search !== undefined)
const showTabs = computed(() => props.kind !== undefined && props.counts !== undefined)
const showTitle = computed(() => props.variant === 'todo')
</script>

<template>
  <div class="border-b border-base flex-none bg-base" data-testid="list-header">
    <div v-if="showSearch" >
      <UiSearchField
        v-model="searchModel"
        :placeholder="searchPlaceholder"
        class="px-3 py-2 rounded-0 border-t-0 border-x-0"
        data-shortcut="search"
        data-testid="list-header-search"
        command="search.focus"
      />
    </div>

    <div
      v-if="showTabs || showTitle || $slots.actions"
      class="px-3 flex items-center gap-2"
    >
      <template v-if="showTitle">
        <h1 class="text-sm font-medium flex items-center gap-2 min-w-0">
          <span class="i-ph-bookmark-simple-duotone color-active shrink-0" />
          <span class="truncate">{{ title }}</span>
          <span v-if="itemTotal != null" class="font-mono color-muted tabular-nums">{{ itemTotal }}</span>
        </h1>
      </template>

      <nav v-if="showTabs" class="flex items-center gap-1 flex-none py2" aria-label="Kind">
        <UiWithCommand v-slot="{ execute, disabled }" command="tab.issues">
          <button
            type="button"
            class="px-2.5 py-1 text-xs flex items-center gap-1.5 rounded transition outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            :class="[
              !searching && kind === 'issue'
                ? 'color-active font-medium bg-active'
                : 'color-muted hover:color-base',
              searching ? 'op50 cursor-default' : '',
            ]"
            :disabled="searching || disabled"
            data-testid="list-header-tab-issues"
            @click="execute"
          >
            <span class="i-octicon-issue-opened-16" />
            <span>Issues</span>
            <span class="font-mono tabular-nums">{{ counts?.issues ?? 0 }}</span>
          </button>
        </UiWithCommand>
        <UiWithCommand v-slot="{ execute, disabled }" command="tab.pulls">
          <button
            type="button"
            class="px-2.5 py-1 text-xs flex items-center gap-1.5 rounded transition outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            :class="[
              !searching && kind === 'pull'
                ? 'color-active font-medium bg-active'
                : 'color-muted hover:color-base',
              searching ? 'op50 cursor-default' : '',
            ]"
            :disabled="searching || disabled"
            data-testid="list-header-tab-pulls"
            @click="execute"
          >
            <span class="i-octicon-git-pull-request-16" />
            <span>Pulls</span>
            <span class="font-mono tabular-nums">{{ counts?.pulls ?? 0 }}</span>
          </button>
        </UiWithCommand>
      </nav>

      <div class="flex-auto" />

      <div class="flex items-center gap-1 flex-none empty:hidden">
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>

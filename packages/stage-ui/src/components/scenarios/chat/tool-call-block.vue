<script setup lang="ts">
import { Collapsible } from '@proj-airi/ui'
import { computed } from 'vue'

import { MarkdownRenderer } from '../../markdown'

const props = defineProps<{
  toolName: string
  args: string
  state?: 'executing' | 'done' | 'error'
  result?: any
}>()

interface TextJournalArgs {
  action?: string
  title?: string
  content?: string
}

interface ImageJournalArgs {
  action?: string
  prompt?: string
  title?: string
  set_as_background?: boolean
}

const parsedArgs = computed<TextJournalArgs | null>(() => {
  try {
    return JSON.parse(props.args) as TextJournalArgs
  }
  catch {
    return null
  }
})

const isTextJournalCreate = computed(() => {
  return props.toolName === 'text_journal'
    && parsedArgs.value?.action === 'create'
    && !!parsedArgs.value?.content?.trim()
})

const isImageJournalCreate = computed(() => {
  return props.toolName === 'image_journal'
    && parsedArgs.value?.action === 'create'
    && !!(parsedArgs.value as ImageJournalArgs)?.prompt?.trim()
})

const textJournalMarkdown = computed(() => {
  if (!isTextJournalCreate.value)
    return ''

  const title = parsedArgs.value?.title?.trim() || 'Journal Entry'
  const content = parsedArgs.value?.content?.trim() || ''
  return `# ${title}\n\n${content}`
})

const imageJournalMarkdown = computed(() => {
  if (!isImageJournalCreate.value)
    return ''

  const args = parsedArgs.value as ImageJournalArgs
  const title = args?.title?.trim() || 'Untitled Image'
  const prompt = args?.prompt?.trim() || ''
  const setBg = args?.set_as_background ? '\n\n> Setting as background...' : ''
  return `### ${title}\n\n*${prompt}*${setBg}`
})

const formattedArgs = computed(() => {
  try {
    const parsed = JSON.parse(props.args)
    return JSON.stringify(parsed, null, 2).trim()
  }
  catch {
    return props.args
  }
})
</script>

<template>
  <Collapsible
    :class="[
      'bg-primary-100/40 dark:bg-primary-900/60 rounded-lg px-2 pb-2 pt-2',
      'flex flex-col gap-2 items-start',
    ]"
  >
    <template #trigger="{ visible, setVisible }">
      <button
        :class="[
          'w-full text-start',
        ]"
        @click="setVisible(!visible)"
      >
        <div
          v-if="state === 'executing'"
          i-eos-icons:loading class="mr-1 inline-block translate-y-0.5 op-50"
        />
        <div
          v-else-if="state === 'error'"
          i-ph:warning-circle-duotone class="mr-1 inline-block translate-y-0.5 text-red-500"
        />
        <div
          v-else-if="state === 'done'"
          i-ph:check-circle-duotone class="mr-1 inline-block translate-y-0.5 text-emerald-500"
        />
        <div
          v-else
          i-solar:sledgehammer-bold-duotone class="mr-1 inline-block translate-y-1 op-50"
        />
        <code>{{ toolName }}</code>
        <span v-if="state === 'error' && result" class="ml-2 text-xs text-red-500 op-80">
          ({{ result }})
        </span>
      </button>
    </template>
    <div
      :class="[
        'rounded-md p-2 w-full',
        'bg-neutral-100/80 text-sm text-neutral-800 dark:bg-neutral-900/80 dark:text-neutral-200',
      ]"
    >
      <template v-if="isTextJournalCreate">
        <div class="mb-2 flex items-center gap-2">
          <div class="i-solar:notebook-bookmark-bold-duotone text-base text-emerald-500" />
          <div class="rounded-full bg-emerald-500/12 px-2.5 py-1 text-xs text-emerald-700 dark:text-emerald-300">
            Saved to long-term memory
          </div>
        </div>
        <MarkdownRenderer :content="textJournalMarkdown" />
      </template>
      <template v-else-if="isImageJournalCreate">
        <div class="mb-2 flex items-center gap-2">
          <div class="i-solar:camera-bold-duotone text-base text-violet-500" />
          <div class="rounded-full bg-violet-500/12 px-2.5 py-1 text-xs text-violet-700 dark:text-violet-300">
            Generating image
          </div>
        </div>
        <MarkdownRenderer :content="imageJournalMarkdown" />
      </template>
      <div v-else class="whitespace-pre-wrap break-words font-mono">
        {{ formattedArgs }}
      </div>
    </div>
  </Collapsible>
</template>

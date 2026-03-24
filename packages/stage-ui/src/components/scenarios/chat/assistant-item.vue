<script setup lang="ts">
import type { ChatAssistantMessage, ChatSlices, ChatSlicesText } from '../../../types/chat'

import { computed } from 'vue'

import ChatResponsePart from './response-part.vue'
import ChatToolCallBlock from './tool-call-block.vue'

import { useChatSessionStore } from '../../../stores/chat/session-store'
import { MarkdownRenderer } from '../../markdown'

const props = withDefaults(defineProps<{
  message: ChatAssistantMessage & { id?: string }
  label: string
  showPlaceholder?: boolean
  variant?: 'desktop' | 'mobile'
}>(), {
  showPlaceholder: false,
  variant: 'desktop',
})

const chatSession = useChatSessionStore()

interface DisplaySegment {
  type: 'text' | 'act'
  content: string
}

const ACT_MARKER_RE = /<\|[\w-]+:[\s\S]*?(?:\|>|>)/g

function parseAssistantDisplayText(text: string): DisplaySegment[] {
  const segments: DisplaySegment[] = []
  let lastIndex = 0

  for (const match of text.matchAll(ACT_MARKER_RE)) {
    const start = match.index ?? 0
    const raw = match[0]

    if (start > lastIndex) {
      segments.push({
        type: 'text',
        content: text.slice(lastIndex, start),
      })
    }

    segments.push({
      type: 'act',
      content: raw,
    })

    lastIndex = start + raw.length
  }

  if (lastIndex < text.length) {
    segments.push({
      type: 'text',
      content: text.slice(lastIndex),
    })
  }

  return segments
}

function sanitizeAssistantTextForDisplay(text: string) {
  return parseAssistantDisplayText(text)
    .filter(segment => segment.type === 'text')
    .map(segment => segment.content)
    .join('')
    .replace(/^\s*\n/, '')
}

const resolvedSlices = computed<ChatSlices[]>(() => {
  if (props.message.slices?.length) {
    return props.message.slices.reduce<ChatSlices[]>((acc, slice) => {
      if (slice.type !== 'text')
        return [...acc, slice]

      const cleaned = sanitizeAssistantTextForDisplay(slice.text)
      if (!cleaned.trim())
        return acc

      return [...acc, { ...slice, text: cleaned } satisfies ChatSlicesText]
    }, [])
  }

  if (typeof props.message.content === 'string' && props.message.content.trim()) {
    const cleaned = sanitizeAssistantTextForDisplay(props.message.content)
    if (cleaned.trim())
      return [{ type: 'text', text: cleaned } satisfies ChatSlicesText]
  }

  if (Array.isArray(props.message.content)) {
    const textPart = props.message.content.find(part => 'type' in part && part.type === 'text') as { text?: string } | undefined
    if (textPart?.text) {
      const cleaned = sanitizeAssistantTextForDisplay(textPart.text)
      if (cleaned.trim())
        return [{ type: 'text', text: cleaned } satisfies ChatSlicesText]
    }
  }

  return []
})

function extractMood(text: string): string | null {
  const match = text.match(ACT_MARKER_RE)
  if (!match)
    return null

  // Extract the label part: <|Label: ... |> -> Label
  const raw = match[0]
  const tagContent = raw.slice(2, -2).trim() // Remove <| and |>
  const colonIndex = tagContent.indexOf(':')
  if (colonIndex === -1)
    return tagContent

  return tagContent.slice(0, colonIndex).trim()
}

const mood = computed(() => {
  if (props.message.slices?.length) {
    for (const slice of props.message.slices) {
      if (slice.type === 'text') {
        const m = extractMood(slice.text)
        if (m)
          return m
      }
    }
  }

  if (typeof props.message.content === 'string') {
    return extractMood(props.message.content)
  }

  if (Array.isArray(props.message.content)) {
    const textPart = props.message.content.find(part => 'type' in part && part.type === 'text') as { text?: string } | undefined
    if (textPart?.text)
      return extractMood(textPart.text)
  }

  return null
})

const moodClasses = computed(() => {
  if (!mood.value)
    return ''

  const m = mood.value.toLowerCase()
  if (m.includes('happy') || m.includes('joy') || m.includes('laugh') || m.includes('grin'))
    return 'mood-happy'
  if (m.includes('sad') || m.includes('cry') || m.includes('sorrow') || m.includes('pout'))
    return 'mood-sad'
  if (m.includes('angry') || m.includes('mad') || m.includes('annoy') || m.includes('frustrate'))
    return 'mood-angry'
  if (m.includes('surprise') || m.includes('shock') || m.includes('wonder'))
    return 'mood-surprised'
  if (m.includes('think') || m.includes('ponder') || m.includes('curious'))
    return 'mood-thinking'

  return ''
})

const showLoader = computed(() => props.showPlaceholder && resolvedSlices.value.length === 0)
const containerClass = computed(() => props.variant === 'mobile' ? 'mr-0' : 'mr-12')
const boxClasses = computed(() => [
  props.variant === 'mobile' ? 'px-2 py-2 text-sm bg-primary-50/90 dark:bg-primary-950/90' : 'px-3 py-3 bg-primary-50/80 dark:bg-primary-950/80',
  moodClasses.value,
])

function deleteSelf() {
  if (props.message.id)
    chatSession.deleteMessage(props.message.id)
}
</script>

<template>
  <div flex :class="containerClass" class="ph-no-capture group">
    <div
      flex="~ col" shadow="sm primary-200/50 dark:none"
      h="unset <sm:fit"
      relative min-w-20 rounded-xl
      transition="all duration-300"
      :class="boxClasses"
    >
      <div
        v-if="moodClasses"
        class="absolute inset-x-0 bottom--1px top--1px z--1 rounded-xl opacity-50 blur-sm transition-all duration-500"
        :class="[
          moodClasses === 'mood-happy' ? 'bg-emerald-400/30' : '',
          moodClasses === 'mood-sad' ? 'bg-blue-400/30' : '',
          moodClasses === 'mood-angry' ? 'bg-rose-400/30' : '',
          moodClasses === 'mood-surprised' ? 'bg-purple-400/30' : '',
          moodClasses === 'mood-thinking' ? 'bg-amber-400/20' : '',
        ]"
      />
      <div>
        <span text-sm text="black/60 dark:white/65" font-normal class="inline <sm:hidden">{{ label }}</span>
      </div>
      <div v-if="resolvedSlices.length > 0" class="break-words" text="primary-700 dark:primary-100">
        <template v-for="(slice, sliceIndex) in resolvedSlices" :key="sliceIndex">
          <ChatToolCallBlock
            v-if="slice.type === 'tool-call'"
            :tool-name="(slice.toolCall as any).function?.name || (slice.toolCall as any).toolName"
            :args="(slice.toolCall as any).function?.arguments || (slice.toolCall as any).args"
            :state="slice.state"
            :result="slice.result"
            class="mb-2"
          />
          <template v-else-if="slice.type === 'tool-call-result'" />
          <template v-else-if="slice.type === 'text'">
            <MarkdownRenderer :content="slice.text" />
          </template>
        </template>
      </div>
      <div v-else-if="showLoader" i-eos-icons:three-dots-loading />

      <ChatResponsePart
        v-if="message.categorization"
        :message="message"
        :variant="variant"
      />

      <button
        v-if="message.id"
        class="absolute z-10 p-1 text-black/30 opacity-0 transition-opacity -right-1 -top-1 dark:text-white/30 group-hover:opacity-100 hover:text-red-500!"
        @click="deleteSelf"
      >
        <div i-ph:trash-duotone />
      </button>
    </div>
  </div>
</template>

<style scoped>
.mood-happy {
  @apply border-emerald-400/50 dark:border-emerald-500/50;
}
.mood-sad {
  @apply border-blue-400/50 dark:border-blue-500/50;
}
.mood-angry {
  @apply border-rose-400/50 dark:border-rose-500/50;
}
.mood-surprised {
  @apply border-purple-400/50 dark:border-purple-500/50;
}
.mood-thinking {
  @apply border-amber-400/30 dark:border-amber-500/30;
}

/* Ensure transition is smooth */
.rounded-xl {
  border: 1px solid transparent;
}
</style>

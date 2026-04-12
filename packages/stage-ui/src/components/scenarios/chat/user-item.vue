<script setup lang="ts">
import type { ChatHistoryItem, ChatMessage } from '../../../types/chat'

import { computed } from 'vue'

import { useChatSessionStore } from '../../../stores/chat/session-store'
import { MarkdownRenderer } from '../../markdown'
import { ChatActionMenu } from './components/action-menu'
import { getChatHistoryItemCopyText } from './utils'

const props = withDefaults(defineProps<{
  message: Extract<ChatMessage, { role: 'user' }> & { id?: string, createdAt?: number }
  label: string
  variant?: 'desktop' | 'mobile'
}>(), {
  variant: 'desktop',
})

const emit = defineEmits<{
  (e: 'copy'): void
  (e: 'delete'): void
}>()

const chatSession = useChatSessionStore()

const formattedTime = computed(() => {
  if (!props.message.createdAt)
    return ''
  return new Date(props.message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
})

const content = computed(() => {
  const raw = props.message.content
  if (typeof raw === 'string')
    return raw

  if (Array.isArray(raw)) {
    const textPart = raw.find(part => 'type' in part && part.type === 'text') as { text?: string } | undefined
    return textPart?.text || ''
  }

  return ''
})

const images = computed(() => {
  const raw = props.message.content
  if (!Array.isArray(raw))
    return []

  return raw
    .filter(part => 'type' in part && part.type === 'image_url')
    .map(part => (part as any).image_url?.url as string)
    .filter(Boolean)
})

const containerClasses = computed(() => [
  'flex',
  props.variant === 'mobile' ? 'ml-0 flex-row' : 'ml-28 flex-row-reverse',
])

const boxClasses = computed(() => [
  props.variant === 'mobile' ? 'px-2 py-2 text-sm bg-neutral-100/90 dark:bg-neutral-800/90' : 'px-3 py-3 bg-neutral-100/80 dark:bg-neutral-800/80',
])

const copyText = computed(() => getChatHistoryItemCopyText(props.message as ChatHistoryItem))

function handleCopy() {
  emit('copy')
}

function handleDelete() {
  if (props.message.id)
    chatSession.deleteMessage(props.message.id)
  emit('delete')
}
</script>

<template>
  <div v-if="message.role === 'user'" :class="containerClasses" class="ph-no-capture group">
    <ChatActionMenu
      :copy-text="copyText"
      placement="left"
      @copy="handleCopy"
      @delete="handleDelete"
    >
      <template #default="{ setMeasuredElement }">
        <div
          :ref="setMeasuredElement"
          flex="~ col" shadow="sm neutral-200/50 dark:none"
          h="unset <sm:fit"
          relative min-w-20 rounded-xl
          :class="boxClasses"
        >
          <div>
            <span text-sm text="black/60 dark:white/65" font-normal class="inline <sm:hidden">{{ label }}</span>
          </div>

          <div v-if="images.length > 0" class="my-2 flex flex-wrap gap-2">
            <div v-for="(url, idx) in images" :key="idx" class="relative max-w-sm overflow-hidden border border-neutral-200 rounded-lg dark:border-neutral-700">
              <img :src="url" class="max-h-64 object-contain">
            </div>
          </div>

          <MarkdownRenderer
            v-if="content"
            :content="content as string"
            class="break-words"
          />

          <div
            v-if="variant === 'desktop' && formattedTime"
            class="absolute right-full top-1/2 mr-4 opacity-0 transition-opacity -translate-y-1/2 group-hover:opacity-100"
          >
            <span class="whitespace-nowrap text-xs text-neutral-400 font-medium tabular-nums dark:text-neutral-500">
              {{ formattedTime }}
            </span>
          </div>
        </div>
      </template>
    </ChatActionMenu>
  </div>
</template>

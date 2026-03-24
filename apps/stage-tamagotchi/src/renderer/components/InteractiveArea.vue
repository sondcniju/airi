<script setup lang="ts">
import type { ChatHistoryItem } from '@proj-airi/stage-ui/types/chat'
import type { ChatProvider } from '@xsai-ext/providers/utils'

import { ChatHistory } from '@proj-airi/stage-ui/components'
import { useBackgroundStore } from '@proj-airi/stage-ui/stores/background'
import { useChatOrchestratorStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatMaintenanceStore } from '@proj-airi/stage-ui/stores/chat/maintenance'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useChatStreamStore } from '@proj-airi/stage-ui/stores/chat/stream-store'
import { useTextJournalStore } from '@proj-airi/stage-ui/stores/memory-text-journal'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { useSettingsChat } from '@proj-airi/stage-ui/stores/settings'
import { BasicTextarea } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { builtinTools } from '../stores/tools/builtin'

const router = useRouter()
const messageInput = ref('')
const attachments = ref<{ type: 'image', data: string, mimeType: string, url: string }[]>([])

const chatOrchestrator = useChatOrchestratorStore()
const chatSession = useChatSessionStore()
const chatStream = useChatStreamStore()
const textJournalStore = useTextJournalStore()
const backgroundStore = useBackgroundStore()
const airiCardStore = useAiriCardStore()

const { cleanupMessages } = useChatMaintenanceStore()
const { ingest, onAfterMessageComposed } = chatOrchestrator
const { messages } = storeToRefs(chatSession)
const { streamingMessage } = storeToRefs(chatStream)
const { sending } = storeToRefs(chatOrchestrator)
const { activeCardId } = storeToRefs(airiCardStore)
const { t } = useI18n()
const providersStore = useProvidersStore()
const { activeModel, activeProvider } = storeToRefs(useConsciousnessStore())
const settingsChat = useSettingsChat()
const isComposing = ref(false)
const CHAT_WINDOW_TITLE = 'AIRI - Chat Window'

// --- Journal Preview Data ---
const latestTextEntries = computed(() => {
  if (!activeCardId.value)
    return []
  return textJournalStore.entries
    .filter(e => e.characterId === activeCardId.value)
    .slice(0, 2)
})

const latestImageEntries = computed(() => {
  if (!activeCardId.value)
    return []
  return backgroundStore.journalEntries.slice(0, 3)
})

// --- Inline Preview Modal ---
const previewModal = ref<{
  type: 'text' | 'image'
  title: string
  content: string // text content or image URL
} | null>(null)

function openTextPreview(entry: { title: string, content: string }) {
  previewModal.value = { type: 'text', title: entry.title, content: entry.content }
}

function openImagePreview(entry: { title: string, url: string | null }) {
  if (!entry.url)
    return
  previewModal.value = { type: 'image', title: entry.title, content: entry.url }
}

function closePreview() {
  previewModal.value = null
}

// --- Date Formatting ---
function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-CA') // YYYY-MM-DD
}

// --- Deep Links ---
function navigateToImageJournal() {
  if (!activeCardId.value)
    return
  router.push(`/settings/airi-card?cardId=${activeCardId.value}&tab=gallery`)
}

function updateWindowTitle() {
  const nextTitle = messageInput.value.trim()
    ? `${CHAT_WINDOW_TITLE} - User Typing...`
    : CHAT_WINDOW_TITLE

  if (document.title !== nextTitle)
    document.title = nextTitle
}

async function handleSend() {
  if (isComposing.value) {
    return
  }

  if (!messageInput.value.trim() && !attachments.value.length) {
    return
  }

  const textToSend = messageInput.value
  const attachmentsToSend = attachments.value.map(att => ({ ...att }))

  // optimistic clear
  messageInput.value = ''
  attachments.value = []

  try {
    const providerConfig = providersStore.getProviderConfig(activeProvider.value)
    await ingest(textToSend, {
      model: activeModel.value,
      chatProvider: await providersStore.getProviderInstance<ChatProvider>(activeProvider.value),
      providerConfig,
      attachments: attachmentsToSend,
      tools: builtinTools,
    })

    attachmentsToSend.forEach(att => URL.revokeObjectURL(att.url))
  }
  catch (error) {
    // restore on failure
    messageInput.value = textToSend
    attachments.value = attachmentsToSend.map(att => ({
      ...att,
      url: URL.createObjectURL(new Blob([Uint8Array.from(atob(att.data), c => c.charCodeAt(0))], { type: att.mimeType })),
    }))
  }
}

async function handleFilePaste(files: File[]) {
  for (const file of files) {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const base64Data = (e.target?.result as string)?.split(',')[1]
        if (base64Data) {
          attachments.value.push({
            type: 'image' as const,
            data: base64Data,
            mimeType: file.type,
            url: URL.createObjectURL(file),
          })
        }
      }
      reader.readAsDataURL(file)
    }
  }
}

const isDragging = ref(false)
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files?.length) {
    handleFilePaste(Array.from(target.files))
  }
  target.value = ''
}

function stopDrag() {
  isDragging.value = false
}

function handleDrop(e: DragEvent) {
  isDragging.value = false
  if (e.dataTransfer?.files?.length) {
    handleFilePaste(Array.from(e.dataTransfer.files))
  }
}

function removeAttachment(index: number) {
  const attachment = attachments.value[index]
  if (attachment) {
    URL.revokeObjectURL(attachment.url)
    attachments.value.splice(index, 1)
  }
}

onAfterMessageComposed(async () => {
  messageInput.value = ''
  attachments.value.forEach(att => URL.revokeObjectURL(att.url))
  attachments.value = []
})

const historyMessages = computed(() => messages.value as unknown as ChatHistoryItem[])

onMounted(() => {
  updateWindowTitle()
  textJournalStore.load()
})

watch(messageInput, () => {
  updateWindowTitle()
})
</script>

<template>
  <div
    h-full w-full flex="~ col gap-1"
    :class="[isDragging ? 'ring-2 ring-primary-500 rounded-lg overflow-hidden' : '']"
    @dragenter.prevent="isDragging = true"
    @dragover.prevent="isDragging = true"
    @dragleave.prevent="stopDrag"
    @drop.prevent="handleDrop"
    @keydown.escape="closePreview"
  >
    <input ref="fileInput" type="file" accept="image/*" class="hidden" multiple @change="handleFileSelect">
    <div w-full flex-1 overflow-hidden>
      <ChatHistory
        :messages="historyMessages"
        :sending="sending"
        :streaming-message="streamingMessage"
      />
    </div>

    <!-- Journal Preview Chips -->
    <div v-if="latestTextEntries.length > 0 || latestImageEntries.length > 0" class="flex gap-2 overflow-x-auto px-2 py-1 scrollbar-none">
      <!-- Text Journal Chips -->
      <div
        v-for="entry in latestTextEntries"
        :key="entry.id"
        :class="[
          'min-w-32 max-w-40 flex flex-col cursor-pointer',
          'border border-primary-200/30 rounded-lg bg-primary-50/50 p-2 text-xs',
          'transition-all hover:bg-primary-100/50',
          'dark:border-primary-800/30 dark:bg-primary-900/30 dark:hover:bg-primary-800/50',
        ]"
        @click="openTextPreview(entry)"
      >
        <div :class="['flex items-center gap-1', 'text-primary-500 text-[10px] font-bold uppercase tracking-tighter']">
          <div i-solar:notebook-bold-duotone />
          <span>{{ formatDate(entry.createdAt) }}</span>
        </div>
        <div :class="['line-clamp-2', 'text-primary-900/70 dark:text-primary-100/70']">
          {{ entry.title }}
        </div>
      </div>

      <!-- Image Journal Chips -->
      <div
        v-for="entry in latestImageEntries"
        :key="entry.id"
        :class="[
          'relative h-14 w-14 shrink-0 cursor-pointer of-hidden rounded-lg',
          'border border-primary-200/30 transition-all hover:border-primary-500',
          'dark:border-primary-800/30 dark:hover:border-primary-400',
        ]"
        @click="openImagePreview(entry)"
      >
        <img :src="entry.url || ''" class="h-full w-full object-cover">
        <div :class="['absolute inset-0 flex items-end p-1', 'bg-gradient-to-t from-black/60 to-transparent']">
          <span class="truncate text-[8px] text-white font-medium">{{ entry.title }}</span>
        </div>
      </div>
    </div>

    <div v-if="attachments.length > 0" class="flex flex-wrap gap-2 border-t border-primary-100 p-2">
      <div v-for="(attachment, index) in attachments" :key="index" class="relative">
        <img :src="attachment.url" class="h-20 w-20 rounded-md object-cover">
        <button class="absolute right-1 top-1 h-5 w-5 flex items-center justify-center rounded-full bg-red-500 text-xs text-white" @click="removeAttachment(index)">
          &times;
        </button>
      </div>
    </div>

    <div class="flex items-center justify-end gap-2 py-1">
      <!-- Memory Deep Link -->
      <button
        class="max-h-[10lh] min-h-[1lh]"
        bg="neutral-100 dark:neutral-800"
        text="lg neutral-500 dark:neutral-400"
        hover:text="primary-500 dark:primary-400"
        flex items-center justify-center rounded-md p-2 outline-none
        transition-colors transition-transform active:scale-95
        title="Memory"
        @click="router.push('/settings/memory')"
      >
        <div class="i-solar:leaf-bold-duotone" />
      </button>

      <!-- Image Journal Deep Link -->
      <button
        class="max-h-[10lh] min-h-[1lh]"
        bg="neutral-100 dark:neutral-800"
        text="lg neutral-500 dark:neutral-400"
        hover:text="primary-500 dark:primary-400"
        flex items-center justify-center rounded-md p-2 outline-none
        transition-colors transition-transform active:scale-95
        title="Image Journal"
        @click="navigateToImageJournal"
      >
        <div class="i-solar:gallery-bold-duotone" />
      </button>

      <!-- Attach Image -->
      <button
        class="max-h-[10lh] min-h-[1lh]"
        bg="neutral-100 dark:neutral-800"
        text="lg neutral-500 dark:neutral-400"
        hover:text="primary-500 dark:primary-400"
        flex items-center justify-center rounded-md p-2 outline-none
        transition-colors transition-transform active:scale-95
        title="Attach Image"
        @click="fileInput?.click()"
      >
        <div class="i-solar:camera-add-bold-duotone" />
      </button>

      <!-- Clear Messages -->
      <button
        class="max-h-[10lh] min-h-[1lh]"
        bg="neutral-100 dark:neutral-800"
        text="lg neutral-500 dark:neutral-400"
        hover:text="red-500 dark:red-400"
        flex items-center justify-center rounded-md p-2 outline-none
        transition-colors transition-transform active:scale-95
        title="Clear Messages"
        @click="() => cleanupMessages()"
      >
        <div class="i-solar:trash-bin-2-bold-duotone" />
      </button>
    </div>
    <BasicTextarea
      v-model="messageInput"
      :send-mode="settingsChat.sendMode"
      :placeholder="t('stage.message')"
      class="ph-no-capture"
      text="primary-600 dark:primary-100  placeholder:primary-500 dark:placeholder:primary-200"
      border="solid 2 primary-200/20 dark:primary-400/20"
      bg="primary-100/50 dark:primary-900/70"
      max-h="[10lh]" min-h="[1lh]"
      w-full shrink-0 resize-none overflow-y-scroll rounded-xl p-2 font-medium outline-none
      transition="all duration-250 ease-in-out placeholder:all placeholder:duration-250 placeholder:ease-in-out"
      @submit="handleSend"
      @compositionstart="isComposing = true"
      @compositionend="isComposing = false"
      @attach="handleFilePaste"
    />

    <!-- Inline Preview Modal -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div
          v-if="previewModal"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          @click.self="closePreview"
        >
          <div
            :class="[
              'relative mx-4 max-h-[80vh] max-w-md w-full overflow-hidden rounded-2xl',
              'bg-white shadow-2xl dark:bg-neutral-900',
              'animate-scale-in',
            ]"
          >
            <!-- Header -->
            <div :class="['flex items-center justify-between border-b border-neutral-200/50 px-4 py-3', 'dark:border-neutral-700/50']">
              <div :class="['flex items-center gap-2 text-sm font-bold', 'text-neutral-800 dark:text-neutral-100']">
                <div :class="previewModal.type === 'text' ? 'i-solar:notebook-bold-duotone' : 'i-solar:gallery-bold-duotone'" />
                <span class="truncate">{{ previewModal.title }}</span>
              </div>
              <button
                :class="['rounded-full p-1 text-neutral-400 transition-colors', 'hover:bg-neutral-100 hover:text-neutral-600', 'dark:hover:bg-neutral-800 dark:hover:text-neutral-200']"
                @click="closePreview"
              >
                <div i-solar:close-circle-bold-duotone class="text-lg" />
              </button>
            </div>

            <!-- Content -->
            <div v-if="previewModal.type === 'text'" class="max-h-[60vh] overflow-y-auto px-4 py-3">
              <p :class="['whitespace-pre-wrap text-sm leading-relaxed', 'text-neutral-700 dark:text-neutral-300']">
                {{ previewModal.content }}
              </p>
            </div>
            <div v-else class="flex items-center justify-center p-2">
              <img :src="previewModal.content" class="max-h-[60vh] w-auto rounded-lg object-contain">
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.animate-scale-in {
  animation: scale-in 0.2s ease-out;
}

@keyframes scale-in {
  from {
    transform: scale(0.95);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
</style>

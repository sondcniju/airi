import type { DiscordEventLogEntry, DiscordInboundMessage, DiscordServiceStatus } from '@proj-airi/stage-shared'

import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import {
  discordServiceForceSync,
  discordServiceGetStatus,
  discordServiceSendMessage,
  discordServiceSimulateEvent,
  discordServiceStart,
  discordServiceStop,
} from '@proj-airi/stage-shared'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed, onMounted, onUnmounted, ref } from 'vue'

import { useChatOrchestratorStore } from '../chat'
import { useChatSessionStore } from '../chat/session-store'

// ── IPC Event Channel Names ────────────────────────────────────────────────────

const STATUS_CHANGED_CHANNEL = 'eventa:event:electron:discord:status-changed'
const EVENT_LOG_CHANNEL = 'eventa:event:electron:discord:event-log'
const INBOUND_MESSAGE_CHANNEL = 'eventa:event:electron:discord:inbound-message'

const MAX_EVENT_LOG_ENTRIES = 200

export const useDiscordStore = defineStore('discord', () => {
  const chatSession = useChatSessionStore()

  // ── Persisted Config ───────────────────────────────────────────────────────
  const enabled = useLocalStorageManualReset<boolean>('settings/discord/enabled', false)
  const token = useLocalStorageManualReset<string>('settings/discord/token', '')

  const chatOrchestrator = useChatOrchestratorStore()

  // ── Live Service State ─────────────────────────────────────────────────────
  const serviceStatus = ref<DiscordServiceStatus>({
    state: 'disconnected',
    ping: null,
    guilds: [],
    activeChannelId: null,
    botUser: null,
    error: null,
  })
  const eventLog = ref<DiscordEventLogEntry[]>([])

  // ── Derived ────────────────────────────────────────────────────────────────
  const configured = computed(() => !!token.value.trim())
  const isConnected = computed(() => serviceStatus.value.state === 'connected')
  const isConnecting = computed(() => serviceStatus.value.state === 'connecting')

  // ── IPC Invokers ───────────────────────────────────────────────────────────
  const isElectron = typeof window !== 'undefined' && !!(window as any).electron

  const invokeStart = isElectron ? useElectronEventaInvoke(discordServiceStart) : null
  const invokeStop = isElectron ? useElectronEventaInvoke(discordServiceStop) : null
  const invokeGetStatus = isElectron ? useElectronEventaInvoke(discordServiceGetStatus) : null
  const invokeForceSync = isElectron ? useElectronEventaInvoke(discordServiceForceSync) : null
  const invokeSimulate = isElectron ? useElectronEventaInvoke(discordServiceSimulateEvent) : null
  const invokeSendMessage = isElectron ? useElectronEventaInvoke(discordServiceSendMessage) : null

  // ── Actions ────────────────────────────────────────────────────────────────

  async function startService() {
    if (!token.value.trim()) {
      console.warn('[DiscordStore] Cannot start: no token configured')
      return
    }

    enabled.value = true
    try {
      const status = await invokeStart?.({ token: token.value })
      if (status)
        serviceStatus.value = status
    }
    catch (err) {
      console.error('[DiscordStore] Failed to start service:', err)
    }
  }

  async function stopService() {
    enabled.value = false
    try {
      const status = await invokeStop?.()
      if (status)
        serviceStatus.value = status
    }
    catch (err) {
      console.error('[DiscordStore] Failed to stop service:', err)
    }
  }

  async function refreshStatus() {
    try {
      const status = await invokeGetStatus?.()
      if (status)
        serviceStatus.value = status
    }
    catch { /* ignore in non-electron */ }
  }

  async function forceCardSync(payload: { name: string, avatarBase64: string | null }) {
    try {
      await invokeForceSync?.(payload)
    }
    catch (err) {
      console.error('[DiscordStore] Force sync failed:', err)
    }
  }

  async function simulateEvent(payload?: { username?: string, content?: string }) {
    try {
      await invokeSimulate?.(payload as any)
    }
    catch (err) {
      console.error('[DiscordStore] Simulate failed:', err)
    }
  }

  async function sendMessageToDiscord(channelId: string, content: string) {
    try {
      await invokeSendMessage?.({ channelId, content })
    }
    catch (err) {
      console.error('[DiscordStore] Send message failed:', err)
    }
  }

  function clearEventLog() {
    eventLog.value = []
  }

  function resetState() {
    enabled.reset()
    token.reset()
    serviceStatus.value = {
      state: 'disconnected',
      ping: null,
      guilds: [],
      activeChannelId: null,
      botUser: null,
      error: null,
    }
    eventLog.value = []
  }

  // ── IPC Event Listeners ────────────────────────────────────────────────────
  const processedMessageIds = new Set<string>()
  let cleanupListeners: (() => void) | null = null

  function setupEventListeners() {
    if (!isElectron)
      return

    const ipcRenderer = (window as any).electron?.ipcRenderer
    if (!ipcRenderer)
      return

    const onStatusChanged = (_event: any, status: DiscordServiceStatus) => {
      serviceStatus.value = status
    }

    const onEventLog = (_event: any, entry: DiscordEventLogEntry) => {
      eventLog.value = [...eventLog.value.slice(-(MAX_EVENT_LOG_ENTRIES - 1)), entry]
    }

    const onInboundMessage = (_event: any, msg: DiscordInboundMessage) => {
      // 0. Deduplicate by ID within this window process
      if (processedMessageIds.has(msg.messageId))
        return
      processedMessageIds.add(msg.messageId)

      // 1. Leadership Election: Only the "Stage" window (root hash) handles the Brain handover.
      // Settings window (#/settings) and others should only log.
      const hash = window.location.hash || '#/'
      const isStage = hash === '#/' || hash.startsWith('#/stage')

      if (!isStage)
        return

      // 3. BRAIN HANDOVER (Stage only)
      const handoverEntry: DiscordEventLogEntry = {
        timestamp: Date.now(),
        type: 'BRAIN_HANDOVER',
        summary: `Stage taking control of message ${msg.messageId.slice(-6)}`,
      }
      eventLog.value = [...eventLog.value.slice(-(MAX_EVENT_LOG_ENTRIES - 1)), handoverEntry]

      const formattedContent = `${msg.displayName} says:\n${msg.content}`

      void chatOrchestrator.ingest(formattedContent, {
        metadata: {
          _discordSource: {
            messageId: msg.messageId,
            channelId: msg.channelId,
            userId: msg.userId,
            username: msg.username,
          },
        },
      })
    }

    const onChatTurnComplete = async (chat: any, context: any) => {
      const source = (context.message as any)?._discordSource
      if (!source?.channelId)
        return

      // Leadership Election: Only the "Stage" window handles the Outbound reply
      const hash = window.location.hash || '#/'
      const isStage = hash === '#/' || hash.startsWith('#/stage')

      if (!isStage)
        return

      const ttsText = chat.output.content
      const error = chat.output.error

      if (error) {
        // Notify Discord about the technical failure so the user isn't left hanging
        const errorMsg = typeof error === 'string' ? error : (error.message || 'Unknown Error')
        const technicalFeedback = `⚠️ **AIRI encountered a technical problem.**\n*(Error: ${errorMsg})*`

        const errorLogEntry: DiscordEventLogEntry = {
          timestamp: Date.now(),
          type: 'ERROR_RELAY',
          summary: `Relaying error to ${source.username}: ${errorMsg.substring(0, 50)}`,
        }
        eventLog.value = [...eventLog.value.slice(-(MAX_EVENT_LOG_ENTRIES - 1)), errorLogEntry]

        await sendMessageToDiscord(source.channelId, technicalFeedback)
        return
      }

      if (!ttsText)
        return

      // Log the intent to send
      const logEntry: DiscordEventLogEntry = {
        timestamp: Date.now(),
        type: 'MESSAGE_SEND',
        summary: `Sending reply to ${source.username} in channel ${source.channelId.slice(-4)}`,
      }
      eventLog.value = [...eventLog.value.slice(-(MAX_EVENT_LOG_ENTRIES - 1)), logEntry]

      await sendMessageToDiscord(source.channelId, ttsText)
    }

    ipcRenderer.on(STATUS_CHANGED_CHANNEL, onStatusChanged)
    ipcRenderer.on(EVENT_LOG_CHANNEL, onEventLog)
    ipcRenderer.on(INBOUND_MESSAGE_CHANNEL, onInboundMessage)

    const cleanupChatHooks = chatOrchestrator.onChatTurnComplete(onChatTurnComplete)

    cleanupListeners = () => {
      ipcRenderer.removeListener(STATUS_CHANGED_CHANNEL, onStatusChanged)
      ipcRenderer.removeListener(EVENT_LOG_CHANNEL, onEventLog)
      ipcRenderer.removeListener(INBOUND_MESSAGE_CHANNEL, onInboundMessage)
      cleanupChatHooks()
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  onMounted(async () => {
    setupEventListeners()

    // Always fetch the true status from the main process on mount
    await refreshStatus()

    // Auto-start logic: If the user previously enabled the service, we have a token,
    // and the main process is currently disconnected, we should boot it up.
    // We restrict this trigger to the Stage window so multiple open windows (like Settings)
    // don't try to start the service simultaneously and cause reconnect loops.
    if (enabled.value && token.value && serviceStatus.value.state === 'disconnected') {
      const hash = window.location.hash || '#/'
      const isStage = hash === '#/' || hash.startsWith('#/stage')

      if (isStage) {
        void startService()
      }
    }
  })

  onUnmounted(() => {
    cleanupListeners?.()
  })

  return {
    // Config
    enabled,
    token,
    configured,

    // Live State
    serviceStatus,
    isConnected,
    isConnecting,
    eventLog,

    // Actions
    startService,
    stopService,
    refreshStatus,
    forceCardSync,
    simulateEvent,
    sendMessageToDiscord,
    clearEventLog,
    resetState,
  }
})

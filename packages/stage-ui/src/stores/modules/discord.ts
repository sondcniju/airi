import type { DiscordEventLogEntry, DiscordInboundMessage, DiscordServiceStatus } from '@proj-airi/stage-shared'

import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import {
  discordServiceForceSync,
  discordServiceGetStatus,
  discordServiceSendImage,
  discordServiceSendMessage,
  discordServiceSimulateEvent,
  discordServiceStart,
  discordServiceStop,
} from '@proj-airi/stage-shared'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed, onMounted, onUnmounted, ref, toRaw, watch } from 'vue'

import { useBackgroundStore } from '../background'
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
  const invokeSendImage = isElectron ? useElectronEventaInvoke(discordServiceSendImage) : null

  // ── Routing Cache ──────────────────────────────────────────────────────────
  const lastChannelId = ref<string | null>(null)
  const audioTurnBuffer = ref<ArrayBuffer[]>([])
  const isTurnTextComplete = ref(false)
  let audioSettleTimer: ReturnType<typeof setTimeout> | null = null

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
      lastChannelId.value = channelId
      await invokeSendMessage?.({ channelId, content })
    }
    catch (err) {
      console.error('[DiscordStore] Send message failed:', err)
    }
  }

  function addAudioToTurn(buffer: ArrayBuffer) {
    if (buffer.byteLength === 0)
      return
    console.log(`[DiscordStore] Aggregating audio chunk: ${Math.round(buffer.byteLength / 1024)}KB`)
    audioTurnBuffer.value.push(buffer)

    // If the text is already done, every new chunk resets the "Final Settle" timer
    if (isTurnTextComplete.value) {
      resetAudioSettleTimer()
    }
  }

  function resetAudioSettleTimer() {
    if (audioSettleTimer)
      clearTimeout(audioSettleTimer)

    console.log(`[DiscordStore] Audio settle timer reset (3000ms wait)...`)
    audioSettleTimer = setTimeout(() => {
      void flushAudioTurn()
    }, 3000) // Give slow TTS providers plenty of time to send the first chunk
  }

  async function flushAudioTurn(content?: string) {
    if (audioSettleTimer) {
      clearTimeout(audioSettleTimer)
      audioSettleTimer = null
    }

    if (audioTurnBuffer.value.length === 0 || !lastChannelId.value) {
      console.log('[DiscordStore] Flush skipped: Bucket empty. Still waiting for chunks if turn is active.')
      // We do NOT reset isTurnTextComplete here - we keep waiting until a chunk arrives or a new turn starts
      return
    }

    const channelId = lastChannelId.value
    console.log(`[DiscordStore] FLUSHING Voice Note: ${audioTurnBuffer.value.length} chunks to ${channelId}`)

    try {
      const channelName = 'eventa:invoke:electron:discord:send-voice-note'

      // Explicitly convert buffers to Uint8Arrays to ensure they are cloneable via IPC
      // and strip any Vue reactivity proxies.
      const buffers = audioTurnBuffer.value.map(buf => new Uint8Array(buf))

      // We send the array of buffers to the main process for merging and delivery
      const result = await (window as any).electron.ipcRenderer.invoke(
        channelName,
        {
          channelId,
          audioBuffers: buffers,
          content,
          filename: `voice-note-${Date.now()}.mp3`,
        },
      )

      console.log('[DiscordStore] Voice Note IPC successful. Result:', result)
    }
    catch (err) {
      console.error('[DiscordStore] Voice Note delivery failed:', err)
    }
    finally {
      audioTurnBuffer.value = []
      isTurnTextComplete.value = false
    }
  }

  function clearAudioTurn() {
    console.log('[DiscordStore] Clearing audio turn bucket.')
    audioTurnBuffer.value = []
    isTurnTextComplete.value = false
    if (audioSettleTimer) {
      clearTimeout(audioSettleTimer)
      audioSettleTimer = null
    }
  }

  async function sendImageToDiscord(channelId: string, base64: string, content?: string, filename?: string) {
    console.log(`[DiscordStore] Preparing to invoke IPC sendImage. Channel: ${channelId}, Payload Size: ${Math.round(base64.length / 1024)}KB, Shape: ${base64.substring(0, 30)}...`)

    if (!invokeSendImage) {
      console.error('[DiscordStore] IPC Invoker "invokeSendImage" is NULL! Are you in a browser instead of Electron?')
      return
    }

    try {
      lastChannelId.value = channelId
      const channelName = 'eventa:invoke:electron:discord:send-image'
      console.log(`[DiscordStore] NATIVE BYPASS: Invoking ${channelName}. Shape: ${base64.substring(0, 50)}...`)

      // We bypass the wrapper and use the literal channel name to avoid "undefined" contract issues
      const result = await (window as any).electron.ipcRenderer.invoke(
        channelName,
        toRaw({ channelId, base64, content, filename }),
      )

      console.log('[DiscordStore] Native IPC successful. Result:', result)
    }
    catch (err) {
      console.error('[DiscordStore] Send image failed during IPC invoke:', err)
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

    console.log('[DiscordStore] Initializing IPC listeners...')

    const onStatusChanged = (_event: any, status: DiscordServiceStatus) => {
      serviceStatus.value = status
    }

    const onEventLog = (_event: any, entry: DiscordEventLogEntry) => {
      eventLog.value = [...eventLog.value.slice(-(MAX_EVENT_LOG_ENTRIES - 1)), entry]
    }

    const onInboundMessage = (_event: any, msg: DiscordInboundMessage) => {
      console.log(`[DiscordStore] Inbound message received: ${msg.messageId.slice(-6)} from ${msg.username}`)

      // 0. Deduplicate by ID within this window process
      if (processedMessageIds.has(msg.messageId))
        return
      processedMessageIds.add(msg.messageId)

      // Update routing cache
      lastChannelId.value = msg.channelId

      // 1. Leadership Election: Only the "Stage" window (root hash) handles the Brain handover.
      const hash = window.location.hash || '#/'
      const isStage = hash === '#/' || hash.startsWith('#/stage')

      if (!isStage) {
        console.log(`[DiscordStore] Skipping Brain handover: Window (${hash}) is not Stage.`)
        return
      }

      console.log(`[DiscordStore] Handing over message ${msg.messageId.slice(-6)} to Brain...`)

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

      console.log(`[DiscordStore] Outbound response ready for ${source.username} in channel ${source.channelId.slice(-4)}`)

      // Leadership Election: Only the "Stage" window handles the Outbound reply
      const hash = window.location.hash || '#/'
      const isStage = hash === '#/' || hash.startsWith('#/stage')

      if (!isStage) {
        console.log(`[DiscordStore] Skipping Outbound: Window (${hash}) is not Stage.`)
        return
      }

      const ttsText = chat.output.content
      const error = chat.output.error

      if (error) {
        console.warn('[DiscordStore] Relaying error back to Discord:', error)
        // ... (error handling)
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

      // Mark text as done and start the "Wait for Audio" settle timer
      isTurnTextComplete.value = true
      resetAudioSettleTimer()
    }

    ipcRenderer.on(STATUS_CHANGED_CHANNEL, onStatusChanged)
    ipcRenderer.on(EVENT_LOG_CHANNEL, onEventLog)
    ipcRenderer.on(INBOUND_MESSAGE_CHANNEL, onInboundMessage)

    const cleanupChatHooks = chatOrchestrator.onChatTurnComplete(onChatTurnComplete)

    const backgroundStore = useBackgroundStore()
    const cleanupBackgroundHook = backgroundStore.onBackgroundAdded(async (entry) => {
      console.log(`[DiscordStore] Background detected: ${entry.id} (${entry.type})`)

      // 1. Detection Log
      const detectLog: DiscordEventLogEntry = {
        timestamp: Date.now(),
        type: 'DEBUG_IMAGE',
        summary: `New background detected: ${entry.id} (Type: ${entry.type})`,
      }
      eventLog.value = [...eventLog.value.slice(-(MAX_EVENT_LOG_ENTRIES - 1)), detectLog]

      // Only route Journal or Selfie images to Discord
      if (entry.type !== 'journal' && entry.type !== 'selfie')
        return

      console.log('[DiscordStore] Candidate image for Discord routing found.')

      // 2. Connection/Channel Check
      if (!isConnected.value || !lastChannelId.value) {
        console.log(`[DiscordStore] Skipping image routing: isConnected=${isConnected.value}, lastChannelId=${lastChannelId.value}`)
        const failLog: DiscordEventLogEntry = {
          timestamp: Date.now(),
          type: 'DEBUG_IMAGE',
          summary: `Routing skipped: Connected=${isConnected.value}, LastChannel=${lastChannelId.value}`,
        }
        eventLog.value = [...eventLog.value.slice(-(MAX_EVENT_LOG_ENTRIES - 1)), failLog]
        return
      }

      // 3. Leadership Election Check
      const hash = window.location.hash || '#/'
      const isStage = hash === '#/' || hash.startsWith('#/stage')

      if (!isStage) {
        console.log(`[DiscordStore] Skipping image routing: Window (${hash}) is not Stage leader.`)
        const leaderLog: DiscordEventLogEntry = {
          timestamp: Date.now(),
          type: 'DEBUG_IMAGE',
          summary: `Routing skipped: This window (${hash}) is not the Stage leader.`,
        }
        eventLog.value = [...eventLog.value.slice(-(MAX_EVENT_LOG_ENTRIES - 1)), leaderLog]
        return
      }

      try {
        console.log(`[DiscordStore] Routing image to Discord: ${entry.title}`)
        const routeLog: DiscordEventLogEntry = {
          timestamp: Date.now(),
          type: 'IMAGE_ROUTE',
          summary: `Routing image "${entry.title}" to channel ${lastChannelId.value.slice(-4)}`,
        }
        eventLog.value = [...eventLog.value.slice(-(MAX_EVENT_LOG_ENTRIES - 1)), routeLog]

        // Convert Blob to Base64 for IPC transfer
        const reader = new FileReader()
        const base64Promise = new Promise<string>((resolve) => {
          reader.onloadend = () => resolve(reader.result as string)
        })
        reader.readAsDataURL(entry.blob)
        const base64 = await base64Promise

        await sendImageToDiscord(lastChannelId.value, base64, `🎨 **New Visual Manifestation: ${entry.title}**`)
      }
      catch (err: any) {
        console.error('[DiscordStore] Failed to route image to discord:', err)
        const errLog: DiscordEventLogEntry = {
          timestamp: Date.now(),
          type: 'ERROR',
          summary: `Image routing failed: ${err.message}`,
        }
        eventLog.value = [...eventLog.value.slice(-(MAX_EVENT_LOG_ENTRIES - 1)), errLog]
      }
    })

    cleanupListeners = () => {
      ipcRenderer.removeListener(STATUS_CHANGED_CHANNEL, onStatusChanged)
      ipcRenderer.removeListener(EVENT_LOG_CHANNEL, onEventLog)
      ipcRenderer.removeListener(INBOUND_MESSAGE_CHANNEL, onInboundMessage)
      cleanupChatHooks()
      cleanupBackgroundHook()
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  // ── Lifecycle & Initialization ──────────────────────────────────────────

  // Initialize listeners immediately so the store is "always awake"
  setupEventListeners()

  onMounted(async () => {
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
    addAudioToTurn,
    flushAudioTurn,
    clearAudioTurn,
    clearEventLog,
    resetState,
  }
})

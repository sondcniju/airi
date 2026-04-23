import type { DiscordEventLogEntry, DiscordInboundMessage, DiscordServiceStatus } from '@proj-airi/stage-shared'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { Client, Events, GatewayIntentBits, Partials } from 'discord.js'
import { BrowserWindow, ipcMain } from 'electron'
import { nanoid } from 'nanoid'

import {
  discordServiceForceSync,
  discordServiceGetStatus,
  discordServiceSendMessage,
  discordServiceSimulateEvent,
  discordServiceStart,
  discordServiceStop,
} from '../../../../shared/eventa'

const log = useLogg('discord-service').useGlobalConfig()

// Event channel names for main → renderer push events
const STATUS_CHANGED_CHANNEL = 'eventa:event:electron:discord:status-changed'
const EVENT_LOG_CHANNEL = 'eventa:event:electron:discord:event-log'
const INBOUND_MESSAGE_CHANNEL = 'eventa:event:electron:discord:inbound-message'

// ── Internal State ─────────────────────────────────────────────────────────────

let discordClient: Client | null = null
let activeChannelId: string | null = null
let lastError: string | null = null

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Broadcast an event payload to all BrowserWindows. */
function broadcastToAllWindows(channel: string, payload: unknown) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && win.webContents) {
      win.webContents.send(channel, payload)
    }
  }
}

function buildStatus(): DiscordServiceStatus {
  if (!discordClient) {
    return {
      state: 'disconnected',
      ping: null,
      guilds: [],
      activeChannelId: null,
      botUser: null,
      error: lastError,
    }
  }

  const ready = discordClient.isReady()
  const guilds = ready
    ? discordClient.guilds.cache.map(g => ({
        id: g.id,
        name: g.name,
        icon: g.iconURL({ size: 64 }),
      }))
    : []

  return {
    state: ready ? 'connected' : 'connecting',
    ping: ready ? discordClient.ws.ping : null,
    guilds,
    activeChannelId,
    botUser: ready && discordClient.user
      ? {
          id: discordClient.user.id,
          tag: discordClient.user.tag,
          avatarUrl: discordClient.user.displayAvatarURL({ size: 128 }),
        }
      : null,
    error: lastError,
  }
}

/**
 * Split a message into Discord-safe chunks (≤2000 chars), preferring
 * newline and space boundaries.  Ported from the legacy adapter.
 */
function chunkMessage(content: string): string[] {
  const MAX = 2000
  if (content.length <= MAX)
    return [content]

  const chunks: string[] = []
  let remaining = content

  while (remaining.length > 0) {
    if (remaining.length <= MAX) {
      chunks.push(remaining)
      break
    }

    let splitAt = remaining.lastIndexOf('\n', MAX)
    if (splitAt <= 0)
      splitAt = remaining.lastIndexOf(' ', MAX)
    if (splitAt <= 0)
      splitAt = MAX

    chunks.push(remaining.slice(0, splitAt))
    remaining = remaining.slice(splitAt).trim()
  }

  return chunks
}

// ── Service Setup ──────────────────────────────────────────────────────────────

export function setupDiscordService() {
  const { context } = createContext(ipcMain)

  function pushLog(type: string, summary: string) {
    const entry: DiscordEventLogEntry = {
      timestamp: Date.now(),
      type,
      summary,
    }
    log.log(`[Event] ${type}: ${summary}`)
    broadcastToAllWindows(EVENT_LOG_CHANNEL, entry)
  }

  function pushStatus() {
    broadcastToAllWindows(STATUS_CHANGED_CHANNEL, buildStatus())
  }

  function pushInboundMessage(msg: DiscordInboundMessage) {
    broadcastToAllWindows(INBOUND_MESSAGE_CHANNEL, msg)
  }

  // ── Invoke Handlers ────────────────────────────────────────────────────────

  defineInvokeHandler(context, discordServiceStart, async (payload) => {
    const token = payload?.token
    if (!token) {
      lastError = 'No token provided'
      pushStatus()
      return buildStatus()
    }

    // Tear down existing client if any
    if (discordClient) {
      try {
        discordClient.removeAllListeners()
        await discordClient.destroy()
      }
      catch { /* ignore */ }
      discordClient = null
    }

    lastError = null
    pushLog('SERVICE', 'Starting Discord service...')

    discordClient = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
      partials: [Partials.Channel],
    })

    // ── Discord Event Wiring ───────────────────────────────────────────────

    discordClient.once(Events.ClientReady, (readyClient) => {
      log.log(`Discord bot ready: ${readyClient.user.tag}`)
      pushLog('READY', `Bot online as ${readyClient.user.tag}`)
      pushStatus()
    })

    discordClient.on(Events.ShardDisconnect, (_, shardId) => {
      pushLog('SHARD_DISCONNECT', `Shard ${shardId} disconnected`)
      pushStatus()
    })

    discordClient.on(Events.ShardReconnecting, (shardId) => {
      pushLog('SHARD_RECONNECTING', `Shard ${shardId} reconnecting...`)
      pushStatus()
    })

    discordClient.on(Events.ShardReady, (shardId) => {
      pushLog('SHARD_READY', `Shard ${shardId} ready`)
      pushStatus()
    })

    discordClient.on(Events.Error, (error) => {
      lastError = error.message
      pushLog('ERROR', error.message)
      pushStatus()
    })

    // ── Inbound Message Pipe ───────────────────────────────────────────────

    discordClient.on(Events.MessageCreate, async (message) => {
      if (message.author.bot)
        return

      const content = message.content.trim()

      if (!content)
        return

      // Track active channel for outbound routing
      activeChannelId = message.channelId

      pushLog('MESSAGE_CREATE', `${message.author.username}: ${content.substring(0, 80)}${content.length > 80 ? '...' : ''}`)

      const inbound: DiscordInboundMessage = {
        messageId: message.id,
        channelId: message.channelId,
        guildId: message.guildId ?? null,
        guildName: message.guild?.name ?? null,
        userId: message.author.id,
        username: message.author.username,
        displayName: message.member?.displayName ?? message.author.username,
        content,
        attachments: [],
      }

      pushInboundMessage(inbound)
    })

    discordClient.on(Events.InteractionCreate, (interaction) => {
      pushLog('INTERACTION_CREATE', `/${interaction.isCommand() ? (interaction as any).commandName : interaction.type} from ${interaction.user.tag}`)
    })

    // ── Login ──────────────────────────────────────────────────────────────

    try {
      pushStatus() // connecting state
      await discordClient.login(token)
      return buildStatus()
    }
    catch (err: any) {
      lastError = err?.message || 'Login failed'
      pushLog('ERROR', `Login failed: ${lastError}`)
      pushStatus()
      return buildStatus()
    }
  })

  defineInvokeHandler(context, discordServiceStop, async () => {
    if (discordClient) {
      pushLog('SERVICE', 'Stopping Discord service...')
      try {
        discordClient.removeAllListeners()
        await discordClient.destroy()
      }
      catch { /* ignore */ }
      discordClient = null
      activeChannelId = null
    }
    pushStatus()
    return buildStatus()
  })

  defineInvokeHandler(context, discordServiceGetStatus, async () => {
    return buildStatus()
  })

  // ── Outbound: Send assistant message to Discord ────────────────────────

  defineInvokeHandler(context, discordServiceSendMessage, async (payload) => {
    if (!discordClient?.isReady() || !payload?.channelId || !payload?.content)
      return

    try {
      const channel = await discordClient.channels.fetch(payload.channelId)
      if (channel?.isTextBased() && 'send' in channel && typeof (channel as any).send === 'function') {
        const chunks = chunkMessage(payload.content)
        for (const chunk of chunks) {
          await (channel as any).send(chunk)
        }
        pushLog('MESSAGE_SEND', `Sent ${chunks.length} chunk(s) to ${payload.channelId}`)
      }
    }
    catch (err: any) {
      pushLog('ERROR', `Failed to send message: ${err?.message}`)
    }
  })

  // ── Force Sync: Push AIRI Card identity to Discord ─────────────────────

  defineInvokeHandler(context, discordServiceForceSync, async (payload) => {
    if (!discordClient?.isReady() || !discordClient.user)
      return

    try {
      const updates: any = {}
      if (payload?.name)
        updates.username = payload.name
      if (payload?.avatarBase64)
        updates.avatar = payload.avatarBase64

      if (Object.keys(updates).length > 0) {
        await discordClient.user.edit(updates)
        pushLog('FORCE_SYNC', `Updated bot profile: ${JSON.stringify(Object.keys(updates))}`)
      }
    }
    catch (err: any) {
      pushLog('ERROR', `Force sync failed: ${err?.message}`)
    }
  })

  // ── Simulate: Inject a mock inbound message ────────────────────────────

  defineInvokeHandler(context, discordServiceSimulateEvent, async (payload) => {
    const mock: DiscordInboundMessage = {
      messageId: `sim-${nanoid()}`,
      channelId: activeChannelId || 'simulated-channel',
      guildId: null,
      guildName: null,
      userId: 'simulated-user-001',
      username: payload?.username || 'TestUser',
      displayName: payload?.username || 'TestUser',
      content: payload?.content || 'Hello from simulated event!',
      attachments: [],
    }

    pushLog('SIMULATE', `Injected mock message from ${mock.username}: ${mock.content.substring(0, 60)}`)
    pushInboundMessage(mock)
  })

  log.log('Discord service handlers registered')
}

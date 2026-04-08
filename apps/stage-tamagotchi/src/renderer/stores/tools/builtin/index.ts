import type { Tool } from '@xsai/shared-chat'

import { getMcpToolBridge } from '@proj-airi/stage-ui/stores/mcp-tool-bridge'
import { useArtistryStore } from '@proj-airi/stage-ui/stores/modules/artistry'
import { useStickersStore } from '@proj-airi/stage-ui/stores/stickers'

import { imageJournalTools } from './image-journal'
import { mcpTools } from './mcp'
import { stickersTools } from './stickers'
import { textJournalTools } from './text-journal'
import { widgetsTools } from './widgets'

export async function builtinTools(): Promise<Tool[]> {
  const artistry = useArtistryStore()
  const stickers = useStickersStore()

  const mcpBridge = getMcpToolBridge()
  const mcpStatus = await mcpBridge.getRuntimeStatus()

  const toolPromises: Promise<Tool[]>[] = []

  // Always enabled
  toolPromises.push(textJournalTools())

  // Artistry suite
  if (artistry.configured) {
    console.log('[builtinTools] 🎨 Artistry configured, enabling widgets and image journal.')
    toolPromises.push(widgetsTools())
    toolPromises.push(imageJournalTools())
  }

  // Stickers library
  if (stickers.currentLibrary.length > 0) {
    console.log(`[builtinTools] ✨ Stickers library found (${stickers.currentLibrary.length}), enabling stickers tool.`)
    toolPromises.push(Promise.resolve(stickersTools()))
  }

  // MCP Servers
  if (mcpStatus.servers.length > 0) {
    console.log(`[builtinTools] 🔌 MCP Servers configured (${mcpStatus.servers.length}), enabling mcp tools.`)
    toolPromises.push(mcpTools())
  }

  const groups = await Promise.all(toolPromises)
  const flattened = groups.flat()

  console.log(`[builtinTools] 🛠️ Total tools registered: ${flattened.length}`)
  return flattened
}

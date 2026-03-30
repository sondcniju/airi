import type { ContextMessage } from '../../../types/chat'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { nanoid } from 'nanoid'

import { useStickersStore } from '../../stickers'

/**
 * Creates context about the available stickers that the assistant can use.
 */
export function createStickersContext(): ContextMessage {
  const stickersStore = useStickersStore()
  const availableStickers = stickersStore.libraryMetadata.map((s: any) => s.label).join(', ')

  return {
    id: nanoid(),
    contextId: 'stickers',
    text: availableStickers
      ? `Available stickers you can spawn to express emotions or decorate the screen: ${availableStickers}. Use the spawn_sticker tool with one of these labels.`
      : 'No stickers are currently available in the library. Ask the user to upload some if you want to use them!',
    strategy: ContextUpdateStrategy.ReplaceSelf,
    createdAt: Date.now(),
  }
}

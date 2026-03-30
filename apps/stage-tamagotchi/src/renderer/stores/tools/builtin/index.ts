import type { Tool } from '@xsai/shared-chat'

import { imageJournalTools } from './image-journal'
import { stickersTools } from './stickers'
import { textJournalTools } from './text-journal'
import { widgetsTools } from './widgets'

export async function builtinTools(): Promise<Tool[]> {
  const groups = await Promise.all([
    widgetsTools(),
    textJournalTools(),
    imageJournalTools(),
    stickersTools(),
  ])

  return groups.flat()
}

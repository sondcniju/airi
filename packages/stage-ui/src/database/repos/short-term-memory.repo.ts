import type { ShortTermMemoryBlock } from '../../types/short-term-memory'

import { storage } from '../storage'

export const shortTermMemoryRepo = {
  async getAll(userId: string) {
    const key = `local:memory/short-term/${userId}`
    return await storage.getItemRaw<ShortTermMemoryBlock[]>(key)
  },

  async saveAll(userId: string, blocks: ShortTermMemoryBlock[]) {
    const key = `local:memory/short-term/${userId}`
    const cleanBlocks = JSON.parse(JSON.stringify(blocks))
    await storage.setItemRaw(key, cleanBlocks)
  },
}

import type { EchoChip } from '../../types/echo-chip'

import { storage } from '../storage'

export const echoChipsRepo = {
  async getAll(userId: string) {
    const key = `local:memory/echo-chips/${userId}`
    return await storage.getItemRaw<EchoChip[]>(key)
  },

  async saveAll(userId: string, chips: EchoChip[]) {
    const key = `local:memory/echo-chips/${userId}`
    await storage.setItemRaw(key, chips)
  },
}

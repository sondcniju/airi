import type { ChatSessionRecord, ChatSessionsIndex } from '../../types/chat-session'

import { storage } from '../storage'

export const chatSessionsRepo = {
  async getIndex(userId: string) {
    const key = `local:chat/index/${userId}`
    return await storage.getItemRaw<ChatSessionsIndex>(key)
  },

  async saveIndex(index: ChatSessionsIndex) {
    const key = `local:chat/index/${index.userId}`
    const cleanIndex = JSON.parse(JSON.stringify(index))
    await storage.setItemRaw(key, cleanIndex)
  },

  async getSession(sessionId: string) {
    const key = `local:chat/sessions/${sessionId}`
    return await storage.getItemRaw<ChatSessionRecord>(key)
  },

  async saveSession(sessionId: string, record: ChatSessionRecord) {
    const key = `local:chat/sessions/${sessionId}`
    const cleanRecord = JSON.parse(JSON.stringify(record))
    await storage.setItemRaw(key, cleanRecord)
  },

  // Cleanup
  async deleteSession(sessionId: string) {
    await storage.removeItem(`local:chat/sessions/${sessionId}`)
  },
}

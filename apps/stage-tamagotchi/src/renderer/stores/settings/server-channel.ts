import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useAsyncState, useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { watch } from 'vue'

import { electronApplyServerChannelConfig, electronGetServerChannelConfig } from '../../../shared/eventa'

export const useServerChannelSettingsStore = defineStore('tamagotchi-server-channel-settings', () => {
  const websocketTlsConfig = useLocalStorage<{ cert?: string, key?: string, passphrase?: string } | null | undefined>('settings/server-channel/websocket-tls-config', null)

  const getServerChannelConfig = useElectronEventaInvoke(electronGetServerChannelConfig)
  const applyServerChannelConfig = useElectronEventaInvoke(electronApplyServerChannelConfig)

  const serverChannelConfig = useAsyncState(getServerChannelConfig, null as { websocketTlsConfig?: any } | null)

  watch(websocketTlsConfig, async (newValue) => {
    // websocketTlsConfig.value = newValue // Remove this, it's redundant and could loop
    await applyServerChannelConfig({ websocketTlsConfig: newValue ? {} : null })
  })

  watch(serverChannelConfig.state, (newConfig) => {
    if (newConfig?.websocketTlsConfig !== undefined) {
      websocketTlsConfig.value = newConfig.websocketTlsConfig
    }
  })

  return {
    websocketTlsConfig,
  }
})

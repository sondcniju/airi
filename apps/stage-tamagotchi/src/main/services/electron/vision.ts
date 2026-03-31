import { defineInvokeHandler } from '@moeru/eventa'
import { visionCaptureScreen } from '@proj-airi/stage-shared'
import { desktopCapturer } from 'electron'

/**
 * Screen capture service that provides high-level screen/window capture
 * functionality via Eventa/IPC.
 */
export function createVisionService(params: { context: any }) {
  defineInvokeHandler(params.context, visionCaptureScreen, async (options) => {
    try {
      // Fetch available sources
      const sources = await desktopCapturer.getSources({
        types: options?.type === 'window' ? ['window'] : ['screen'],
        thumbnailSize: {
          width: options?.width || 1280,
          height: options?.height || 720,
        },
      })

      // Find the appropriate source
      const source = options?.sourceId
        ? sources.find(s => s.id === options.sourceId)
        : sources[0] // Default to primary screen

      if (!source) {
        console.warn('[Vision Service] No capture source found.')
        return null
      }

      console.log(`[Vision Service] Captured ${options?.type || 'screen'}: ${source.name} (${source.id})`)

      return {
        dataUrl: source.thumbnail.toDataURL(),
        timestamp: Date.now(),
      }
    }
    catch (err) {
      console.error('[Vision Service] Capture failed:', err)
      return null
    }
  })
}

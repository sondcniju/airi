import type { WidgetsWindowManager } from '../../../windows/widgets'
import type { ArtistryProvider, ArtistryRequest } from './providers/base'

import { useLogg } from '@guiiai/logg'

import { ComfyUIProvider } from './providers/comfyui'
import { NanoBananaProvider } from './providers/nanobanana'
import { ReplicateProvider } from './providers/replicate'

const log = useLogg('artistry-bridge').useGlobalConfig()

function robustParse(input: any): any {
  if (typeof input === 'object' && input !== null)
    return input
  if (typeof input === 'string') {
    try {
      return JSON.parse(input)
    }
    catch {
      return {}
    }
  }
  return {}
}

const lastTriggerMap = new Map<string, string>()
const activeRunMap = new Map<string, string>()

function createRunId(widgetId: string) {
  return `${widgetId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
}

async function downloadImageAsBase64(url: string): Promise<string> {
  try {
    log.log(`[Artistry Bridge] Downloading image from: ${url}`)
    const response = await fetch(url)
    if (!response.ok)
      throw new Error(`Failed to fetch image: ${response.statusText}`)
    const buffer = await response.arrayBuffer()
    return Buffer.from(buffer).toString('base64')
  }
  catch (error: any) {
    log.error(`[Artistry Bridge] Failed to download image: ${error.message}`)
    throw error
  }
}

// Maintaining a registry of providers
export const artistryProviders = new Map<string, ArtistryProvider>()
artistryProviders.set('comfyui', new ComfyUIProvider())
artistryProviders.set('replicate', new ReplicateProvider())
artistryProviders.set('nanobanana', new NanoBananaProvider())

// Deduplication map for headless requests
const pendingHeadlessRequests = new Map<string, Promise<{ imageUrl?: string, base64?: string, error?: string }>>()

export async function generateHeadless(params: {
  prompt: string
  model?: string
  provider?: string
  options?: Record<string, any>
  globals?: any
}): Promise<{ imageUrl?: string, base64?: string, error?: string }> {
  // Create a fingerprint for deduplication
  const fingerprint = JSON.stringify({
    p: params.prompt,
    m: params.model,
    pr: params.provider,
    o: params.options,
    g: { ...params.globals, image: params.globals?.image ? 'HAS_IMAGE' : undefined },
  })

  if (pendingHeadlessRequests.has(fingerprint)) {
    log.log(`[Headless] Deduplicating identical request: ${params.prompt.slice(0, 30)}...`)
    return pendingHeadlessRequests.get(fingerprint)!
  }

  const executionPromise = (async () => {
    const requestedProvider = (params.provider || 'replicate').trim().toLowerCase()
    const provider = artistryProviders.get(requestedProvider)
    if (!provider) {
      log.error(`[Headless] CRITICAL: Provider '${requestedProvider}' not found in registry!`)
      throw new Error(`Provider '${requestedProvider}' not found.`)
    }

    // Initialize the provider if globals are provided
    if (provider.initialize && params.globals) {
      log.log(`[Headless] Initializing provider ${requestedProvider} with globals...`)
      await provider.initialize(params.globals)
    }

    log.log(`[Headless] Globals keys: ${Object.keys(params.globals || {}).join(', ')}`)
    if (params.globals?.image)
      log.log(`[Headless] Source image length: ${params.globals.image.length}`)

    const request: ArtistryRequest = {
      prompt: params.prompt,
      negativePrompt: params.options?.negativePrompt,
      width: params.options?.width,
      height: params.options?.height,
      model: params.model,
      extra: {
        ...params.options,
        image: params.globals?.image,
        internalJobId: createRunId('headless'),
      },
    }

    log.log(`[Headless] Starting generation with provider: ${requestedProvider}, model: ${params.model || 'default'}`)
    const job = await provider.generate(request)
    log.log(`[Headless] Job created: ${job.jobId}`)

    // Polling/Wait for result
    if (!('setJobCallback' in provider)) {
      let isDone = false
      let lastStatus: any = {}
      const start = Date.now()
      const timeout = 1000 * 60 * 10 // 10 minutes timeout

      while (!isDone) {
        if (Date.now() - start > timeout) {
          log.error(`[Headless] Job ${job.jobId} timed out after 10 minutes.`)
          throw new Error('Image generation timed out after 10 minutes.')
        }

        log.log(`[Headless] Polling status for job: ${job.jobId}...`)
        lastStatus = await provider.getStatus(job.jobId)
        log.log(`[Headless] Status for job ${job.jobId}: ${lastStatus.status}`)

        if (lastStatus.status === 'succeeded' || lastStatus.status === 'failed') {
          isDone = true
        }
        if (!isDone) {
          await new Promise(resolve => setTimeout(resolve, 2000))
        }
      }

      if (lastStatus.status === 'failed') {
        log.error(`[Headless] Job ${job.jobId} failed: ${lastStatus.error || 'Unknown error'}`)
        throw new Error(lastStatus.error || 'Generation failed')
      }

      log.log(`[Headless] Job ${job.jobId} succeeded. Image URL: ${lastStatus.imageUrl}`)
      const base64 = lastStatus.imageUrl ? await downloadImageAsBase64(lastStatus.imageUrl) : undefined
      return { imageUrl: lastStatus.imageUrl, base64 }
    }
    else {
      // For providers with callbacks (like ComfyUI), we wait for the result via the callback
      log.log(`[Headless] Using callback-based wait logic for provider: ${requestedProvider}`)
      return new Promise<{ imageUrl?: string, base64?: string }>((resolve, reject) => {
        const timeout = 1000 * 60 * 10 // 10 minutes timeout
        const timer = setTimeout(() => {
          reject(new Error('Image generation timed out after 10 minutes.'))
        }, timeout)

        ;(provider as any).setJobCallback(request.extra?.internalJobId, async (status: any) => {
          if (status.status === 'succeeded') {
            clearTimeout(timer)
            try {
              const base64 = status.imageUrl ? await downloadImageAsBase64(status.imageUrl) : undefined
              resolve({ imageUrl: status.imageUrl, base64 })
            }
            catch (e) {
              reject(e)
            }
          }
          else if (status.status === 'failed') {
            clearTimeout(timer)
            reject(new Error(status.error || 'Generation failed'))
          }
        })
      })
    }
  })()

  pendingHeadlessRequests.set(fingerprint, executionPromise)

  try {
    return await executionPromise
  }
  catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
  finally {
    // Remove from map after completion so it can be re-triggered later
    pendingHeadlessRequests.delete(fingerprint)
  }
}

async function handleArtistryTrigger(params: {
  id: string
  componentName?: string
  componentProps?: any
  widgetsManager: WidgetsWindowManager
}) {
  if (params.componentName !== 'comfy' && params.componentName !== 'artistry')
    return

  log.log(`🔍 Intercepted widget update [${params.id}] for component: ${params.componentName}`)

  const props = robustParse(params.componentProps)
  const status = props.status
  const prompt = props.payload?.prompt || props.prompt

  const config = props._artistryConfig || {}
  const providerId = config.provider || 'comfyui'

  // Extract options and remix ID fallback
  const options = config.options || {}
  const remixId = props.payload?.remixId || props.remixId || options.remixId || (props.status === 'generating' && !prompt ? '48250602' : undefined)

  const mode = props.mode || (remixId ? 'remix' : 'generate')
  const triggerFingerprint = `${mode}:${remixId || ''}:${prompt || ''}`

  if (status === 'generating' && lastTriggerMap.get(params.id) !== triggerFingerprint && (prompt || remixId)) {
    log.log(`🎯 TRIGGER DETECTED [${params.id}]: ${triggerFingerprint} | Mode: ${mode} | Provider: ${providerId}`)
    lastTriggerMap.set(params.id, triggerFingerprint)
    const runId = createRunId(params.id)
    activeRunMap.set(params.id, runId)

    const provider = artistryProviders.get(providerId)
    if (!provider) {
      log.error(`🔴 Provider '${providerId}' not found.`)
      params.widgetsManager.updateWidget({
        id: params.id,
        componentProps: { status: 'error', actionLabel: `Provider '${providerId}' not available` },
      })
      return
    }

    // Initialize the provider with global config
    if (provider.initialize && config.Globals) {
      await provider.initialize(config.Globals)
    }

    try {
      // Build the abstract request
      const request: ArtistryRequest = {
        prompt: config.promptPrefix ? `${config.promptPrefix} ${prompt}` : prompt,
        model: config.model,
        extra: {
          ...options,
          internalJobId: runId, // Track each generation independently, even on the same widget.
          remixId,
        },
      }

      const updateIfActive = (statusUpdate: Record<string, any>) => {
        // NOTICE: the same widget can kick off another generation before the previous one fully
        // settles. Only the most recent run is allowed to keep updating the widget state.
        if (activeRunMap.get(params.id) !== runId)
          return

        params.widgetsManager.updateWidget({
          id: params.id,
          componentProps: statusUpdate,
        })
      }

      // If the provider accepts callbacks (like ComfyUI streaming stdout)
      if ('setJobCallback' in provider) {
        ;(provider as any).setJobCallback(runId, (statusUpdate: any) => updateIfActive(statusUpdate))
      }

      const job = await provider.generate(request)

      // Polling loop for providers that don't do callbacks (like Replicate)
      if (!('setJobCallback' in provider)) {
        let isDone = false
        while (!isDone) {
          const status = await provider.getStatus(job.jobId)
          if (status.status === 'succeeded' || status.status === 'failed') {
            isDone = true
          }

          updateIfActive(status)

          if (!isDone) {
            await new Promise(resolve => setTimeout(resolve, 2000))
          }
        }
      }

      log.log(`🎉 Job complete for ${params.id}. Sending final status: done`)
      updateIfActive({ status: 'done', progress: 100, actionLabel: undefined })
    }
    catch (error: any) {
      log.error(`🔴 Generation failed: ${error.message}`)
      if (activeRunMap.get(params.id) === runId) {
        params.widgetsManager.updateWidget({
          id: params.id,
          componentProps: { status: 'error', actionLabel: error.message },
        })
      }
    }
  }
}

export function setupArtistryBridge(params: { widgetsManager: WidgetsWindowManager }) {
  log.log('🚀 Initializing Artistry bridge (Spawn + Update Interceptor)...')

  const originalUpdateWidget = params.widgetsManager.updateWidget
  params.widgetsManager.updateWidget = async (payload) => {
    const snapshot = params.widgetsManager.getWidgetSnapshot(payload.id)
    await originalUpdateWidget.call(params.widgetsManager, payload)
    await handleArtistryTrigger({
      id: payload.id,
      componentName: snapshot?.componentName,
      componentProps: payload.componentProps,
      widgetsManager: params.widgetsManager,
    })
  }

  const originalPushWidget = params.widgetsManager.pushWidget
  params.widgetsManager.pushWidget = async (payload) => {
    if (payload.componentName === 'comfy' || payload.componentName === 'artistry') {
      log.log(`🖼️  Enabling 'Living Wall' mode for ${payload.id}. Forcing infinite TTL. (Component: ${payload.componentName})`)
      payload.ttlMs = 0
    }

    const resultId = await originalPushWidget.call(params.widgetsManager, payload)

    await handleArtistryTrigger({
      id: resultId,
      componentName: payload.componentName,
      componentProps: payload.componentProps,
      widgetsManager: params.widgetsManager,
    })

    return resultId
  }
}

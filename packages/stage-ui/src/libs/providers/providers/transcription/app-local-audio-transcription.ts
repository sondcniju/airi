import type { ProviderDefinition } from '../../types'

import { isStageTamagotchi } from '@proj-airi/stage-shared'
import { z } from 'zod'

import { getWhisperWorker, WHISPER_MODELS, whisperModelsToModelInfo } from '../../../workers/whisper'

const localTranscriptionConfigSchema = z.object({})

type LocalTranscriptionConfig = z.input<typeof localTranscriptionConfigSchema>

const loadedModels = new Set<string>()
const loadingPromises = new Map<string, Promise<void>>()

const definition: ProviderDefinition<LocalTranscriptionConfig> = {
  id: 'app-local-audio-transcription',
  name: 'App (Local)',
  // Legacy fields for ProviderMetadata
  nameKey: 'settings.pages.providers.provider.app-local-audio-transcription.title',
  descriptionKey: 'settings.pages.providers.provider.app-local-audio-transcription.description',
  category: 'transcription',
  // New fields for ProviderDefinition
  nameLocalize: ({ t }: { t: any }) => t('settings.pages.providers.provider.app-local-audio-transcription.title'),
  descriptionLocalize: ({ t }: { t: any }) => t('settings.pages.providers.provider.app-local-audio-transcription.description'),
  // @ts-ignore - settingsComponent is dynamic and cross-package
  settingsComponent: () => import('@proj-airi/stage-pages/pages/settings/providers/transcription/app-local-audio-transcription.vue'),
  icon: 'i-lobe-icons:huggingface',
  description: 'Native AI - High-performance local Whisper transcription',
  pricing: 'free',
  deployment: 'local',
  beginnerRecommended: true,
  tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt'],
  isAvailableBy: isStageTamagotchi,
  // Legacy
  defaultOptions: () => ({}),
  // New
  createProviderConfig: () => localTranscriptionConfigSchema as any,
  createProvider: async (_config: LocalTranscriptionConfig) => {
    const worker = await getWhisperWorker()

    const transcribe = async (audioInput: any, model: string) => {
      console.group(`[App Local Transcription] Transcribing with model ${model}`)

      // Transcription libraries like @xsai might pass an object with { file: Blob }
      const audio = (audioInput && typeof audioInput === 'object' && 'file' in audioInput)
        ? (audioInput as any).file
        : audioInput

      console.info('[App Local Transcription] Normalized audio input:', {
        type: audio?.constructor?.name || typeof audio,
        size: audio instanceof Blob ? audio.size : 'N/A',
      })

      // Safety: ensure model is loaded if not already
      if (!loadedModels.has(model)) {
        console.warn(`[App Local Transcription] Model ${model} not loaded. Triggering auto-load...`)
        try {
          const capabilities = definition.capabilities as any
          if (capabilities?.loadModel) {
            await capabilities.loadModel(model, { transcription: () => ({}) } as any, { onProgress: (info: any) => console.info(`[App Local Transcription] Auto-load progress:`, info) })
          }
          else {
            throw new Error('loadModel capability is missing')
          }
        }
        catch (err) {
          console.error(`[App Local Transcription] Auto-load failed:`, err)
          console.groupEnd()
          throw err
        }
      }

      return new Promise((resolve, reject) => {
        const id = Math.random().toString(36).substring(7)

        const handleMessage = (e: MessageEvent) => {
          if (e.data.id === id) {
            if (e.data.type === 'RESULT') {
              console.info(`[App Local Transcription] Success for ${id}`)
              worker.removeEventListener('message', handleMessage)
              resolve({ text: e.data.text })
            }
            else if (e.data.type === 'ERROR') {
              const error = new Error(e.data.error || 'Unknown worker error')
              ;(error as any).stack = e.data.stack
              console.error(`[App Local Transcription] Error for ${id}:`, error)
              worker.removeEventListener('message', handleMessage)
              reject(error)
            }
          }
        }

        worker.addEventListener('message', handleMessage)

        console.info(`[App Local Transcription] Sending TRANSCRIBE message ${id}`)

        if (audio instanceof Blob) {
          audio.arrayBuffer().then((buffer) => {
            worker.postMessage({
              type: 'TRANSCRIBE',
              id,
              audio: buffer,
              model,
            }, [buffer])
          }).catch((err) => {
            console.error('[App Local Transcription] Failed to read audio blob:', err)
            worker.removeEventListener('message', handleMessage)
            reject(err)
          })
        }
        else if (audio instanceof ArrayBuffer) {
          const buffer = audio.slice(0)
          worker.postMessage({
            type: 'TRANSCRIBE',
            id,
            audio: buffer,
            model,
            format: 'pcm16',
          }, [buffer])
        }
        else {
          console.error('[App Local Transcription] Unsupported audio format received:', audio)
          worker.removeEventListener('message', handleMessage)
          reject(new Error(`Unsupported audio format: ${audio?.constructor?.name || typeof audio}`))
        }
      }).finally(() => {
        console.groupEnd()
      })
    }

    return {
      transcription: (model: string) => ({
        provider: 'app-local-audio-transcription',
        model,
        // NOTICE: baseURL is required by @xsai/shared requestURL to avoid .toString() on undefined
        baseURL: 'http://app-local-transcription.invalid',
        // NOTICE: fetch shim to intercept REST-style calls and route to local worker
        fetch: async (input: any, init?: any) => {
          const url = (typeof input === 'string')
            ? input
            : (input instanceof URL)
                ? input.href
                : (input && typeof input === 'object' && 'url' in input)
                    ? input.url
                    : String(input)

          if (url.includes('audio/transcriptions')) {
            console.info('[App Local Transcription] Intercepting transcription request', { url })
            const body = init?.body as any
            const file = body?.get?.('file')
            const result = await transcribe(file, model)
            return new Response(JSON.stringify(result), {
              headers: { 'Content-Type': 'application/json' },
            })
          }
          return globalThis.fetch(input, init)
        },
        // Also keep legacy transcribe for direct calls
        transcribe: (audioInput: any) => transcribe(audioInput, model),
      }),
    } as any // Cast to any because the nested structure used by xsai is complex and we're bridging interfaces
  },
  capabilities: {
    // Legacy
    listModels: async () => whisperModelsToModelInfo(WHISPER_MODELS as any),

    // Common for both standards
    loadModel: async (_config: any, _provider: any, hooks?: { onProgress?: (progress: any) => void }) => {
      const modelId = WHISPER_MODELS[0].id // Fallback to first model if not specific
      const effectiveModelId = typeof _config === 'string' ? _config : modelId

      if (loadedModels.has(effectiveModelId)) {
        console.info(`[App Local Transcription] Model ${effectiveModelId} already loaded.`)
        return
      }

      if (loadingPromises.has(effectiveModelId)) {
        console.info(`[App Local Transcription] Model ${effectiveModelId} is already loading...`)
        return loadingPromises.get(effectiveModelId)
      }

      console.info(`[App Local Transcription] Starting load for ${effectiveModelId}`)

      const loadPromise = (async () => {
        const worker = await getWhisperWorker()
        const id = Math.random().toString(36).substring(7)

        return new Promise<void>((resolve, reject) => {
          const handleMessage = (e: MessageEvent) => {
            if (e.data.id === id) {
              if (e.data.type === 'LOADED') {
                worker.removeEventListener('message', handleMessage)
                loadedModels.add(effectiveModelId)
                loadingPromises.delete(effectiveModelId)
                console.info(`[App Local Transcription] Model ${effectiveModelId} loaded successfully.`)
                resolve()
              }
              else if (e.data.type === 'PROGRESS') {
                if (hooks?.onProgress) {
                  hooks.onProgress({ progress: e.data.progress })
                }
              }
              else if (e.data.type === 'ERROR') {
                worker.removeEventListener('message', handleMessage)
                loadingPromises.delete(effectiveModelId)
                const error = new Error(e.data.error)
                ;(error as any).stack = e.data.stack
                console.error(`[App Local Transcription] Load failed:`, error)
                reject(error)
              }
            }
          }

          worker.addEventListener('message', handleMessage)
          worker.postMessage({ type: 'LOAD', id, modelId: effectiveModelId })
        })
      })()

      loadingPromises.set(effectiveModelId, loadPromise)
      return loadPromise
    },

    // New (ProviderDefinition uses transcription under capabilities)
    transcription: {
      protocol: 'http',
      generateOutput: true,
      streamOutput: false,
      streamInput: false,
    },
  } as any,
  validators: {
    // Legacy
    validateProviderConfig: () => ({
      errors: [],
      reason: '',
      valid: true,
    }),
    // New
    validateConfig: [],
    validateProvider: [],
  } as any,
} as any

export const appLocalAudioTranscription = definition

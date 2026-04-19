import type { Message } from '@xsai/shared-chat'

import { defineInvoke, defineInvokeEventa } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { artistryGenerateHeadless } from '@proj-airi/stage-shared'
import { defineStore } from 'pinia'
import { ref, toRaw } from 'vue'
import { toast } from 'vue-sonner'

import { useBackgroundStore } from '../background'
import { useLLM } from '../llm'
import { useProvidersStore } from '../providers'
import { useAiriCardStore } from './airi-card'
import { useArtistryStore } from './artistry'
import { useConsciousnessStore } from './consciousness'

const artistLog = import.meta.env.DEV ? console.log.bind(console, '[AutonomousArtist]') : () => {}

export const useAutonomousArtistryStore = defineStore('artistry-autonomous', () => {
  const llmStore = useLLM()
  const cardStore = useAiriCardStore()
  const backgroundStore = useBackgroundStore()
  const artistryStore = useArtistryStore()
  const consciousnessStore = useConsciousnessStore()
  const providersStore = useProvidersStore()

  const isProcessing = ref(false)

  /**
   * Safe IPC Invoker for headless generation
   */
  const widgetsAdd = defineInvokeEventa<string | undefined, any>('eventa:invoke:electron:windows:widgets:add')

  const getGenerateHeadless = () => {
    const win = window as any
    if (typeof window !== 'undefined' && win.electron?.ipcRenderer) {
      const { context } = createContext(win.electron.ipcRenderer as any)
      return {
        generate: defineInvoke(context, artistryGenerateHeadless),
        addWidget: defineInvoke(context, widgetsAdd),
      }
    }
    return null
  }

  /**
   * Analyzes the user input in parallel and triggers a visual if threshold is met.
   */
  async function runArtistTask(userInput: string, history: Message[] = []) {
    const { activeCard } = cardStore
    const autonomousEnabled = activeCard?.extensions?.airi?.artistry?.autonomousEnabled ?? false
    artistLog('Triggered runArtistTask. State:', {
      cardId: cardStore.activeCardId,
      cardName: activeCard?.name,
      autonomousEnabled,
    })

    if (!activeCard) {
      return
    }

    const artistry = activeCard.extensions?.airi?.artistry
    if (!autonomousEnabled || !artistry) {
      return
    }

    const threshold = artistry.autonomousThreshold ?? 70
    const cardId = cardStore.activeCardId

    isProcessing.value = true
    artistLog('Starting analysis task...', { threshold, cardId })

    try {
      // 1. Compose the "Director" prompt
      const systemPrompt = `You are the Cinematic Director for AIRI. 
Your job is to analyze the user's input and decide if it warrants a visual manifestation (a generative image).
Manifestation is warranted for:
- Descriptions of beautiful scenery or environment changes
- Direct mentions of food, items, or gifts
- Narrative actions that would look stunning as a manga/anime scene
- Changes in the character's clothing or appearance

Character Personality: ${activeCard.personality}

Output EXACTLY this JSON format and nothing else:
{
  "reasoning": "Quick explanation of why this warrants/doesn't warrant a visual",
  "intensity": 0-100,
  "prompt": "Highly detailed, illustrative prompt for the image generator. Use Mori's style (masterpiece, high quality, manga style, intricate details)",
  "title": "Short descriptive title for the scene"
}`

      // Prepare context: last 3 turns of history for scene consistency
      const recentHistory = history.slice(-3)
      const messages: Message[] = [
        { role: 'system', content: systemPrompt },
        ...recentHistory,
        { role: 'user', content: userInput },
      ]

      const modelId = consciousnessStore.activeModel
      const providerId = consciousnessStore.activeProvider

      artistLog('Sending prompt to Director LLM...', {
        model: modelId,
        provider: providerId,
        historyCount: recentHistory.length,
        userInputSubstring: userInput.substring(0, 50),
      })

      if (!modelId || !providerId) {
        throw new Error(`Missing LLM configuration (Model: ${modelId}, Provider: ${providerId})`)
      }

      const chatProvider = await providersStore.getProviderInstance(providerId) as any
      if (!chatProvider) {
        throw new Error(`Failed to resolve chat provider instance for: ${providerId}`)
      }

      // 2. Call LLM (Non-streaming for structured data)
      const response = await llmStore.generate(modelId, chatProvider, messages)

      const rawContent = (response.text || '').trim()
      artistLog('Received raw response from Director LLM:', rawContent)

      // 3. Parse and analyze
      // Handle potential markdown fences: ```json ... ```
      let jsonContent = rawContent
      const fenceMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
      if (fenceMatch) {
        jsonContent = fenceMatch[1].trim()
        artistLog('Extracted JSON from fences:', jsonContent)
      }

      if (!jsonContent) {
        throw new Error('LLM returned empty content')
      }

      const analysis = JSON.parse(jsonContent)
      artistLog('Parsed Analysis Result:', {
        intensity: analysis.intensity,
        reasoning: analysis.reasoning,
        title: analysis.title,
        prompt: analysis.prompt,
      })

      const thresholdMet = (analysis.intensity ?? 0) >= threshold
      toast('Director\'s Decision', {
        description: `${thresholdMet ? '✅' : '❌'} Grade: ${analysis.intensity}/${threshold}\nReason: ${analysis.reasoning?.substring(0, 130)}${analysis.reasoning?.length > 130 ? '...' : ''}`,
        duration: 7000,
      })

      // 3. Evaluate Threshold
      if (analysis.intensity >= threshold) {
        artistLog(`Threshold met (${analysis.intensity} >= ${threshold}). Triggering generation...`)

        const invoker = getGenerateHeadless()
        if (!invoker) {
          artistLog('IPC Invoker not available (non-electron environment). Skipping generation.')
          return
        }

        const artistryGlobals = artistryStore.artistryGlobals
        const generationPayload = {
          prompt: artistry.promptPrefix ? `${artistry.promptPrefix} ${analysis.prompt}` : analysis.prompt,
          model: artistry.model || artistryStore.activeModel,
          provider: artistry.provider || artistryStore.activeProvider,
          options: artistry.options || artistryStore.providerOptions,
          globals: artistryGlobals,
        }

        artistLog('Triggering Headless Generation with payload:', generationPayload)

        const invokers = getGenerateHeadless()
        if (!invokers) {
          throw new Error('IPC invokers not available')
        }

        // Safety: ensure payload is a plain object for IPC serialization
        const plainPayload = JSON.parse(JSON.stringify(toRaw(generationPayload)))
        const result = await invokers.generate(plainPayload)

        if (result.error) {
          throw new Error(result.error)
        }

        artistLog('Headless Generation Success!', { hasUrl: !!result.imageUrl, hasBase64: !!result.base64 })

        // 4. Save to journal
        if (result.base64 || result.imageUrl) {
          let blob: Blob
          if (result.base64) {
            let data = result.base64
            let contentType = 'image/png'
            if (typeof data === 'string' && data.includes(',')) {
              const parts = data.split(',')
              contentType = parts[0].split(':')[1]?.split(';')[0] || contentType
              data = parts[1]
            }
            const byteCharacters = atob(data)
            const byteNumbers = new Array(byteCharacters.length)
            for (let j = 0; j < byteCharacters.length; j++)
              byteNumbers[j] = byteCharacters.charCodeAt(j)
            blob = new Blob([new Uint8Array(byteNumbers)], { type: contentType })
          }
          else {
            const response = await fetch(result.imageUrl!)
            blob = await response.blob()
          }

          const entryId = await backgroundStore.addBackground('journal', blob, analysis.title || 'Autonomous Scene', analysis.prompt, cardId)
          artistLog('Generation complete and added to journal.', { entryId })

          // Update character's active background to the new entry
          cardStore.updateCard(cardId, {
            extensions: {
              ...activeCard.extensions,
              airi: {
                ...activeCard.extensions.airi,
                modules: {
                  ...activeCard.extensions.airi.modules,
                  activeBackgroundId: entryId,
                },
              },
            },
          } as any)

          // 5. Trigger widget for visibility
          try {
            await invokers.addWidget({
              componentName: 'artistry',
              componentProps: {
                status: 'done',
                entryId,
                imageUrl: result.imageUrl || result.base64,
                prompt: analysis.prompt,
                title: analysis.title || 'Autonomous Scene',
                _skipIngestion: true,
              },
              size: 'm',
              ttlMs: 0,
            })
          }
          catch (widgetErr) {
            console.warn('[AutonomousArtist] Failed to spawn Result widget', widgetErr)
          }
        }
      }
      else {
        artistLog(`Intensity (${analysis.intensity}) below threshold (${threshold}). No action taken.`)
      }
    }
    catch (err) {
      artistLog('Task failed with error:', err)
    }
    finally {
      isProcessing.value = false
    }
  }

  return {
    isProcessing,
    runArtistTask,
  }
})

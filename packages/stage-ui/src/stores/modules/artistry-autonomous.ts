import type { Message } from '@xsai/shared-chat'

import type { DirectorNote } from '../../types/director'

import { defineInvoke, defineInvokeEventa } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { artistryGenerateHeadless } from '@proj-airi/stage-shared'
import { defineStore } from 'pinia'
import { ref, toRaw, watch } from 'vue'
import { toast } from 'vue-sonner'

import { directorNotesRepo } from '../../database/repos/director-notes.repo'
import { useBackgroundStore } from '../background'
import { useChatSessionStore } from '../chat/session-store'
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
  const chatSessionStore = useChatSessionStore()

  const isProcessing = ref(false)
  const directorNotes = ref<DirectorNote[]>([])

  async function loadDirectorNotes(sessionId: string) {
    directorNotes.value = await directorNotesRepo.getNotes(sessionId)
  }

  async function recordDirectorDecision(note: DirectorNote) {
    directorNotes.value.push(note)
    await directorNotesRepo.saveNotes(note.sessionId, directorNotes.value)
  }

  async function updateDirectorDecision(noteId: string, updates: Partial<DirectorNote>) {
    const note = directorNotes.value.find(n => n.id === noteId)
    if (note) {
      Object.assign(note, updates)
      await directorNotesRepo.saveNotes(note.sessionId, directorNotes.value)
    }
  }

  // Auto-load notes when session changes
  watch(() => chatSessionStore.activeSessionId, (newId) => {
    if (newId) {
      void loadDirectorNotes(newId)
    }
    else {
      directorNotes.value = []
    }
  }, { immediate: true })

  /**
   * Resolve the next concept stack based on the Director's new selections.
   * Implements the "Keep Base, Refresh Modifiers" rule:
   * - If the Director selects a new Base concept, the stack is wiped and rebuilt.
   * - If the Director selects only Layer concepts, the current Base is preserved
   *   and all other modifiers are replaced by the Director's new choices.
   */
  function resolveConceptStack(
    currentStack: string[],
    directorPicks: string[],
    visualAssets: Record<string, any>,
  ): string[] {
    const validPicks = directorPicks.filter(id => !!visualAssets[id])
    if (validPicks.length === 0)
      return currentStack

    // Separate Director's picks into bases and layers
    const newBases = validPicks.filter(id => visualAssets[id]?.isBase)
    const newLayers = validPicks.filter(id => !visualAssets[id]?.isBase)

    if (newBases.length > 0) {
      // Director picked a new Base: wipe stack, apply the last Base + layers
      const primaryBase = newBases[newBases.length - 1]
      artistLog('Stack Resolve: New Base detected, clearing stack.', { primaryBase, layers: newLayers })
      return [primaryBase, ...newLayers]
    }

    // Director picked only Layers: preserve existing Base, clear old modifiers
    const currentBase = currentStack.find(id => visualAssets[id]?.isBase)
    const nextStack = currentBase ? [currentBase] : []
    nextStack.push(...newLayers)
    artistLog('Stack Resolve: Refreshing modifiers, keeping base.', { currentBase, layers: newLayers })
    return nextStack
  }

  /**
   * Fold the active concept stack into resolved artistry and manifestation values.
   * Iterates from bottom to top; each layer can override the one below it.
   * - Prompts are concatenated.
   * - Artistry (provider/model/options) and Manifestation (modelId/mood) use "last defined wins".
   */
  function foldConceptStack(
    stack: string[],
    visualAssets: Record<string, any>,
    defaults: { provider: string, model: string, options: any },
  ) {
    let resolvedProvider = defaults.provider
    let resolvedModel = defaults.model
    let resolvedOptions = defaults.options
    let resolvedModelId: string | undefined
    let resolvedMood: string | undefined
    let accumulatedPrompt = ''

    for (const conceptId of stack) {
      const asset = visualAssets[conceptId]
      if (!asset)
        continue

      // Prompt: concatenate all snippets
      if (asset.prompt) {
        accumulatedPrompt += asset.prompt
      }

      // Artistry: last override wins
      if (asset.artistry?.provider && asset.artistry.provider !== 'none' && asset.artistry.provider !== 'inherit') {
        resolvedProvider = asset.artistry.provider
        resolvedModel = asset.artistry.model || resolvedModel
        resolvedOptions = asset.artistry.options || resolvedOptions
      }

      // Manifestation: last override wins
      if (asset.manifestation?.modelId && asset.manifestation.modelId !== 'inherit') {
        resolvedModelId = asset.manifestation.modelId
      }
      if (asset.manifestation?.mood) {
        resolvedMood = asset.manifestation.mood
      }
    }

    return {
      provider: resolvedProvider,
      model: resolvedModel,
      options: resolvedOptions,
      modelId: resolvedModelId,
      mood: resolvedMood,
      promptSnippets: accumulatedPrompt,
    }
  }

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
   * Analyzes the context in parallel and triggers a visual if threshold is met.
   */
  async function runArtistTask(inputText: string, history: Message[] = [], targetOverride?: 'user' | 'assistant') {
    const { activeCard } = cardStore
    const artistry = activeCard?.extensions?.airi?.artistry
    const autonomousEnabled = artistry?.autonomousEnabled ?? false
    const target = targetOverride || artistry?.autonomousTarget || 'user'

    artistLog('Triggered runArtistTask. State:', {
      cardId: cardStore.activeCardId,
      cardName: activeCard?.name,
      autonomousEnabled,
      target,
    })

    if (!activeCard || !artistry || !autonomousEnabled) {
      return
    }

    const threshold = artistry.autonomousThreshold ?? 70
    const cardId = cardStore.activeCardId

    isProcessing.value = true
    artistLog('Starting analysis task...', { threshold, cardId, target })

    try {
      // 0. Guard: If the text is empty, skip analysis (Director cannot analyze silence)
      if (!inputText || inputText.trim() === '') {
        artistLog('Skipping analysis: Input text is empty.')
        return
      }

      // 1. Compose the "Director" prompt based on target
      const airiExt = activeCard.extensions?.airi as any
      artistLog('DEBUG: Full airi extension:', JSON.stringify(airiExt, null, 2))
      const visualAssets = airiExt?.visual_assets || {}
      artistLog('DEBUG: visual_assets resolved to:', JSON.stringify(visualAssets))
      const hasConcepts = Object.keys(visualAssets).length > 0
      const availableConceptsText = hasConcepts
        ? Object.entries(visualAssets)
            .map(([id, asset]: [string, any]) => `- "${id}": ${asset.description}`)
            .join('\n')
        : ''

      const conceptsInstruction = hasConcepts
        ? `\nAVAILABLE CONCEPTS:\n${availableConceptsText}\n`
        : ''

      const conceptsSchema = hasConcepts
        ? ',\n  "selected_concepts": ["Array of zero or more concept IDs chosen from the Available Concepts list"]'
        : ''

      const commonInstructions = `
A high grade (warranted) should be given for:
- Descriptions of beautiful scenery or environment changes
- Expressive emotional reactions or body language from the character
- Direct mentions of food, items, or gifts in the narrative
- Narrative actions that would look stunning as a manga/anime scene
- Changes in the character's clothing or appearance

Character Personality: ${activeCard.personality}
${conceptsInstruction}
Output EXACTLY this JSON format and nothing else:
{
  "reasoning": "Quick explanation of why this scene is visually interesting or boring",
  "intensity": 1-100,
  "prompt": "Highly detailed, illustrative prompt for the image generator capturing the character's reaction and scene. Use Mori's style (masterpiece, high quality, manga style, intricate details)",
  "title": "Short descriptive title for the scene"${conceptsSchema}
}`

      const systemPrompt = target === 'assistant'
        ? `You are the Cinematic Director for AIRI. 
Your job is to ALWAYS generate a visual manifestation (a generative image) summarizing the current scene, and then grade how interesting the resulting scene is from 1 to 100.
You should draw inspiration from the entire context history provided. If the latest response is mundane, use your artistic freedom to craft an image that captures the broader narrative arc or the environment established in the recent turns.
${commonInstructions}`
        : `You are the Cinematic Director for AIRI. 
Your job is to ALWAYS generate a visual manifestation (a generative image) summarizing the current scene, and then grade how interesting the resulting scene is from 1 to 100.
You should draw inspiration from the entire context history provided. If the latest input is mundane, use your artistic freedom to craft an image that captures the broader narrative arc or the environment established in the recent turns.
${commonInstructions}`

      // 2. Rollup history and text into a single prompt to help the LLM "see" the full context
      const historyDepth = (artistry as any).autonomousHistoryDepth ?? 3
      const recentHistory = history.slice(-historyDepth)
      const historyText = recentHistory.map(m => `[${m.role === 'assistant' ? 'Companion' : 'User'}]: ${m.content}`).join('\n\n')

      const analysisPrompt = `Consider the recent history between the user and the character for context and inspiration, then analyze the latest ${target === 'assistant' ? 'response from the companion' : 'input from the user'} to decide if a visual manifestation is needed.

--- 
CONTEXT HISTORY:
${historyText || '(No previous history)'}

---
LATEST ${target === 'assistant' ? 'COMPANION RESPONSE' : 'USER INPUT'}:
"${inputText}"`

      const messages: Message[] = [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: analysisPrompt,
        },
      ]

      const modelId = consciousnessStore.activeModel
      const providerId = consciousnessStore.activeProvider

      artistLog('Sending rolled-up prompt to Director LLM...', {
        model: modelId,
        provider: providerId,
        historyCount: recentHistory.length,
        textSubstring: inputText.substring(0, 50),
        target,
      })

      if (!modelId || !providerId) {
        throw new Error(`Missing LLM configuration (Model: ${modelId}, Provider: ${providerId})`)
      }

      const chatProvider = await providersStore.getProviderInstance(providerId) as any
      if (!chatProvider) {
        throw new Error(`Failed to resolve chat provider instance for: ${providerId}`)
      }

      // NOTICE: Artificial 10s delay for USER target to avoid race conditions/429s.
      // Skipped for ASSISTANT target as the main response is already finalized.
      if (target === 'user') {
        artistLog('User target detected. Applying 10s safety delay...')
        await new Promise(resolve => setTimeout(resolve, 10000))
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
      const selectedConcepts: string[] = Array.isArray(analysis.selected_concepts) ? analysis.selected_concepts : []
      artistLog('Parsed Analysis Result:', {
        intensity: analysis.intensity,
        reasoning: analysis.reasoning,
        title: analysis.title,
        prompt: analysis.prompt,
        selected_concepts: selectedConcepts,
      })

      // 3.5 Stack Folding: Resolve the next concept stack and fold into final values
      // First, resolve what the stack SHOULD look like after the Director's decision
      const currentConceptIds = airiExt?.active_concepts || []
      const nextConceptStack = resolveConceptStack(currentConceptIds, selectedConcepts, visualAssets)
      artistLog('Stack Folding: Resolved next stack:', nextConceptStack)

      // Fold the resolved stack to get final prompt, artistry, and manifestation values
      const folded = foldConceptStack(
        nextConceptStack,
        visualAssets,
        {
          provider: artistry.provider || artistryStore.activeProvider,
          model: artistry.model || artistryStore.activeModel,
          options: artistry.options || artistryStore.providerOptions,
        },
      )

      // Build the final prompt from the Director's base prompt + folded concept snippets
      let finalPrompt = analysis.prompt + folded.promptSnippets
      artistLog('Stack Folding: Final resolved values:', {
        provider: folded.provider,
        model: folded.model,
        modelId: folded.modelId,
        mood: folded.mood,
        promptSnippets: folded.promptSnippets,
      })

      const thresholdMet = (analysis.intensity ?? 0) >= threshold

      let notificationDescription = `${thresholdMet ? '✅' : '❌'} Grade: ${analysis.intensity}/${threshold}\nReason: ${analysis.reasoning?.substring(0, 130)}${analysis.reasoning?.length > 130 ? '...' : ''}`
      if (selectedConcepts.length > 0) {
        notificationDescription += `\n🎯 Concepts: ${selectedConcepts.join(', ')}`
      }

      toast('Director\'s Decision', {
        description: notificationDescription,
        duration: 7000,
      })

      const sessionId = chatSessionStore.activeSessionId
      const noteId = Date.now().toString()
      const noteState = thresholdMet ? 'pending' : 'done'

      await recordDirectorDecision({
        id: noteId,
        sessionId,
        type: 'director-note',
        content: analysis.reasoning,
        intensity: analysis.intensity,
        title: analysis.title,
        prompt: finalPrompt,
        target,
        state: noteState,
        selected_concepts: selectedConcepts,
        createdAt: Date.now(),
      })

      // 3. Evaluate Threshold
      if (analysis.intensity >= threshold) {
        artistLog(`Threshold met (${analysis.intensity} >= ${threshold}). Triggering generation...`)

        const invoker = getGenerateHeadless()
        if (!invoker) {
          artistLog('IPC Invoker not available (non-electron environment). Skipping generation.')
          return
        }

        // 3.7 Artistry Bridge: Use folded stack values for generation resolution
        let resolvedProvider = folded.provider
        let resolvedModel = folded.model
        let resolvedOptions = folded.options

        const artistryGlobals = artistryStore.artistryGlobals
        const generationPayload = {
          prompt: artistry.promptPrefix ? `${artistry.promptPrefix} ${finalPrompt}` : finalPrompt,
          model: resolvedModel,
          provider: resolvedProvider,
          options: resolvedOptions,
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

          await updateDirectorDecision(noteId, { state: 'done' })

          // 5. Route based on spawnMode
          const spawnMode = artistry.spawnMode || 'bg_widget'
          artistLog(`Routing image with mode: ${spawnMode}`)

          switch (spawnMode) {
            case 'bg': {
              // Update character's active background + concept stack + manifestation
              const bgModuleUpdates: Record<string, any> = {
                ...activeCard.extensions.airi.modules,
                activeBackgroundId: entryId,
              }
              if (folded.modelId) {
                bgModuleUpdates.displayModelId = folded.modelId
              }
              cardStore.updateCard(cardId, {
                extensions: {
                  ...activeCard.extensions,
                  airi: {
                    ...activeCard.extensions.airi,
                    active_concepts: nextConceptStack,
                    modules: bgModuleUpdates,
                  },
                },
              } as any)
              break
            }

            case 'inline': {
              const imageUrl = result.imageUrl || result.base64
              const content = `![${analysis.title || 'Generated Image'}](${imageUrl})`
              chatSessionStore.inscribeTurn({
                role: 'assistant',
                content,
                slices: [{ type: 'text', text: content }],
                tool_results: [],
                createdAt: Date.now(),
              })
              break
            }

            case 'widget':
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
              break

            case 'bg_widget':
            default:
              // Both: Update background, stack, AND spawn widget
              {
                if (!activeCard || !activeCard.extensions?.airi) {
                  artistLog('Director Bridge: Aborting card update - active card or airi extension is missing.')
                  break
                }

                // 1. Use the pre-computed nextConceptStack from the Stack Folding phase
                artistLog('Director Bridge: Applying resolved concept stack:', nextConceptStack)

                // 2. Build the surgical update payload
                const moduleUpdates: Record<string, any> = {
                  ...activeCard.extensions.airi.modules,
                  activeBackgroundId: entryId,
                }

                // 3. Manifestation Bridge: If the stack fold resolved a new modelId, apply it
                if (folded.modelId) {
                  artistLog(`Manifestation Bridge: Updating displayModelId to "${folded.modelId}"`)
                  moduleUpdates.displayModelId = folded.modelId
                }

                // 4. Perform a SURGICAL update to avoid shredding the modules (TTS/Brain)
                cardStore.updateCard(cardId, {
                  extensions: {
                    ...activeCard.extensions,
                    airi: {
                      ...activeCard.extensions.airi,
                      active_concepts: nextConceptStack,
                      modules: moduleUpdates,
                    },
                  },
                } as any)

                artistLog('Director Bridge: Card updated successfully with new concept stack:', nextConceptStack)
              }

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
              break
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

  /**
   * Manually trigger a synchronization of the current concept stack to physical manifestations.
   * Useful for immediate model swaps when a user toggles an outfit in the UI.
   */
  async function applyCurrentStackManifestations() {
    const { activeCard } = cardStore
    if (!activeCard || !activeCard.extensions?.airi)
      return

    const airiExt = activeCard.extensions.airi as any
    const visualAssets = airiExt.visual_assets || {}
    const currentStack = airiExt.active_concepts || []
    const artistry = airiExt.artistry || {}

    artistLog('Manual Sync: Folding current stack manifestations...', currentStack)

    const folded = foldConceptStack(
      currentStack,
      visualAssets,
      {
        provider: artistry.provider || artistryStore.activeProvider,
        model: artistry.model || artistryStore.activeModel,
        options: artistry.options || artistryStore.providerOptions,
      },
    )

    const moduleUpdates: Record<string, any> = {
      ...activeCard.extensions.airi.modules,
    }

    if (folded.modelId) {
      artistLog(`Manual Sync: Applying displayModelId "${folded.modelId}"`)
      moduleUpdates.displayModelId = folded.modelId
    }

    cardStore.updateCard(cardStore.activeCardId, {
      extensions: {
        ...activeCard.extensions,
        airi: {
          ...activeCard.extensions.airi,
          modules: moduleUpdates,
        },
      },
    } as any)
  }

  function findNoteForImage(title?: string, prompt?: string) {
    if (!title && !prompt)
      return null
    return directorNotes.value.slice().reverse().find((n) => {
      // Direct match on title or prompt
      if (title && n.title === title)
        return true
      if (prompt && n.prompt === prompt)
        return true
      return false
    })
  }

  return {
    isProcessing,
    directorNotes,
    runArtistTask,
    loadDirectorNotes,
    applyCurrentStackManifestations,
    findNoteForImage,
  }
})

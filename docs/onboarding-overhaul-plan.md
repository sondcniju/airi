# Onboarding Overhaul: Easy vs. Advanced (The Sense Pivot)

This plan outlines the restructuring of the initial AIRI setup experience to remove technical friction and highlight "free-to-start" services via an opinionated "Easy Mode."

## 1. The Core Concept: "The Sense Portal"

We are pivoting the terminology from technical acronyms to intuitive "Senses" for the Easy Mode path:
- **Consciousness** (formerly LLM)
- **Speech** (formerly TTS)
- **Hearing** (formerly STT)

## 2. The Two Paths

Upon entering the onboarding flow, users are presented with a choice:

### Path A: Easy Mode (Recommended)
An opinionated, curated setup designed to get the user to their first conversation in under 60 seconds.
- **Consciousness**: Powered by **Qwen Portal** (No API key required; utilizes a secure OAuth-style flow—just sign in with Google).
- **Speech & Hearing**: Powered by **Deepgram** (Industry-leading speed, high quality).
- **UI**: A single, streamlined "Sense Portal" page where the user logs in to Qwen and enters their Deepgram key with direct signup links.

### Path B: Advanced Mode (Custom)
The legacy granular flow for power users and developers.
- Manual selection of providers (Ollama, OpenAI, Anthropic, LM Studio, etc.).
- Custom configuration for every layer.
- Full control over model parameters during setup.

---

## 3. Revised Step Sequence

1. **Step: Welcome**
   - Standard landing with a single "Enter the Stage" button.

2. **Step: The Choice (NEW)**
   - Two large, visual cards:
     - **"Easy Setup"**: (Icon: Magic Wand) "Get started instantly with our recommended cloud providers."
     - **"Advanced Setup"**: (Icon: Gear) "I want to configure my own local or custom providers."

3. **Step: Sense Setup (Easy Mode Only)**
   - Combined form for **Qwen Portal** and **Deepgram**.
   - **Login Button** for Qwen Portal (OAuth).
   - **Input** for Deepgram API Key (labeled as "Sense Key" or similar).

4. **Step: Character Selection (The Card Browser)**
   - This step converges both paths.
   - Users pick their starting companion ($AIRI, Lupin, etc.).
   - **Integrated Card Browser**: A button to open the "External Import" browser to drag-and-drop or one-click import cards from **JannyAI**, **Chub.ai**, and **CharacterHub**.

5. **Step: Success**
   - Final summary and "Launch" button.

---

---

## 5. Technical References & Integration Points

This section serves as a directory for the upcoming implementation of the "Sense Portal" and "Card Browser."

### Core Orchestration
- **File**: `packages/stage-ui/src/components/scenarios/dialogs/onboarding/onboarding.vue`
- **Integration**:
    - Add `isEasyMode` (boolean) ref to track the user's choice.
    - Update the `allSteps` computed property to conditionally include `StepEasySetup` and skip `StepProviderSelection`/`StepModelSelection` when `isEasyMode` is true.

### Initial Choice (The Fork)
- **File**: `packages/stage-ui/src/components/scenarios/dialogs/onboarding/step-welcome.vue`
- **Integration**:
    - Replace the single "Start" button with two action cards (Easy vs. Advanced).
    - Emit `easy` or `advanced` to the parent orchestrator to set the navigation path.

### Sense Portal (Easy Setup)
- **New File**: `packages/stage-ui/src/components/scenarios/dialogs/onboarding/step-easy-setup.vue`
- **Integration**:
    - Build a unified form for **Qwen Portal** (OAuth login) and **Deepgram** (API Key).
    - Terminologies to use: **Consciousness**, **Speech**, and **Hearing**.

### Character Selection & Card Browser
- **File**: `packages/stage-ui/src/components/scenarios/dialogs/onboarding/step-character-selection.vue`
- **Integration**:
    - **Card Browser Button**: Place alongside the existing "Import Custom Card" button (currently at line 277).
    - **Community Links**: The existing links for JannyAI, Chub.ai, etc. (lines 260-274) should be integrated into the browsing experience instead of opening external browser tabs.
    - **Portrait Hover**: Enhance the portrait grid (lines 194-243) with a subtle zoom/depth effect on hover.

### Provider Metadata
- **File**: `packages/stage-ui/src/stores/providers.ts`
- **Integration**:
    - Ensure `qwen-portal` and `deepgram` metadata are defined and correctly categorized as "Easy Mode" compatible.

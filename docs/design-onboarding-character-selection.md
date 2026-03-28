# Implementation Plan: Onboarding Character Selection (High Fidelity)

We are elevating the "Character Selection" step into a premium visual experience. Each trope will be presented with its **Built-in Thumbnail**, **Name**, and **Brief Bio** to create a compelling "Choose Your Starter" moment.

## User Review Required

> [!IMPORTANT]
> **This is the final draft of the Character Selection Step.**
> - **Visuals**: We will use the `previewImage` from the `display-models` store (AvatarSample_A/B and Hiyori) to show their faces in the onboarding.
> - **Scientist Pivot**: "Dr. Aris" is officially renamed to **Dr. Aria** (Female Scientist archetype).
> - **Janny Promotion**: **JannyAI (https://jannyai.com/)** is prioritized as the cleanest landing page for discovery.

## 1. Character Grid (The "Starter Souls")

| Character | Role | Model Assignment | Bio Snippet |
| :--- | :--- | :--- | :--- |
| **ReLU** | The Companion | `Hiyori (Pro)` | "A soulful connection that evolves alongside your data and heart." |
| **Dr. Aria** | The Scientist | `AvatarSample_A` | "A brilliant, sharp-witted guide managing the AIRI research layer." |
| **Lupin** | The Guardian | `AvatarSample_B` | "A loyal wolf-girl with fierce instincts and a protective heart." |
| **Custom** | Import | *Dynamic* | "Import your own soul from .json or .png character cards." |

---

## 2. Proposed Changes

### [Component] Step Character Selection
#### [NEW] [step-character-selection.vue](file:///c:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/stage-ui/src/components/scenarios/dialogs/onboarding/step-character-selection.vue)
- Create a reactive grid using `UnoCSS`.
- Fetch `previewImage` URLs from `useDisplayModelsStore`.
- Implement a hover-zoom effect for character portraits.
- Add the discovery footer promoting **JannyAI** (https://jannyai.com/), Chub.ai, and CharacterHub.

### [Component] Onboarding Orchestrator
#### [MODIFY] [onboarding.vue](file:///c:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/stage-ui/src/components/scenarios/dialogs/onboarding/onboarding.vue)
- **Integration Point**: Add `StepCharacterSelection` to the `allSteps` computed property.
- **Placement**: Step 5 (after `StepModelSelection`).
- **Finalization**: When the user finishes, call `cardStore.seedDefaults()`.

### [Store] AIRI Card Store
#### [MODIFY] [airi-card.ts](file:///c:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/stage-ui/src/stores/modules/airi-card.ts)
- **Task**: Add the `seedDefaults()` method.
- **Logic**: Verify if ReLU, Aria, and Lupin exist; if not, create them using standardized proactive prompts and correct `displayModelId` links (AvatarSample_A, AvatarSample_B, Hiyori).

---

## 4. Testing & Manual Trigger
To manually trigger the onboarding bypass and re-run the setup, execute the following in the browser console:

```javascript
// Reset onboarding state
localStorage.removeItem('onboarding/completed')
localStorage.removeItem('onboarding/skipped')

// Reload the app to trigger the orchestrator
location.reload()
```

---

## 5. Visual Strategy
- **Portraits**: Large circular or rounded-square avatars.
- **Glassmorphism**: Cards will use `backdrop-blur` and a slight white border for a premium feel.
- **Micro-Animations**: Transitions between cards and model selection will be a smooth horizontal slide.

## Open Questions

1. **JannyAI Priority**: JannyAI is now the primary recommendation. JanitorAI is removed from the "Cleanest Experience" list due to export friction.

2. **First Greeting Preview**: I will use the first greeting (`greetings[0]`) as the descriptive sub-text in the selection card.

---

## Phase 2: The Integrated Character Bazaar (Concept)

We want to move from a manual "Upload" feel to a "Magical Discovery" feel.

### 1. Interactive Browse View
Instead of just external links, clicking a community site (JannyAI, Chub.ai, etc.) will open a **New View** (likely an Electron-managed iframe or webview) with:
- **Navigation Controls**: A simple "Back" button to return to the selection grid.
- **Task Guidance**: A overlay or header explaining: *"Find a character you like and click their download (PNG) button."*

### 2. Download Interception
The core technical "magic" is intercepting the `.png` download from the browser view:
- **Electron Hook**: Listen for download events targeting `.png` files with `chara_card_v2` metadata.
- **Immediate Ingestion**: Automatically call `cardStore.addCard()` as soon as the download starts/finishes.
- **Dynamic Update**: The Onboarding UI detects this new card and automatically selects it.

### 3. Quick Association Layer
Once a "soul" (PNG) is found, the user is prompted to:
- **Choose a Vessel**: Select which built-in VRM or Live2D model to associate with this custom character.
- **Model Palette**: A small gallery of our premium models (ReLU, Hiyori, etc.) simplified for quick association.

### 4. Completion Flow
- **Locked State**: The "Start Your Journey" button remains disabled or "unlit" until a character is successfully selected or imported.
- **Flow**: `Click Website -> Find Character -> Click Download -> Character Auto-Imports -> Select Model Vessel -> Finish button lights up -> Start Journey.`

---

## Upcoming Tasks (Phase 2)
- [ ] Research Electron `session.on('will-download')` for iframe/webview interception.
- [ ] Implement the "Character Bazaar" fullscreen iframe layout in `OnboardingDialog`.
- [ ] Add the "Model Association" mini-gallery to the import success state.
- [ ] Update character selection logic to support an "Unlocked-by-Action" finish state.


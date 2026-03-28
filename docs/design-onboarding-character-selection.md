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


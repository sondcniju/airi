# Architectural Record: Director-Led Modular Visual Assets

## Context
Interactive RP characters often change visual states (outfits, styles, lighting) based on narrative beats. Static system prompts fail to capture these transitions. This system introduces a **Production Studio** and **Active Concept Stack** that the Director (Visual Manifestation LLM) and the User can orchestrate in real-time.

## The Realized Concept: "The Production Studio"
Instead of a single hardcoded description, each character has a "Registry" of **Concepts**. A concept is a "Package" containing three pillars of manifestation:

### The Three Pillars of a Concept
1.  **Identity (Prompt Layer)**: Narrative prompt snippets that are appended to the generation prompt. (e.g., `, (burgundy velvet dress:1.4)`)
2.  **Artistry (Pipeline Layer)**: Overrides for the generative engine. This includes **Workflow Swapping** (swapping the entire ComfyUI JSON) and **Provider/Model Swapping** (e.g., switching from Flux to Anima).
3.  **Manifestation (Physical Layer)**: Live stage reconfigurations. This triggers a **Physical Model Swap** (Live2D/VRM) or a **Baseline Mood/Expression** lock.

---

## Mechanics: "The Stacking Engine"

### 1. Active Concept Stack
Concepts are not mutually exclusive; they are **stacked**.
- The user or Director can push concepts onto the stack (e.g., `[Outfit: Burgundy]` + `[Mood: Serious]`).
- **Top-Most Wins**: For technical overrides (Workflows and Models), the last concept added to the stack takes precedence.
- **Prompt Accumulation**: Prompt snippets from all active concepts are concatenated, allowing for layered visual hooks.

### 2. Director Selection
The system injects the available concepts into the Director LLM's context. The Director then outputs the selected concept IDs in its structured reasoning.
- **Narrative Logic**: If Vamp-chan mentions she is "getting ready for a cleaning duty," the Director automatically selects the `original_dress` concept.

### 3. Production Monitor (Bridge)
A dedicated watcher in the `AiriCardStore` monitors the stack. When a manifestation override (Model ID) reaches the top of the stack, the stage immediately initiates a `changeModel()` sequence to swap the VRM/Live2D assets.

---

## Validation History

### 1. Baseline Validation: The Moriinatsu Prompt Hook
Before the full "Bridge" architecture was completed, we used **Moriinatsu** to validate the **Identity Pillar** (Prompt Injection).
- **Goal**: Confirm the Director can select a concept and successfully "fight" her base character prompt.
- **Result**: Successfully injected specific narrative hooks into the generative prompt, proving that the Concept Registry was being correctly prioritized by the LLM context.

### 2. Deep Immersion: The Vamp-chan Burgundy Shift [REALIZED]
- **Scenario**: Vamp-chan goes through a makeover and falls in love with her burgundy dress.
- **Concept: "Original"**: Maps to the monochrome `anima_vampchan_og_dress.json` workflow and the `vamp-chan.vrm` base model.
- **Concept: "Burgundy"**: Maps to the wine-red `anima_vampchan_burgundy_dress.json` workflow and the `burgundy-chan.vrm` alt-model.
- **Transition**: When the Master requests a "Diagnostic session in the Model Room," the Director (or User) toggles the `original_dress` concept.
    - **Artistry Bridge**: Swaps the ComfyUI workflow back to the monochrome OG version.
    - **Manifestation Bridge**: Swaps the Live2D/VRM model back to the black-and-white maid uniform.
    - **Result**: Complete, zero-touch narrative immersion.

---

## Future Vision: The Lain Protocol
The system is designed to scale to complex multi-state characters like **Lain Iwakura**, who may have 20+ dress/expression combinations. The next phase involves stress-testing the stack with high-frequency switching and expression-mapped manifestation overrides.

# AIRI Release Notes - May 3, 2026 (v0.9.1-stable.20260503)

This release introduces the **Production Studio**, a powerful new way to build and manage character manifestations through "Concept Stacking," alongside significant improvements to Discord interaction logic and long-term memory integration.

## 🚀 Key Highlights

### 🎬 Production Studio & Concept Stacking
The Card Editor now features a dedicated **Production Studio** for architecting complex character behaviors and visuals.
- **Concept Registry**: A new system to register and stack "Concepts" (Base or Layered) onto your characters.
- **Immersive Concept Stacking**: Layer multiple prompts, artistry rules, and behaviors to create highly nuanced manifestations.
- **Tabbed Builder Modal**: A streamlined interface for creating and managing your concept library.
- **Manifestation Bridge**: Improved logic for synchronizing concepts with the live stage.

### 🎭 Discord Service: Queue vs. Steer
Inspired by OpenClaw, we've refined how companions manage Discord conversations.
- **Interaction Modes**: Switch between "Queue" (ordered processing) and "Steer" (proactive/reactive) modes for more natural chat flow.
- **NO_REPLY Hook**: AI companions can now intelligently decide to remain silent when a response isn't necessary, preventing channel noise.
- **Stability**: Fixed "typing loops" and improved the reliability of message history insertion.

### 🧠 Advanced Memory & Orchestration
- **Eternal Record Integration**: Autonomous artistry now utilizes "Eternal Record" context injection, allowing companions to reference deeper historical patterns during generation.
- **Token-Driven Sync**: New multi-character synchronization driven by raw tokens for precise coordination between companions.
- **Hallucination Protection**: Refined reasoning pipelines for the Autonomous Director to significantly reduce hallucinations in character manifestations.

## 🛠️ Stability & Fixes
- **macOS Refinement**: Significant stability and interface fixes specifically for macOS environments, ensuring a premium experience on Apple silicon.
- **Workflow Safety**: Successfully implemented and verified the new **Process Safety Guidelines**, ensuring build stability without disruptive environment nukes.
- **Metadata Persistence**: Resolved issues where Studio metadata was lost during character ingestion or card edits.
- **Store Safety**: Fixed a Pinia store ID collision that caused background state conflicts.
- **Message Ordering**: Fixed a regression that caused messages in the chat history to occasionally appear out of order.

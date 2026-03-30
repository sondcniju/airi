# Design: Gemini Live API Integration

Documentation for integrating the Gemini Live API into the AIRI ecosystem to support real-time, bidirectional multimodal interaction (Audio, Video, Text).

## 🔗 References & SDK
- **Official Guide**: [Get Started with Gemini Live API](https://ai.google.dev/gemini-api/docs/live-api/get-started-sdk)
- **SDK**: `google-genai` (Node.js/TypeScript)
- **Key Concepts**:
    - **Session**: A persistent WebSocket connection for real-time I/O.
    - **Config**: Modality setup (audio/text), voice selection, and system instructions.
    - **Real-time Input**: Continuous streaming of audio/video frames as blobs.

## Overview

The Gemini Live API allows AIRI to interact with users with sub-second latency using native audio/video streaming. This integration will replace or augment the existing turn-based STT -> LLM -> TTS pipeline for compatible models.

## Key Requirements

1.  **Real-time Multimodal I/O**:
    - **Input**: Send raw PCM audio (16kHz, 16-bit) and video frames (JPEG/PNG) via WebSockets.
    - **Output**: Receive and play back native audio chunks from the model.
2.  **Tool Call Plumbing**:
    - Naturally integrate the existing tool calling pipeline.
    - Use the established tool collection/orchestration system (currently in `ProactivityStore`).
3.  **Chat History Inscription**:
    - Transcriptions for both user input and model output must be inscribed into the `ChatSession` history.
4.  **Token & Tag Parsing**:
    - Prevent technical markers (ACT tokens, bracket tags) from bleeding into TTS or visible chat.

## Proposed Architecture

### 1. New Store: `LiveSessionStore`
A dedicated Pinia store (`packages/stage-ui/src/stores/modules/live-session.ts`) to manage the WebSocket lifecycle and the `google-genai` client.

- **State**:
    - `isActive`: Boolean indicating if a live session is running.
    - `session`: The active `google-genai` session object.
- **Actions**:
    - `connect(model, config)`: Initializes the WebSocket connection.
    - `sendMediaChunk(blob)`: Forwards audio/video data to the session.
    - `handleResponse(response)`: Routes incoming server content (audio, text, tool calls).

### 2. Tool Integration (`ToolOrchestrator`)
Discovery and execution of tools (MCP and local) via the `resolveRegisteredTools()` registry. Gemini Live tool calls will be mapped to AIRI's tool execution logic.

### 3. Special Token & ACT Handling (TTS Safety)
AIRI uses a centralized parsing pipeline to handle special markers (like `<|ACT...|>`) or bracket-style tags (`[ACT: ...]`) without them bleeding into the TTS.

- **Centralized Parser**: `useLlmmarkerParser` (`packages/stage-ui/src/composables/llm-marker-parser.ts`) uses a stream-safe buffer to split incoming text.
- **Robustness**:
    - **Separation**: Only `onLiteral` chunks are forwarded to the speech pipeline.
    - **Execution**: `onSpecial` events are forwarded to `SpecialTokenQueue` to trigger VRM expressions in `Stage.vue`.
    - **Extensibility**: The parser can be extended with Regex profiles to handle different bracket styles (e.g. `[...]` vs `<|...|>`) depending on the model's preferred syntax.
- **TTS Jumble Prevention**: By intercepting markers at the parser level, we ensure the native audio output (or 3rd party TTS) never "speaks" technical syntax.

### 4. History & Transcriptions
- When `input_transcription` or `output_transcription` is received, it is piped into the parser.
- The literal output is added to the visible chat and TTS.
- The raw output (with tags) is stored in the `ChatSession` index for full context persistence.

## Development Issues & Mitigations

### ⚠️ OOBE / State Loss on Linux (Origin Mismatch)
**Problem**: Users on Linux (Saha) report that settings and onboarding state are wiped on app restart.
**Root Cause**:
1.  AIRI stores state (Onboarding/Settings) in `localStorage` which is keyed to the **Renderer Origin** (e.g., `http://localhost:5173`).
2.  In `pnpm dev` environments, if 5173 is occupied, the port may jump to 5174.
3.  This change in port changes the Origin, making `localStorage` completely inaccessible (appearing empty).
**Mitigation**:
- **Strict Port**: Ensure `strictPort: true` is enforced in both `stage-web` and `stage-tamagotchi` to prevent silent port-jumping.
- **Main State**: Move critical "IsOnboarded" and "API Keys" state from `localStorage` to the Main process `config.json` (filesystem), which is origin-agnostic.

## Implementation Workflow
1.  Add `google-genai` dependency.
2.  Implement `LiveSessionStore`.
3.  Bridge `useLlmmarkerParser` to the live transcription stream.
4.  Standardize `strictPort` across all dev environments to stabilize Linux development.

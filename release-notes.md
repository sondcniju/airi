# AIRI Release Notes - April 29, 2026 (v0.9.1-stable.20260429)

This release focuses on a massive overhaul of the Discord integration, significant performance wins for Live2D, and the introduction of the new "lhack" suite for real-time model modification.

## 🚀 Key Highlights

### 🎭 Discord Revamp (Alpha)
The Discord service has been completely rebuilt to provide a native-feeling experience for your companions.
- **Slash Commands**: Take control with `/status`, `/imagine`, `/character`, `/new`, `/history`, and `/director`.
- **Image Pipeline**: Companions can now "see" images attached to Discord messages (via VLM routing) and send their own visual manifestations back to your channels.
- **Typing Indicators**: Real-time feedback when your companion is generating a response.
- **Mission Control**: Improved UI for monitoring Discord service status and gateway telemetry.

### 🖌️ Live2D Hacker (lhack) Introduction
A new specialized panel for real-time modification of Live2D models.
- **Texture Deck**: Surgical upload/download of model textures for precise, live editing.
- **Surgical Eraser**: Improved tools for removing or hiding specific model components.
- **Persistence**: Enhanced export stability ensures your custom tweaks are preserved across sessions.

### ⚡ Live2D Performance & Compatibility
Significant internal refactors to the Live2D engine to improve stability and speed.
- **Framerate Optimization**: Resolved severe lag and garbage collection pressure, especially noticeable on complex models.
- **SDK 5.3 Support**: Added compatibility guards for the latest generation of Live2D models.
- **Scaling & Clipping**: Fixed layout cropping and scaling bound issues that affected model visibility.

### 🧠 Brain & Memory Refinements
- **Eternal Thread**: Refined long-term memory distillation with new context sliders and stricter validation rules.
- **Persona Refresh**: Improved system prompt handling with stable IDs and head-tail pruning for long conversations.
- **Mood Extraction**: Restored inline bracket-based mood parsing for dynamic chat bubble styling.

## 🛠️ Stability & Fixes
- **Discord**: Implemented **Leadership Election** to prevent duplicate responses when multiple AIRI windows are open.
- **Discord**: Fixed frequent IPC crashes and typecheck regressions after recent system rebases.
- **Artistry**: Moved "Director Monitor" and history depth settings to per-character configurations for better control.
- **LLM**: Robust fallbacks for `response_format` to prevent generation failures on certain providers.

---
*Thank you for being part of the AIRI evolution!*

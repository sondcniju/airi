# AIRI Release Notes: v0.9.1-stable.20260422

This update focuses on core engine stability and neurological timing. We have addressed a critical "silent crash" issue affecting Windows users and integrated high-fidelity audio pipeline improvements.

---

## 🛡️ ENGINE STABILITY: "Silent Crash" Resolution

We identified and resolved a critical issue where the application would fail to open on some Windows systems without any error message.

*   **Native Module Safeguards**: Wrapped all hardware-level native module imports (`active-win`, `loudness`, `systeminformation`) in safety guards. The app now boots reliably even if specific native drivers are missing or incompatible.
*   **Koffi Win32 Fallback**: Implemented a high-performance FFI fallback using `Koffi` for active window tracking on Windows. This ensures "Vision" and "Context Awareness" features remain functional even when the primary native module fails.
*   **Binary ABI Enforcement**: Enabled mandatory native module rebuilds during the packaging phase to ensure 100% compatibility between C++ binaries and the Electron runtime.

---

## 🎙️ AUDIO INTELLIGENCE: UST Tech Forward-Port

We've forward-ported the latest advancements in audio processing from the neurological research branch (PR 1702).

*   **High-Fidelity TTS Chunking**: Overhauled the speech chunking algorithm to reduce latency and improve the rhythmic flow of long-form character speech.
*   **Latency Reduction**: Optimized the communication buffer between the LLM and the audio manifestation layer for near-instant responses.

---

## 🎨 ARTISTRY & VISION REFINEMENTS

*   **Companion-Centric Artistry**: Re-tuned the Autonomous Artistry engine to prioritize character-relevant visual manifests over generic background generations.
*   **Model Persistence Fix**: Resolved a race condition where the "Vision" state would sometimes fail to persist across app restarts.
*   **OpenRouter Reliability**: Fixed a 404 regression in the Artistry routing for OpenRouter-based providers.

---

## 🖐️ TACTILE MODE ENHANCEMENTS

*   **Physics Tuning**: Adjusted the tension of the "Tug-and-Pull" physics for a more natural feel on high-refresh-rate displays.
*   **Wardrobe Manifest Stability**: Fixed a bug where dynamic outfit discovery would sometimes fail to load textures on first scan.

---

### How to Install
Download the `AIRI-0.9.1-stable.20260422-windows-x64-setup.exe` from the latest release artifacts and follow the installation prompts.

*For detailed technical discussions on these changes, refer to the [ROSETTA_STONE.md](docs/ROSETTA_STONE.md) or the [Windows Release Guide](docs/content/en/docs/contributing/windows-release-guide.md).*

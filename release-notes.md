### **AIRI v0.9.1-stable (April 12, 2026)**

#### **Critical Fixes**
*   **Icon Restoration**: Resolved a critical regression where UI icons were failing to load across the entire application. This was the primary focus of this release.
*   **Gemini "Ghost Stream"**: Fixed a bug where Gemini tool calls would prematurely cause the UI to stop rendering, resulting in missing tool bubbles and AI responses.
*   **Vision Reliability**: Fixed anonymous screenshot capture failures and improved macOS permission handling guards.

#### **New Features & Enhancements**
*   **Consolidated Interactive Area**: Unified image attachments, unit screenshots, and journal access into a new, streamlined popover menu in the chat interface.
*   **New "Take Screenshot" Capability**: Added a dedicated screenshot button within the interactive area for quick capture.
*   **Vision Global Shortcut**: New ability to trigger vision captures using a shortcut while the application window is active and responsive.
*   **Enhanced Tooltips**: Added clearer visual feedback and improved tooltip states for various control elements and the new vision view.
*   **Memory Wisdom**: Improved short-term memory with language-aware summarization for better conversational context.
*   **Infrastructure**: Durable cross-platform patches for native dependencies (active-win), ensuring stable builds across Windows and other environments.

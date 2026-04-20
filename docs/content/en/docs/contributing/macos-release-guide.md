# macOS Stable Release & Build Guide

This document captures the specific technical steps required to successfully build and release stable versions of the AIRI Electron application on macOS.

## 1. Release Workflow

### Step 1: Version Stamping
Update the `version` in `apps/stage-tamagotchi/package.json`. Follow the format: `[major].[minor].[patch]-stable.[YYYYMMDD]`.

### Step 2: Local Tagging
Create a git tag matching the version (with a `v` prefix) and push it to your fork or upstream:
```bash
git tag v[version]
git push origin v[version]
```

### Step 3: Generate Release Notes
1. **Compare Hashes**: Look at all commits between the previous stable tag and `HEAD`:
   ```bash
   git log [previous-tag]..HEAD --oneline
   ```
2. **Draft Summary**: Focus on outward-facing user features (e.g., new buttons, UI improvements, stability wins).
3. **Save to File**: Save to `release-notes.md`.

### Step 4: Build macOS Executable
Execute the build command from the `stage-tamagotchi` workspace:
```bash
pnpm -F @proj-airi/stage-tamagotchi run build:mac
```
This runs `electron-builder --mac` and generates a `.dmg` and a `.app` in `dist`.

### Step 5: Publish to GitHub Releases
Use the `gh` CLI to create the release and upload the asset.

**Daily / Development Release (Target your fork):**
```bash
gh release create [tag] apps/stage-tamagotchi/dist/AIRI-[version]-darwin-arm64.dmg --repo [your-fork] --title "AIRI [version]" --notes-file release-notes.md
```

**Stable Release (Target upstream):**
```bash
gh release create [tag] apps/stage-tamagotchi/dist/AIRI-[version]-darwin-arm64.dmg --repo moeru-ai/airi --title "AIRI [version]" --notes-file release-notes.md
```

---

## 2. macOS Specific Considerations

### Notarization & Entitlements
For the app to run on other machines without security warnings:
- **Entitlements**: Specified in `build/entitlements.mac.plist`.
- **Notarization**: Handled by GitHub Actions via `CSC_CONTENT` and `APPLE_ID`. If building locally, ensure your Apple Developer certificate is in your keychain.

### Architecture Support
The project supports both `arm64` (Apple Silicon) and `x64` (Intel).
- Build arm64: `electron-builder --mac --arm64` (default in `pnpm run build:mac` on Apple Silicon).
- Build x64: `electron-builder --mac --x64`.

### Dynamic Permissions
Ensure `extendInfo` in `electron-builder.config.ts` includes `NSMicrophoneUsageDescription` and `NSCameraUsageDescription` so macOS prompts the user correctly.

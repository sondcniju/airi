import type { BrowserWindow } from 'electron'

import type { MicToggleHotkey } from '../../../shared/eventa'

import path from 'node:path'

import { exec } from 'node:child_process'

import { globalShortcut, ipcMain } from 'electron'

let currentHotkey: MicToggleHotkey = 'Scroll'
let currentWindow: BrowserWindow | null = null
let macCapsLockPollingInterval: NodeJS.Timeout | null = null
let lastMacCapsLockState: boolean | null = null

/**
 * Stop any existing monitoring and unregister shortcuts
 */
export function cleanupMicToggleShortcut() {
  globalShortcut.unregisterAll()
  if (macCapsLockPollingInterval) {
    clearInterval(macCapsLockPollingInterval)
    macCapsLockPollingInterval = null
  }
  lastMacCapsLockState = null
  ipcMain.removeAllListeners('mic-state-changed')
}

/**
 * Setup global microphone toggle shortcut using Electron globalShortcut
 */
export function setupMicToggleShortcut(mainWindow: BrowserWindow, hotkey: MicToggleHotkey = 'Scroll') {
  currentWindow = mainWindow
  currentHotkey = hotkey

  cleanupMicToggleShortcut()

  const keyMap = {
    Scroll: { electron: 'Scrolllock', send: 'SCROLLLOCK' },
    Caps: { electron: 'Capslock', send: 'CAPSLOCK' },
    Num: { electron: 'Numlock', send: 'NUMLOCK' },
  }

  const { electron: electronKey } = keyMap[currentHotkey]

  console.log(`[Mic Toggle] Setting up shortcut with hotkey: ${currentHotkey}`)

  // 1. Initial State Check (Windows only fallback for LED sync)
  // We don't poll anymore. We just react to the global shortcut.
  // The globalShortcut consumes the event, so the LED won't toggle by itself.
  // We will manually toggle it to keep the OS/User in sync.

  const registerShortcut = () => {
    // 1. macOS specific handling for Caps Lock (polling workaround)
    if (process.platform === 'darwin' && currentHotkey === 'Caps') {
      const helperPath = path.join(__dirname, 'macos-capslock-check')
      console.log(`[Mic Toggle] Using macOS polling fallback for Caps Lock. Helper: ${helperPath}`)

      macCapsLockPollingInterval = setInterval(() => {
        exec(helperPath, (error, stdout) => {
          if (error) {
            console.error(`[Mic Toggle] Error polling Caps Lock:`, error)
            return
          }

          const currentState = stdout.trim() === '1'
          if (lastMacCapsLockState !== null && currentState !== lastMacCapsLockState) {
            console.log(`[Mic Toggle] Caps Lock state change detected (${lastMacCapsLockState} -> ${currentState}). Toggling mic.`)
            if (currentWindow) {
              currentWindow.webContents.send('toggle-mic-from-shortcut')
            }
          }
          lastMacCapsLockState = currentState
        })
      }, 200) // Poll every 200ms
      return
    }

    // 2. Standard globalShortcut for other keys/platforms
    try {
      const isRegistered = globalShortcut.register(electronKey, () => {
        console.log(`[Mic Toggle] Hotkey ${electronKey} pressed`)
        if (currentWindow) {
          currentWindow.webContents.send('toggle-mic-from-shortcut')
        }
      })

      if (!isRegistered) {
        console.warn(`[Mic Toggle] Failed to register global shortcut for ${electronKey}`)
      }
    }
    catch (err) {
      console.error(`[Mic Toggle] Error registering global shortcut: ${err}`)
    }
  }

  registerShortcut()

  // 2. Listen to renderer state changes to sync the LED
  // NOTICE: Disabled backend Scroll Lock state syncing as requested by user.
  // It causes unwanted flickering and OS overlays.
  /*
  ipcMain.on('mic-state-changed', (_event, _micEnabled: boolean) => {
    // On Windows, try to sync the LED if possible.
    // Since globalShortcut consumes the keypress, the LED state is controlled by US.
    // We send a toggle if the target state doesn't match our 'presumed' LED state.
    // NOTE: This uses WScript.Shell which is safer than Add-Type.
    if (process.platform === 'win32') {
      console.log(`[Mic Toggle] Syncing LED for ${electronKey}`)
      // Temporarily unregister to avoid infinite loop from simulated keypress
      globalShortcut.unregister(electronKey)

      const syncScript = `$wsh = New-Object -ComObject WScript.Shell; $wsh.SendKeys('{${sendKey}}')`
      spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', syncScript], { windowsHide: true })

      // Re-register after a small delay to ensure the OS has processed the simulated key
      setTimeout(() => {
        registerShortcut()
      }, 500)
    }
  })
  */
}

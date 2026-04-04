import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { ActiveWindowEntry, WindowInfo } from '@proj-airi/stage-shared'

import os from 'node:os'

import { createRequire } from 'node:module'

import activeWin from 'active-win'
import loudness from 'loudness'
import si from 'systeminformation'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import {

  sensorsGetActiveWindow,
  sensorsGetActiveWindowHistory,
  sensorsGetIdleTime,
  sensorsGetLocalTime,
  sensorsGetSystemLoad,
  sensorsGetVolumeLevel,

} from '@proj-airi/stage-shared'
import { powerMonitor } from 'electron'

const require = createRequire(import.meta.url)
const log = useLogg('main/sensors').useGlobalConfig()

export async function createSensorsService(params: { context: ReturnType<typeof createContext>['context'] }) {
  const { context } = params
  const activeWindowHistory: ActiveWindowEntry[] = []

  let lastActiveWinErrorTime = 0
  const ERROR_LOG_INTERVAL = 60000 // Only log once per minute

  // Initialize Win32 FFI bridge once at startup
  let win32Bridge: any = null
  if (process.platform === 'win32') {
    try {
      const ffi = require('ffi-napi')
      win32Bridge = {
        user32: new ffi.Library('user32', {
          GetForegroundWindow: ['pointer', []],
          GetWindowTextW: ['int', ['pointer', 'pointer', 'int']],
          GetWindowThreadProcessId: ['uint', ['pointer', 'pointer']],
        }),
        kernel32: new ffi.Library('kernel32', {
          OpenProcess: ['pointer', ['uint', 'bool', 'uint']],
          QueryFullProcessImageNameW: ['bool', ['pointer', 'uint', 'pointer', 'pointer']],
          CloseHandle: ['bool', ['pointer']],
        }),
      }
      log.debug('Win32 FFI bridge initialized successfully.')
    }
    catch (err) {
      log.withError(err).warn('Failed to initialize Win32 FFI bridge. Native fallbacks will be unavailable.')
    }
  }

  async function getActiveWindowInfo(): Promise<WindowInfo | null> {
    try {
      const result = await activeWin()
      if (result) {
        return {
          title: result.title || 'Unknown',
          processName: result.owner.name || 'Unknown',
        }
      }
    }
    catch (err) {
      const now = Date.now()
      if (now - lastActiveWinErrorTime > ERROR_LOG_INTERVAL) {
        log.withError(err).debug('Native active-win failed; attempting FFI fallback.')
        lastActiveWinErrorTime = now
      }

      // High-performance N-API fallback for Windows
      if (win32Bridge) {
        try {
          const { user32, kernel32 } = win32Bridge
          const hwnd = user32.GetForegroundWindow()
          if (!hwnd || hwnd.isNull())
            return null

          // Get Title
          const titleBuffer = Buffer.allocUnsafe(512)
          const titleLen = user32.GetWindowTextW(hwnd, titleBuffer, 255)
          const title = titleBuffer.toString('utf16le', 0, titleLen * 2).replace(/\0/g, '').trim()

          // Get Process Name
          let processName = 'Unknown'
          const pidBuffer = Buffer.allocUnsafe(4)
          user32.GetWindowThreadProcessId(hwnd, pidBuffer)
          const pid = pidBuffer.readUInt32LE(0)

          const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
          const hProcess = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid)

          if (hProcess && !hProcess.isNull()) {
            const pathBuffer = Buffer.allocUnsafe(4096)
            const sizeBuffer = Buffer.allocUnsafe(4)
            sizeBuffer.writeUInt32LE(2048)

            if (kernel32.QueryFullProcessImageNameW(hProcess, 0, pathBuffer, sizeBuffer)) {
              const fullPath = pathBuffer.toString('utf16le', 0, sizeBuffer.readUInt32LE(0) * 2).replace(/\0/g, '').trim()
              processName = fullPath.split(/[\\/]/).pop()?.replace(/\.[^/.]+$/, '') || 'Unknown'
            }
            kernel32.CloseHandle(hProcess)
          }

          return {
            title: title || 'Unknown',
            processName: processName || 'Foreground',
          }
        }
        catch (nativeErr) {
          log.withError(nativeErr).debug('N-API fallback execution failed.')
        }
      }
    }

    return null
  }

  const MAX_HISTORY = 50

  setInterval(async () => {
    const current = await getActiveWindowInfo()
    if (!current)
      return

    const now = Date.now()
    const lastEntry = activeWindowHistory.at(-1)
    if (lastEntry && lastEntry.window.title === current.title && lastEntry.window.processName === current.processName) {
      lastEntry.endTime = now
      lastEntry.durationMs = lastEntry.endTime - lastEntry.startTime
    }
    else {
      activeWindowHistory.push({
        window: current,
        startTime: now,
        endTime: now,
        durationMs: 0,
      })

      if (activeWindowHistory.length > MAX_HISTORY)
        activeWindowHistory.shift()
    }
  }, 10000)

  defineInvokeHandler(
    context,
    sensorsGetIdleTime,
    async () => {
      return powerMonitor.getSystemIdleTime() * 1000
    },
  )

  defineInvokeHandler(
    context,
    sensorsGetActiveWindow,
    async () => {
      return getActiveWindowInfo()
    },
  )

  defineInvokeHandler(
    context,
    sensorsGetActiveWindowHistory,
    async () => {
      return activeWindowHistory
    },
  )

  async function getVolumeLevel(): Promise<number> {
    try {
      const vol = await loudness.getVolume()
      const muted = await loudness.getMuted()
      if (muted)
        return 0
      return vol
    }
    catch (err) {
      log.withError(err).warn('Failed to get system volume via loudness')
    }

    return 0
  }

  defineInvokeHandler(
    context,
    sensorsGetVolumeLevel,
    async () => {
      return getVolumeLevel()
    },
  )

  async function getSystemLoad() {
    let cpuLoads: [number, number, number] = [0, 0, 0]
    let gpuLoad = 0

    try {
      const load = await si.currentLoad()
      const val = load.currentLoad / 100
      cpuLoads = [val, val, val] // si doesn't provide 1/5/15 load avg directly in a cross-platform way as easily as this, but currentLoad is more meaningful for real-time sensors.
    }
    catch (err) {
      log.withError(err).warn('Failed to get CPU load via systeminformation')
      // Fallback to os.loadavg if si fails
      cpuLoads = os.loadavg() as [number, number, number]
    }

    try {
      const graphics = await si.graphics()
      // Take the max utilization across all GPUs
      gpuLoad = Math.max(0, ...graphics.controllers.map((c: any) => (c.utilizationGpu || 0) as number))
    }
    catch (err) {
      log.withError(err).warn('Failed to get GPU load via systeminformation')
    }

    return {
      cpu: cpuLoads,
      gpuAvg: gpuLoad,
    }
  }

  defineInvokeHandler(
    context,
    sensorsGetSystemLoad,
    async () => {
      return getSystemLoad()
    },
  )

  defineInvokeHandler(
    context,
    sensorsGetLocalTime,
    async () => {
      return new Date().toLocaleString()
    },
  )

  return context
}

import type { Camera, Scene, WebGLRenderer } from 'three'

import { clamp } from 'es-toolkit/math'
import { Vector2, WebGLRenderTarget } from 'three'
import { shallowRef } from 'vue'

import {
  getStageThreeRuntimeTraceContext,
  isStageThreeRuntimeTraceEnabled,
  stageThreeTraceHitTestReadEvent,
} from '../trace'

// Performance state for Async PBO reads
let pb1: WebGLBuffer | null = null
let pb2: WebGLBuffer | null = null
let isPboInitialized = false
let currentPboIdx = 0
let lastReadRequestFrameId = -1
let lastReadData: Uint8Array | null = null
let lastFrameId = -1

// A simple global frame counter to track PBO freshness
let globalFrameId = 0
if (typeof window !== 'undefined') {
  const tick = () => {
    globalFrameId += 1
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

function initPbos(gl: WebGL2RenderingContext, size: number) {
  pb1 = gl.createBuffer()
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pb1)
  gl.bufferData(gl.PIXEL_PACK_BUFFER, size, gl.STREAM_READ)

  pb2 = gl.createBuffer()
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pb2)
  gl.bufferData(gl.PIXEL_PACK_BUFFER, size, gl.STREAM_READ)

  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
  isPboInitialized = true
}

export interface RenderTargetRegionRead {
  data: Uint8Array
  readWidth: number
  readHeight: number
  startX: number
  startY: number
  centerX: number
  centerY: number
  scaleX: number
  scaleY: number
}

export function useRenderTargetRegionAtClientPoint(context: {
  getRenderer: () => WebGLRenderer | undefined
  getScene: () => Scene | undefined
  getCamera: () => Camera | undefined
  getCanvas: () => HTMLCanvasElement | undefined
}) {
  const renderTargetRef = shallowRef<WebGLRenderTarget>()
  const renderTargetSize = new Vector2()
  const stageThreeRuntimeTraceContext = getStageThreeRuntimeTraceContext()

  function ensureRenderTarget(renderer: WebGLRenderer) {
    // Match the offscreen target to the current drawing buffer size (DPI + canvas resize).
    // Recreate the target when size changes to avoid reading stale or cropped pixels.
    renderer.getDrawingBufferSize(renderTargetSize)
    const width = Math.max(1, Math.floor(renderTargetSize.x))
    const height = Math.max(1, Math.floor(renderTargetSize.y))

    if (!renderTargetRef.value || renderTargetRef.value.width !== width || renderTargetRef.value.height !== height) {
      // Dispose old target to keep GPU memory in check.
      renderTargetRef.value?.dispose()
      renderTargetRef.value = new WebGLRenderTarget(width, height, { depthBuffer: false })
    }

    return renderTargetRef.value
  }

  function readRenderTargetRegionAtClientPoint(clientX: number, clientY: number, radius: number): RenderTargetRegionRead | null {
    const traceStart = isStageThreeRuntimeTraceEnabled() ? performance.now() : 0
    const renderer = context.getRenderer()
    const scene = context.getScene()
    const camera = context.getCamera()
    const canvas = context.getCanvas()
    if (!renderer || !scene || !camera || !canvas)
      return null

    const rect = canvas.getBoundingClientRect()
    const xIn = clientX - rect.left
    const yIn = clientY - rect.top
    const inCanvas = xIn >= 0 && yIn >= 0 && xIn < rect.width && yIn < rect.height
    if (!inCanvas)
      return null

    const renderTarget = ensureRenderTarget(renderer)
    const scaleX = renderTarget.width / rect.width
    const scaleY = renderTarget.height / rect.height
    if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY))
      return null

    const centerX = Math.floor(xIn * scaleX)
    const centerY = Math.floor(renderTarget.height - 1 - yIn * scaleY)

    const radiusX = Math.ceil(radius * scaleX)
    const radiusY = Math.ceil(radius * scaleY)

    const startX = clamp(centerX - radiusX, 0, renderTarget.width - 1)
    const endX = clamp(centerX + radiusX, 0, renderTarget.width - 1)
    const startY = clamp(centerY - radiusY, 0, renderTarget.height - 1)
    const endY = clamp(centerY + radiusY, 0, renderTarget.height - 1)

    const readWidth = endX - startX + 1
    const readHeight = endY - startY + 1
    const requiredSize = readWidth * readHeight * 4

    const prevTarget = renderer.getRenderTarget()
    const currentFrameId = globalFrameId

    // Render into our offscreen target so we can read pixels from it.
    // Preserve the previous target to avoid breaking the main render pipeline.
    // Optimization: Skip re-render if we already rendered the scene to this target in the same frame.
    if (lastFrameId !== currentFrameId) {
      renderer.setRenderTarget(renderTarget)
      renderer.clear()
      renderer.render(scene, camera)
      lastFrameId = currentFrameId
    }
    else {
      renderer.setRenderTarget(renderTarget)
    }

    let data: Uint8Array
    const isWebGL2 = renderer.capabilities.isWebGL2
    const gl = renderer.getContext() as WebGL2RenderingContext

    if (isWebGL2) {
      // ASYNC PBO PATH: Reads pixels into a buffer and retrieves them in the next frame.
      // This eliminates the blocking CPU-stalling nature of gl.readPixels.
      if (!isPboInitialized || !pb1) {
        initPbos(gl, 1024 * 1024 * 4) // Cache 4MB buffer
      }

      const readPbo = currentPboIdx === 0 ? pb1 : pb2
      const writePbo = currentPboIdx === 0 ? pb2 : pb1

      // 1. Request async transfer from Framebuffer to writePbo
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, writePbo)
      gl.readPixels(startX, startY, readWidth, readHeight, gl.RGBA, gl.UNSIGNED_BYTE, 0)

      // 2. Map previously requested data from readPbo into CPU land
      if (lastReadRequestFrameId !== -1) {
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, readPbo)
        if (!lastReadData || lastReadData.length !== requiredSize) {
          lastReadData = new Uint8Array(requiredSize)
        }
        gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, lastReadData)
      }

      data = lastReadData || new Uint8Array(requiredSize)
      currentPboIdx = (currentPboIdx + 1) % 2
      lastReadRequestFrameId = currentFrameId
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
    }
    else {
      // WEBGL1 FALLBACK: Synchronous read (blocking)
      data = new Uint8Array(requiredSize)
      renderer.readRenderTargetPixels(renderTarget, startX, startY, readWidth, readHeight, data)
    }

    // Restore the original target so downstream renders keep working.
    renderer.setRenderTarget(prevTarget)

    if (traceStart > 0) {
      stageThreeRuntimeTraceContext.emit(stageThreeTraceHitTestReadEvent, {
        durationMs: performance.now() - traceStart,
        radius,
        readHeight,
        readWidth,
        ts: traceStart,
      })
    }

    return {
      data,
      readWidth,
      readHeight,
      startX,
      startY,
      centerX,
      centerY,
      scaleX,
      scaleY,
    }
  }

  function disposeRenderTarget() {
    renderTargetRef.value?.dispose()
    renderTargetRef.value = undefined

    const renderer = context.getRenderer()
    if (renderer) {
      const gl = renderer.getContext()
      if (pb1)
        gl.deleteBuffer(pb1)
      if (pb2)
        gl.deleteBuffer(pb2)
    }
    pb1 = null
    pb2 = null
    isPboInitialized = false
  }

  return {
    readRenderTargetRegionAtClientPoint,
    disposeRenderTarget,
  }
}

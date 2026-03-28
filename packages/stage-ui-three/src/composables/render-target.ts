import type { Camera, Scene, WebGLRenderer } from 'three'

import { clamp } from 'es-toolkit/math'
import {
  Box3,
  Vector2,
  Vector3,
  WebGLRenderTarget,
} from 'three'
import { shallowRef } from 'vue'

import {
  getStageThreeRuntimeTraceContext,
  isStageThreeRuntimeTraceEnabled,
  stageThreeTraceHitTestReadEvent,
} from '../trace'

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

  // Bounding box cache to skip rendering when mouse is far from the model
  const box3 = new Box3()
  const box2 = { minX: 0, maxX: 0, minY: 0, maxY: 0 }
  let lastBoxUpdate = 0
  const boxUpdateInterval = 500 // Update 3D/2D bounds every 500ms or on request

  // Async PBO Readback State for zero-stall performance
  let pb1: WebGLBuffer | null = null
  let pb2: WebGLBuffer | null = null
  let currentPboIdx = 0
  let lastReadRequestFrameId = -1
  let isPboInitialized = false

  function ensureRenderTarget(renderer: WebGLRenderer) {
    // Match the offscreen target to the current drawing buffer size (DPI + canvas resize).
    // Cap the size for hit-testing to avoid massive stalls on high-DPI/4K screens.
    renderer.getDrawingBufferSize(renderTargetSize)
    const maxDimension = 512
    const scale = Math.min(1, maxDimension / Math.max(renderTargetSize.x, renderTargetSize.y, 1))
    const width = Math.max(1, Math.floor(renderTargetSize.x * scale))
    const height = Math.max(1, Math.floor(renderTargetSize.y * scale))

    if (!renderTargetRef.value || renderTargetRef.value.width !== width || renderTargetRef.value.height !== height) {
      // Dispose old target to keep GPU memory in check.
      renderTargetRef.value?.dispose()
      renderTargetRef.value = new WebGLRenderTarget(width, height, { depthBuffer: false })
      isPboInitialized = false // Reset PBOs on resize or recreate
    }

    return renderTargetRef.value
  }

  function initPbos(gl: WebGL2RenderingContext, size: number) {
    if (pb1)
      gl.deleteBuffer(pb1)
    if (pb2)
      gl.deleteBuffer(pb2)

    pb1 = gl.createBuffer()
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pb1)
    gl.bufferData(gl.PIXEL_PACK_BUFFER, size, gl.STREAM_READ)

    pb2 = gl.createBuffer()
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pb2)
    gl.bufferData(gl.PIXEL_PACK_BUFFER, size, gl.STREAM_READ)

    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
    isPboInitialized = true
  }

  let lastFrameId = -1
  let lastReadData: Uint8Array | null = null

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

    // PRE-CHECK: Bounding Box. Skip expensive render/read if mouse is not over the model.
    // We update the projected 2D bounds periodically to catch model changes/camera moves.
    const now = performance.now()
    if (now - lastBoxUpdate > boxUpdateInterval) {
      box3.setFromObject(scene)
      if (!box3.isEmpty()) {
        const corners = [
          new Vector3(box3.min.x, box3.min.y, box3.min.z),
          new Vector3(box3.min.x, box3.min.y, box3.max.z),
          new Vector3(box3.min.x, box3.max.y, box3.min.z),
          new Vector3(box3.min.x, box3.max.y, box3.max.z),
          new Vector3(box3.max.x, box3.min.y, box3.min.z),
          new Vector3(box3.max.x, box3.min.y, box3.max.z),
          new Vector3(box3.max.x, box3.max.y, box3.min.z),
          new Vector3(box3.max.x, box3.max.y, box3.max.z),
        ]

        let minX = Infinity
        let maxX = -Infinity
        let minY = Infinity
        let maxY = -Infinity
        for (const corner of corners) {
          corner.project(camera)
          const px = (corner.x + 1) / 2 * rect.width
          const py = (1 - corner.y) / 2 * rect.height
          minX = Math.min(minX, px)
          maxX = Math.max(maxX, px)
          minY = Math.min(minY, py)
          maxY = Math.max(maxY, py)
        }
        // Add a small margin (radius + fixed buffer)
        const margin = radius + 20
        box2.minX = minX - margin
        box2.maxX = maxX + margin
        box2.minY = minY - margin
        box2.maxY = maxY + margin
      }
      lastBoxUpdate = now
    }

    // If mouse is outside the projected model bounds, assume transparent.
    const outsideBox = xIn < box2.minX || xIn > box2.maxX || yIn < box2.minY || yIn > box2.maxY
    if (outsideBox && !box3.isEmpty()) {
      return null
    }

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

    const currentFrameId = renderer.info.render.frame
    const prevTarget = renderer.getRenderTarget()

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

      const currentPbo = currentPboIdx === 0 ? pb1 : pb2
      const nextPbo = currentPboIdx === 0 ? pb2 : pb1

      // 1. Kick off an asynchronous read into the CURRENT PBO. This returns instantly.
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, currentPbo)
      gl.readPixels(startX, startY, readWidth, readHeight, gl.RGBA, gl.UNSIGNED_BYTE, 0)

      // 2. Try to retrieve the result from the NEXT PBO (kicked off in a previous call).
      if (lastReadRequestFrameId !== -1) {
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, nextPbo)
        if (!lastReadData || lastReadData.length !== requiredSize) {
          lastReadData = new Uint8Array(requiredSize)
        }
        gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, lastReadData)
      }
      else {
        // First frame: fallback to sync read
        lastReadData = new Uint8Array(requiredSize)
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
        gl.readPixels(startX, startY, readWidth, readHeight, gl.RGBA, gl.UNSIGNED_BYTE, lastReadData)
      }

      data = lastReadData
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

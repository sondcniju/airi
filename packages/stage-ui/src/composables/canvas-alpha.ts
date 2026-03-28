import type { MaybeRefOrGetter, Ref } from 'vue'

import { toRef, unrefElement, useElementBounding } from '@vueuse/core'
import { clamp } from 'es-toolkit/math'
import { computed } from 'vue'

interface CircleHitTestInput {
  gl: WebGL2RenderingContext | WebGLRenderingContext
  clientX: number
  clientY: number
  left: number
  top: number
  width: number
  height: number
  radius: number
  threshold: number
}

// Module-level cache to avoid GC pressure during high-frequency hit-testing
let cachedData: Uint8Array | null = null
const MAX_CACHED_SIZE = 128 * 128 * 4 // 64KB - plenty for a 15-25 radius circle

// Async PBO Readback State for zero-stall performance
let pb1: WebGLBuffer | null = null
let pb2: WebGLBuffer | null = null
let currentPboIdx = 0
let lastReadRequestFrameId = -1
let isPboInitialized = false

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

export function isCanvasRegionTransparent({
  gl,
  clientX,
  clientY,
  left,
  top,
  width,
  height,
  radius,
  threshold,
}: CircleHitTestInput) {
  if (!width || !height)
    return true

  if (gl.drawingBufferWidth <= 0 || gl.drawingBufferHeight <= 0)
    return true

  const xIn = clientX - left
  const yIn = clientY - top
  const inCanvas = xIn >= 0 && yIn >= 0 && xIn < width && yIn < height
  if (!inCanvas)
    return true

  const scaleX = gl.drawingBufferWidth / width
  const scaleY = gl.drawingBufferHeight / height
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY))
    return true

  const centerX = Math.floor(xIn * scaleX)
  const centerY = Math.floor(gl.drawingBufferHeight - 1 - yIn * scaleY)

  const radiusX = Math.ceil(radius * scaleX)
  const radiusY = Math.ceil(radius * scaleY)

  const startX = clamp(centerX - radiusX, 0, gl.drawingBufferWidth - 1)
  const endX = clamp(centerX + radiusX, 0, gl.drawingBufferWidth - 1)
  const startY = clamp(centerY - radiusY, 0, gl.drawingBufferHeight - 1)
  const endY = clamp(centerY + radiusY, 0, gl.drawingBufferHeight - 1)

  const readWidth = endX - startX + 1
  const readHeight = endY - startY + 1
  const requiredSize = readWidth * readHeight * 4

  let data: Uint8Array
  const isWebGL2 = gl instanceof (window.WebGL2RenderingContext || Object)
  if (isWebGL2) {
    const gl2 = gl as WebGL2RenderingContext
    if (!isPboInitialized || !pb1) {
      initPbos(gl2, MAX_CACHED_SIZE)
    }

    const currentPbo = currentPboIdx === 0 ? pb1 : pb2
    const nextPbo = currentPboIdx === 0 ? pb2 : pb1

    // 1. Kick off an asynchronous read into the CURRENT PBO. This returns instantly.
    gl2.bindBuffer(gl2.PIXEL_PACK_BUFFER, currentPbo)
    gl2.readPixels(startX, startY, readWidth, readHeight, gl2.RGBA, gl2.UNSIGNED_BYTE, 0)

    // 2. Try to retrieve the result from the NEXT PBO.
    if (!cachedData || cachedData.length !== requiredSize) {
      cachedData = new Uint8Array(requiredSize)
    }

    if (lastReadRequestFrameId !== -1) {
      gl2.bindBuffer(gl2.PIXEL_PACK_BUFFER, nextPbo)
      gl2.getBufferSubData(gl2.PIXEL_PACK_BUFFER, 0, cachedData)
    }
    else {
      // First frame: fallback to sync
      gl2.bindBuffer(gl2.PIXEL_PACK_BUFFER, null)
      gl2.readPixels(startX, startY, readWidth, readHeight, gl2.RGBA, gl2.UNSIGNED_BYTE, cachedData)
    }

    data = cachedData
    currentPboIdx = (currentPboIdx + 1) % 2
    lastReadRequestFrameId = 1 // Simplified since we don't have renderer frame info here easily
    gl2.bindBuffer(gl2.PIXEL_PACK_BUFFER, null)
  }
  else {
    // WebGL1 Fallback: Sync Read
    if (cachedData && cachedData.length >= requiredSize && requiredSize <= MAX_CACHED_SIZE) {
      data = cachedData.subarray(0, requiredSize)
    }
    else {
      data = new Uint8Array(requiredSize)
      if (requiredSize <= MAX_CACHED_SIZE) {
        cachedData = data
      }
    }
    try {
      gl.readPixels(startX, startY, readWidth, readHeight, gl.RGBA, gl.UNSIGNED_BYTE, data)
    }
    catch {
      return true
    }
  }

  const radiusSq = radius * radius

  for (let y = 0; y < readHeight; y += 1) {
    const gy = startY + y
    const dy = (gy - centerY) / scaleY
    const dySq = dy * dy

    for (let x = 0; x < readWidth; x += 1) {
      const gx = startX + x
      const dx = (gx - centerX) / scaleX
      if (dx * dx + dySq > radiusSq)
        continue

      const index = (y * readWidth + x) * 4
      const alpha = data[index + 3]
      if (alpha >= threshold)
        return false
    }
  }

  return true
}

export function useCanvasPixelAtPoint(
  canvas: MaybeRefOrGetter<HTMLCanvasElement | undefined>,
  pointX: MaybeRefOrGetter<number>,
  pointY: MaybeRefOrGetter<number>,
): {
  inCanvas: Ref<boolean>
  pixel: Ref<Uint8Array | number[]>
} {
  const canvasRef = toRef(canvas)

  const { left, top, width, height } = useElementBounding(canvasRef)
  const xRef = toRef(pointX)
  const yRef = toRef(pointY)

  const inCanvas = computed(() => {
    if (canvasRef.value == null) {
      return false
    }

    const xIn = xRef.value - left.value
    const yIn = yRef.value - top.value
    return xIn >= 0 && yIn >= 0 && xIn < width.value && yIn < height.value
  })

  const pixel = computed(() => {
    const el = unrefElement(canvasRef)
    if (!el || !inCanvas.value)
      return new Uint8Array([0, 0, 0, 0])

    const gl = (el.getContext('webgl2') || el.getContext('webgl')) as WebGL2RenderingContext | WebGLRenderingContext | null
    if (!gl)
      return new Uint8Array([0, 0, 0, 0])

    const xIn = xRef.value - left.value
    const yIn = yRef.value - top.value

    const scaleX = gl.drawingBufferWidth / width.value
    const scaleY = gl.drawingBufferHeight / height.value
    const pixelX = Math.floor(xIn * scaleX)
    // Flip Y; subtract 1 to avoid top-edge off-by-one
    const pixelY = Math.floor(gl.drawingBufferHeight - 1 - yIn * scaleY)

    const data = new Uint8Array(4)
    try {
      gl.readPixels(pixelX, pixelY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, data)
    }
    catch {
      return new Uint8Array([0, 0, 0, 0])
    }

    return data
  })

  return {
    inCanvas,
    pixel,
  }
}

export function useCanvasPixelIsTransparent(
  pixel: Ref<Uint8Array | number[]>,
  threshold = 10,
): Ref<boolean> {
  return computed(() => pixel.value[3] < threshold)
}

export function useCanvasPixelIsTransparentAtPoint(
  canvas: MaybeRefOrGetter<HTMLCanvasElement | undefined>,
  pointX: MaybeRefOrGetter<number>,
  pointY: MaybeRefOrGetter<number>,
  optionsOrThreshold: number | { threshold?: number, regionRadius?: number } = 10,
): Ref<boolean> {
  const options = typeof optionsOrThreshold === 'number'
    ? { threshold: optionsOrThreshold, regionRadius: 0 }
    : optionsOrThreshold

  const threshold = options?.threshold ?? 10
  const radius = Math.max(0, options?.regionRadius ?? 0)

  if (radius === 0) {
    const { pixel } = useCanvasPixelAtPoint(canvas, pointX, pointY)
    return useCanvasPixelIsTransparent(pixel, threshold)
  }

  const canvasRef = toRef(canvas)
  const xRef = toRef(pointX)
  const yRef = toRef(pointY)
  const { left, top, width, height } = useElementBounding(canvasRef)

  return computed(() => {
    const el = unrefElement(canvasRef)
    if (!el)
      return true

    const gl = (el.getContext('webgl2') || el.getContext('webgl')) as WebGL2RenderingContext | WebGLRenderingContext | null
    if (!gl)
      return true

    return isCanvasRegionTransparent({
      gl,
      clientX: xRef.value,
      clientY: yRef.value,
      left: left.value,
      top: top.value,
      width: width.value,
      height: height.value,
      radius,
      threshold,
    })
  })
}

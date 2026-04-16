import type { VRM } from '@pixiv/three-vrm'
import type { Object3D } from 'three'

import { CanvasTexture, Line, Raycaster, Sprite, SpriteMaterial, Vector2, Vector3 } from 'three'
import { ref, shallowRef } from 'vue'

import * as THREE from 'three'

import { useModelStore } from '../../stores/model-store'

/**
 * useVRMClothInteraction
 * R&D Prototype for "Wired-style" tactile cloth interaction.
 * Allows users to "tug" on fabric using mouse drag, with visual tethering.
 */
export function useVRMClothInteraction() {
  const isDragging = ref(false)
  const targetBone = shallowRef<Object3D | null>(null)

  // Cache for performance-heavy lookups
  const nodes = {
    jaw: null as Object3D | null,
    head: null as Object3D | null,
    boundary: new THREE.Box3(), // Persistent hit-aura
    hasBoundary: false,
  }

  // Interaction State
  const modelStore = useModelStore()
  const activePuffs: Sprite[] = []
  const clothMeshCache = shallowRef<Object3D[]>([])

  // Persistent Rest-Position Memory (Stops Drift)
  const boneBaseCache = new Map<string, Vector3>()

  // Initialize Tether Line Mesh
  const lineGeom = new THREE.BufferGeometry()
  const tetherPosBuffer = new Float32Array(6) // Reuse this buffer
  lineGeom.setAttribute('position', new THREE.BufferAttribute(tetherPosBuffer, 3))
  const lineMat = new THREE.LineBasicMaterial({ color: 0x00FFFF, transparent: true, opacity: 0.4 })
  const tetherLine = shallowRef<Line>(new Line(lineGeom, lineMat))
  const basePosition = new Vector3()
  const currentTension = ref(0)
  const maxStretch = 0.15 // 15cm max pull

  // Texture Cache
  let puffTexture: THREE.Texture | null = null

  function getPuffTexture() {
    if (puffTexture)
      return puffTexture

    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext('2d')!
    ctx.beginPath()
    ctx.arc(32, 32, 28, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()

    puffTexture = new CanvasTexture(canvas)
    return puffTexture
  }

  // Interaction Helpers
  const raycaster = new Raycaster()
  const mouse = new Vector2()
  const intersectionPoint = new Vector3()
  const grabPoint = new Vector3() // Local point in vrm.scene where grab started

  function resolveNodes(vrm: VRM) {
    if (!vrm)
      return
    if (!nodes.jaw || !nodes.head) {
      nodes.jaw = vrm.humanoid?.getNormalizedBoneNode('jaw') || null
      nodes.head = vrm.humanoid?.getNormalizedBoneNode('head') || null
    }

    // [SPEED-FIX] Calculate boundary strictly ONCE per model load
    if (!nodes.hasBoundary) {
      nodes.boundary.setFromObject(vrm.scene)
      nodes.hasBoundary = true

      // [RESTORATION- inclusive] Cache ALL meshes to ensure nothing is missed
      const meshes: Object3D[] = []
      vrm.scene.traverse((obj) => {
        if (obj.type === 'Mesh' || obj.type === 'SkinnedMesh') {
          meshes.push(obj)
        }
      })
      clothMeshCache.value = meshes
      console.log(`[WIRED] Logic Caches Ready. Mesh candidates: ${meshes.length}`)
    }
  }

  function spawnPuff(point: Vector3, scene: THREE.Object3D) {
    const localPoint = point.clone()
    scene.worldToLocal(localPoint)

    const material = new SpriteMaterial({
      map: getPuffTexture(),
      transparent: true,
      opacity: 0.8,
      depthTest: false,
    })

    material.color.setHSL(Math.random(), 0.8, 0.6)

    const puff = new Sprite(material)
    puff.position.copy(localPoint)
    puff.scale.set(0.05, 0.05, 0.05)
    scene.add(puff)
    activePuffs.push(puff)
  }

  /**
   * Attempt to "grab" a piece of cloth
   */
  function startTug(
    event: { x: number, y: number },
    camera: THREE.Camera,
    vrm: VRM,
    vrmEmote?: any, // Accept managed emote service
  ) {
    if (!vrm || modelStore.interactionMode !== 'tactile')
      return

    mouse.x = (event.x / window.innerWidth) * 2 - 1
    mouse.y = -(event.y / window.innerHeight) * 2 + 1
    raycaster.setFromCamera(mouse, camera)

    resolveNodes(vrm)

    // Only check meshes from our inclusive cache
    const visibleMeshes = clothMeshCache.value.filter(m => m.visible)
    const intersects = raycaster.intersectObjects(visibleMeshes, false)

    if (intersects.length > 0) {
      const hit = intersects[0]
      intersectionPoint.copy(hit.point)

      // Find the best bone to tug
      let nearestBone: Object3D | null = null
      let minDist = Infinity

      vrm.scene.traverse((obj) => {
        if (obj.type === 'Bone') {
          const boneWorldPos = new Vector3()
          obj.getWorldPosition(boneWorldPos)
          const d = boneWorldPos.distanceTo(intersectionPoint)
          if (d < minDist) {
            minDist = d
            nearestBone = obj
          }
        }
      })

      if (nearestBone) {
        const bone = nearestBone as Object3D
        isDragging.value = true
        targetBone.value = bone

        // [DRIFT-FIX] Populate and use a Neutral-Rest Cache to prevent cumulative drift
        if (!boneBaseCache.has(bone.name)) {
          console.log(`[WIRED] Neutralizing Bone Home: "${bone.name}"`)
          boneBaseCache.set(bone.name, bone.position.clone())
        }
        basePosition.copy(boneBaseCache.get(bone.name)!)

        // Calculate a stable local grab point for the tether
        grabPoint.copy(intersectionPoint)
        vrm.scene.worldToLocal(grabPoint)

        console.log(`[WIRED] Discovery: "${hit.object.name}" (MeshID: ${hit.object.id}) -> Bone: "${bone.name}"`)

        // [MANAGED-HEURISTIC] Direct 'Happy' emotion via official emote service
        if (bone.name.toLowerCase().includes('chest')) {
          console.log('[WIRED] activating happy emotion')
          if (vrmEmote?.setEmotionWithResetAfter) {
            vrmEmote.setEmotionWithResetAfter('happy', 2000, 1.0)
          }
          else {
            // Fallback for standalone prototype testing
            vrm.expressionManager?.setValue('happy', 1.0)
          }
        }

        spawnPuff(intersectionPoint, vrm.scene)
      }
    }
  }

  function handleTug(event: { x: number, y: number }, camera: THREE.Camera) {
    if (!isDragging.value || !targetBone.value || modelStore.interactionMode !== 'tactile')
      return

    mouse.x = (event.x / window.innerWidth) * 2 - 1
    mouse.y = -(event.y / window.innerHeight) * 2 + 1
    raycaster.setFromCamera(mouse, camera)

    const plane = new THREE.Plane()
    const boneWorldPos = new Vector3()
    targetBone.value.getWorldPosition(boneWorldPos)
    plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new Vector3()).negate(), boneWorldPos)

    const dragTarget = new Vector3()
    raycaster.ray.intersectPlane(plane, dragTarget)

    const parent = targetBone.value.parent
    if (parent) {
      const localTarget = parent.worldToLocal(dragTarget.clone())
      const pullDir = localTarget.sub(basePosition)
      const dist = pullDir.length()
      currentTension.value = Math.min(dist / maxStretch, 1.0)
      if (dist > maxStretch)
        pullDir.normalize().multiplyScalar(maxStretch)
      targetBone.value.position.copy(basePosition.clone().add(pullDir))
    }
  }

  function endTug() {
    isDragging.value = false
  }

  /**
   * Main update loop for physics and emotional sync
   */
  function update(vrm: VRM, delta: number) {
    if (!vrm)
      return

    // [PRODUCTION-HOT-PATH] Early return STRICTLY if nothing is moving/interacting
    if (!isDragging.value && activePuffs.length === 0 && currentTension.value === 0 && !targetBone.value)
      return

    resolveNodes(vrm)

    // Update Puffs (Fade and Scale) - Optimized loop
    for (let i = activePuffs.length - 1; i >= 0; i--) {
      const puff = activePuffs[i]
      puff.scale.multiplyScalar(1.03)
      const mat = puff.material as SpriteMaterial
      mat.opacity -= delta * 1.5
      if (mat.opacity <= 0) {
        puff.removeFromParent()
        mat.dispose()
        activePuffs.splice(i, 1)
      }
    }

    // Spring Back Logic
    if (!isDragging.value && targetBone.value) {
      targetBone.value.position.lerp(basePosition, 0.15) // Slightly snappier
      currentTension.value = Math.max(0, currentTension.value - 0.2) // Faster tension decay

      // [SNAPPING-FIX] Ensure precise restoration before setting target to null
      if (targetBone.value.position.distanceTo(basePosition) < 0.0001) {
        targetBone.value.position.copy(basePosition)
        targetBone.value = null
      }
    }

    // Emotional Coupling (Default reactive behavior for tugging)
    if (vrm.expressionManager && currentTension.value > 0) {
      const tension = currentTension.value
      vrm.expressionManager.setValue('surprised', Math.max(0, tension * (1.0 - tension) * 4) * 0.8)
      vrm.expressionManager.setValue('angry', (tension ** 2) * 0.7)
    }

    updateTether(vrm)
  }

  function updateTether(vrm: VRM) {
    if (!tetherLine.value || !isDragging.value || !targetBone.value) {
      if (tetherLine.value)
        tetherLine.value.visible = false
      return
    }

    const mouthPoint = new Vector3()
    const anchor = nodes.jaw || nodes.head
    if (anchor)
      anchor.getWorldPosition(mouthPoint)
    else vrm.scene.getWorldPosition(mouthPoint)

    const bonePos = new Vector3()
    targetBone.value.getWorldPosition(bonePos)

    // Note: Line geometry setFromPoints is fine for prototype
    tetherLine.value.visible = true
    const geometry = tetherLine.value.geometry as THREE.BufferGeometry
    geometry.setFromPoints([mouthPoint, bonePos])
  }

  return {
    isDragging,
    currentTension,
    startTug,
    handleTug,
    endTug,
    update,
    tetherLine,
  }
}

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

  // Initialize Tether Line Mesh
  const lineGeom = new THREE.BufferGeometry()
  lineGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
  const lineMat = new THREE.LineBasicMaterial({ color: 0x00FFFF, transparent: true, opacity: 0.4 })
  const tetherLine = shallowRef<Line>(new Line(lineGeom, lineMat))

  // Interaction State
  const modelStore = useModelStore()
  const puffs = shallowRef<Sprite[]>([])
  const basePosition = new Vector3()
  const currentTension = ref(0)
  const maxStretch = 0.15 // 15cm max pull

  // Interaction Helpers
  const raycaster = new Raycaster()
  const mouse = new Vector2()
  const intersectionPoint = new Vector3()
  const mouthAnchorPoint = new Vector3()

  /**
   * Initialize or update the tether line geometry
   */
  function updateTether(vrm: VRM) {
    if (!vrm)
      return

    // Find mouth anchor (Normalized Bone Node)
    const jaw = vrm.humanoid?.getNormalizedBoneNode('jaw')
    const head = vrm.humanoid?.getNormalizedBoneNode('head')

    if (jaw) {
      jaw.getWorldPosition(mouthAnchorPoint)
    }
    else if (head) {
      head.getWorldPosition(mouthAnchorPoint)
      mouthAnchorPoint.y -= 0.05 // Visual offset for mouth
    }

    if (isDragging.value && targetBone.value && tetherLine.value) {
      const bonePos = new Vector3()
      targetBone.value.getWorldPosition(bonePos)

      const positions = new Float32Array([
        mouthAnchorPoint.x,
        mouthAnchorPoint.y,
        mouthAnchorPoint.z,
        bonePos.x,
        bonePos.y,
        bonePos.z,
      ])

      tetherLine.value.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      tetherLine.value.geometry.attributes.position.needsUpdate = true
      tetherLine.value.visible = true
    }
    else if (tetherLine.value) {
      tetherLine.value.visible = false
    }
  }

  function spawnPuff(point: Vector3, scene: THREE.Object3D) {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext('2d')!
    ctx.beginPath()
    ctx.arc(32, 32, 28, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()

    const texture = new CanvasTexture(canvas)
    const material = new SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.8,
      depthTest: false,
    })

    // Randomized Color
    const hue = Math.random()
    material.color.setHSL(hue, 0.8, 0.6)

    const puff = new Sprite(material)
    puff.position.copy(point)
    puff.scale.set(0.02, 0.02, 0.02)
    scene.add(puff)
    puffs.value.push(puff)
  }

  /**
   * Attempt to "grab" a piece of cloth
   */
  function startTug(event: { x: number, y: number }, camera: THREE.Camera, vrm: VRM) {
    if (!vrm || modelStore.interactionMode !== 'tactile')
      return

    // Diagnostic: Mouse Coords
    mouse.x = (event.x / window.innerWidth) * 2 - 1
    mouse.y = -(event.y / window.innerHeight) * 2 + 1
    console.log(`[WIRED] Grab Start. Mouse: ${mouse.x.toFixed(2)}, ${mouse.y.toFixed(2)}`)

    raycaster.setFromCamera(mouse, camera)

    const clothMeshes: Object3D[] = []
    vrm.scene.traverse((obj) => {
      const name = obj.name.toLowerCase()
      // Broadened keywords for R&D
      if (name.includes('cloth') || name.includes('skirt') || name.includes('shirt') || name.includes('sleeve') || name.includes('ribbon') || name.includes('body') || name.includes('dress') || name.includes('acc')) {
        clothMeshes.push(obj)
      }
    })

    console.log(`[WIRED] Potential Cloth Meshes Scanned: ${clothMeshes.length}`)

    const intersects = raycaster.intersectObjects(clothMeshes, true)
    if (intersects.length > 0) {
      const hit = intersects[0]
      intersectionPoint.copy(hit.point)
      console.log(`[WIRED] Hit Found on: "${hit.object.name}" at ${hit.point.x.toFixed(2)}, ${hit.point.y.toFixed(2)}`)

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
        basePosition.copy(bone.position)
        console.log(`[WIRED] Successfully Grabbed Bone: "${bone.name}"`)
        spawnPuff(intersectionPoint, vrm.scene)
      }
      else {
        console.warn('[WIRED] Hit mesh but found no proximal bones!')
        spawnPuff(intersectionPoint, vrm.scene)
      }
    }
    else {
      console.log('[WIRED] Raycast missed all cloth meshes.')
    }
  }

  function handleTug(event: { x: number, y: number }, camera: THREE.Camera) {
    if (!isDragging.value || !targetBone.value || modelStore.interactionMode !== 'tactile')
      return

    // Calculate pull vector based on mouse movement in 3D space
    mouse.x = (event.x / window.innerWidth) * 2 - 1
    mouse.y = -(event.y / window.innerHeight) * 2 + 1
    raycaster.setFromCamera(mouse, camera)

    // Project mouse onto a plane at the bone's depth
    const plane = new THREE.Plane()
    const boneWorldPos = new Vector3()
    targetBone.value.getWorldPosition(boneWorldPos)
    plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new Vector3()).negate(), boneWorldPos)

    const dragTarget = new Vector3()
    raycaster.ray.intersectPlane(plane, dragTarget)

    // Calculate local offset
    const parent = targetBone.value.parent
    if (parent) {
      const localTarget = parent.worldToLocal(dragTarget.clone())
      const pullDir = localTarget.sub(basePosition)

      // Constraint: Fabric tension
      const dist = pullDir.length()
      currentTension.value = Math.min(dist / maxStretch, 1.0)

      if (dist > maxStretch) {
        pullDir.normalize().multiplyScalar(maxStretch)
      }

      targetBone.value.position.copy(basePosition.clone().add(pullDir))
    }
  }

  function endTug() {
    isDragging.value = false
    // Spring back is handled in update loop for smoothness
    console.log('[WIRED] Released Fabric')
  }

  /**
   * Main update loop for physics and emotional sync
   */
  function update(vrm: VRM, delta: number) {
    if (!vrm)
      return

    // Update Puffs (Fade and Scale)
    puffs.value = puffs.value.filter((puff) => {
      puff.scale.multiplyScalar(1.05)
      const mat = puff.material as SpriteMaterial
      mat.opacity -= delta * 2.5
      if (mat.opacity <= 0) {
        puff.removeFromParent()
        return false
      }
      return true
    })

    // Spring Back Logic
    if (!isDragging.value && targetBone.value) {
      targetBone.value.position.lerp(basePosition, 0.1) // Spring back speed
      currentTension.value = Math.max(0, currentTension.value - 0.1)

      if (targetBone.value.position.distanceTo(basePosition) < 0.001) {
        targetBone.value.position.copy(basePosition)
        targetBone.value = null
      }
    }

    // Emotional Coupling (Genius Layer)
    if (vrm.expressionManager && currentTension.value > 0) {
      const tension = currentTension.value
      // High tension blends Angry, low tension Surprised
      const surprisedWeight = Math.max(0, tension * (1.0 - tension) * 4) // Peaks in the middle
      const angryWeight = tension ** 2 // Peaks at the end

      vrm.expressionManager.setValue('surprised', surprisedWeight * 0.8)
      vrm.expressionManager.setValue('angry', angryWeight * 0.7)
    }

    updateTether(vrm)
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

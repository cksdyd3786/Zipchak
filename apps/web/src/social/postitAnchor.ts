import { Matrix3, type Object3D, type Vector3 } from 'three'
import { mToMm } from '../lib/units'

export type AnchorTarget =
  | { type: 'wall'; id: string }
  | { type: 'furniture'; id: string; frame: Object3D }

export function toPostitAnchor(
  surface: Object3D,
  worldPoint: Vector3,
  faceNormal: Vector3,
  target: AnchorTarget,
) {
  surface.updateWorldMatrix(true, false)
  const point = worldPoint.clone()
  const normalMatrix = new Matrix3().getNormalMatrix(surface.matrixWorld)
  const normal = faceNormal.clone().applyNormalMatrix(normalMatrix)

  if (target.type === 'furniture') {
    target.frame.worldToLocal(point)
    normal.applyNormalMatrix(normalMatrix.getNormalMatrix(target.frame.matrixWorld.clone().invert()))
  }

  return {
    targetType: target.type,
    targetId: target.type === 'wall' ? target.id : null,
    furnitureInstanceId: target.type === 'furniture' ? target.id : null,
    point: { x: mToMm(point.x), y: mToMm(point.y), z: mToMm(point.z) },
    normal: { x: normal.x, y: normal.y, z: normal.z },
  }
}

import type { Matrix } from '@mediapipe/tasks-vision'

export interface HeadPose {
  yaw: number
  pitch: number
  roll: number
}

const radiansToDegrees = 180 / Math.PI

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/** Convert the rotation portion of MediaPipe's row-major facial transform to approximate Euler angles. */
export function getHeadPose(matrix?: Matrix): HeadPose | null {
  if (!matrix || matrix.rows !== 4 || matrix.columns !== 4 || matrix.data.length < 16) return null

  const values = matrix.data
  const pitch = Math.asin(clamp(-values[6], -1, 1))
  const yaw = Math.atan2(values[2], values[10])
  const roll = Math.atan2(values[4], values[5])

  return {
    yaw: yaw * radiansToDegrees,
    pitch: pitch * radiansToDegrees,
    roll: roll * radiansToDegrees,
  }
}

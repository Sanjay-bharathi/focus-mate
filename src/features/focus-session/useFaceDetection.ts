import { useEffect, useState, type RefObject } from 'react'
import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from '@mediapipe/tasks-vision'
import { getHeadPose, type HeadPose } from './headPose'

const DETECTION_INTERVAL_MS = 200

export type FaceDetectionStatus =
  | 'Initializing'
  | 'Face detected'
  | 'No face detected'
  | 'Detection unavailable'

export interface FaceBounds {
  left: number
  top: number
  width: number
  height: number
}

interface FaceDetectionState {
  stream: MediaStream | null
  status: FaceDetectionStatus
  faceBounds: FaceBounds | null
  headPose: HeadPose | null
}

type FaceObservation = (hasFace: boolean, headPose: HeadPose | null) => void

function getFaceBounds(
  landmarks: NormalizedLandmark[],
  video: HTMLVideoElement,
  viewport: HTMLElement,
): FaceBounds | null {
  const viewportWidth = viewport.clientWidth
  const viewportHeight = viewport.clientHeight
  if (!viewportWidth || !viewportHeight || !video.videoWidth || !video.videoHeight) return null

  const minX = Math.min(...landmarks.map(({ x }) => x))
  const maxX = Math.max(...landmarks.map(({ x }) => x))
  const minY = Math.min(...landmarks.map(({ y }) => y))
  const maxY = Math.max(...landmarks.map(({ y }) => y))
  const scale = Math.max(viewportWidth / video.videoWidth, viewportHeight / video.videoHeight)
  const renderedWidth = video.videoWidth * scale
  const renderedHeight = video.videoHeight * scale
  const cropX = (renderedWidth - viewportWidth) / 2
  const cropY = (renderedHeight - viewportHeight) / 2
  const left = renderedWidth * (1 - maxX) - cropX
  const top = renderedHeight * minY - cropY

  return {
    left: (left / viewportWidth) * 100,
    top: (top / viewportHeight) * 100,
    width: (((maxX - minX) * renderedWidth) / viewportWidth) * 100,
    height: (((maxY - minY) * renderedHeight) / viewportHeight) * 100,
  }
}

export function useFaceDetection(
  videoRef: RefObject<HTMLVideoElement | null>,
  viewportRef: RefObject<HTMLElement | null>,
  stream: MediaStream | null,
  enabled: boolean,
  onObservation: FaceObservation,
) {
  const [detectionState, setDetectionState] = useState<FaceDetectionState>({
    stream: null,
    status: 'Detection unavailable',
    faceBounds: null,
    headPose: null,
  })

  useEffect(() => {
    if (!enabled || !stream) return

    let cancelled = false
    let timeoutId: number | undefined
    let landmarker: FaceLandmarker | null = null
    let lastVideoTime = -1

    const runDetection = () => {
      if (cancelled || !landmarker) return

      if (!stream.active || stream.getVideoTracks().every((track) => track.readyState !== 'live')) {
        setDetectionState({ stream, status: 'Detection unavailable', faceBounds: null, headPose: null })
        onObservation(false, null)
        landmarker.close()
        landmarker = null
        return
      }

      const video = videoRef.current
      const viewport = viewportRef.current
      if (
        video &&
        viewport &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.videoWidth > 0 &&
        video.videoHeight > 0 &&
        video.currentTime !== lastVideoTime
      ) {
        try {
          const result = landmarker.detectForVideo(video, performance.now())
          lastVideoTime = video.currentTime
          const landmarks = result.faceLandmarks[0]
          if (landmarks) {
            const headPose = getHeadPose(result.facialTransformationMatrixes[0])
            setDetectionState({
              stream,
              status: 'Face detected',
              faceBounds: getFaceBounds(landmarks, video, viewport),
              headPose,
            })
            onObservation(true, headPose)
          } else {
            setDetectionState({ stream, status: 'No face detected', faceBounds: null, headPose: null })
            onObservation(false, null)
          }
        } catch {
          setDetectionState({ stream, status: 'Detection unavailable', faceBounds: null, headPose: null })
          onObservation(true, null)
          landmarker.close()
          landmarker = null
          return
        }
      }

      timeoutId = window.setTimeout(runDetection, DETECTION_INTERVAL_MS)
    }

    const initialize = async () => {
      try {
        const wasmPath = `${import.meta.env.BASE_URL}wasm`
        const modelPath = `${import.meta.env.BASE_URL}models/face_landmarker.task`
        const vision = await FilesetResolver.forVisionTasks(wasmPath)
        const task = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: modelPath },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: true,
        })

        if (cancelled) {
          task.close()
          return
        }

        landmarker = task
        runDetection()
      } catch {
        if (!cancelled) {
          setDetectionState({ stream, status: 'Detection unavailable', faceBounds: null, headPose: null })
        }
      }
    }

    void initialize()

    return () => {
      cancelled = true
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      landmarker?.close()
      landmarker = null
    }
  }, [enabled, stream, videoRef, viewportRef, onObservation])

  const hasCurrentStream = enabled && stream !== null && detectionState.stream === stream
  const status = !enabled
    ? 'Detection unavailable'
    : hasCurrentStream
      ? detectionState.status
      : 'Initializing'
  const faceBounds = hasCurrentStream ? detectionState.faceBounds : null
  const headPose = hasCurrentStream ? detectionState.headPose : null

  return { status, faceBounds, headPose } as const
}

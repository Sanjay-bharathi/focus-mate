import { useCallback, useEffect, useRef, useState } from 'react'

export type WebcamStatus =
  | 'Idle'
  | 'Requesting'
  | 'Active'
  | 'Permission Denied'
  | 'Unavailable'
  | 'Error'

function stopTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop())
}

function getFailureStatus(error: unknown): WebcamStatus {
  const errorName = error instanceof Error ? error.name : ''

  if (errorName === 'NotAllowedError' || errorName === 'SecurityError') {
    return 'Permission Denied'
  }

  if (
    errorName === 'NotFoundError' ||
    errorName === 'DevicesNotFoundError' ||
    errorName === 'OverconstrainedError'
  ) {
    return 'Unavailable'
  }

  return 'Error'
}

export function useWebcam() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const requestIdRef = useRef(0)
  const statusRef = useRef<WebcamStatus>('Idle')
  const [status, setStatus] = useState<WebcamStatus>('Idle')
  const [stream, setStream] = useState<MediaStream | null>(null)

  const updateStatus = useCallback((nextStatus: WebcamStatus) => {
    statusRef.current = nextStatus
    setStatus(nextStatus)
  }, [])

  const stopCamera = useCallback(() => {
    requestIdRef.current += 1
    const currentStream = streamRef.current
    streamRef.current = null
    stopTracks(currentStream)

    if (videoRef.current) videoRef.current.srcObject = null

    setStream(null)
    updateStatus('Idle')
  }, [updateStatus])

  const requestCamera = useCallback(async () => {
    if (statusRef.current === 'Requesting' || statusRef.current === 'Active') return

    const mediaDevices = navigator.mediaDevices
    if (!mediaDevices?.getUserMedia) {
      updateStatus('Unavailable')
      return
    }

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    updateStatus('Requesting')

    try {
      const nextStream = await mediaDevices.getUserMedia({ video: true, audio: false })

      if (requestIdRef.current !== requestId) {
        stopTracks(nextStream)
        return
      }

      streamRef.current = nextStream
      setStream(nextStream)
      updateStatus('Active')
      nextStream.getVideoTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          if (requestIdRef.current !== requestId) return
          stopCamera()
          updateStatus('Error')
        }, { once: true })
      })
    } catch (error) {
      if (requestIdRef.current !== requestId) return
      updateStatus(getFailureStatus(error))
    }
  }, [stopCamera, updateStatus])

  useEffect(() => {
    const videoElement = videoRef.current
    if (!stream || !videoElement) return

    videoElement.srcObject = stream
    return () => {
      if (videoElement.srcObject === stream) videoElement.srcObject = null
    }
  }, [stream])

  useEffect(() => {
    const videoElement = videoRef.current
    return () => {
      requestIdRef.current += 1
      stopTracks(streamRef.current)
      streamRef.current = null
      if (videoElement) videoElement.srcObject = null
    }
  }, [])

  return { videoRef, stream, status, requestCamera, stopCamera } as const
}

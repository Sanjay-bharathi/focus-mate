import { useCallback, useRef, useState } from 'react'
import type { HeadPose } from './headPose'

const STORAGE_KEY = 'focusmate.workspace-calibration.v1'
const REQUIRED_STABLE_SAMPLES = 10
const STABILITY_WINDOW_SIZE = 5
const STABLE_RANGE_DEGREES = { yaw: 7, pitch: 9, roll: 9 }
const SCREEN_YAW_SEPARATION_DEGREES = 12
const NEUTRAL_SEPARATION_DEGREES = 8

export type WorkspaceDiagnostic =
  | 'Facing personal Mac'
  | 'Facing office laptop'
  | 'Facing neither screen'
  | 'Face not detected'
  | 'Unknown'
  | 'Calibration required'

export type CalibrationStep = 'personalMac' | 'officeLaptop' | 'neutral'

interface OrientationRange {
  center: HeadPose
  tolerance: HeadPose
  sampleCount: number
}

interface WorkspaceCalibration {
  version: 1
  calibratedAt: number
  personalMac: OrientationRange
  officeLaptop: OrientationRange
  neutral: OrientationRange
}

const STEP_ORDER: CalibrationStep[] = ['personalMac', 'officeLaptop', 'neutral']

const STEP_CONTENT: Record<CalibrationStep, { title: string; instruction: string }> = {
  personalMac: {
    title: 'Personal Mac · right side',
    instruction: 'Look toward your personal MacBook screen on your right.',
  },
  officeLaptop: {
    title: 'Office laptop · left side',
    instruction: 'Look toward your office Windows laptop screen on your left.',
  },
  neutral: {
    title: 'Neutral · straight ahead',
    instruction: 'Look straight ahead, between the two screens.',
  },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isPose(value: unknown): value is HeadPose {
  return isRecord(value) &&
    typeof value.yaw === 'number' && Number.isFinite(value.yaw) &&
    typeof value.pitch === 'number' && Number.isFinite(value.pitch) &&
    typeof value.roll === 'number' && Number.isFinite(value.roll)
}

function isRange(value: unknown): value is OrientationRange {
  return isRecord(value) &&
    isPose(value.center) && isPose(value.tolerance) &&
    typeof value.sampleCount === 'number' && Number.isFinite(value.sampleCount) && value.sampleCount >= REQUIRED_STABLE_SAMPLES
}

function angleDifference(first: number, second: number) {
  return ((first - second + 540) % 360) - 180
}

function distance(first: HeadPose, second: HeadPose) {
  const yaw = angleDifference(first.yaw, second.yaw)
  const pitch = angleDifference(first.pitch, second.pitch)
  const roll = angleDifference(first.roll, second.roll)
  return Math.sqrt(yaw * yaw + pitch * pitch + roll * roll)
}

function isReliable(calibration: WorkspaceCalibration) {
  const { personalMac, officeLaptop, neutral } = calibration
  const axes: (keyof HeadPose)[] = ['yaw', 'pitch', 'roll']
  const profiles = [personalMac, officeLaptop, neutral]
  if (profiles.some((profile) => profile.sampleCount < REQUIRED_STABLE_SAMPLES)) return false
  if (profiles.some((profile) => axes.some((axis) => profile.tolerance[axis] <= 0 || profile.tolerance[axis] > 35))) return false

  return Math.abs(angleDifference(personalMac.center.yaw, officeLaptop.center.yaw)) >= SCREEN_YAW_SEPARATION_DEGREES &&
    distance(personalMac.center, neutral.center) >= NEUTRAL_SEPARATION_DEGREES &&
    distance(officeLaptop.center, neutral.center) >= NEUTRAL_SEPARATION_DEGREES
}

function readCalibration(): WorkspaceCalibration | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return null
    const value: unknown = JSON.parse(stored)
    if (
      !isRecord(value) || value.version !== 1 ||
      typeof value.calibratedAt !== 'number' || !Number.isFinite(value.calibratedAt) ||
      !isRange(value.personalMac) || !isRange(value.officeLaptop) || !isRange(value.neutral)
    ) return null

    const calibration = value as unknown as WorkspaceCalibration
    return isReliable(calibration) ? calibration : null
  } catch {
    return null
  }
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function makeRange(samples: HeadPose[]): OrientationRange {
  const center = {
    yaw: average(samples.map((sample) => sample.yaw)),
    pitch: average(samples.map((sample) => sample.pitch)),
    roll: average(samples.map((sample) => sample.roll)),
  }
  const deviation = (axis: keyof HeadPose) => {
    const variance = average(samples.map((sample) => (sample[axis] - center[axis]) ** 2))
    return Math.sqrt(variance)
  }

  return {
    center,
    tolerance: {
      yaw: Math.max(8, deviation('yaw') * 2.5),
      pitch: Math.max(12, deviation('pitch') * 2.5),
      roll: Math.max(12, deviation('roll') * 2.5),
    },
    sampleCount: samples.length,
  }
}

function isStable(samples: HeadPose[]) {
  return (['yaw', 'pitch', 'roll'] as const).every((axis) => {
    const values = samples.map((sample) => sample[axis])
    return Math.max(...values) - Math.min(...values) <= STABLE_RANGE_DEGREES[axis]
  })
}

function profileScore(pose: HeadPose, range: OrientationRange) {
  const yaw = angleDifference(pose.yaw, range.center.yaw) / range.tolerance.yaw
  const pitch = angleDifference(pose.pitch, range.center.pitch) / range.tolerance.pitch
  const roll = angleDifference(pose.roll, range.center.roll) / range.tolerance.roll
  return yaw * yaw + pitch * pitch + roll * roll
}

function isInsideRange(pose: HeadPose, range: OrientationRange) {
  return profileScore(pose, range) <= 3
}

function classify(pose: HeadPose, calibration: WorkspaceCalibration): WorkspaceDiagnostic {
  const screenProfiles = [
    { status: 'Facing personal Mac' as const, range: calibration.personalMac },
    { status: 'Facing office laptop' as const, range: calibration.officeLaptop },
  ].filter(({ range }) => isInsideRange(pose, range))

  if (screenProfiles.length === 0) return 'Facing neither screen'

  const closestScreen = screenProfiles.reduce((best, candidate) =>
    profileScore(pose, candidate.range) < profileScore(pose, best.range) ? candidate : best,
  )
  const neutralScore = profileScore(pose, calibration.neutral)
  if (isInsideRange(pose, calibration.neutral) && neutralScore <= profileScore(pose, closestScreen.range)) {
    return 'Facing neither screen'
  }

  return closestScreen.status
}

function smoothPose(previous: HeadPose | null, next: HeadPose): HeadPose {
  if (!previous) return next
  const blend = (oldValue: number, newValue: number) => oldValue + angleDifference(newValue, oldValue) * 0.35
  return {
    yaw: blend(previous.yaw, next.yaw),
    pitch: blend(previous.pitch, next.pitch),
    roll: blend(previous.roll, next.roll),
  }
}

export function useWorkspaceCalibration() {
  const [calibration, setCalibration] = useState<WorkspaceCalibration | null>(readCalibration)
  const [diagnostic, setDiagnostic] = useState<WorkspaceDiagnostic>(() =>
    readCalibration() ? 'Unknown' : 'Calibration required',
  )
  const [step, setStepState] = useState<CalibrationStep | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const [sampleCount, setSampleCount] = useState(0)
  const [captureMessage, setCaptureMessage] = useState('')
  const [calibrationError, setCalibrationError] = useState('')
  const [storageWarning, setStorageWarning] = useState(false)

  const calibrationRef = useRef(calibration)
  const stepRef = useRef<CalibrationStep | null>(null)
  const isCapturingRef = useRef(false)
  const stepProfilesRef = useRef<Partial<Record<CalibrationStep, OrientationRange>>>({})
  const stableWindowRef = useRef<HeadPose[]>([])
  const samplesRef = useRef<HeadPose[]>([])
  const smoothedPoseRef = useRef<HeadPose | null>(null)
  const diagnosticRef = useRef(diagnostic)
  const candidateRef = useRef<{ status: WorkspaceDiagnostic | null; count: number }>({ status: null, count: 0 })
  const missingFaceCountRef = useRef(0)

  const updateDiagnostic = useCallback((next: WorkspaceDiagnostic, requiredFrames = 3) => {
    if (next === diagnosticRef.current) {
      candidateRef.current = { status: null, count: 0 }
      return
    }

    if (candidateRef.current.status === next) {
      candidateRef.current.count += 1
    } else {
      candidateRef.current = { status: next, count: 1 }
    }

    if (candidateRef.current.count >= requiredFrames) {
      diagnosticRef.current = next
      candidateRef.current = { status: null, count: 0 }
      setDiagnostic(next)
    }
  }, [])

  const updateStep = useCallback((next: CalibrationStep | null) => {
    stepRef.current = next
    setStepState(next)
  }, [])

  const setCapturing = useCallback((next: boolean) => {
    isCapturingRef.current = next
    setIsCapturing(next)
  }, [])

  const observeFrame = useCallback((hasFace: boolean, pose: HeadPose | null) => {
    if (!hasFace) {
      missingFaceCountRef.current += 1
      if (missingFaceCountRef.current >= 2) updateDiagnostic('Face not detected', 2)
      if (isCapturingRef.current) {
        stableWindowRef.current = []
        setCaptureMessage('Face not detected. Move back into view to continue.')
      }
      return
    }

    missingFaceCountRef.current = 0
    if (!pose) {
      updateDiagnostic('Unknown')
      if (isCapturingRef.current) setCaptureMessage('Head orientation is unavailable. Check the camera view.')
      return
    }

    const smoothed = smoothPose(smoothedPoseRef.current, pose)
    smoothedPoseRef.current = smoothed

    if (!calibrationRef.current) {
      diagnosticRef.current = 'Calibration required'
      candidateRef.current = { status: null, count: 0 }
      setDiagnostic('Calibration required')
    } else {
      updateDiagnostic(classify(smoothed, calibrationRef.current))
    }

    if (!isCapturingRef.current) return

    const step = stepRef.current
    if (!step) return

    const window = [...stableWindowRef.current, pose].slice(-STABILITY_WINDOW_SIZE)
    stableWindowRef.current = window
    if (window.length < STABILITY_WINDOW_SIZE || !isStable(window)) {
      if (window.length === STABILITY_WINDOW_SIZE) {
        samplesRef.current = []
        setSampleCount(0)
      }
      setCaptureMessage('Hold this position steadily while we collect samples.')
      return
    }

    samplesRef.current.push(pose)
    setSampleCount(samplesRef.current.length)
    setCaptureMessage('Stable samples collected.')

    if (samplesRef.current.length < REQUIRED_STABLE_SAMPLES) return

    stepProfilesRef.current[step] = makeRange(samplesRef.current)
    samplesRef.current = []
    stableWindowRef.current = []
    setSampleCount(0)
    setCapturing(false)

    const nextStep = STEP_ORDER[STEP_ORDER.indexOf(step) + 1]
    if (nextStep) {
      updateStep(nextStep)
      setCaptureMessage('Position saved. Continue to the next direction when ready.')
      return
    }

    const profiles = stepProfilesRef.current
    const proposed: WorkspaceCalibration | null = profiles.personalMac && profiles.officeLaptop && profiles.neutral
      ? {
          version: 1,
          calibratedAt: Date.now(),
          personalMac: profiles.personalMac,
          officeLaptop: profiles.officeLaptop,
          neutral: profiles.neutral,
        }
      : null

    if (!proposed || !isReliable(proposed)) {
      setCalibrationError('These positions were too similar or unstable to distinguish reliably. Restart calibration and turn your head clearly toward each position.')
      stepProfilesRef.current = {}
      updateStep('personalMac')
      setCaptureMessage('')
      return
    }

    calibrationRef.current = proposed
    setCalibration(proposed)
    updateStep(null)
    setCalibrationError('')
    setCaptureMessage('Calibration complete. Your direction ranges are saved on this device.')
    smoothedPoseRef.current = null
    diagnosticRef.current = 'Unknown'
    candidateRef.current = { status: null, count: 0 }
    setDiagnostic('Unknown')
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(proposed))
      setStorageWarning(false)
    } catch {
      setStorageWarning(true)
    }
  }, [setCapturing, updateStep, updateDiagnostic])

  const startCalibration = useCallback(() => {
    stepProfilesRef.current = {}
    stableWindowRef.current = []
    samplesRef.current = []
    setSampleCount(0)
    setCalibrationError('')
    setCaptureMessage('')
    setCapturing(false)
    updateStep('personalMac')
    smoothedPoseRef.current = null
  }, [setCapturing, updateStep])

  const beginCapture = useCallback(() => {
    if (!stepRef.current) return
    stableWindowRef.current = []
    samplesRef.current = []
    setSampleCount(0)
    setCaptureMessage('Hold the requested position steady. FocusMate will collect stable samples.')
    setCapturing(true)
  }, [setCapturing])

  const cancelCalibration = useCallback(() => {
    stableWindowRef.current = []
    samplesRef.current = []
    setSampleCount(0)
    setCapturing(false)
    updateStep(null)
    setCaptureMessage('')
  }, [setCapturing, updateStep])

  const clearCalibration = useCallback(() => {
    calibrationRef.current = null
    setCalibration(null)
    diagnosticRef.current = 'Calibration required'
    setDiagnostic('Calibration required')
    try {
      localStorage.removeItem(STORAGE_KEY)
      setStorageWarning(false)
    } catch {
      setStorageWarning(true)
    }
  }, [])

  const currentStepContent = step ? STEP_CONTENT[step] : null

  return {
    calibration,
    diagnostic,
    step,
    currentStepContent,
    isCalibrating: step !== null,
    isCapturing,
    sampleCount,
    requiredStableSamples: REQUIRED_STABLE_SAMPLES,
    captureMessage,
    calibrationError,
    storageWarning,
    observeFrame,
    startCalibration,
    beginCapture,
    cancelCalibration,
    clearCalibration,
  } as const
}

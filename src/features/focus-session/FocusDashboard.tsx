import { useRef } from 'react'
import { formatElapsedTime } from './formatElapsedTime'
import { useFocusTimer } from './useFocusTimer'
import { useFaceDetection } from './useFaceDetection'
import { useWorkspaceCalibration } from './useWorkspaceCalibration'
import { useWebcam } from './useWebcam'
import './focus-session.css'

function FocusDashboard() {
  const { status, elapsedMs, completedDurationMs, start, stop } = useFocusTimer()
  const { videoRef, stream, status: cameraStatus, requestCamera, stopCamera } = useWebcam()
  const previewRef = useRef<HTMLDivElement>(null)
  const isFocusing = status === 'Focusing'
  const workspace = useWorkspaceCalibration()
  const { status: detectionStatus, faceBounds, headPose } = useFaceDetection(
    videoRef,
    previewRef,
    stream,
    isFocusing && cameraStatus === 'Active',
    workspace.observeFrame,
  )
  const canUseCamera = isFocusing && cameraStatus === 'Active'
  const canCapture = canUseCamera && detectionStatus === 'Face detected' && headPose !== null
  const workspaceDiagnostic = !workspace.calibration && workspace.diagnostic !== 'Face not detected'
    ? 'Calibration required'
    : !canUseCamera || detectionStatus === 'Detection unavailable'
      ? 'Unknown'
      : workspace.diagnostic

  const handleStart = () => {
    start()
    void requestCamera()
  }

  const handleStop = () => {
    workspace.cancelCalibration()
    stopCamera()
    stop()
  }

  const handleStartCalibration = () => {
    workspace.startCalibration()
  }

  const cameraMessage = {
    Idle: 'Camera turns on only while a focus session is active.',
    Requesting: 'Waiting for camera permission…',
    Active: 'Your live camera preview is active.',
    'Permission Denied': 'Camera permission was denied. Your focus timer continues.',
    Unavailable: 'No compatible camera is available. Your focus timer continues.',
    Error: 'The camera could not start. Your focus timer continues.',
  }[cameraStatus]

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <span>FocusMate</span>
        </div>
        <span className="topbar-note">A little space for your best work</span>
      </header>

      <section className="focus-layout" aria-labelledby="dashboard-title">
        <div className="intro">
          <p className="eyebrow">Your Personal AI Focus Companion</p>
          <h1 id="dashboard-title">Make room for<br className="desktop-break" /> what matters.</h1>
          <p className="intro-copy">One thing at a time. Give your attention a place to land.</p>
        </div>

        <section className="timer-card" aria-label="Focus session timer">
          <div className="timer-card-top">
            <span className="timer-label">CURRENT SESSION</span>
            <span className={`status-pill${isFocusing ? ' is-active' : ''}`}>
              <span className="status-dot" aria-hidden="true" />
              {status}
            </span>
          </div>

          <div className="timer-display" role="timer" aria-label={`Elapsed time ${formatElapsedTime(elapsedMs)}`}>
            {formatElapsedTime(elapsedMs)}
          </div>
          <p className="timer-caption" aria-live="polite">
            {isFocusing ? 'Stay with the moment.' : status === 'Stopped' ? 'Your session is complete.' : 'Your next focused moment starts here.'}
          </p>

          <div className="timer-divider" />

          <div className="session-detail">
            <span className="detail-indicator" aria-hidden="true" />
            <span>Session elapsed</span>
            <strong>{formatElapsedTime(elapsedMs)}</strong>
          </div>

          <div className="timer-actions">
            <button className="button button-primary" type="button" onClick={handleStart} disabled={isFocusing}>
              <span className="play-icon" aria-hidden="true" />
              {isFocusing ? 'Focus in progress' : 'Start Focus'}
            </button>
            <button className="button button-secondary" type="button" onClick={handleStop} disabled={!isFocusing}>
              <span className="stop-icon" aria-hidden="true" />
              Stop Focus
            </button>
          </div>

          <section className="camera-panel" aria-label="Webcam preview">
            <div className="camera-panel-heading">
              <span className="camera-panel-title">CAMERA</span>
              <div className="camera-state-group">
                <span className={`status-pill${cameraStatus === 'Active' ? ' is-active' : ''}`} role="status">
                  <span className="status-dot" aria-hidden="true" />
                  {cameraStatus}
                </span>
                <span className={`status-pill${detectionStatus === 'Face detected' ? ' is-active' : ''}`} role="status">
                  <span className="status-dot" aria-hidden="true" />
                  {detectionStatus}
                </span>
              </div>
            </div>
            <div className="camera-preview-frame" ref={previewRef}>
              <video
                ref={videoRef}
                className="camera-preview"
                autoPlay
                muted
                playsInline
                aria-label="Live webcam preview"
                hidden={cameraStatus !== 'Active'}
              />
              {cameraStatus === 'Active' && detectionStatus === 'Face detected' && faceBounds && (
                <div
                  className="face-detection-box"
                  aria-hidden="true"
                  style={{
                    left: `${faceBounds.left}%`,
                    top: `${faceBounds.top}%`,
                    width: `${faceBounds.width}%`,
                    height: `${faceBounds.height}%`,
                  }}
                />
              )}
              {cameraStatus !== 'Active' && (
                <div className={`camera-placeholder${cameraStatus === 'Requesting' ? ' is-requesting' : ''}`}>
                  <span className="camera-placeholder-mark" aria-hidden="true">◉</span>
                  <span>{cameraMessage}</span>
                </div>
              )}
            </div>
            <section className="workspace-panel" aria-label="Workspace direction and calibration">
              <div className="workspace-heading">
                <div>
                  <span className="workspace-kicker">WORKSPACE DIRECTION</span>
                  <p className="workspace-description">Approximate head direction only</p>
                </div>
                <span className={`status-pill${workspaceDiagnostic.startsWith('Facing ') ? ' is-active' : ''}`} role="status" aria-live="polite">
                  <span className="status-dot" aria-hidden="true" />
                  {workspaceDiagnostic}
                </span>
              </div>

              {workspace.isCalibrating && workspace.currentStepContent ? (
                <div className="calibration-flow">
                  <p className="calibration-step">Step {['personalMac', 'officeLaptop', 'neutral'].indexOf(workspace.step ?? '') + 1} of 3 · {workspace.currentStepContent.title}</p>
                  <p className="calibration-instruction">{workspace.currentStepContent.instruction}</p>
                  {workspace.isCapturing ? (
                    <>
                      <div className="calibration-progress" role="progressbar" aria-label="Stable orientation samples" aria-valuemin={0} aria-valuemax={workspace.requiredStableSamples} aria-valuenow={workspace.sampleCount}>
                        <span style={{ width: `${(workspace.sampleCount / workspace.requiredStableSamples) * 100}%` }} />
                      </div>
                      <p className="calibration-message" aria-live="polite">
                        {workspace.captureMessage || `${workspace.sampleCount} of ${workspace.requiredStableSamples} stable samples`}
                        {workspace.captureMessage === 'Stable samples collected.' && ` ${workspace.sampleCount} of ${workspace.requiredStableSamples}`}
                      </p>
                      <button className="button button-secondary calibration-button" type="button" onClick={workspace.cancelCalibration}>Cancel calibration</button>
                    </>
                  ) : (
                    <div className="calibration-actions">
                      <button className="button button-primary calibration-button" type="button" onClick={workspace.beginCapture} disabled={!canCapture}>
                        Collect stable samples
                      </button>
                      {!canCapture && <p className="calibration-hint">Wait for a detected face and available head orientation.</p>}
                      <button className="button button-secondary calibration-button" type="button" onClick={workspace.cancelCalibration}>Cancel</button>
                    </div>
                  )}
                  {workspace.calibrationError && <p className="calibration-error" role="alert">{workspace.calibrationError}</p>}
                </div>
              ) : (
                <div className="workspace-calibration-summary">
                  {workspace.calibration ? (
                    <>
                      <p className="calibration-summary-copy">Two screen directions and a neutral position are calibrated on this device.</p>
                      <div className="workspace-centers" aria-label="Calibrated head orientation ranges">
                        <span>Mac right <strong>{workspace.calibration.personalMac.center.yaw.toFixed(0)}° yaw</strong></span>
                        <span>Office left <strong>{workspace.calibration.officeLaptop.center.yaw.toFixed(0)}° yaw</strong></span>
                        <span>Neutral <strong>{workspace.calibration.neutral.center.yaw.toFixed(0)}° yaw</strong></span>
                      </div>
                      <div className="calibration-actions">
                        <button className="button button-secondary calibration-button" type="button" onClick={handleStartCalibration} disabled={!canUseCamera}>Recalibrate workspace</button>
                        <button className="button button-text calibration-button" type="button" onClick={workspace.clearCalibration}>Clear calibration</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="calibration-summary-copy">Calibrate both laptop directions and your neutral position before workspace direction can be classified.</p>
                      <button className="button button-secondary calibration-button" type="button" onClick={handleStartCalibration} disabled={!canUseCamera}>Calibrate workspace</button>
                    </>
                  )}
                  {!canUseCamera && <p className="calibration-hint">Start Focus and allow camera access to calibrate.</p>}
                  {workspace.storageWarning && <p className="calibration-hint" role="status">Browser storage is unavailable; calibration may not persist after this page closes.</p>}
                </div>
              )}
            <p className="workspace-privacy-note">Orientation is processed locally. This does not measure concentration.</p>
            </section>
            <p className="camera-privacy">Camera only · No microphone or recording · Stays on this device</p>
          </section>
        </section>

        {completedDurationMs !== null && (
          <section className="completion-card" aria-live="polite" aria-label="Completed session summary">
            <span className="completion-check" aria-hidden="true">✓</span>
            <div>
              <p className="completion-title">Focus session complete</p>
              <p className="completion-copy">You spent <strong>{formatElapsedTime(completedDurationMs)}</strong> focused on what matters.</p>
            </div>
          </section>
        )}

        <footer className="dashboard-footer">
          <span>Take a breath. You’re right where you need to be.</span>
          <span className="footer-sparkle" aria-hidden="true">✳</span>
        </footer>
      </section>
    </main>
  )
}

export default FocusDashboard

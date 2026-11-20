import { formatElapsedTime } from './formatElapsedTime'
import { useFocusTimer } from './useFocusTimer'
import './focus-session.css'

function FocusDashboard() {
  const { status, elapsedMs, completedDurationMs, start, stop } = useFocusTimer()
  const isFocusing = status === 'Focusing'

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
            <button className="button button-primary" type="button" onClick={start} disabled={isFocusing}>
              <span className="play-icon" aria-hidden="true" />
              {isFocusing ? 'Focus in progress' : 'Start Focus'}
            </button>
            <button className="button button-secondary" type="button" onClick={stop} disabled={!isFocusing}>
              <span className="stop-icon" aria-hidden="true" />
              Stop Focus
            </button>
          </div>
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

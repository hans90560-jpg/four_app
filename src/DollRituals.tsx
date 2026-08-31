import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react'
import talismanFlameImage from '../assets/effects/talisman-flame-v1.png'

export const DOLL_BURN_HOLD_MS = 1000
export const DOLL_BURN_EFFECT_MS = 2300
export const CHARRED_DURATION_MS = 60_000

export function DollBurnDialog({
  dialogRef,
  busy,
  error,
  resetToken,
  onCancel,
  onComplete,
}: {
  dialogRef: RefObject<HTMLElement | null>
  busy: boolean
  error: string
  resetToken: number
  onCancel: () => void
  onComplete: () => void
}) {
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('1초 동안 계속 눌러 주세요')
  const frameRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  const holdingRef = useRef(false)
  const completedRef = useRef(false)
  const sourceRef = useRef<'pointer' | 'keyboard' | null>(null)

  const stopFrame = () => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
  }

  const cancelHold = () => {
    if (!holdingRef.current || completedRef.current) return
    stopFrame()
    holdingRef.current = false
    sourceRef.current = null
    setProgress(0)
    setStatus('처음부터 다시 1초간 눌러 주세요')
  }

  const finishHold = () => {
    stopFrame()
    holdingRef.current = false
    completedRef.current = true
    sourceRef.current = null
    setProgress(100)
    setStatus('그을림 상태를 저장하는 중이에요')
    onComplete()
  }

  const tick = (now: number) => {
    if (!holdingRef.current) return
    const nextProgress = Math.min(100, ((now - startedAtRef.current) / DOLL_BURN_HOLD_MS) * 100)
    setProgress(nextProgress)
    if (nextProgress >= 100) {
      finishHold()
      return
    }
    frameRef.current = requestAnimationFrame(tick)
  }

  const startHold = (source: 'pointer' | 'keyboard') => {
    if (busy || holdingRef.current || completedRef.current) return
    holdingRef.current = true
    sourceRef.current = source
    startedAtRef.current = performance.now()
    setProgress(0)
    setStatus('계속 누르고 있어 주세요')
    frameRef.current = requestAnimationFrame(tick)
  }

  useEffect(() => {
    stopFrame()
    holdingRef.current = false
    completedRef.current = false
    sourceRef.current = null
    setProgress(0)
    setStatus('1초 동안 계속 눌러 주세요')
  }, [resetToken])

  useEffect(() => () => stopFrame(), [])

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    if (sourceRef.current) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    startHold('pointer')
  }

  const handlePointerEnd = (event: PointerEvent<HTMLButtonElement>) => {
    if (sourceRef.current !== 'pointer') return
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    cancelHold()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== ' ' && event.key !== 'Enter') return
    event.preventDefault()
    if (event.repeat || sourceRef.current) return
    startHold('keyboard')
  }

  const handleKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if ((event.key === ' ' || event.key === 'Enter') && sourceRef.current === 'keyboard') {
      event.preventDefault()
      cancelHold()
    }
  }

  return (
    <div className="ritual-dialog-backdrop">
      <section
        className="ritual-dialog doll-burn-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="doll-burn-title"
        aria-describedby="doll-burn-description"
        ref={dialogRef}
      >
        <h2 id="doll-burn-title">인형 태우기</h2>
        <div id="doll-burn-description">
          <p>인형은 삭제되지 않으며 화면에서만 밝은 불꽃 연출이 실행됩니다.</p>
          <ul>
            <li>그을림은 1분 뒤 자동으로 사라집니다.</li>
            <li>실제 효력이 없는 가상 스트레스 해소 놀이입니다.</li>
          </ul>
        </div>
        <div
          className="doll-burn-progress"
          role="progressbar"
          aria-label="인형 태우기 누르기 진행률"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.floor(progress)}
          style={{ '--doll-burn-progress': `${progress}%` } as CSSProperties}
        >
          <span />
        </div>
        <p className="ritual-dialog-status" role="status" aria-live="polite">{error || status}</p>
        <div className="ritual-dialog-actions">
          <button type="button" className="secondary-maker-button" disabled={busy} onClick={onCancel}>취소</button>
          <button
            type="button"
            className="doll-burn-hold-button"
            disabled={busy}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            onPointerLeave={handlePointerEnd}
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
            onBlur={cancelHold}
            onContextMenu={(event) => event.preventDefault()}
          >{busy ? '저장 중…' : '1초간 눌러 인형 태우기'}</button>
        </div>
      </section>
    </div>
  )
}

export function DollBurnEffect({ onComplete }: { onComplete: () => void }) {
  return (
    <div
      className="doll-burn-flames"
      data-testid="doll-burn-effect"
      aria-hidden="true"
      onAnimationEnd={(event) => {
        if (event.currentTarget === event.target) onComplete()
      }}
    >
      <img className="doll-flame-layer is-wide" src={talismanFlameImage} alt="" aria-hidden="true" draggable={false} />
      <img className="doll-flame-layer is-narrow" src={talismanFlameImage} alt="" aria-hidden="true" draggable={false} />
    </div>
  )
}

export function PurifyDialog({
  dialogRef,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  dialogRef: RefObject<HTMLElement | null>
  busy: boolean
  error: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="ritual-dialog-backdrop">
      <section
        className="ritual-dialog purify-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="purify-title"
        aria-describedby="purify-description"
        ref={dialogRef}
      >
        <h2 id="purify-title">인형 정화하기</h2>
        <p id="purify-description">바늘, 부적, 저주와 그을림을 모두 없앨까요? 얼굴 사진과 이름, 인형 자체는 그대로 유지됩니다.</p>
        {error && <p className="ritual-dialog-error" role="alert">{error}</p>}
        <div className="ritual-dialog-actions">
          <button type="button" className="secondary-maker-button" disabled={busy} onClick={onCancel}>취소</button>
          <button type="button" className="purify-confirm-button" disabled={busy} onClick={onConfirm}>
            {busy ? '정화하는 중…' : '모두 정화하기'}
          </button>
        </div>
      </section>
    </div>
  )
}

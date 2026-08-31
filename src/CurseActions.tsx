import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react'
import talismanAshImage from '../assets/effects/talisman-ash-v1.png'
import talismanFlameImage from '../assets/effects/talisman-flame-v1.png'
import { getCurseById, type CurseId } from './curses'
import { TalismanPaper } from './Talisman'

export const CHANT_DURATION_MS = 1500
export const TALISMAN_BURN_DURATION_MS = 2300

export function AttachedTalismanPanel({
  dialogRef,
  curseId,
  busy,
  burnButtonRef,
  onChooseAnother,
  onRequestBurn,
  onClose,
}: {
  dialogRef: RefObject<HTMLElement | null>
  curseId: CurseId
  busy: boolean
  burnButtonRef: RefObject<HTMLButtonElement | null>
  onChooseAnother: () => void
  onRequestBurn: () => void
  onClose: () => void
}) {
  const curse = getCurseById(curseId)
  if (!curse) return null

  return (
    <div className="talisman-backdrop">
      <section
        className="talisman-panel attached-talisman-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="attached-talisman-title"
        aria-describedby="attached-talisman-description"
        ref={dialogRef}
      >
        <button type="button" className="talisman-panel-close" aria-label="현재 부적 정보 닫기" disabled={busy} onClick={onClose}>×</button>
        <header>
          <p>현재 얼굴에 붙어 있는 부적</p>
          <h2 id="attached-talisman-title">{curse.name}</h2>
          <p id="attached-talisman-description">다른 부적으로 바꾸거나, 이 부적만 화면 속에서 태울 수 있어요.</p>
        </header>
        <div className="attached-talisman-content">
          <TalismanPaper curseId={curseId} preview />
          <div className="attached-talisman-actions">
            <button type="button" className="secondary-maker-button" disabled={busy} onClick={onChooseAnother}>다른 부적 선택</button>
            <button type="button" className="talisman-burn-button" ref={burnButtonRef} disabled={busy} onClick={onRequestBurn}>부적 태우기</button>
            <button type="button" className="primary-maker-button" disabled={busy} onClick={onClose}>닫기</button>
          </div>
        </div>
      </section>
    </div>
  )
}

export function TalismanBurnDialog({
  dialogRef,
  curseId,
  busy,
  onCancel,
  onConfirm,
}: {
  dialogRef: RefObject<HTMLElement | null>
  curseId: CurseId
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const curse = getCurseById(curseId)
  return (
    <div className="talisman-confirm-backdrop">
      <section
        className="talisman-confirm-dialog talisman-burn-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="talisman-burn-title"
        aria-describedby="talisman-burn-description"
        ref={dialogRef}
      >
        <h2 id="talisman-burn-title">{curse?.name} 부적을 태울까요?</h2>
        <p id="talisman-burn-description">계속하면 주문 화면이 열립니다. 주문을 끝까지 외운 뒤 부적이 타오르고 저주가 끝납니다.</p>
        <div className="talisman-confirm-actions">
          <button type="button" className="secondary-maker-button" disabled={busy} onClick={onCancel}>취소</button>
          <button type="button" className="talisman-burn-button" disabled={busy} onClick={onConfirm}>{busy ? '태우는 중…' : '계속하기'}</button>
        </div>
      </section>
    </div>
  )
}

export function SpellPanel({
  dialogRef,
  curseId,
  onClose,
  onCastingChange,
  onComplete,
}: {
  dialogRef: RefObject<HTMLElement | null>
  curseId: CurseId
  onClose: () => void
  onCastingChange: (casting: boolean) => void
  onComplete: () => void
}) {
  const curse = getCurseById(curseId)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('1.5초 동안 길게 눌러 주세요')
  const frameRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  const castingRef = useRef(false)
  const completedRef = useRef(false)
  const sourceRef = useRef<'pointer' | 'keyboard' | null>(null)
  const progressRef = useRef(0)

  const stopFrame = () => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
  }

  const cancelCasting = () => {
    if (!castingRef.current || completedRef.current) return
    stopFrame()
    castingRef.current = false
    sourceRef.current = null
    progressRef.current = 0
    setProgress(0)
    setStatus('주문이 취소됐어요')
    onCastingChange(false)
  }

  const finishCasting = () => {
    stopFrame()
    castingRef.current = false
    completedRef.current = true
    sourceRef.current = null
    progressRef.current = 100
    setProgress(100)
    setStatus(`${curse?.name ?? '현재 저주'}의 주문이 완성됐습니다.`)
    onCastingChange(false)
    onComplete()
  }

  const tick = (now: number) => {
    if (!castingRef.current) return
    const nextProgress = Math.min(100, ((now - startedAtRef.current) / CHANT_DURATION_MS) * 100)
    progressRef.current = nextProgress
    setProgress(nextProgress)
    if (nextProgress >= 100) {
      finishCasting()
      return
    }
    frameRef.current = requestAnimationFrame(tick)
  }

  const startCasting = (source: 'pointer' | 'keyboard') => {
    if (castingRef.current) return
    completedRef.current = false
    castingRef.current = true
    sourceRef.current = source
    progressRef.current = 0
    startedAtRef.current = performance.now()
    setProgress(0)
    setStatus('주문을 외우는 중이에요')
    onCastingChange(true)
    frameRef.current = requestAnimationFrame(tick)
  }

  const closeSafely = () => {
    cancelCasting()
    onClose()
  }

  useEffect(() => () => {
    stopFrame()
    if (castingRef.current) onCastingChange(false)
    castingRef.current = false
  }, [onCastingChange])

  if (!curse) return null
  const characters = Array.from(curse.chant)
  const highlightedCount = Math.ceil((progress / 100) * characters.length)

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    if (sourceRef.current) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    startCasting('pointer')
  }

  const handlePointerEnd = (event: PointerEvent<HTMLButtonElement>) => {
    if (sourceRef.current !== 'pointer') return
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    cancelCasting()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== ' ' && event.key !== 'Enter') return
    event.preventDefault()
    if (event.repeat || sourceRef.current) return
    startCasting('keyboard')
  }

  const handleKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if ((event.key === ' ' || event.key === 'Enter') && sourceRef.current === 'keyboard') {
      event.preventDefault()
      cancelCasting()
    }
  }

  return (
    <div className={`spell-backdrop${castingRef.current ? ' is-casting' : ''}`}>
      <section
        className="spell-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="spell-panel-title"
        aria-describedby="spell-panel-description"
        ref={dialogRef}
      >
        <button type="button" className="talisman-panel-close" aria-label="주문 외우기 닫기" onClick={closeSafely}>×</button>
        <header>
          <p>현재 부적의 주문</p>
          <h2 id="spell-panel-title">{curse.name} 주문 외우기</h2>
          <p id="spell-panel-description" className="spell-transition-note">주문을 마치면 부적이 타오릅니다</p>
        </header>

        <div
          className="spell-progress"
          role="progressbar"
          aria-label="주문 시전 진행률"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.floor(progress)}
          style={{ '--spell-progress': `${progress}%` } as CSSProperties}
        >
          <TalismanPaper curseId={curseId} preview />
          <strong>{Math.floor(progress)}%</strong>
        </div>

        <p className="spell-chant">
          {characters.map((character, index) => (
            <span key={`${character}-${index}`} className={index < highlightedCount ? 'is-highlighted' : ''}>{character}</span>
          ))}
        </p>

        <p className="spell-status" role="status" aria-live="polite">{status}</p>
        <button
          type="button"
          className="spell-hold-button"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onPointerLeave={handlePointerEnd}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onContextMenu={(event) => event.preventDefault()}
        >길게 눌러 주문 외우기</button>
        <button type="button" className="secondary-maker-button spell-cancel-button" onClick={closeSafely}>취소하고 돌아가기</button>
      </section>
    </div>
  )
}

export function TalismanBurnEffect({ onComplete }: { onComplete: () => void }) {
  return (
    <div
      className="talisman-burn-effect"
      data-testid="talisman-burn-effect"
      aria-hidden="true"
      onAnimationEnd={(event) => {
        if (event.currentTarget === event.target) onComplete()
      }}
    >
      <img className="talisman-flame-layer is-back" src={talismanFlameImage} alt="" draggable={false} />
      <img className="talisman-flame-layer is-front" src={talismanFlameImage} alt="" draggable={false} />
      <img className="talisman-ash-layer" src={talismanAshImage} alt="" draggable={false} />
    </div>
  )
}

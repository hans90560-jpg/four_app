import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react'
import dollFemaleBase from '../assets/characters/doll-female-base-v1.png'
import needleImage from '../assets/tools/needle-v1.png'
import {
  getDoll,
  markDollUsed,
  updateDoll,
  type DollRecord,
  type Pin,
} from './dollDatabase'
import { getCurseById, type CurseCategory, type CurseId } from './curses'
import {
  CurseEffect,
  TalismanPanel,
  TalismanPaper,
  TalismanReplacementDialog,
} from './Talisman'
import {
  AttachedTalismanPanel,
  ChantBurst,
  SpellPanel,
  TALISMAN_BURN_DURATION_MS,
  TalismanBurnDialog,
  TalismanBurnEffect,
} from './CurseActions'

const ROOM_COMPOSITE_STYLE = {
  '--face-left': '30%',
  '--face-top': '13.5%',
  '--face-width': '40%',
  '--face-height': '26%',
  '--name-left': '43%',
  '--name-top': '47.5%',
  '--name-width': '14%',
  '--name-height': '28%',
  '--talisman-left': '28.5%',
  '--talisman-top': '12%',
  '--talisman-width': '43%',
  '--talisman-height': '29%',
} as CSSProperties

type ActiveTool = 'needle' | 'shake' | 'talisman' | 'spell' | null
type SaveStatus = 'saving' | 'saved' | 'error'

function useBlobObjectUrl(blob: Blob | null): string {
  const [url, setUrl] = useState('')

  useEffect(() => {
    if (!blob) {
      setUrl('')
      return
    }
    const nextUrl = URL.createObjectURL(blob)
    setUrl(nextUrl)
    return () => URL.revokeObjectURL(nextUrl)
  }, [blob])

  return url
}

function createPinId(): string {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID()
  return `pin-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function isInsideDoll(x: number, y: number): boolean {
  const inEllipse = (centerX: number, centerY: number, radiusX: number, radiusY: number) => (
    ((x - centerX) / radiusX) ** 2 + ((y - centerY) / radiusY) ** 2 <= 1
  )
  const head = inEllipse(.5, .27, .24, .2)
  const body = inEllipse(.5, .58, .29, .27)
  const arms = y >= .42 && y <= .7 && x >= .13 && x <= .87
  const legs = y >= .7 && y <= .95 && x >= .3 && x <= .7
  return head || body || arms || legs
}

function pinAngle(x: number, y: number, count: number): number {
  return -28 + ((Math.round(x * 100) + Math.round(y * 100) + count * 17) % 57)
}

export default function CurseRoom({
  dollId,
  onExit,
  onOpenArchive,
}: {
  dollId: string
  onExit: () => void
  onOpenArchive: () => void
}) {
  const [doll, setDoll] = useState<DollRecord | null>(null)
  const [loadError, setLoadError] = useState('')
  const [activeTool, setActiveTool] = useState<ActiveTool>(null)
  const [pins, setPins] = useState<Pin[]>([])
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [notice, setNotice] = useState('')
  const [sparkle, setSparkle] = useState<{ id: string; x: number; y: number } | null>(null)
  const [isFlinching, setIsFlinching] = useState(false)
  const [shakeX, setShakeX] = useState(0)
  const [shakeAngle, setShakeAngle] = useState(0)
  const [isReturning, setIsReturning] = useState(false)
  const [keyboardPoint, setKeyboardPoint] = useState({ x: .5, y: .55 })
  const [isTalismanPanelOpen, setIsTalismanPanelOpen] = useState(false)
  const [curseTab, setCurseTab] = useState<CurseCategory>('occult')
  const [selectedCurseId, setSelectedCurseId] = useState<CurseId | null>(null)
  const [replacementCurseId, setReplacementCurseId] = useState<CurseId | null>(null)
  const [isTalismanSaving, setIsTalismanSaving] = useState(false)
  const [talismanError, setTalismanError] = useState('')
  const [effectCurseId, setEffectCurseId] = useState<CurseId | null>(null)
  const [isEffectEnhanced, setIsEffectEnhanced] = useState(false)
  const [showChantBurst, setShowChantBurst] = useState(false)
  const [isAttachedPanelOpen, setIsAttachedPanelOpen] = useState(false)
  const [isSpellPanelOpen, setIsSpellPanelOpen] = useState(false)
  const [isCasting, setIsCasting] = useState(false)
  const [isBurnConfirmationOpen, setIsBurnConfirmationOpen] = useState(false)
  const [isTalismanBurning, setIsTalismanBurning] = useState(false)
  const faceUrl = useBlobObjectUrl(doll?.faceBlob ?? null)
  const attachedCurseId = doll?.interactionState.talismanStatus === 'attached'
    ? doll.interactionState.selectedCurse
    : null
  const mountedRef = useRef(true)
  const pinsRef = useRef<Pin[]>([])
  const confirmedPinsRef = useRef<Pin[]>([])
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const saveVersionRef = useRef(0)
  const dragRef = useRef<{ pointerId: number; startX: number; maxX: number } | null>(null)
  const sparkleTimerRef = useRef<number | null>(null)
  const motionTimerRef = useRef<number | null>(null)
  const effectTimerRef = useRef<number | null>(null)
  const burnTimerRef = useRef<number | null>(null)
  const burnSaveRef = useRef(false)
  const talismanSaveRef = useRef(false)
  const talismanButtonRef = useRef<HTMLButtonElement>(null)
  const talismanDialogRef = useRef<HTMLElement>(null)
  const replacementDialogRef = useRef<HTMLElement>(null)
  const attachedDialogRef = useRef<HTMLElement>(null)
  const spellDialogRef = useRef<HTMLElement>(null)
  const burnDialogRef = useRef<HTMLElement>(null)
  const burnButtonRef = useRef<HTMLButtonElement>(null)
  const spellButtonRef = useRef<HTMLButtonElement>(null)
  const roomPageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    mountedRef.current = true
    let active = true
    setLoadError('')
    setDoll(null)
    markDollUsed(dollId)
      .then((record) => {
        if (!active) return
        const restoredPins = Array.isArray(record.interactionState?.pins)
          ? record.interactionState.pins
          : []
        pinsRef.current = restoredPins
        confirmedPinsRef.current = restoredPins
        setPins(restoredPins)
        setDoll(record)
      })
      .catch(() => {
        if (active) setLoadError('인형을 불러오지 못했어요. 삭제되었거나 보관함을 사용할 수 없어요.')
      })

    return () => {
      active = false
      mountedRef.current = false
      if (sparkleTimerRef.current !== null) window.clearTimeout(sparkleTimerRef.current)
      if (motionTimerRef.current !== null) window.clearTimeout(motionTimerRef.current)
      if (effectTimerRef.current !== null) window.clearTimeout(effectTimerRef.current)
      if (burnTimerRef.current !== null) window.clearTimeout(burnTimerRef.current)
    }
  }, [dollId])

  useEffect(() => {
    if (!isTalismanPanelOpen) return
    const dialog = talismanDialogRef.current
    roomPageRef.current?.setAttribute('inert', '')
    dialog?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus()

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (document.querySelector('.talisman-confirm-dialog')) return
      if (event.key === 'Escape' && !talismanSaveRef.current) {
        event.preventDefault()
        setIsTalismanPanelOpen(false)
        return
      }
      if (event.key !== 'Tab' || !dialog) return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex]:not([tabindex="-1"])'))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      roomPageRef.current?.removeAttribute('inert')
      talismanButtonRef.current?.focus()
    }
  }, [isTalismanPanelOpen])

  useEffect(() => {
    if (!replacementCurseId) return
    const dialog = replacementDialogRef.current
    talismanDialogRef.current?.setAttribute('inert', '')
    dialog?.querySelector<HTMLButtonElement>('button')?.focus()

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !talismanSaveRef.current) {
        event.preventDefault()
        setReplacementCurseId(null)
        return
      }
      if (event.key !== 'Tab' || !dialog) return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled)'))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      talismanDialogRef.current?.removeAttribute('inert')
      talismanDialogRef.current?.querySelector<HTMLButtonElement>('.primary-maker-button')?.focus()
    }
  }, [replacementCurseId])

  useEffect(() => {
    if (!isAttachedPanelOpen) return
    const dialog = attachedDialogRef.current
    roomPageRef.current?.setAttribute('inert', '')
    dialog?.querySelector<HTMLButtonElement>('button')?.focus()

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (document.querySelector('.talisman-burn-dialog')) return
      if (event.key === 'Escape') {
        event.preventDefault()
        setIsAttachedPanelOpen(false)
        return
      }
      if (event.key !== 'Tab' || !dialog) return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled)'))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      roomPageRef.current?.removeAttribute('inert')
      talismanButtonRef.current?.focus()
    }
  }, [isAttachedPanelOpen])

  useEffect(() => {
    if (!isSpellPanelOpen) return
    const dialog = spellDialogRef.current
    roomPageRef.current?.setAttribute('inert', '')
    dialog?.querySelector<HTMLButtonElement>('.spell-hold-button')?.focus()

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setIsSpellPanelOpen(false)
        setIsCasting(false)
        return
      }
      if (event.key !== 'Tab' || !dialog) return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled)'))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      roomPageRef.current?.removeAttribute('inert')
      spellButtonRef.current?.focus()
    }
  }, [isSpellPanelOpen])

  useEffect(() => {
    if (!isBurnConfirmationOpen) return
    const dialog = burnDialogRef.current
    attachedDialogRef.current?.setAttribute('inert', '')
    dialog?.querySelector<HTMLButtonElement>('button')?.focus()

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setIsBurnConfirmationOpen(false)
        return
      }
      if (event.key !== 'Tab' || !dialog) return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled)'))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      attachedDialogRef.current?.removeAttribute('inert')
      burnButtonRef.current?.focus()
    }
  }, [isBurnConfirmationOpen])

  const openTalismanPanel = () => {
    if (isTalismanBurning) return
    const attachedCurse = getCurseById(attachedCurseId)
    setActiveTool('talisman')
    if (attachedCurseId) {
      setNotice(`${attachedCurse?.name ?? '현재'} 부적이 붙어 있어요.`)
      setIsAttachedPanelOpen(true)
      return
    }
    setCurseTab(attachedCurse?.category ?? 'occult')
    setSelectedCurseId(attachedCurseId)
    setReplacementCurseId(null)
    setTalismanError('')
    setNotice('부적을 선택해 미리본 뒤 붙여주세요.')
    setIsTalismanPanelOpen(true)
  }

  const chooseAnotherTalisman = () => {
    const attachedCurse = getCurseById(attachedCurseId)
    setCurseTab(attachedCurse?.category ?? 'occult')
    setSelectedCurseId(attachedCurseId)
    setReplacementCurseId(null)
    setTalismanError('')
    setIsAttachedPanelOpen(false)
    setIsTalismanPanelOpen(true)
  }

  const showCurseEffect = useCallback((curseId: CurseId, enhanced = false) => {
    if (effectTimerRef.current !== null) window.clearTimeout(effectTimerRef.current)
    setEffectCurseId(curseId)
    setIsEffectEnhanced(enhanced)
    setShowChantBurst(enhanced)
    effectTimerRef.current = window.setTimeout(() => {
      if (!mountedRef.current) return
      setEffectCurseId(null)
      setIsEffectEnhanced(false)
      setShowChantBurst(false)
    }, enhanced ? 1600 : 1400)
  }, [])

  const handleCastingChange = useCallback((casting: boolean) => {
    setIsCasting(casting)
  }, [])

  const completeSpell = useCallback(() => {
    if (!attachedCurseId) return
    setNotice('주문이 완성됐어요')
    showCurseEffect(attachedCurseId, true)
  }, [attachedCurseId, showCurseEffect])

  const finishTalismanBurn = useCallback(async () => {
    if (burnSaveRef.current || !mountedRef.current) return
    burnSaveRef.current = true
    if (burnTimerRef.current !== null) {
      window.clearTimeout(burnTimerRef.current)
      burnTimerRef.current = null
    }
      setSaveStatus('saving')
      try {
        const latest = await getDoll(dollId)
        if (!latest) throw new Error('not-found')
        const updated = await updateDoll(dollId, {
          interactionState: {
            ...latest.interactionState,
            selectedCurse: null,
            talismanStatus: null,
          },
          lastUsedAt: new Date().toISOString(),
        })
        if (!mountedRef.current) return
        setDoll(updated)
        setSelectedCurseId(null)
        setActiveTool(null)
        setSaveStatus('saved')
        setNotice('모든 저주는 화면 속에서 끝났습니다')
      } catch {
        if (!mountedRef.current) return
        setSaveStatus('error')
        setNotice('부적 상태를 저장하지 못했어요. 다시 시도해 주세요.')
      } finally {
        burnSaveRef.current = false
        if (mountedRef.current) setIsTalismanBurning(false)
      }
  }, [dollId])

  const startTalismanBurn = () => {
    if (!attachedCurseId || isTalismanBurning) return
    burnSaveRef.current = false
    setIsBurnConfirmationOpen(false)
    setIsAttachedPanelOpen(false)
    setIsTalismanBurning(true)
    setEffectCurseId(null)
    setShowChantBurst(false)
    setNotice(`${getCurseById(attachedCurseId)?.name ?? '현재'} 부적을 태우는 중이에요.`)

    if (burnTimerRef.current !== null) window.clearTimeout(burnTimerRef.current)
    burnTimerRef.current = window.setTimeout(() => void finishTalismanBurn(), TALISMAN_BURN_DURATION_MS)
  }

  const closeTalismanPanel = () => {
    if (talismanSaveRef.current) return
    setReplacementCurseId(null)
    setIsTalismanPanelOpen(false)
    setTalismanError('')
  }

  const saveTalisman = async (curseId: CurseId) => {
    if (talismanSaveRef.current) return
    talismanSaveRef.current = true
    setIsTalismanSaving(true)
    setSaveStatus('saving')
    setTalismanError('')
    setNotice('부적을 저장하는 중이에요.')

    try {
      const latest = await getDoll(dollId)
      if (!latest) throw new Error('not-found')
      const updated = await updateDoll(dollId, {
        interactionState: {
          ...latest.interactionState,
          selectedCurse: curseId,
          talismanStatus: 'attached',
        },
        lastUsedAt: new Date().toISOString(),
      })
      if (!mountedRef.current) return

      const curse = getCurseById(curseId)
      setDoll(updated)
      setSaveStatus('saved')
      setNotice(`${curse?.name ?? '선택한'} 부적을 붙였어요.`)
      setReplacementCurseId(null)
      setIsTalismanPanelOpen(false)
      showCurseEffect(curseId)
    } catch {
      if (!mountedRef.current) return
      setSaveStatus('error')
      setTalismanError('부적을 저장하지 못했어요. 기존 부적은 그대로 유지됩니다.')
      setNotice('부적 저장에 실패했어요. 기존 상태를 유지합니다.')
      setReplacementCurseId(null)
    } finally {
      talismanSaveRef.current = false
      if (mountedRef.current) setIsTalismanSaving(false)
    }
  }

  const requestTalismanAttach = () => {
    if (!selectedCurseId || talismanSaveRef.current) return
    if (attachedCurseId && attachedCurseId !== selectedCurseId) {
      setReplacementCurseId(selectedCurseId)
      return
    }
    void saveTalisman(selectedCurseId)
  }

  const queuePinsSave = (nextPins: Pin[]) => {
    pinsRef.current = nextPins
    setPins(nextPins)
    setSaveStatus('saving')
    setNotice('')
    const version = ++saveVersionRef.current

    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const latest = await getDoll(dollId)
        if (!latest) throw new Error('not-found')
        const updated = await updateDoll(dollId, {
          interactionState: {
            ...latest.interactionState,
            pins: nextPins,
          },
          lastUsedAt: new Date().toISOString(),
        })
        confirmedPinsRef.current = nextPins
        if (mountedRef.current && version === saveVersionRef.current) {
          setDoll(updated)
          setSaveStatus('saved')
        }
      })
      .catch(() => {
        if (mountedRef.current && version === saveVersionRef.current) {
          pinsRef.current = confirmedPinsRef.current
          setPins(confirmedPinsRef.current)
          setSaveStatus('error')
          setNotice('바늘 상태를 저장하지 못했어요. 저장된 상태로 되돌렸습니다. 다시 시도해 주세요.')
        }
      })
  }

  const showPinReaction = (pin: Pin) => {
    setSparkle({ id: pin.id, x: pin.x, y: pin.y })
    setIsFlinching(true)
    if (sparkleTimerRef.current !== null) window.clearTimeout(sparkleTimerRef.current)
    if (motionTimerRef.current !== null) window.clearTimeout(motionTimerRef.current)
    sparkleTimerRef.current = window.setTimeout(() => setSparkle(null), 520)
    motionTimerRef.current = window.setTimeout(() => setIsFlinching(false), 360)
  }

  const addPinAt = (x: number, y: number) => {
    if (!isInsideDoll(x, y)) {
      setNotice('인형의 얼굴, 몸, 팔 또는 다리 안쪽을 선택해 주세요.')
      return
    }
    const pin: Pin = {
      id: createPinId(),
      x,
      y,
      angle: pinAngle(x, y, pinsRef.current.length),
      createdAt: new Date().toISOString(),
    }
    const nextPins = [...pinsRef.current, pin]
    showPinReaction(pin)
    queuePinsSave(nextPins)
  }

  const handleDollClick = (event: MouseEvent<HTMLDivElement>) => {
    if (activeTool !== 'needle') return
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    addPinAt(
      Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    )
  }

  const handleDollKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (activeTool !== 'needle') return
    const movement: Record<string, { x: number; y: number }> = {
      ArrowLeft: { x: -.03, y: 0 },
      ArrowRight: { x: .03, y: 0 },
      ArrowUp: { x: 0, y: -.03 },
      ArrowDown: { x: 0, y: .03 },
    }
    if (movement[event.key]) {
      event.preventDefault()
      const delta = movement[event.key]
      setKeyboardPoint((current) => ({
        x: Math.min(.86, Math.max(.14, current.x + delta.x)),
        y: Math.min(.94, Math.max(.08, current.y + delta.y)),
      }))
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      addPinAt(keyboardPoint.x, keyboardPoint.y)
    }
  }

  const startShake = (event: PointerEvent<HTMLDivElement>) => {
    if (activeTool !== 'shake') return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const maxX = Math.max(36, Math.min(rect.width * .3, window.innerWidth * .22))
    const startX = Number.isFinite(event.clientX) ? event.clientX : 0
    dragRef.current = { pointerId: event.pointerId, startX, maxX }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setIsReturning(false)
  }

  const moveShake = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return
    event.preventDefault()
    const clientX = Number.isFinite(event.clientX) ? event.clientX : dragRef.current.startX
    const nextX = Math.min(dragRef.current.maxX, Math.max(-dragRef.current.maxX, clientX - dragRef.current.startX))
    setShakeX(nextX)
    setShakeAngle((nextX / dragRef.current.maxX) * 12)
  }

  const endShake = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    dragRef.current = null
    setIsReturning(true)
    setShakeX(0)
    setShakeAngle(0)
    if (motionTimerRef.current !== null) window.clearTimeout(motionTimerRef.current)
    motionTimerRef.current = window.setTimeout(() => setIsReturning(false), 480)
  }

  if (loadError) {
    return (
      <div className="curse-room-shell">
        <main className="curse-room-error" id="main-content">
          <h1>저주방을 열 수 없어요</h1>
          <p role="alert">{loadError}</p>
          <button type="button" className="primary-maker-button" onClick={onOpenArchive}>보관함으로 돌아가기</button>
        </main>
      </div>
    )
  }

  if (!doll) {
    return <div className="curse-room-shell"><p className="curse-room-loading" role="status">인형을 불러오는 중이에요</p></div>
  }

  const saveLabel = saveStatus === 'saving' ? '저장 중' : saveStatus === 'error' ? '저장 실패' : '저장됨'

  return (
    <div className="curse-room-shell">
      <div className="curse-room-page" ref={roomPageRef}>
        <header className="curse-room-header">
        <button type="button" className="room-exit-button" onClick={onExit}>← 나가기</button>
        <h1>{doll.name}</h1>
        <div className="room-header-actions">
          <span className={`room-save-status is-${saveStatus}`} role="status" aria-live="polite">{saveLabel}</span>
          <button type="button" className="room-archive-button" onClick={onOpenArchive}>보관함</button>
        </div>
        </header>

        <main className="curse-room-main" id="main-content">
        <section className="curse-room-stage" aria-label={`${doll.name} 인형 상호작용 영역`}>
          <div className="room-paper-halo" aria-hidden="true" />
          <div
            className={`room-doll-transform${isFlinching ? ' is-flinching' : ''}${isReturning ? ' is-returning' : ''}`}
            data-testid="room-doll-transform"
            style={{ transform: `translateX(${shakeX}px) rotate(${shakeAngle}deg)` }}
          >
            <div className="composite-doll room-composite" style={ROOM_COMPOSITE_STYLE}>
              <img
                className="composite-doll-base"
                src={dollFemaleBase}
                alt={`${doll.name} 여성형 헝겊인형`}
                draggable={false}
              />
              <div className="face-layer" aria-hidden="true">
                {faceUrl && <img className="room-face-image" src={faceUrl} alt="" draggable={false} />}
              </div>
              <div className="name-layer" aria-label={`대상 이름 ${doll.name}`} data-name-length={Array.from(doll.name).length}>
                {Array.from(doll.name).map((character, index) => (
                  <span key={`${character}-${index}`} aria-hidden="true">{character}</span>
                ))}
              </div>
              {attachedCurseId && (
                <div className={`talisman-layer${isTalismanBurning ? ' is-burning' : ''}${isCasting ? ' is-casting' : ''}`}>
                  <TalismanPaper curseId={attachedCurseId} />
                  {isTalismanBurning && <TalismanBurnEffect onComplete={() => void finishTalismanBurn()} />}
                </div>
              )}
              <div
                className={`room-doll-hit-area is-${activeTool ?? 'idle'}`}
                role="application"
                tabIndex={0}
                aria-label={activeTool === 'needle'
                  ? '인형 바늘 위치 선택. 방향키로 위치를 움직이고 Enter 또는 Space로 바늘을 꽂습니다.'
                  : activeTool === 'shake'
                    ? '인형 흔들기 영역. 포인터로 잡아 좌우로 움직이세요.'
                    : '인형 영역. 먼저 아래에서 도구를 선택하세요.'}
                onClick={handleDollClick}
                onKeyDown={handleDollKeyDown}
                onPointerDown={startShake}
                onPointerMove={moveShake}
                onPointerUp={endShake}
                onPointerCancel={endShake}
              >
                {activeTool === 'needle' && (
                  <span
                    className="keyboard-pin-cursor"
                    aria-hidden="true"
                    style={{ left: `${keyboardPoint.x * 100}%`, top: `${keyboardPoint.y * 100}%` }}
                  />
                )}
                {pins.map((pin) => (
                  <button
                    type="button"
                    key={pin.id}
                    className="doll-pin"
                    style={{
                      '--pin-x': `${pin.x * 100}%`,
                      '--pin-y': `${pin.y * 100}%`,
                      '--pin-angle': `${pin.angle}deg`,
                    } as CSSProperties}
                    aria-label={`${doll.name} 인형의 바늘 제거`}
                    onClick={(event) => {
                      event.stopPropagation()
                      queuePinsSave(pinsRef.current.filter((candidate) => candidate.id !== pin.id))
                    }}
                  >
                    <img src={needleImage} alt="" aria-hidden="true" draggable={false} />
                  </button>
                ))}
                {sparkle && (
                  <span
                    className="pin-sparkle"
                    aria-hidden="true"
                    style={{ left: `${sparkle.x * 100}%`, top: `${sparkle.y * 100}%` }}
                  >✦</span>
                )}
              </div>
              {effectCurseId && <CurseEffect curseId={effectCurseId} enhanced={isEffectEnhanced} />}
              {showChantBurst && <ChantBurst />}
            </div>
          </div>
        </section>

        <section className="tool-chest" aria-labelledby="tool-chest-title">
          <div className="tool-chest-heading">
            <div>
              <p>나무 작업함</p>
              <h2 id="tool-chest-title">도구 선택</h2>
            </div>
            <div className="needle-actions">
              <button
                type="button"
                disabled={activeTool !== 'needle'}
                onClick={() => addPinAt(.5, .55)}
              >인형 중앙에 바늘 꽂기</button>
              <button
                type="button"
                disabled={pins.length === 0}
                onClick={() => queuePinsSave([])}
              >바늘 모두 빼기</button>
            </div>
          </div>

          <div className="room-tools" role="toolbar" aria-label="저주방 도구">
            <button type="button" className={activeTool === 'needle' ? 'is-selected' : ''} aria-pressed={activeTool === 'needle'} onClick={() => { setActiveTool('needle'); setNotice('인형 안쪽을 누르거나 키보드로 위치를 정해 바늘을 꽂아보세요.') }}><span aria-hidden="true">✦</span>바늘</button>
            <button type="button" className={activeTool === 'shake' ? 'is-selected' : ''} aria-pressed={activeTool === 'shake'} onClick={() => { setActiveTool('shake'); setNotice('인형을 잡고 좌우로 흔들어보세요.') }}><span aria-hidden="true">↔</span>흔들기</button>
            <button
              type="button"
              ref={talismanButtonRef}
              className={activeTool === 'talisman' ? 'is-selected' : ''}
              aria-pressed={activeTool === 'talisman'}
              disabled={isTalismanBurning}
              onClick={openTalismanPanel}
            ><span aria-hidden="true">▤</span>부적</button>
            <button type="button" aria-pressed="false" onClick={() => setNotice('다음 단계에서 제공됩니다')}><span aria-hidden="true">◇</span>인형 태우기</button>
            <button
              type="button"
              ref={spellButtonRef}
              className={activeTool === 'spell' ? 'is-selected' : ''}
              aria-pressed={activeTool === 'spell'}
              disabled={!attachedCurseId || isTalismanBurning}
              onClick={() => {
                if (!attachedCurseId || isTalismanBurning) return
                setActiveTool('spell')
                setNotice(`${getCurseById(attachedCurseId)?.name ?? '현재'} 부적의 주문을 준비합니다.`)
                setIsSpellPanelOpen(true)
              }}
            ><span aria-hidden="true">◇</span>주문 외우기</button>
            <button type="button" aria-pressed="false" onClick={() => setNotice('다음 단계에서 제공됩니다')}><span aria-hidden="true">◇</span>정화하기</button>
          </div>
          {!attachedCurseId && <p className="tool-requirement">먼저 부적을 붙여 주세요</p>}
          <p className="room-notice" role={saveStatus === 'error' ? 'alert' : 'status'} aria-live="polite">{notice}</p>
        </section>
        </main>
      </div>

      {isTalismanPanelOpen && (
        <TalismanPanel
          dialogRef={talismanDialogRef}
          tab={curseTab}
          selectedCurseId={selectedCurseId}
          attachedCurseId={attachedCurseId}
          isSaving={isTalismanSaving}
          error={talismanError}
          onTabChange={(nextTab) => {
            setCurseTab(nextTab)
            setTalismanError('')
          }}
          onSelect={(curseId) => {
            setSelectedCurseId(curseId)
            setTalismanError('')
          }}
          onAttach={requestTalismanAttach}
          onClose={closeTalismanPanel}
        />
      )}

      {replacementCurseId && attachedCurseId && (
        <TalismanReplacementDialog
          dialogRef={replacementDialogRef}
          currentCurseId={attachedCurseId}
          nextCurseId={replacementCurseId}
          isSaving={isTalismanSaving}
          onCancel={() => setReplacementCurseId(null)}
          onConfirm={() => void saveTalisman(replacementCurseId)}
        />
      )}

      {isAttachedPanelOpen && attachedCurseId && (
        <AttachedTalismanPanel
          dialogRef={attachedDialogRef}
          curseId={attachedCurseId}
          busy={isTalismanBurning}
          burnButtonRef={burnButtonRef}
          onChooseAnother={chooseAnotherTalisman}
          onRequestBurn={() => setIsBurnConfirmationOpen(true)}
          onClose={() => setIsAttachedPanelOpen(false)}
        />
      )}

      {isSpellPanelOpen && attachedCurseId && (
        <SpellPanel
          dialogRef={spellDialogRef}
          curseId={attachedCurseId}
          onClose={() => { setIsSpellPanelOpen(false); setIsCasting(false) }}
          onCastingChange={handleCastingChange}
          onComplete={completeSpell}
        />
      )}

      {isBurnConfirmationOpen && attachedCurseId && (
        <TalismanBurnDialog
          dialogRef={burnDialogRef}
          curseId={attachedCurseId}
          busy={isTalismanBurning}
          onCancel={() => setIsBurnConfirmationOpen(false)}
          onConfirm={startTalismanBurn}
        />
      )}
    </div>
  )
}

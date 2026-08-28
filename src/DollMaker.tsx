import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import dollFemaleBase from '../assets/characters/doll-female-base-v1.png'
import {
  DOLL_LIMIT_MESSAGE,
  createDoll,
  updateDoll,
} from './dollDatabase'
import {
  clampPhotoPosition,
  countNameCharacters,
  createAdjustedFaceWebP,
  decodePhoto,
  getPhotoLayout,
  isValidDollName,
  normalizeRotation,
  validatePhotoFile,
  type DecodedPhoto,
  type PhotoPosition,
} from './imageProcessing'

type Step = 1 | 2 | 3

type SelectedPhoto = {
  fileName: string
  url: string
  width: number
  height: number
}

type CompletedDoll = {
  name: string
  faceBlob: Blob
  zoom: number
  position: PhotoPosition
  rotation: number
}

type DollMakerProps = {
  onHome: () => void
  onOpenArchive: () => void
  onEnterCurseRoom: (dollId: string) => void
}

const INITIAL_POSITION = { x: 0, y: 0 }

const COMPOSITE_STYLE = {
  '--face-left': '30%',
  '--face-top': '13.5%',
  '--face-width': '40%',
  '--face-height': '26%',
  '--name-left': '43%',
  '--name-top': '47.5%',
  '--name-width': '14%',
  '--name-height': '28%',
} as CSSProperties

function DollPreview({
  photo,
  zoom,
  position,
  rotation,
  name,
  editable,
  onPositionChange,
}: {
  photo: SelectedPhoto | null
  zoom: number
  position: PhotoPosition
  rotation: number
  name: string
  editable: boolean
  onPositionChange: (position: PhotoPosition) => void
}) {
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    origin: PhotoPosition
  } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const dimensions = photo ? { width: photo.width, height: photo.height } : null
  const layout = dimensions ? getPhotoLayout(dimensions, zoom, rotation) : null

  const moveTo = (next: PhotoPosition) => {
    if (!dimensions) return
    onPositionChange(clampPhotoPosition(next, dimensions, zoom, rotation))
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!editable || !photo) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: position,
    }
    setIsDragging(true)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!editable || !drag || drag.pointerId !== event.pointerId) return
    const bounds = event.currentTarget.getBoundingClientRect()
    moveTo({
      x: drag.origin.x + (event.clientX - drag.startX) / Math.max(bounds.width, 1),
      y: drag.origin.y + (event.clientY - drag.startY) / Math.max(bounds.height, 1),
    })
  }

  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    setIsDragging(false)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!editable || !photo) return
    const amount = event.shiftKey ? 0.04 : 0.015
    const movement: Record<string, PhotoPosition> = {
      ArrowLeft: { x: -amount, y: 0 },
      ArrowRight: { x: amount, y: 0 },
      ArrowUp: { x: 0, y: -amount },
      ArrowDown: { x: 0, y: amount },
    }
    const delta = movement[event.key]
    if (!delta) return
    event.preventDefault()
    moveTo({ x: position.x + delta.x, y: position.y + delta.y })
  }

  const photoStyle = layout
    ? ({
        width: `${layout.width * 100}%`,
        height: `${layout.height * 100}%`,
        left: `calc(50% + ${position.x * 100}%)`,
        top: `calc(50% + ${position.y * 100}%)`,
        transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
      } as CSSProperties)
    : undefined

  return (
    <div className="preview-card" aria-label="인형 최종 미리보기">
      <div className="preview-halo" aria-hidden="true" />
      <div className="composite-doll" style={COMPOSITE_STYLE}>
        <img
          className="composite-doll-base"
          src={dollFemaleBase}
          alt="얼굴이 비어 있는 여성형 헝겊인형"
          data-layer="doll"
        />
        <div
          className={`face-layer${editable ? ' is-editable' : ''}${isDragging ? ' is-dragging' : ''}`}
          role={editable ? 'group' : undefined}
          aria-label={editable ? '얼굴 사진 위치 조절 영역' : undefined}
          tabIndex={editable ? 0 : undefined}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onLostPointerCapture={() => {
            dragRef.current = null
            setIsDragging(false)
          }}
          onKeyDown={handleKeyDown}
          data-layer="face"
        >
          {photo && (
            <img
              className="face-photo"
              src={photo.url}
              alt="업로드한 얼굴 사진"
              draggable="false"
              style={photoStyle}
            />
          )}
        </div>
        <div
          className="name-layer"
          aria-label={name ? `대상 이름 ${name}` : undefined}
          data-layer="name"
          data-name-length={Array.from(name).length || undefined}
        >
          {Array.from(name).map((character, index) => (
            <span key={`${character}-${index}`} aria-hidden="true">{character}</span>
          ))}
        </div>
      </div>
      <p className="preview-caption">
        {editable ? '사진을 드래그하거나 방향키로 얼굴 위치를 맞춰주세요' : '얼굴 · 인형 · 이름이 각각의 레이어로 포개집니다'}
      </p>
    </div>
  )
}

function StepProgress({ current }: { current: Step }) {
  const labels = ['사진 올리기', '얼굴 맞추기', '이름과 확인']

  return (
    <ol className="step-progress" aria-label="인형 만들기 진행 단계">
      {labels.map((label, index) => {
        const step = (index + 1) as Step
        return (
          <li
            key={label}
            className={current === step ? 'is-current' : current > step ? 'is-complete' : ''}
            aria-current={current === step ? 'step' : undefined}
          >
            <span>{current > step ? '✓' : step}</span>
            <strong>{label}</strong>
          </li>
        )
      })}
    </ol>
  )
}

export default function DollMaker({ onHome, onOpenArchive, onEnterCurseRoom }: DollMakerProps) {
  const [step, setStep] = useState<Step>(1)
  const [photo, setPhoto] = useState<SelectedPhoto | null>(null)
  const [photoError, setPhotoError] = useState('')
  const [isDecoding, setIsDecoding] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [position, setPosition] = useState<PhotoPosition>(INITIAL_POSITION)
  const [quarterTurnRotation, setQuarterTurnRotation] = useState(0)
  const [fineRotation, setFineRotation] = useState(0)
  const [targetName, setTargetName] = useState('')
  const [completedDoll, setCompletedDoll] = useState<CompletedDoll | null>(null)
  const [completionError, setCompletionError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [savedDollId, setSavedDollId] = useState('')
  const sourceRef = useRef<DecodedPhoto | null>(null)
  const objectUrlRef = useRef('')
  const mountedRef = useRef(true)

  const normalizedName = targetName.trim()
  const nameLength = countNameCharacters(targetName)
  const validName = isValidDollName(targetName)
  const finalRotation = normalizeRotation(quarterTurnRotation + fineRotation)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      sourceRef.current?.close?.()
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [])

  const replacePhoto = async (file: File) => {
    const validationError = validatePhotoFile(file)
    if (validationError) {
      setPhotoError(validationError)
      return
    }

    setPhotoError('')
    setIsDecoding(true)
    const nextUrl = URL.createObjectURL(file)

    try {
      const decoded = await decodePhoto(file, nextUrl)
      if (!mountedRef.current) {
        decoded.close?.()
        URL.revokeObjectURL(nextUrl)
        return
      }

      sourceRef.current?.close?.()
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
      sourceRef.current = decoded
      objectUrlRef.current = nextUrl
      setPhoto({
        fileName: file.name,
        url: nextUrl,
        width: decoded.width,
        height: decoded.height,
      })
      setZoom(1)
      setPosition(INITIAL_POSITION)
      setQuarterTurnRotation(0)
      setFineRotation(0)
      setCompletedDoll(null)
    } catch {
      URL.revokeObjectURL(nextUrl)
      setPhotoError('사진을 불러오지 못했어요. 다른 사진을 선택해주세요.')
    } finally {
      if (mountedRef.current) setIsDecoding(false)
    }
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) void replacePhoto(file)
  }

  const handleZoomChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!photo) return
    const nextZoom = Number(event.target.value)
    setZoom(nextZoom)
    setPosition((current) => clampPhotoPosition(current, photo, nextZoom, finalRotation))
    setCompletedDoll(null)
  }

  const updateRotation = (nextQuarterTurn: number, nextFineRotation: number) => {
    const normalizedQuarterTurn = ((nextQuarterTurn % 360) + 360) % 360
    const nextFinalRotation = normalizeRotation(normalizedQuarterTurn + nextFineRotation)
    setQuarterTurnRotation(normalizedQuarterTurn)
    setFineRotation(nextFineRotation)
    if (photo) {
      setPosition((current) => (
        clampPhotoPosition(current, photo, zoom, nextFinalRotation)
      ))
    }
    setCompletedDoll(null)
  }

  const resetFace = () => {
    setZoom(1)
    setPosition(INITIAL_POSITION)
    setQuarterTurnRotation(0)
    setFineRotation(0)
    setCompletedDoll(null)
  }

  const finishDoll = async () => {
    if (!validName || !photo || !sourceRef.current) return
    setCompletionError('')
    setIsSaving(true)
    try {
      const faceBlob = await createAdjustedFaceWebP(
        sourceRef.current.source,
        photo,
        zoom,
        position,
        finalRotation,
      )
      const savedDoll = savedDollId
        ? await updateDoll(savedDollId, {
            name: normalizedName,
            faceBlob,
            lastUsedAt: new Date().toISOString(),
          })
        : await createDoll({ name: normalizedName, faceBlob })
      setSavedDollId(savedDoll.id)
      setTargetName(normalizedName)
      setCompletedDoll({
        name: normalizedName,
        faceBlob,
        zoom,
        position,
        rotation: finalRotation,
      })
    } catch (error) {
      setCompletionError(error instanceof Error ? error.message : '인형을 저장하지 못했어요. 다시 시도해 주세요.')
    } finally {
      setIsSaving(false)
    }
  }

  const nameMessage = useMemo(() => {
    if (!targetName) return '대상 이름은 필수예요.'
    if (!normalizedName) return '공백만으로는 이름을 만들 수 없어요.'
    if (nameLength > 4) return '이름은 한글 기준 최대 4글자까지 입력할 수 있어요.'
    return `${nameLength}/4글자`
  }, [nameLength, normalizedName, targetName])

  if (completedDoll) {
    return (
      <div className="maker-shell">
        <header className="maker-header">
          <button type="button" className="home-button" onClick={onHome}>← 홈으로</button>
          <p>속풀이 인형 공방</p>
        </header>
        <main className="completion-screen" id="main-content">
          <section className="completion-copy" aria-labelledby="completion-title">
            <p className="maker-eyebrow">바느질을 마쳤어요</p>
            <h1 id="completion-title">인형이 완성됐어요</h1>
            <p className="completion-name">{completedDoll.name} 인형</p>
            <p>인형이 보관함에 저장됐어요</p>
            <div className="completion-actions">
              <button
                type="button"
                className="secondary-maker-button"
                onClick={() => {
                  setCompletedDoll(null)
                  setStep(2)
                }}
              >
                이전 단계로 돌아가 수정하기
              </button>
              <button type="button" className="primary-maker-button" onClick={onOpenArchive}>보관함 보기</button>
              <button
                type="button"
                className="primary-maker-button"
                disabled={!savedDollId}
                onClick={() => savedDollId && onEnterCurseRoom(savedDollId)}
              >
                저주방 들어가기
              </button>
            </div>
          </section>
          <DollPreview
            photo={photo}
            zoom={completedDoll.zoom}
            position={completedDoll.position}
            rotation={completedDoll.rotation}
            name={completedDoll.name}
            editable={false}
            onPositionChange={() => undefined}
          />
        </main>
      </div>
    )
  }

  return (
    <div className="maker-shell">
      <header className="maker-header">
        <button type="button" className="home-button" onClick={onHome}>← 홈으로</button>
        <p>속풀이 인형 공방</p>
      </header>

      <main className="maker-main" id="main-content">
        <div className="maker-intro">
          <div>
            <p className="maker-eyebrow">나만의 헝겊인형</p>
            <h1>새 인형 만들기</h1>
          </div>
          <StepProgress current={step} />
        </div>

        <div className="maker-layout">
          <section className="maker-panel" aria-labelledby={`step-${step}-title`}>
            {step === 1 && (
              <>
                <p className="step-number">1단계</p>
                <h2 id="step-1-title">사진 올리기</h2>
                <p className="step-description">얼굴이 잘 보이는 사진을 골라주세요. JPG, PNG, WebP 파일을 10MB까지 사용할 수 있어요.</p>
                <label className="file-picker">
                  <span aria-hidden="true">＋</span>
                  <strong>{photo ? '다른 사진 선택' : '얼굴 사진 선택'}</strong>
                  <small>기기에서 파일 고르기</small>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleFileChange}
                    onClick={(event) => { event.currentTarget.value = '' }}
                  />
                </label>
                {photo && <p className="selected-file">선택한 사진: {photo.fileName}</p>}
                {photoError && <p className="form-error" role="alert">{photoError}</p>}
                <p className="privacy-note"><span aria-hidden="true">▣</span> 사진은 서버로 전송되지 않아요</p>
                <button
                  type="button"
                  className="primary-maker-button"
                  disabled={!photo || isDecoding}
                  onClick={() => setStep(2)}
                >
                  {isDecoding ? '사진 불러오는 중…' : '다음 단계'}
                </button>
              </>
            )}

            {step === 2 && photo && (
              <>
                <p className="step-number">2단계</p>
                <h2 id="step-2-title">얼굴 맞추기</h2>
                <p className="step-description">오른쪽 사진을 드래그해 위치를 움직이고, 얼굴 영역을 빈틈없이 채워주세요.</p>
                <div className="zoom-control">
                  <label htmlFor="face-zoom">확대·축소 <strong>{zoom.toFixed(1)}배</strong></label>
                  <input
                    id="face-zoom"
                    type="range"
                    min="1"
                    max="3"
                    step="0.1"
                    value={zoom}
                    aria-valuetext={`${zoom.toFixed(1)}배`}
                    onChange={handleZoomChange}
                  />
                  <div aria-hidden="true"><span>최소</span><span>3배</span></div>
                </div>
                <div className="rotation-control">
                  <div className="rotation-heading">
                    <span>사진 회전</span>
                    <output aria-label="현재 최종 회전 각도" aria-live="polite">
                      {finalRotation > 0 ? '+' : ''}{finalRotation}°
                    </output>
                  </div>
                  <div className="rotation-buttons">
                    <button
                      type="button"
                      className="secondary-maker-button"
                      onClick={() => updateRotation(quarterTurnRotation - 90, fineRotation)}
                    >
                      왼쪽으로 90°
                    </button>
                    <button
                      type="button"
                      className="secondary-maker-button"
                      onClick={() => updateRotation(quarterTurnRotation + 90, fineRotation)}
                    >
                      오른쪽으로 90°
                    </button>
                  </div>
                  <label htmlFor="fine-rotation">
                    미세 회전
                    <strong>{fineRotation > 0 ? '+' : ''}{fineRotation}°</strong>
                  </label>
                  <input
                    id="fine-rotation"
                    type="range"
                    min="-30"
                    max="30"
                    step="1"
                    value={fineRotation}
                    aria-valuetext={`${fineRotation > 0 ? '+' : ''}${fineRotation}도`}
                    onChange={(event) => (
                      updateRotation(quarterTurnRotation, Number(event.target.value))
                    )}
                  />
                  <div className="rotation-range" aria-hidden="true"><span>-30°</span><span>0°</span><span>+30°</span></div>
                </div>
                <div className="adjustment-actions">
                  <button type="button" className="secondary-maker-button" onClick={resetFace}>위치 초기화</button>
                  <label className="secondary-maker-button file-reselect">
                    사진 다시 선택
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleFileChange}
                      onClick={(event) => { event.currentTarget.value = '' }}
                    />
                  </label>
                </div>
                {photoError && <p className="form-error" role="alert">{photoError}</p>}
                <p className="keyboard-tip">키보드에서는 얼굴 영역에 초점을 두고 방향키로 움직일 수 있어요.</p>
                <div className="step-actions">
                  <button type="button" className="secondary-maker-button" onClick={() => setStep(1)}>이전</button>
                  <button type="button" className="primary-maker-button" onClick={() => setStep(3)}>다음 단계</button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <p className="step-number">3단계</p>
                <h2 id="step-3-title">이름과 최종 확인</h2>
                <p className="step-description">대상 이름은 앞치마 위에 붉은 세로 붓글씨로 바로 나타나요.</p>
                <div className="name-control">
                  <label htmlFor="target-name">대상 이름 <span>필수</span></label>
                  <input
                    id="target-name"
                    type="text"
                    value={targetName}
                    aria-describedby="name-help"
                    aria-invalid={targetName.length > 0 && !validName}
                    autoComplete="off"
                    onChange={(event) => {
                      setTargetName(event.target.value)
                      setCompletedDoll(null)
                    }}
                    placeholder="한글 기준 최대 4글자"
                  />
                  <p id="name-help" className={validName ? 'form-help' : 'form-error'}>{nameMessage}</p>
                </div>
                <p className="final-check-note">사진과 이름은 현재 브라우저 메모리에서만 처리됩니다.</p>
                {completionError && <p className="form-error" role="alert">{completionError}</p>}
                {completionError === DOLL_LIMIT_MESSAGE && (
                  <button type="button" className="secondary-maker-button archive-error-link" onClick={onOpenArchive}>
                    보관함으로 이동
                  </button>
                )}
                <div className="step-actions">
                  <button type="button" className="secondary-maker-button" onClick={() => setStep(2)}>이전</button>
                  <button
                    type="button"
                    className="primary-maker-button"
                    disabled={!validName || isSaving}
                    onClick={() => void finishDoll()}
                  >
                    {isSaving ? '인형을 보관하는 중이에요' : '인형 완성'}
                  </button>
                </div>
              </>
            )}
          </section>

          <DollPreview
            photo={photo}
            zoom={zoom}
            position={position}
            rotation={finalRotation}
            name={normalizedName}
            editable={step === 2}
            onPositionChange={(next) => {
              setPosition(next)
              setCompletedDoll(null)
            }}
          />
        </div>
      </main>
    </div>
  )
}

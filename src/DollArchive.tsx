import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import dollFemaleBase from '../assets/characters/doll-female-base-v1.png'
import dollFemaleCharred from '../assets/characters/doll-female-charred-v1.png'
import {
  MAX_DOLLS,
  deleteAllDolls,
  deleteDoll,
  getAllDolls,
  markDollUsed,
  renameDoll,
  type DollRecord,
} from './dollDatabase'

const STORED_COMPOSITE_STYLE = {
  '--face-left': '30%',
  '--face-top': '13.5%',
  '--face-width': '40%',
  '--face-height': '26%',
  '--name-left': '43%',
  '--name-top': '47.5%',
  '--name-width': '14%',
  '--name-height': '28%',
} as CSSProperties

type ArchiveModal =
  | { type: 'rename'; doll: DollRecord }
  | { type: 'delete'; doll: DollRecord }
  | { type: 'delete-all-first' }
  | { type: 'delete-all-second' }

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

function StoredDollPreview({ doll, large = false }: { doll: DollRecord | null; large?: boolean }) {
  const faceUrl = useBlobObjectUrl(doll?.faceBlob ?? null)
  const name = doll?.name ?? ''
  const isCharred = Boolean(
    doll?.interactionState.charredUntil
    && Date.parse(doll.interactionState.charredUntil) > Date.now(),
  )

  return (
    <div className={`stored-doll-preview${large ? ' is-large' : ''}`}>
      <div
        className="composite-doll"
        style={STORED_COMPOSITE_STYLE}
        data-charred={isCharred ? 'true' : undefined}
      >
        <img
          className="composite-doll-base"
          src={dollFemaleBase}
          alt={doll ? `${doll.name} 인형 미리보기` : '얼굴이 비어 있는 여성형 헝겊인형'}
        />
        <img
          className="composite-doll-charred"
          src={dollFemaleCharred}
          alt=""
          aria-hidden="true"
        />
        <div className="face-layer" aria-hidden="true">
          {faceUrl && <img className="stored-face-image" src={faceUrl} alt="" />}
        </div>
        <div
          className="name-layer"
          aria-label={name ? `대상 이름 ${name}` : undefined}
          data-name-length={Array.from(name).length || undefined}
        >
          {Array.from(name).map((character, index) => (
            <span key={`${character}-${index}`} aria-hidden="true">{character}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

function formatLastUsedAt(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function DollDetail({
  doll,
  onBack,
  onEnterCurseRoom,
}: {
  doll: DollRecord
  onBack: () => void
  onEnterCurseRoom: (dollId: string) => void
}) {
  return (
    <div className="archive-shell">
      <header className="archive-header">
        <button type="button" className="home-button" onClick={onBack}>← 보관함으로 돌아가기</button>
        <p>현재 브라우저에만 저장됩니다</p>
      </header>
      <main className="doll-detail" id="main-content">
        <section className="doll-detail-copy" aria-labelledby="opened-doll-title">
          <p className="maker-eyebrow">보관한 인형</p>
          <h1 id="opened-doll-title">{doll.name} 인형</h1>
          <p>저장된 얼굴과 이름으로 인형방을 열 수 있어요.</p>
          <button type="button" className="primary-maker-button" onClick={() => onEnterCurseRoom(doll.id)}>저주방 들어가기</button>
          <button type="button" className="primary-maker-button" onClick={onBack}>보관함으로 돌아가기</button>
        </section>
        <StoredDollPreview doll={doll} large />
      </main>
    </div>
  )
}

export default function DollArchive({
  onHome,
  onCreate,
  onOpen,
}: {
  onHome: () => void
  onCreate: () => void
  onOpen: (doll: DollRecord) => void
}) {
  const [dolls, setDolls] = useState<DollRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [busyDollId, setBusyDollId] = useState('')
  const [modal, setModal] = useState<ArchiveModal | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [modalError, setModalError] = useState('')
  const [isModalWorking, setIsModalWorking] = useState(false)
  const pageRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const modalWorkingRef = useRef(false)
  const isMountedRef = useRef(true)
  const openRequestIdRef = useRef(0)
  const busyDollIdRef = useRef('')
  const modalDollId = modal && 'doll' in modal ? modal.doll.id : ''

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      openRequestIdRef.current += 1
      busyDollIdRef.current = ''
    }
  }, [])

  useEffect(() => {
    let active = true
    getAllDolls()
      .then((records) => {
        if (active) setDolls(records)
      })
      .catch(() => {
        if (active) setPageError('이 브라우저에서는 인형 보관함을 불러올 수 없어요.')
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    modalWorkingRef.current = isModalWorking
  }, [isModalWorking])

  useEffect(() => {
    if (!modal) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const dialog = dialogRef.current
    pageRef.current?.setAttribute('inert', '')
    dialog?.querySelector<HTMLElement>('[data-autofocus], input, button')?.focus()

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !modalWorkingRef.current) {
        event.preventDefault()
        setModal(null)
        return
      }
      if (event.key !== 'Tab' || !dialog) return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button, input, [tabindex]:not([tabindex="-1"])'))
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

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      pageRef.current?.removeAttribute('inert')
      previouslyFocused?.focus()
    }
  }, [modal?.type, modalDollId])

  const closeModal = () => {
    if (isModalWorking) return
    setModal(null)
    setModalError('')
  }

  const openRename = (doll: DollRecord) => {
    setRenameValue(doll.name)
    setModalError('')
    setModal({ type: 'rename', doll })
  }

  const submitRename = async () => {
    if (modal?.type !== 'rename') return
    const normalized = renameValue.trim()
    const length = Array.from(normalized).length
    if (length === 0 || length > 4) {
      setModalError('이름은 한글 기준 1~4글자로 입력해 주세요.')
      return
    }

    setIsModalWorking(true)
    setModalError('')
    try {
      const updated = await renameDoll(modal.doll.id, normalized)
      setDolls((current) => current.map((doll) => doll.id === updated.id ? updated : doll))
      setSuccessMessage(`${modal.doll.name} 인형의 이름을 ${updated.name}(으)로 변경했어요.`)
      setModal(null)
    } catch {
      setModalError('이름을 저장하지 못했어요. 기존 이름은 그대로 유지됩니다.')
    } finally {
      setIsModalWorking(false)
    }
  }

  const confirmDelete = async () => {
    if (modal?.type !== 'delete') return
    setIsModalWorking(true)
    setModalError('')
    try {
      await deleteDoll(modal.doll.id)
      setDolls((current) => current.filter((doll) => doll.id !== modal.doll.id))
      setSuccessMessage(`${modal.doll.name} 인형을 삭제했어요.`)
      setModal(null)
    } catch {
      setModalError('인형을 삭제하지 못했어요. 다시 시도해 주세요.')
    } finally {
      setIsModalWorking(false)
    }
  }

  const confirmDeleteAll = async () => {
    if (modal?.type !== 'delete-all-second') return
    setIsModalWorking(true)
    setModalError('')
    try {
      await deleteAllDolls()
      setDolls([])
      setSuccessMessage('모든 인형 데이터를 삭제했어요.')
      setModal(null)
    } catch {
      setModalError('전체 데이터를 삭제하지 못했어요. 다시 시도해 주세요.')
    } finally {
      setIsModalWorking(false)
    }
  }

  const openDoll = async (doll: DollRecord) => {
    if (busyDollIdRef.current) return
    const requestId = ++openRequestIdRef.current
    busyDollIdRef.current = doll.id
    setBusyDollId(doll.id)
    setPageError('')
    try {
      const updated = await markDollUsed(doll.id)
      if (!isMountedRef.current || requestId !== openRequestIdRef.current) return
      busyDollIdRef.current = ''
      setBusyDollId('')
      onOpen(updated)
    } catch {
      if (isMountedRef.current && requestId === openRequestIdRef.current) {
        setPageError('인형을 열지 못했어요. 보관함에서 다시 시도해 주세요.')
      }
    } finally {
      if (isMountedRef.current && requestId === openRequestIdRef.current && busyDollIdRef.current) {
        busyDollIdRef.current = ''
        setBusyDollId('')
      }
    }
  }

  const handleRenameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      void submitRename()
    }
  }

  const atLimit = dolls.length >= MAX_DOLLS

  return (
    <>
      <div className="archive-shell" ref={pageRef}>
        <header className="archive-header">
          <button type="button" className="home-button" onClick={onHome}>← 홈으로</button>
          <p>현재 브라우저에만 저장됩니다</p>
        </header>
        <main className="archive-main" id="main-content">
          <div className="archive-title-row">
            <div>
              <p className="maker-eyebrow">나만의 로컬 보관함</p>
              <h1>내 인형 보관함</h1>
            </div>
            <button
              type="button"
              className="primary-maker-button"
              disabled={atLimit || isLoading || Boolean(pageError)}
              onClick={onCreate}
            >
              새 인형 만들기
            </button>
          </div>

          {atLimit && <p className="archive-limit" role="status">인형은 최대 5개까지 보관할 수 있어요. 기존 인형을 삭제한 뒤 다시 만들어 주세요.</p>}
          {pageError && <p className="archive-error" role="alert">{pageError}</p>}
          {successMessage && <p className="archive-success" role="status">{successMessage}</p>}

          {isLoading ? (
            <p className="archive-loading" role="status">보관한 인형을 불러오는 중이에요</p>
          ) : dolls.length === 0 && !pageError ? (
            <section className="archive-empty" aria-labelledby="empty-archive-title">
              <StoredDollPreview doll={null} />
              <h2 id="empty-archive-title">아직 만든 인형이 없어요</h2>
              <p>새 인형을 만들면 이 브라우저의 보관함에 차곡차곡 놓아둘게요.</p>
            </section>
          ) : (
            <section className="doll-grid" aria-label="보관한 인형 목록">
              {dolls.map((doll) => (
                <article className="doll-card" key={doll.id}>
                  <StoredDollPreview doll={doll} />
                  <h2>{doll.name}</h2>
                  <p>마지막 사용 {formatLastUsedAt(doll.lastUsedAt)}</p>
                  <div className="interaction-state-badges" aria-label={`${doll.name} 인형 상태`}>
                    {doll.interactionState.pins.length > 0 && <span>바늘 {doll.interactionState.pins.length}</span>}
                    {doll.interactionState.talismanStatus === 'attached' && <span>부적</span>}
                    {doll.interactionState.charredUntil
                      && Date.parse(doll.interactionState.charredUntil) > Date.now()
                      && <span>그을림</span>}
                    {doll.interactionState.pins.length === 0
                      && doll.interactionState.talismanStatus === null
                      && (!doll.interactionState.charredUntil
                        || Date.parse(doll.interactionState.charredUntil) <= Date.now())
                      && <span>깨끗함</span>}
                  </div>
                  <div className="doll-card-actions">
                    <button
                      type="button"
                      className="primary-maker-button"
                      disabled={Boolean(busyDollId)}
                      onClick={() => void openDoll(doll)}
                    >
                      {busyDollId === doll.id ? '여는 중…' : '열기'}
                    </button>
                    <button type="button" className="secondary-maker-button" onClick={() => openRename(doll)}>이름 변경</button>
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => {
                        setModalError('')
                        setModal({ type: 'delete', doll })
                      }}
                    >
                      삭제
                    </button>
                  </div>
                </article>
              ))}
            </section>
          )}

          <footer className="archive-footer">
            <p>브라우저 데이터 삭제, 시크릿 모드 사용 또는 기기 변경 시 저장한 인형이 사라질 수 있습니다.</p>
            <button
              type="button"
              className="danger-button"
              disabled={dolls.length === 0 || isLoading}
              onClick={() => {
                setModalError('')
                setModal({ type: 'delete-all-first' })
              }}
            >
              전체 데이터 삭제
            </button>
          </footer>
        </main>
      </div>

      {modal && (
        <div className="modal-backdrop archive-modal-backdrop" onMouseDown={(event) => {
          if (event.currentTarget === event.target) closeModal()
        }}>
          <section
            className="archive-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="archive-modal-title"
            aria-describedby="archive-modal-description"
            ref={dialogRef}
          >
            <button type="button" className="modal-close" aria-label="확인창 닫기" onClick={closeModal}>×</button>

            {modal.type === 'rename' && (
              <>
                <p className="modal-kicker">이름 변경</p>
                <h2 id="archive-modal-title">{modal.doll.name} 인형의 이름을 바꿀까요?</h2>
                <p id="archive-modal-description">기존 이름: {modal.doll.name}</p>
                <label className="archive-rename-label" htmlFor="archive-rename">새 이름</label>
                <input
                  id="archive-rename"
                  data-autofocus
                  value={renameValue}
                  aria-invalid={Boolean(modalError)}
                  onChange={(event) => setRenameValue(event.target.value)}
                  onKeyDown={handleRenameKeyDown}
                />
                {modalError && <p className="form-error" role="alert">{modalError}</p>}
                <div className="modal-actions">
                  <button type="button" className="secondary-maker-button" onClick={closeModal}>취소</button>
                  <button type="button" className="primary-maker-button" disabled={isModalWorking} onClick={() => void submitRename()}>
                    {isModalWorking ? '저장 중…' : '이름 저장'}
                  </button>
                </div>
              </>
            )}

            {modal.type === 'delete' && (
              <>
                <p className="modal-kicker">인형 삭제</p>
                <h2 id="archive-modal-title">{modal.doll.name} 인형을 삭제할까요?</h2>
                <p id="archive-modal-description">사진과 이름을 포함한 이 인형 데이터는 복구할 수 없어요.</p>
                {modalError && <p className="form-error" role="alert">{modalError}</p>}
                <div className="modal-actions">
                  <button type="button" className="secondary-maker-button" data-autofocus onClick={closeModal}>취소</button>
                  <button type="button" className="danger-button" disabled={isModalWorking} onClick={() => void confirmDelete()}>
                    {isModalWorking ? '삭제 중…' : '삭제하기'}
                  </button>
                </div>
              </>
            )}

            {modal.type === 'delete-all-first' && (
              <>
                <p className="modal-kicker">첫 번째 확인</p>
                <h2 id="archive-modal-title">보관한 인형을 모두 삭제할까요?</h2>
                <p id="archive-modal-description">사진, 이름과 모든 인형 데이터가 삭제되며 복구할 수 없어요.</p>
                <div className="modal-actions">
                  <button type="button" className="secondary-maker-button" data-autofocus onClick={closeModal}>취소</button>
                  <button type="button" className="danger-button" onClick={() => setModal({ type: 'delete-all-second' })}>계속</button>
                </div>
              </>
            )}

            {modal.type === 'delete-all-second' && (
              <>
                <p className="modal-kicker">마지막 확인</p>
                <h2 id="archive-modal-title">정말 모든 데이터를 삭제할까요?</h2>
                <p id="archive-modal-description">이 작업은 되돌릴 수 없습니다. 빈 보관함으로 돌아갑니다.</p>
                {modalError && <p className="form-error" role="alert">{modalError}</p>}
                <div className="modal-actions">
                  <button type="button" className="secondary-maker-button" data-autofocus onClick={closeModal}>취소</button>
                  <button type="button" className="danger-button" disabled={isModalWorking} onClick={() => void confirmDeleteAll()}>
                    {isModalWorking ? '삭제 중…' : '모든 인형 삭제'}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </>
  )
}

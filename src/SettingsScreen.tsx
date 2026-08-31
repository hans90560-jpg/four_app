import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_DOLLS, countDolls, deleteAllDolls } from './dollDatabase'

type SettingsScreenProps = {
  onHome: () => void
  countStoredDolls?: () => Promise<number>
  deleteStoredDolls?: () => Promise<void>
}

export default function SettingsScreen({
  onHome,
  countStoredDolls = countDolls,
  deleteStoredDolls = deleteAllDolls,
}: SettingsScreenProps) {
  const [storedCount, setStoredCount] = useState<number | null>(null)
  const [loadError, setLoadError] = useState('')
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const pageRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const deleteButtonRef = useRef<HTMLButtonElement>(null)
  const isDeletingRef = useRef(false)

  const loadCount = useCallback(async () => {
    setLoadError('')
    try {
      setStoredCount(await countStoredDolls())
    } catch {
      setStoredCount(null)
      setLoadError('저장된 인형 수를 불러오지 못했어요. 다시 시도해 주세요.')
    }
  }, [countStoredDolls])

  useEffect(() => {
    let active = true
    void countStoredDolls().then(
      (count) => {
        if (active) setStoredCount(count)
      },
      () => {
        if (active) setLoadError('저장된 인형 수를 불러오지 못했어요. 다시 시도해 주세요.')
      },
    )
    return () => {
      active = false
    }
  }, [countStoredDolls])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isConfirmOpen) {
        event.preventDefault()
        onHome()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isConfirmOpen, onHome])

  useEffect(() => {
    if (!isConfirmOpen) return

    const dialog = dialogRef.current
    pageRef.current?.setAttribute('inert', '')
    dialog?.querySelector<HTMLButtonElement>('[data-autofocus]')?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!isDeletingRef.current) {
          setDeleteError('')
          setIsConfirmOpen(false)
        }
        return
      }
      if (event.key !== 'Tab' || !dialog) return

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'),
      )
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
      deleteButtonRef.current?.focus()
    }
  }, [isConfirmOpen])

  const closeConfirmation = () => {
    if (isDeletingRef.current) return
    setDeleteError('')
    setIsConfirmOpen(false)
  }

  const confirmDeleteAll = async () => {
    if (isDeletingRef.current) return
    isDeletingRef.current = true
    setIsDeleting(true)
    setDeleteError('')
    setSuccessMessage('')
    try {
      await deleteStoredDolls()
      setStoredCount(0)
      setSuccessMessage('모든 인형과 저주 상태를 삭제했어요.')
      setIsConfirmOpen(false)
    } catch {
      setDeleteError('모든 인형을 삭제하지 못했어요. 다시 시도해 주세요.')
    } finally {
      isDeletingRef.current = false
      setIsDeleting(false)
    }
  }

  return (
    <>
      <div className="settings-shell" ref={pageRef}>
        <header className="settings-header">
          <button type="button" className="home-button" onClick={onHome}>← 홈으로</button>
          <p>현재 브라우저의 로컬 데이터 설정</p>
        </header>

        <main className="settings-main" id="main-content">
          <section className="settings-heading" aria-labelledby="settings-title">
            <p className="maker-eyebrow">내 브라우저 안의 보관함</p>
            <h1 id="settings-title">설정</h1>
            <p>저장된 인형과 로컬 데이터 보관 방식을 확인하고 관리할 수 있어요.</p>
          </section>

          <section className="settings-card settings-storage-card" aria-labelledby="storage-title">
            <div>
              <p className="settings-card-kicker">로컬 보관 현황</p>
              <h2 id="storage-title">저장된 인형</h2>
            </div>
            <p className="settings-count" role="status" aria-live="polite">
              {storedCount === null ? '확인 중…' : `${storedCount}개 / 최대 ${MAX_DOLLS}개`}
            </p>
            {loadError && (
              <div className="settings-inline-error" role="alert">
                <p>{loadError}</p>
                <button type="button" className="secondary-maker-button" onClick={() => void loadCount()}>다시 불러오기</button>
              </div>
            )}
          </section>

          <section className="settings-card" aria-labelledby="privacy-title">
            <p className="settings-card-kicker">개인 콘텐츠 보관 안내</p>
            <h2 id="privacy-title">이 브라우저에만 저장돼요</h2>
            <ul className="settings-info-list">
              <li>사진과 인형 정보는 서버가 아니라 현재 브라우저에만 저장됩니다.</li>
              <li>브라우저 데이터를 삭제하거나 시크릿 모드를 사용하거나 다른 기기를 이용하면 인형이 사라질 수 있습니다.</li>
              <li>사용자 콘텐츠는 다른 사용자에게 공개되거나 공유되지 않습니다.</li>
            </ul>
          </section>

          <section className="settings-card settings-danger-card" aria-labelledby="delete-all-title">
            <div>
              <p className="settings-card-kicker">로컬 데이터 삭제</p>
              <h2 id="delete-all-title">모든 인형 삭제</h2>
              <p>사진, 이름과 인형에 저장된 모든 저주 상태를 현재 브라우저에서 삭제합니다.</p>
            </div>
            <button
              type="button"
              className="danger-button settings-delete-button"
              ref={deleteButtonRef}
              disabled={storedCount === null || storedCount === 0}
              onClick={() => {
                setDeleteError('')
                setSuccessMessage('')
                setIsConfirmOpen(true)
              }}
            >
              모든 인형 삭제
            </button>
          </section>

          {successMessage && <p className="settings-success" role="status">{successMessage}</p>}
        </main>
      </div>

      {isConfirmOpen && (
        <div className="modal-backdrop archive-modal-backdrop" onMouseDown={(event) => {
          if (event.currentTarget === event.target) closeConfirmation()
        }}>
          <section
            className="archive-modal settings-delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-delete-title"
            aria-describedby="settings-delete-description"
            ref={dialogRef}
          >
            <button type="button" className="modal-close" aria-label="전체 삭제 확인창 닫기" disabled={isDeleting} onClick={closeConfirmation}>×</button>
            <p className="modal-kicker">로컬 데이터 전체 삭제</p>
            <h2 id="settings-delete-title">모든 인형을 삭제할까요?</h2>
            <p id="settings-delete-description">저장된 인형과 모든 저주 상태가 삭제되며 복구할 수 없습니다.</p>
            {deleteError && <p className="form-error" role="alert">{deleteError}</p>}
            <div className="modal-actions">
              <button type="button" className="secondary-maker-button" data-autofocus disabled={isDeleting} onClick={closeConfirmation}>취소</button>
              <button type="button" className="danger-button" disabled={isDeleting} onClick={() => void confirmDeleteAll()}>
                {isDeleting ? '삭제 중…' : '모든 인형 삭제'}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  )
}

import { useEffect, useRef, useState } from 'react'
import dollFemaleBase from '../assets/characters/doll-female-base-v1.png'
import DollArchive, { DollDetail } from './DollArchive'
import DollMaker from './DollMaker'
import CurseRoom from './CurseRoom'
import SettingsScreen from './SettingsScreen'
import {
  DOLL_LIMIT_MESSAGE,
  MAX_DOLLS,
  countDolls,
  type DollRecord,
} from './dollDatabase'

function WorkshopDecor() {
  return (
    <div className="workshop-decor" aria-hidden="true">
      <div className="moon-lamp"><span /></div>
      <div className="fabric-scraps"><i /><i /><i /></div>
      <div className="sewing-box"><span /><i /><i /><i /></div>
      <div className="thread-ball"><span /></div>
      <div className="talisman-stack"><span /><span /><span /></div>
    </div>
  )
}

function App() {
  const [screen, setScreen] = useState<'home' | 'maker' | 'archive' | 'detail' | 'curse-room' | 'settings'>('home')
  const [openedDoll, setOpenedDoll] = useState<DollRecord | null>(null)
  const [curseRoomDollId, setCurseRoomDollId] = useState('')
  const [notice, setNotice] = useState('')
  const [isCheckingLimit, setIsCheckingLimit] = useState(false)
  const [showArchiveLink, setShowArchiveLink] = useState(false)
  const [isInfoOpen, setIsInfoOpen] = useState(false)
  const infoButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }, [screen])

  useEffect(() => {
    if (!isInfoOpen) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const dialog = dialogRef.current
    pageRef.current?.setAttribute('inert', '')
    dialog?.querySelector<HTMLButtonElement>('button')?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setIsInfoOpen(false)
        return
      }

      if (event.key !== 'Tab' || !dialog) return
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])'),
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
      ;(previouslyFocused ?? infoButtonRef.current)?.focus()
    }
  }, [isInfoOpen])

  const startDollMaker = async () => {
    setIsCheckingLimit(true)
    setNotice('')
    setShowArchiveLink(false)
    try {
      const count = await countDolls()
      if (count >= MAX_DOLLS) {
        setNotice(DOLL_LIMIT_MESSAGE)
        setShowArchiveLink(true)
        return
      }
      setScreen('maker')
    } catch {
      setNotice('이 브라우저에서는 인형 보관함을 사용할 수 없어요.')
    } finally {
      setIsCheckingLimit(false)
    }
  }

  if (screen === 'maker') {
    return (
      <DollMaker
        onHome={() => setScreen('home')}
        onOpenArchive={() => setScreen('archive')}
        onEnterCurseRoom={(dollId) => {
          setCurseRoomDollId(dollId)
          setScreen('curse-room')
        }}
      />
    )
  }

  if (screen === 'archive') {
    return (
      <DollArchive
        onHome={() => setScreen('home')}
        onCreate={() => void startDollMaker()}
        onOpen={(doll) => {
          setOpenedDoll(doll)
          setScreen('detail')
        }}
      />
    )
  }

  if (screen === 'detail' && openedDoll) {
    return (
      <DollDetail
        doll={openedDoll}
        onBack={() => setScreen('archive')}
        onEnterCurseRoom={(dollId) => {
          setCurseRoomDollId(dollId)
          setScreen('curse-room')
        }}
      />
    )
  }

  if (screen === 'curse-room' && curseRoomDollId) {
    return (
      <CurseRoom
        dollId={curseRoomDollId}
        onExit={() => setScreen('archive')}
        onOpenArchive={() => setScreen('archive')}
      />
    )
  }

  if (screen === 'settings') {
    return <SettingsScreen onHome={() => setScreen('home')} />
  }

  return (
    <>
      <div className="page-shell" ref={pageRef}>
        <header className="topbar">
          <nav className="utility-nav" aria-label="도움말 메뉴">
            <button type="button" className="text-button" onClick={() => setScreen('settings')}>
              <span aria-hidden="true" className="button-symbol">⚙</span>
              설정
            </button>
            <button
              type="button"
              className="text-button"
              ref={infoButtonRef}
              onClick={() => setIsInfoOpen(true)}
            >
              <span aria-hidden="true" className="button-symbol">?</span>
              서비스 안내
            </button>
          </nav>
        </header>

        <main className="hero" id="main-content">
          <section className="hero-copy" aria-labelledby="page-title">
            <h1 id="page-title">속풀이<br />인형방</h1>
            <p className="subtitle">내 브라우저 안의 비밀 인형방</p>
            <p className="intro">누구에게도 보이지 않게,<br />작은 인형에게 마음을 잠시 맡겨보세요.</p>
          </section>

          <section className="doll-stage" aria-label="인형 미리보기">
            <div className="paper-sun" aria-hidden="true" />
            <figure className="doll-figure">
              <img
                className="doll-image"
                src={dollFemaleBase}
                alt="얼굴이 비어 있는 크림색 원피스를 입은 헝겊인형"
              />
            </figure>
          </section>

          <section className="actions" aria-label="시작 메뉴">
            <button type="button" className="primary-action" disabled={isCheckingLimit} onClick={() => void startDollMaker()}>
              <span className="action-icon" aria-hidden="true">＋</span>
              <span>{isCheckingLimit ? '보관함 확인 중…' : '새 인형 만들기'}<small>마음을 담을 인형 만들기</small></span>
              <span className="arrow" aria-hidden="true">→</span>
            </button>
            <button type="button" className="secondary-action" onClick={() => setScreen('archive')}>
              <span className="action-icon" aria-hidden="true">⌂</span>
              <span>내 인형 보관함<small>소중히 보관한 인형 보기</small></span>
              <span className="arrow" aria-hidden="true">→</span>
            </button>
            <p className="local-note"><span aria-hidden="true">▣</span> 사진과 인형은 이 브라우저에만 저장됩니다</p>
            <p className="notice" role="status" aria-live="polite">{notice}</p>
            {showArchiveLink && (
              <button type="button" className="limit-archive-link" onClick={() => setScreen('archive')}>
                보관함으로 이동
              </button>
            )}
          </section>
        </main>

        <WorkshopDecor />
        <footer>
          <p>사진과 인형은 이 브라우저에만 저장됩니다</p>
        </footer>
      </div>

      {isInfoOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setIsInfoOpen(false)
        }}>
          <section
            className="info-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="info-title"
            aria-describedby="info-description"
            ref={dialogRef}
          >
            <button
              type="button"
              className="modal-close"
              aria-label="서비스 안내 닫기"
              onClick={() => setIsInfoOpen(false)}
            >
              ×
            </button>
            <p className="modal-kicker">속풀이 인형방 사용 안내</p>
            <h2 id="info-title">안심하고 마음을 놓아두세요</h2>
            <p id="info-description" className="modal-intro">
              이곳은 나만의 브라우저 안에서 즐기는 가상 스트레스 해소 놀이입니다.
            </p>
            <ul>
              <li><span aria-hidden="true">✦</span> 실제 효력을 주장하지 않는 가상 스트레스 해소 놀이입니다.</li>
              <li><span aria-hidden="true">✦</span> 사진과 인형은 현재 브라우저에만 저장됩니다.</li>
              <li><span aria-hidden="true">✦</span> 사용자 콘텐츠를 다른 사람에게 공개하거나 전송하지 않습니다.</li>
              <li><span aria-hidden="true">✦</span> 결과를 타인에게 보내거나 위협하는 용도로 사용하지 마세요.</li>
              <li><span aria-hidden="true">✦</span> 만 14세 이상 이용을 권장합니다.</li>
            </ul>
            <button type="button" className="modal-confirm" onClick={() => setIsInfoOpen(false)}>
              확인했어요
            </button>
          </section>
        </div>
      )}
    </>
  )
}

export default App

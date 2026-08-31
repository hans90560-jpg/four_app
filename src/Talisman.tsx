import type { KeyboardEvent, RefObject, SyntheticEvent } from 'react'
import {
  CURSES_BY_CATEGORY,
  getCurseById,
  type CurseCategory,
  type CurseId,
} from './curses'
import { CURSE_EFFECT_IMAGES } from './curseEffectImages'

export function TalismanPaper({ curseId, preview = false }: { curseId: CurseId; preview?: boolean }) {
  const curse = getCurseById(curseId)
  if (!curse) return null

  return (
    <div
      className={`talisman-paper${preview ? ' is-preview' : ''}`}
      role="img"
      aria-label={`${curse.name} 부적`}
      data-aspect-ratio="1:1.8"
    >
      <span className="talisman-frame" aria-hidden="true" />
      <span className="talisman-ornament is-top" aria-hidden="true">
        {Array.from({ length: 9 }, (_, index) => <i key={index} />)}
      </span>
      <span className="talisman-writing" aria-hidden="true">
        {Array.from(curse.name).map((character, index) => (
          <span key={`${character}-${index}`}>{character}</span>
        ))}
      </span>
      <span className="talisman-ornament is-bottom" aria-hidden="true">
        {Array.from({ length: 9 }, (_, index) => <i key={index} />)}
      </span>
    </div>
  )
}

export type CurseEffectIntensity = 'normal' | 'enhanced' | 'maximum'

export function CurseEffect({
  curseId,
  intensity = 'normal',
}: {
  curseId: CurseId
  intensity?: CurseEffectIntensity
}) {
  const imageSource = CURSE_EFFECT_IMAGES[curseId]
  const commonProps = {
    className: `curse-effect effect-${curseId} is-${intensity}`,
    'data-testid': `curse-effect-${curseId}`,
    'data-effect-intensity': intensity,
    'aria-hidden': true,
  } as const
  const imageProps = {
    src: imageSource,
    alt: '',
    draggable: false,
    onError: (event: SyntheticEvent<HTMLImageElement>) => {
      event.currentTarget.hidden = true
    },
  } as const

  if (curseId === 'elbenotchim') {
    return (
      <div {...commonProps}>
        <img {...imageProps} className="curse-effect-image effect-door-left" />
        <img {...imageProps} className="curse-effect-image effect-door-right" />
      </div>
    )
  }

  return <div {...commonProps}><img {...imageProps} className="curse-effect-image" /></div>
}

export function TalismanPanel({
  dialogRef,
  tab,
  selectedCurseId,
  attachedCurseId,
  isSaving,
  error,
  onTabChange,
  onSelect,
  onAttach,
  onClose,
}: {
  dialogRef: RefObject<HTMLElement | null>
  tab: CurseCategory
  selectedCurseId: CurseId | null
  attachedCurseId: CurseId | null
  isSaving: boolean
  error: string
  onTabChange: (tab: CurseCategory) => void
  onSelect: (curseId: CurseId) => void
  onAttach: () => void
  onClose: () => void
}) {
  const selectedCurse = getCurseById(selectedCurseId)
  const tabName = tab === 'occult' ? '오컬트 저주' : '장난 저주'

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const nextTab: CurseCategory = event.key === 'ArrowLeft' || event.key === 'Home' ? 'occult' : 'prank'
    onTabChange(nextTab)
    document.getElementById(`curse-tab-${nextTab}`)?.focus()
  }

  return (
    <div className="talisman-backdrop" onMouseDown={(event) => {
      if (event.currentTarget === event.target && !isSaving) onClose()
    }}>
      <section
        className="talisman-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="talisman-panel-title"
        aria-describedby="talisman-panel-description"
        ref={dialogRef}
      >
        <button type="button" className="talisman-panel-close" aria-label="부적 선택 닫기" disabled={isSaving} onClick={onClose}>×</button>
        <header>
          <p>얼굴에 붙일 종이 부적</p>
          <h2 id="talisman-panel-title">부적 선택</h2>
          <p id="talisman-panel-description">저주를 고른 뒤 미리보기를 확인하고 붙여주세요.</p>
        </header>

        <div className="curse-tabs" role="tablist" aria-label="저주 종류">
          <button
            type="button"
            id="curse-tab-occult"
            role="tab"
            aria-selected={tab === 'occult'}
            aria-controls="curse-panel-occult"
            tabIndex={tab === 'occult' ? 0 : -1}
            onClick={() => onTabChange('occult')}
            onKeyDown={handleTabKeyDown}
          >오컬트 저주</button>
          <button
            type="button"
            id="curse-tab-prank"
            role="tab"
            aria-selected={tab === 'prank'}
            aria-controls="curse-panel-prank"
            tabIndex={tab === 'prank' ? 0 : -1}
            onClick={() => onTabChange('prank')}
            onKeyDown={handleTabKeyDown}
          >장난 저주</button>
        </div>

        <div className="talisman-panel-content">
          <div
            className="curse-list-panel"
            id={`curse-panel-${tab}`}
            role="tabpanel"
            aria-labelledby={`curse-tab-${tab}`}
          >
            <ul className="curse-list" aria-label={`${tabName} 목록`}>
              {CURSES_BY_CATEGORY[tab].map((curse) => {
                const isAttached = attachedCurseId === curse.id
                return (
                  <li key={curse.id}>
                    <button
                      type="button"
                      className={`${selectedCurseId === curse.id ? 'is-selected ' : ''}${isAttached ? 'is-attached' : ''}`.trim()}
                      aria-pressed={selectedCurseId === curse.id}
                      onClick={() => onSelect(curse.id)}
                    >
                      <strong>{curse.name}</strong>
                      <span>{curse.description}</span>
                      {isAttached && <small>현재 부착됨</small>}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>

          <aside className="talisman-choice-preview" aria-label="선택한 부적 미리보기">
            {selectedCurse ? (
              <>
                <TalismanPaper curseId={selectedCurse.id} preview />
                <p className="selected-curse-name" aria-live="polite">선택한 저주: {selectedCurse.name}</p>
              </>
            ) : (
              <p className="empty-talisman-preview">저주를 선택하면 부적을 미리 볼 수 있어요.</p>
            )}
            {error && <p className="talisman-error" role="alert">{error}</p>}
            <div className="talisman-panel-actions">
              <button type="button" className="secondary-maker-button" disabled={isSaving} onClick={onClose}>취소</button>
              <button type="button" className="primary-maker-button" disabled={!selectedCurse || isSaving} onClick={onAttach}>
                {isSaving ? '부적을 저장하는 중…' : '이 부적 붙이기'}
              </button>
            </div>
          </aside>
        </div>
      </section>
    </div>
  )
}

export function TalismanReplacementDialog({
  dialogRef,
  currentCurseId,
  nextCurseId,
  isSaving,
  onCancel,
  onConfirm,
}: {
  dialogRef: RefObject<HTMLElement | null>
  currentCurseId: CurseId
  nextCurseId: CurseId
  isSaving: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const currentCurse = getCurseById(currentCurseId)
  const nextCurse = getCurseById(nextCurseId)
  return (
    <div className="talisman-confirm-backdrop">
      <section
        className="talisman-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="talisman-confirm-title"
        aria-describedby="talisman-confirm-description"
        ref={dialogRef}
      >
        <h2 id="talisman-confirm-title">기존 부적을 바꿀까요?</h2>
        <p id="talisman-confirm-description">
          {currentCurse?.name} 부적을 떼고 {nextCurse?.name} 부적으로 교체합니다.
        </p>
        <div className="talisman-confirm-actions">
          <button type="button" className="secondary-maker-button" disabled={isSaving} onClick={onCancel}>교체 취소</button>
          <button type="button" className="primary-maker-button" disabled={isSaving} onClick={onConfirm}>
            {isSaving ? '교체하는 중…' : '교체하기'}
          </button>
        </div>
      </section>
    </div>
  )
}

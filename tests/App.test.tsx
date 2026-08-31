import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'
import SettingsScreen from '../src/SettingsScreen'
import appStyles from '../src/styles.css?raw'
import {
  TALISMAN_BURN_DURATION_MS,
  TALISMAN_EFFECT_OVERLAP_MS,
  TALISMAN_EFFECT_START_MS,
} from '../src/CurseActions'
import { CURSES, type CurseCategory } from '../src/curses'
import {
  DOLL_LIMIT_MESSAGE,
  countDolls,
  createDoll,
  deleteAllDolls,
  deleteDoll,
  getAllDolls,
  getDoll,
  updateDoll,
  type Pin,
} from '../src/dollDatabase'

const validPhoto = () => new File(['photo'], 'face.jpg', { type: 'image/jpeg' })

async function openMaker() {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('button', { name: /새 인형 만들기/ }))
  await screen.findByRole('heading', { name: '새 인형 만들기' })
  return user
}

async function uploadPhotoAndOpenFaceStep(user: ReturnType<typeof userEvent.setup>) {
  await user.upload(screen.getByLabelText(/얼굴 사진 선택/), validPhoto())
  await waitFor(() => expect(screen.getByText('선택한 사진: face.jpg')).toBeInTheDocument())
  await user.click(screen.getByRole('button', { name: '다음 단계' }))
}

async function openCurseRoomFromArchive(name = '바늘') {
  const created = await createDoll({
    name,
    faceBlob: new Blob(['stored-face'], { type: 'image/webp' }),
  })
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('button', { name: /내 인형 보관함/ }))
  await user.click(await screen.findByRole('button', { name: '열기' }))
  await user.click(await screen.findByRole('button', { name: '저주방 들어가기' }))
  await screen.findByRole('toolbar', { name: '저주방 도구' })
  return { user, created }
}

async function openExistingDollInCurseRoom() {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('button', { name: /내 인형 보관함/ }))
  await user.click(await screen.findByRole('button', { name: '열기' }))
  await user.click(await screen.findByRole('button', { name: '저주방 들어가기' }))
  await screen.findByRole('toolbar', { name: '저주방 도구' })
  return user
}

async function openDollBurnDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '인형 태우기' }))
  return screen.findByRole('dialog', { name: '인형 태우기' })
}

async function completeDollBurnHold(
  user: ReturnType<typeof userEvent.setup>,
  source: 'pointer' | 'Enter' | ' ' = 'pointer',
) {
  const frames = mockAnimationFrames()
  const dialog = await openDollBurnDialog(user)
  const holdButton = within(dialog).getByRole('button', { name: '1초간 눌러 인형 태우기' })
  if (source === 'pointer') {
    fireEvent.pointerDown(holdButton, { pointerId: 41 })
  } else {
    fireEvent.keyDown(holdButton, { key: source })
  }
  act(() => frames.runAt(1000))
  return screen.findByTestId('doll-burn-effect')
}

function mockDollBounds() {
  const dollArea = screen.getByRole('application')
  vi.spyOn(dollArea, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 300,
    bottom: 450,
    width: 300,
    height: 450,
    toJSON: () => ({}),
  })
  return dollArea
}

async function openTalismanPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '부적' }))
  const chooseAnotherButton = screen.queryByRole('button', { name: '다른 부적 선택' })
  if (chooseAnotherButton) await user.click(chooseAnotherButton)
  return screen.findByRole('dialog', { name: '부적 선택' })
}

async function selectTalisman(
  user: ReturnType<typeof userEvent.setup>,
  curseName: string,
  category: CurseCategory = 'occult',
) {
  const panel = await openTalismanPanel(user)
  if (category === 'prank') {
    await user.click(within(panel).getByRole('tab', { name: '장난 저주' }))
  }
  await user.click(within(panel).getByRole('button', { name: new RegExp(`^${curseName}`) }))
  return panel
}

async function attachTalisman(
  user: ReturnType<typeof userEvent.setup>,
  curseName = '만사불통',
  category: CurseCategory = 'occult',
) {
  const panel = await selectTalisman(user, curseName, category)
  await user.click(within(panel).getByRole('button', { name: '이 부적 붙이기' }))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '부적 선택' })).not.toBeInTheDocument())
}

async function openBurnSpell(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '부적' }))
  const infoPanel = await screen.findByRole('dialog', { name: '만사불통' })
  await user.click(within(infoPanel).getByRole('button', { name: '부적 태우기' }))
  const confirmation = screen.getByRole('dialog', { name: '만사불통 부적을 태울까요?' })
  await user.click(within(confirmation).getByRole('button', { name: '계속하기' }))
  return screen.findByRole('dialog', { name: '만사불통 주문 외우기' })
}

function mockAnimationFrames() {
  const callbacks: FrameRequestCallback[] = []
  const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callbacks.push(callback)
    return callbacks.length
  })
  const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
  vi.spyOn(performance, 'now').mockReturnValue(0)
  return {
    request,
    cancel,
    runAt(timestamp: number) {
      const pending = callbacks.splice(0)
      pending.forEach((callback) => callback(timestamp))
    },
  }
}

async function finishTalismanBurnAnimation() {
  await act(async () => {
    fireEvent.animationEnd(screen.getByTestId('talisman-burn-effect'))
    await new Promise((resolve) => setTimeout(resolve, 50))
  })
}

function mockCanvas() {
  const context = {
    save: vi.fn(),
    beginPath: vi.fn(),
    ellipse: vi.fn(),
    clip: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    drawImage: vi.fn(),
    restore: vi.fn(),
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
    callback(new Blob(['webp'], { type: 'image/webp' }))
  })
  return context
}

beforeEach(async () => {
  vi.restoreAllMocks()
  let objectUrlIndex = 0
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => `blob:local-photo-${objectUrlIndex++}`),
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  })
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({
    width: 1200,
    height: 900,
    close: vi.fn(),
  }))
  await deleteAllDolls()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('그을림 이미지 레이어 CSS', () => {
  it('필터와 가짜 얼룩 pseudo-element 없이 승인 이미지 opacity만 전환한다', () => {
    expect(appStyles).not.toContain(".composite-doll[data-charred='true'] .composite-doll-base")
    expect(appStyles).not.toContain(".composite-doll[data-charred='true']::after")
    expect(appStyles).not.toMatch(/data-charred[^}]*filter\s*:/s)
    expect(appStyles).toMatch(/\.composite-doll-charred\s*{[^}]*opacity:\s*0[^}]*transition:\s*opacity 250ms/s)
    expect(appStyles).toMatch(/\.composite-doll\[data-charred='true'\] \.composite-doll-charred\s*{\s*opacity:\s*1;/)
    expect(appStyles).toMatch(/\.composite-doll-base,\s*\.composite-doll-charred\s*{[^}]*z-index:\s*1[^}]*width:\s*100%[^}]*height:\s*100%[^}]*object-fit:\s*contain[^}]*object-position:\s*center/s)
    expect(appStyles).toMatch(/\.face-layer\s*{[^}]*z-index:\s*2/s)
    expect(appStyles).toMatch(/\.name-layer\s*{[^}]*z-index:\s*3/s)
  })

  it('불꽃 이미지와 컨테이너는 사각형 배경 없이 투명 배경과 drop-shadow만 사용한다', () => {
    expect(appStyles).toMatch(/\.doll-burn-flames\s*{[^}]*background:\s*transparent/s)
    expect(appStyles).toMatch(/\.doll-flame-layer\s*{[^}]*background:\s*transparent[^}]*filter:[^}]*drop-shadow/s)
    expect(appStyles).not.toMatch(/\.doll-burn-flames\s*{[^}]*(?:background|background-color):\s*(?:black|#0{3,6}|rgb\(\s*0\s*,\s*0\s*,\s*0)/s)
    expect(appStyles).not.toMatch(/\.doll-flame-layer\s*{[^}]*(?:background|background-color):\s*(?:black|#0{3,6}|rgb\(\s*0\s*,\s*0\s*,\s*0)/s)
  })

  it('태우기 흔들림은 인형 하단을 축으로 좌우 10도 안에서만 움직인다', () => {
    expect(appStyles).toMatch(/\.doll-burn-motion-wrapper\s*{[^}]*transform-origin:\s*50% 100%/s)
    const burnShake = appStyles.match(/@keyframes doll-burn-shake\s*{([\s\S]*?)\n}/)?.[1]
    expect(burnShake).toContain('rotate(-10deg)')
    expect(burnShake).toContain('rotate(10deg)')
    expect(burnShake).not.toMatch(/rotate\(-?(?:1[1-9]|[2-9]\d)deg\)/)
    expect(appStyles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.doll-burn-motion-wrapper\.is-burning\s*{\s*animation:\s*none;/)
  })
})

describe('시작 화면', () => {
  it('서비스 이름, 부제, 주요 시작 버튼과 승인된 인형 PNG를 렌더링한다', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: '속풀이 인형방' })).toBeInTheDocument()
    expect(screen.getByText('내 브라우저 안의 비밀 인형방')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /새 인형 만들기/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /내 인형 보관함/ })).toBeInTheDocument()
    expect(screen.getAllByText('사진과 인형은 이 브라우저에만 저장됩니다')).toHaveLength(2)
    expect(screen.queryByRole('link', { name: '속풀이 인형방 홈' })).not.toBeInTheDocument()
    expect(screen.queryByText('마음이 복잡한 날, 조용히 들르는 곳')).not.toBeInTheDocument()
    expect(screen.queryByText('오늘의 속마음은 안전해요')).not.toBeInTheDocument()
    expect(screen.queryByText('당신만의 인형을 기다리고 있어요')).not.toBeInTheDocument()
    const dollImage = screen.getByRole('img', {
      name: '얼굴이 비어 있는 크림색 원피스를 입은 헝겊인형',
    })
    expect(dollImage).toHaveAttribute('src', expect.stringContaining('doll-female-base-v1.png'))
  })

  it('새 인형 만들기 화면으로 이동하고 홈으로 돌아온다', async () => {
    const user = await openMaker()

    expect(screen.getByRole('heading', { name: '새 인형 만들기' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '사진 올리기' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: '인형 만들기 진행 단계' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '← 홈으로' }))
    expect(screen.getByRole('heading', { name: '속풀이 인형방' })).toBeInTheDocument()
  })

  it('화면을 이동할 때 이전 스크롤 위치를 새 화면에 남기지 않는다', async () => {
    const user = userEvent.setup()
    render(<App />)
    document.documentElement.scrollTop = 420
    document.body.scrollTop = 420

    await user.click(screen.getByRole('button', { name: '설정' }))

    expect(document.documentElement.scrollTop).toBe(0)
    expect(document.body.scrollTop).toBe(0)
  })

  it('설정 화면으로 이동해 저장 개수와 로컬 보관 안내를 표시하고 홈으로 돌아온다', async () => {
    await createDoll({ name: '하나', faceBlob: new Blob(['1'], { type: 'image/webp' }) })
    await createDoll({ name: '둘', faceBlob: new Blob(['2'], { type: 'image/webp' }) })
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '설정' }))
    expect(screen.getByRole('heading', { name: '설정' })).toBeInTheDocument()
    expect(await screen.findByRole('status')).toHaveTextContent('2개 / 최대 5개')
    expect(screen.getByText('사진과 인형 정보는 서버가 아니라 현재 브라우저에만 저장됩니다.')).toBeInTheDocument()
    expect(screen.getByText(/브라우저 데이터를 삭제하거나 시크릿 모드를 사용하거나 다른 기기를 이용하면/)).toBeInTheDocument()
    expect(screen.getByText('사용자 콘텐츠는 다른 사용자에게 공개되거나 공유되지 않습니다.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '← 홈으로' }))
    expect(screen.getByRole('heading', { name: '속풀이 인형방' })).toBeInTheDocument()
  })

  it('설정 화면에서 Escape를 누르면 홈으로 돌아온다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '설정' }))
    await screen.findByRole('heading', { name: '설정' })

    await user.keyboard('{Escape}')
    expect(screen.getByRole('heading', { name: '속풀이 인형방' })).toBeInTheDocument()
  })
})

describe('설정과 로컬 데이터 관리', () => {
  it('전체 삭제 확인을 취소하면 저장 상태를 유지하고 삭제 버튼으로 포커스를 돌린다', async () => {
    await createDoll({ name: '유지', faceBlob: new Blob(['face'], { type: 'image/webp' }) })
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '설정' }))
    const deleteButton = await screen.findByRole('button', { name: '모든 인형 삭제' })

    await user.click(deleteButton)
    const dialog = screen.getByRole('dialog', { name: '모든 인형을 삭제할까요?' })
    expect(dialog).toHaveTextContent('저장된 인형과 모든 저주 상태가 삭제되며 복구할 수 없습니다.')
    await user.click(within(dialog).getByRole('button', { name: '취소' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(deleteButton).toHaveFocus()
    expect(await countDolls()).toBe(1)
  })

  it('전체 삭제를 확정하면 사진과 모든 상호작용 상태를 삭제하고 개수를 0개로 갱신한다', async () => {
    const created = await createDoll({ name: '삭제', faceBlob: new Blob(['face'], { type: 'image/webp' }) })
    await updateDoll(created.id, {
      interactionState: {
        pins: [{ id: 'pin-settings', x: 0.4, y: 0.5, angle: 12, createdAt: new Date().toISOString() }],
        selectedCurse: 'mansabultong',
        talismanStatus: 'attached',
        charredUntil: new Date(Date.now() + 60_000).toISOString(),
      },
    })
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '설정' }))
    await screen.findByText('1개 / 최대 5개')

    await user.click(screen.getByRole('button', { name: '모든 인형 삭제' }))
    const dialog = screen.getByRole('dialog', { name: '모든 인형을 삭제할까요?' })
    await user.click(within(dialog).getByRole('button', { name: '모든 인형 삭제' }))

    expect(await screen.findByText('0개 / 최대 5개')).toBeInTheDocument()
    expect(screen.getByText('모든 인형과 저주 상태를 삭제했어요.')).toBeInTheDocument()
    expect(await getAllDolls()).toEqual([])
  })

  it('전체 삭제 실패를 안내하고 중복 실행을 막은 뒤 다시 시도할 수 있다', async () => {
    let rejectDelete!: (reason?: unknown) => void
    const firstDelete = new Promise<void>((_resolve, reject) => {
      rejectDelete = reject
    })
    const deleteStoredDolls = vi.fn()
      .mockReturnValueOnce(firstDelete)
      .mockResolvedValueOnce(undefined)
    const user = userEvent.setup()
    render(
      <SettingsScreen
        onHome={vi.fn()}
        countStoredDolls={vi.fn().mockResolvedValue(1)}
        deleteStoredDolls={deleteStoredDolls}
      />,
    )
    await screen.findByText('1개 / 최대 5개')
    await user.click(screen.getByRole('button', { name: '모든 인형 삭제' }))
    const dialog = screen.getByRole('dialog', { name: '모든 인형을 삭제할까요?' })
    const confirmButton = within(dialog).getByRole('button', { name: '모든 인형 삭제' })

    await user.click(confirmButton)
    expect(within(dialog).getByRole('button', { name: '삭제 중…' })).toBeDisabled()
    await user.click(within(dialog).getByRole('button', { name: '삭제 중…' }))
    expect(deleteStoredDolls).toHaveBeenCalledTimes(1)
    rejectDelete(new Error('storage failure'))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('다시 시도해 주세요')
    await user.click(within(dialog).getByRole('button', { name: '모든 인형 삭제' }))

    expect(deleteStoredDolls).toHaveBeenCalledTimes(2)
    expect(await screen.findByText('0개 / 최대 5개')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('인형 만들기', () => {
  it('파일 형식과 10MB 용량을 브라우저에서 검증한다', async () => {
    const user = await openMaker()
    const input = screen.getByLabelText(/얼굴 사진 선택/)

    fireEvent.change(input, {
      target: { files: [new File(['gif'], 'face.gif', { type: 'image/gif' })] },
    })
    expect(screen.getByRole('alert')).toHaveTextContent('JPG, PNG, WebP')
    expect(screen.getByRole('button', { name: '다음 단계' })).toBeDisabled()

    fireEvent.change(input, {
      target: {
        files: [new File(
          [new Uint8Array(10 * 1024 * 1024 + 1)],
          'large.png',
          { type: 'image/png' },
        )],
      },
    })
    expect(screen.getByRole('alert')).toHaveTextContent('10MB 이하')
    expect(screen.getByRole('button', { name: '다음 단계' })).toBeDisabled()
  })

  it('사진 선택 전 다음 단계가 비활성화되고 3단계를 앞뒤로 이동한다', async () => {
    const user = await openMaker()
    expect(screen.getByRole('button', { name: '다음 단계' })).toBeDisabled()

    await uploadPhotoAndOpenFaceStep(user)
    expect(screen.getByRole('heading', { name: '얼굴 맞추기' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '이전' }))
    expect(screen.getByRole('heading', { name: '사진 올리기' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '다음 단계' }))
    await user.click(screen.getByRole('button', { name: '다음 단계' }))
    expect(screen.getByRole('heading', { name: '이름과 최종 확인' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '이전' }))
    expect(screen.getByRole('heading', { name: '얼굴 맞추기' })).toBeInTheDocument()
  })

  it('이름은 필수이며 앞뒤 공백 제거 후 최대 4글자까지만 완료할 수 있다', async () => {
    const user = await openMaker()
    await uploadPhotoAndOpenFaceStep(user)
    await user.click(screen.getByRole('button', { name: '다음 단계' }))

    const nameInput = screen.getByLabelText(/대상 이름/)
    const finishButton = screen.getByRole('button', { name: '인형 완성' })
    expect(finishButton).toBeDisabled()

    await user.type(nameInput, '다섯글자임')
    expect(screen.getByText(/최대 4글자/)).toBeInTheDocument()
    expect(finishButton).toBeDisabled()

    await user.clear(nameInput)
    await user.type(nameInput, ' 김아무 ')
    expect(finishButton).toBeEnabled()
    expect(screen.getByLabelText('대상 이름 김아무')).toBeInTheDocument()
  })

  it('4글자 이름을 앞치마에 한 글자씩 세로로 렌더링한다', async () => {
    const user = await openMaker()
    await uploadPhotoAndOpenFaceStep(user)
    await user.click(screen.getByRole('button', { name: '다음 단계' }))
    await user.type(screen.getByLabelText(/대상 이름/), '김아무개')

    const nameLayer = screen.getByLabelText('대상 이름 김아무개')
    expect(nameLayer).toHaveAttribute('data-name-length', '4')
    expect(Array.from(nameLayer.querySelectorAll('span')).map((span) => span.textContent))
      .toEqual(['김', '아', '무', '개'])
  })

  it('왼쪽과 오른쪽 90도 회전을 정규화한다', async () => {
    const user = await openMaker()
    await uploadPhotoAndOpenFaceStep(user)
    const angle = screen.getByLabelText('현재 최종 회전 각도')

    await user.click(screen.getByRole('button', { name: '왼쪽으로 90°' }))
    expect(angle).toHaveTextContent('-90°')

    await user.click(screen.getByRole('button', { name: '오른쪽으로 90°' }))
    expect(angle).toHaveTextContent('0°')

    for (let index = 0; index < 4; index += 1) {
      await user.click(screen.getByRole('button', { name: '오른쪽으로 90°' }))
    }
    expect(angle).toHaveTextContent('0°')
  })

  it('미세 회전 슬라이더를 -30도부터 30도까지 변경한다', async () => {
    const user = await openMaker()
    await uploadPhotoAndOpenFaceStep(user)
    const slider = screen.getByRole('slider', { name: /미세 회전/ })

    fireEvent.change(slider, { target: { value: '17' } })
    expect(slider).toHaveValue('17')
    expect(screen.getByLabelText('현재 최종 회전 각도')).toHaveTextContent('+17°')
    expect(slider).toHaveAttribute('min', '-30')
    expect(slider).toHaveAttribute('max', '30')
    expect(slider).toHaveAttribute('step', '1')
  })

  it('위치 초기화 시 확대와 모든 회전값을 초기화한다', async () => {
    const user = await openMaker()
    await uploadPhotoAndOpenFaceStep(user)
    const zoomSlider = screen.getByRole('slider', { name: /확대·축소/ })
    const rotationSlider = screen.getByRole('slider', { name: /미세 회전/ })

    fireEvent.change(zoomSlider, { target: { value: '2' } })
    await user.click(screen.getByRole('button', { name: '오른쪽으로 90°' }))
    fireEvent.change(rotationSlider, { target: { value: '12' } })
    await user.click(screen.getByRole('button', { name: '위치 초기화' }))

    expect(zoomSlider).toHaveValue('1')
    expect(rotationSlider).toHaveValue('0')
    expect(screen.getByLabelText('현재 최종 회전 각도')).toHaveTextContent('0°')
  })

  it('사진을 다시 선택하면 회전값을 초기화한다', async () => {
    const user = await openMaker()
    await uploadPhotoAndOpenFaceStep(user)
    await user.click(screen.getByRole('button', { name: '오른쪽으로 90°' }))
    fireEvent.change(screen.getByRole('slider', { name: /미세 회전/ }), {
      target: { value: '9' },
    })

    await user.upload(
      screen.getByLabelText(/사진 다시 선택/),
      new File(['next-photo'], 'next.png', { type: 'image/png' }),
    )

    await waitFor(() => {
      expect(screen.getByLabelText('현재 최종 회전 각도')).toHaveTextContent('0°')
      expect(screen.getByRole('slider', { name: /미세 회전/ })).toHaveValue('0')
      expect(screen.getByRole('img', { name: '업로드한 얼굴 사진' }))
        .toHaveAttribute('src', 'blob:local-photo-1')
    })
  })

  it('단계를 이동해도 회전값을 유지한다', async () => {
    const user = await openMaker()
    await uploadPhotoAndOpenFaceStep(user)
    await user.click(screen.getByRole('button', { name: '오른쪽으로 90°' }))
    fireEvent.change(screen.getByRole('slider', { name: /미세 회전/ }), {
      target: { value: '5' },
    })

    await user.click(screen.getByRole('button', { name: '다음 단계' }))
    expect(screen.getByRole('img', { name: '업로드한 얼굴 사진' }))
      .toHaveStyle({ transform: 'translate(-50%, -50%) rotate(95deg)' })

    await user.click(screen.getByRole('button', { name: '이전' }))
    expect(screen.getByLabelText('현재 최종 회전 각도')).toHaveTextContent('+95°')
    expect(screen.getByRole('slider', { name: /미세 회전/ })).toHaveValue('5')
  })

  it('승인된 인형, 업로드 사진 대체 텍스트와 얼굴 조절 접근성 요소를 제공한다', async () => {
    const user = await openMaker()
    expect(screen.getByRole('img', { name: '얼굴이 비어 있는 여성형 헝겊인형' }))
      .toHaveAttribute('src', expect.stringContaining('doll-female-base-v1.png'))
    expect(screen.getByText((_, element) => (
      element?.classList.contains('privacy-note') === true
      && element.textContent?.includes('사진은 서버로 전송되지 않아요') === true
    ))).toBeInTheDocument()

    await uploadPhotoAndOpenFaceStep(user)
    expect(screen.getByRole('img', { name: '업로드한 얼굴 사진' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '얼굴 사진 위치 조절 영역' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('slider', { name: /확대·축소/ })).toHaveAttribute('max', '3')
  })

  it('Canvas를 통해 완성 상태를 만들고 수정 단계로 돌아갈 수 있다', async () => {
    const user = await openMaker()
    const context = mockCanvas()

    await uploadPhotoAndOpenFaceStep(user)
    await user.click(screen.getByRole('button', { name: '오른쪽으로 90°' }))
    fireEvent.change(screen.getByRole('slider', { name: /미세 회전/ }), {
      target: { value: '15' },
    })
    await user.click(screen.getByRole('button', { name: '다음 단계' }))
    await user.type(screen.getByLabelText(/대상 이름/), '김아무')
    await user.click(screen.getByRole('button', { name: '인형 완성' }))

    expect(await screen.findByRole('heading', { name: '인형이 완성됐어요' })).toBeInTheDocument()
    expect(screen.getByText('인형이 보관함에 저장됐어요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '저주방 들어가기' })).toBeInTheDocument()
    expect(context.drawImage).toHaveBeenCalled()
    expect(context.rotate).toHaveBeenCalledWith(105 * Math.PI / 180)
    expect(await countDolls()).toBe(1)

    await user.click(screen.getByRole('button', { name: '이전 단계로 돌아가 수정하기' }))
    expect(screen.getByRole('heading', { name: '얼굴 맞추기' })).toBeInTheDocument()
  })

  it('IndexedDB 저장이 끝날 때까지 완료 버튼을 비활성화한다', async () => {
    const user = await openMaker()
    mockCanvas()
    const finishBlob: { callback?: (blob: Blob | null) => void } = {}
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation((callback) => {
      finishBlob.callback = callback
    })
    await uploadPhotoAndOpenFaceStep(user)
    await user.click(screen.getByRole('button', { name: '다음 단계' }))
    await user.type(screen.getByRole('textbox', { name: /대상 이름/ }), '저장')

    await user.click(screen.getByRole('button', { name: '인형 완성' }))
    expect(screen.getByRole('button', { name: '인형을 보관하는 중이에요' })).toBeDisabled()

    expect(finishBlob.callback).toBeDefined()
    finishBlob.callback?.(new Blob(['webp'], { type: 'image/webp' }))
    expect(await screen.findByRole('heading', { name: '인형이 완성됐어요' })).toBeInTheDocument()
  })
})

describe('인형 보관함', () => {
  it('홈페이지에서 빈 보관함으로 이동하고 홈으로 돌아온다', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /내 인형 보관함/ }))
    expect(await screen.findByRole('heading', { name: '내 인형 보관함' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: '아직 만든 인형이 없어요' })).toBeInTheDocument()
    expect(screen.getByText('현재 브라우저에만 저장됩니다')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '← 홈으로' }))
    expect(screen.getByRole('heading', { name: '속풀이 인형방' })).toBeInTheDocument()
  })

  it('5개가 저장되면 홈페이지에서 새 인형 만들기를 막고 보관함으로 안내한다', async () => {
    for (let index = 1; index <= 5; index += 1) {
      await createDoll({
        name: `인형${index}`,
        faceBlob: new Blob([`face-${index}`], { type: 'image/webp' }),
      })
    }
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /새 인형 만들기/ }))
    expect(await screen.findByRole('status')).toHaveTextContent(DOLL_LIMIT_MESSAGE)
    expect(screen.queryByRole('heading', { name: '새 인형 만들기' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '보관함으로 이동' }))
    expect(await screen.findByRole('heading', { name: '내 인형 보관함' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '새 인형 만들기' })).toBeDisabled()
  })

  it('인형을 열면 마지막 사용 시각을 갱신하고 큰 미리보기를 표시한다', async () => {
    const created = await createDoll({
      name: '보관',
      faceBlob: new Blob(['face'], { type: 'image/webp' }),
    })
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /내 인형 보관함/ }))

    await user.click(await screen.findByRole('button', { name: '열기' }))
    expect(await screen.findByRole('heading', { name: '보관 인형' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '저주방 들어가기' })).toBeInTheDocument()
    const usedDoll = await getDoll(created.id)
    expect(usedDoll).toBeDefined()
    expect(usedDoll!.lastUsedAt >= created.lastUsedAt).toBe(true)

    await user.click(screen.getByRole('button', { name: '← 보관함으로 돌아가기' }))
    expect(await screen.findByRole('heading', { name: '내 인형 보관함' })).toBeInTheDocument()
  })

  it('열기 실패 시 로딩을 끝내고 보관함에서 다시 시도할 수 있게 안내한다', async () => {
    const created = await createDoll({
      name: '사라짐',
      faceBlob: new Blob(['face'], { type: 'image/webp' }),
    })
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /내 인형 보관함/ }))
    const openButton = await screen.findByRole('button', { name: '열기' })
    await deleteDoll(created.id)

    await user.click(openButton)

    expect(await screen.findByRole('alert')).toHaveTextContent('보관함에서 다시 시도해 주세요')
    expect(screen.getByRole('button', { name: '열기' })).toBeEnabled()
    expect(screen.getByRole('heading', { name: '내 인형 보관함' })).toBeInTheDocument()
  })

  it('열기 요청 중 홈으로 이동하면 늦은 조회 결과가 현재 화면을 덮어쓰지 않는다', async () => {
    const created = await createDoll({
      name: '이동',
      faceBlob: new Blob(['face'], { type: 'image/webp' }),
    })
    await new Promise((resolve) => window.setTimeout(resolve, 2))
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /내 인형 보관함/ }))
    const openButton = await screen.findByRole('button', { name: '열기' })
    fireEvent.click(openButton)
    expect(screen.getByRole('button', { name: '여는 중…' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '← 홈으로' }))

    await waitFor(async () => {
      expect((await getDoll(created.id))?.updatedAt).not.toBe(created.updatedAt)
    })
    expect(screen.getByRole('heading', { name: '속풀이 인형방' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '이동 인형' })).not.toBeInTheDocument()
  })

  it('기존 이름을 표시하고 유효한 새 이름으로 즉시 변경한다', async () => {
    const created = await createDoll({
      name: '기존',
      faceBlob: new Blob(['face'], { type: 'image/webp' }),
    })
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /내 인형 보관함/ }))
    await user.click(await screen.findByRole('button', { name: '이름 변경' }))

    expect(screen.getByText('기존 이름: 기존')).toBeInTheDocument()
    const input = screen.getByLabelText('새 이름')
    expect(input).toHaveValue('기존')
    await user.clear(input)
    await user.type(input, '새이름')
    await user.click(screen.getByRole('button', { name: '이름 저장' }))

    expect(await screen.findByRole('heading', { name: '새이름' })).toBeInTheDocument()
    expect((await getDoll(created.id))?.name).toBe('새이름')
  })

  it('개별 삭제를 취소하거나 확인할 수 있고 삭제 시 Object URL을 정리한다', async () => {
    await createDoll({
      name: '삭제',
      faceBlob: new Blob(['face'], { type: 'image/webp' }),
    })
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /내 인형 보관함/ }))
    await screen.findByRole('heading', { name: '삭제' })

    await user.click(screen.getByRole('button', { name: '삭제' }))
    expect(screen.getByRole('dialog', { name: '삭제 인형을 삭제할까요?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '취소' }))
    expect(screen.getByRole('heading', { name: '삭제' })).toBeInTheDocument()
    expect(await countDolls()).toBe(1)

    await user.click(screen.getByRole('button', { name: '삭제' }))
    await user.click(screen.getByRole('button', { name: '삭제하기' }))
    expect(await screen.findByRole('heading', { name: '아직 만든 인형이 없어요' })).toBeInTheDocument()
    expect(await countDolls()).toBe(0)
    expect(URL.revokeObjectURL).toHaveBeenCalled()
  })

  it('Escape로 삭제 확인창을 닫고 실행 버튼으로 포커스를 돌려준다', async () => {
    await createDoll({
      name: '탈출',
      faceBlob: new Blob(['face'], { type: 'image/webp' }),
    })
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /내 인형 보관함/ }))
    const deleteButton = await screen.findByRole('button', { name: '삭제' })

    await user.click(deleteButton)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(deleteButton).toHaveFocus()
    expect(await countDolls()).toBe(1)
  })

  it('앱 내부 확인창 두 단계를 거쳐 전체 데이터를 삭제한다', async () => {
    await createDoll({ name: '하나', faceBlob: new Blob(['1'], { type: 'image/webp' }) })
    await createDoll({ name: '둘', faceBlob: new Blob(['2'], { type: 'image/webp' }) })
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /내 인형 보관함/ }))
    await screen.findByRole('heading', { name: '하나' })

    await user.click(screen.getByRole('button', { name: '전체 데이터 삭제' }))
    expect(screen.getByRole('dialog', { name: '보관한 인형을 모두 삭제할까요?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '계속' }))
    expect(screen.getByRole('dialog', { name: '정말 모든 데이터를 삭제할까요?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '모든 인형 삭제' }))

    expect(await screen.findByRole('heading', { name: '아직 만든 인형이 없어요' })).toBeInTheDocument()
    expect(await getAllDolls()).toEqual([])
  })

  it('보관함을 벗어날 때 생성한 Blob Object URL을 해제한다', async () => {
    await createDoll({
      name: '정리',
      faceBlob: new Blob(['face'], { type: 'image/webp' }),
    })
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /내 인형 보관함/ }))
    await screen.findByRole('img', { name: '정리 인형 미리보기' })
    expect(URL.createObjectURL).toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '← 홈으로' }))
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalled())
  })

  it('IndexedDB 저장 실패 시 편집 상태와 오류를 유지한다', async () => {
    const user = await openMaker()
    mockCanvas()
    await uploadPhotoAndOpenFaceStep(user)
    await user.click(screen.getByRole('button', { name: '다음 단계' }))
    await user.type(screen.getByLabelText(/대상 이름/), '실패')

    const originalIndexedDB = globalThis.indexedDB
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined })
    try {
      await user.click(screen.getByRole('button', { name: '인형 완성' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('이 브라우저에서는 인형 보관함을 사용할 수 없어요.')
      expect(screen.getByRole('heading', { name: '이름과 최종 확인' })).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: /대상 이름/ })).toHaveValue('실패')
    } finally {
      Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: originalIndexedDB })
    }
  })
})

describe('저주방', () => {
  it('인형 완성 후 저장된 ID로 저주방에 들어간다', async () => {
    const user = await openMaker()
    mockCanvas()
    await uploadPhotoAndOpenFaceStep(user)
    await user.click(screen.getByRole('button', { name: '다음 단계' }))
    await user.type(screen.getByLabelText(/대상 이름/), '완성')
    await user.click(screen.getByRole('button', { name: '인형 완성' }))

    await user.click(await screen.findByRole('button', { name: '저주방 들어가기' }))
    expect(await screen.findByRole('toolbar', { name: '저주방 도구' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '완성' })).toBeInTheDocument()
  })

  it('보관함에서 진입해 저장된 얼굴과 세로 이름을 렌더링하고 나간다', async () => {
    const { user } = await openCurseRoomFromArchive('보관')

    expect(screen.getByRole('img', { name: '보관 여성형 헝겊인형' }))
      .toHaveAttribute('src', expect.stringContaining('doll-female-base-v1.png'))
    const normalComposite = document.querySelector('.room-composite')
    const charredLayer = normalComposite?.querySelector('.composite-doll-charred')
    expect(normalComposite).not.toHaveAttribute('data-charred')
    expect(charredLayer).toHaveAttribute('src', expect.stringContaining('doll-female-charred-v1.png'))
    expect(charredLayer).toHaveAttribute('alt', '')
    expect(charredLayer).toHaveAttribute('aria-hidden', 'true')
    await waitFor(() => {
      expect(document.querySelector('.room-face-image')).toHaveAttribute('src', expect.stringContaining('blob:'))
    })
    expect(screen.getByLabelText('대상 이름 보관').querySelectorAll('span')).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: '← 나가기' }))
    expect(await screen.findByRole('heading', { name: '내 인형 보관함' })).toBeInTheDocument()
  })

  it('바늘을 상대 좌표로 추가하고 개별 제거한다', async () => {
    const { user, created } = await openCurseRoomFromArchive('추가')
    await user.click(screen.getByRole('button', { name: '바늘' }))
    const dollArea = mockDollBounds()
    fireEvent.click(dollArea, { clientX: 150, clientY: 247.5 })

    await waitFor(async () => {
      const stored = await getDoll(created.id)
      expect(stored?.interactionState.pins).toHaveLength(1)
      expect(stored?.interactionState.pins[0]).toMatchObject({ x: .5, y: .55 })
    })

    const removePinButton = screen.getByRole('button', { name: '추가 인형의 바늘 제거' })
    expect(removePinButton.querySelector('img')).toHaveAttribute('src', expect.stringContaining('needle-v1.png'))
    expect(removePinButton.querySelector('img')).toHaveAttribute('alt', '')
    await user.click(removePinButton)
    await waitFor(async () => {
      expect((await getDoll(created.id))?.interactionState.pins).toEqual([])
      expect(screen.queryByRole('button', { name: '추가 인형의 바늘 제거' })).not.toBeInTheDocument()
    })
  })

  it('바늘을 모두 빼고 저장한다', async () => {
    const { user, created } = await openCurseRoomFromArchive('전체')
    await user.click(screen.getByRole('button', { name: '바늘' }))
    const dollArea = mockDollBounds()
    fireEvent.click(dollArea, { clientX: 150, clientY: 247.5 })
    await screen.findByRole('button', { name: '전체 인형의 바늘 제거' })

    await user.click(screen.getByRole('button', { name: '바늘 모두 빼기' }))
    await waitFor(async () => {
      expect((await getDoll(created.id))?.interactionState.pins).toEqual([])
    })
    expect(screen.getByRole('button', { name: '바늘 모두 빼기' })).toBeDisabled()
  })

  it('저장된 바늘 위치를 다시 열 때 복원한다', async () => {
    const pin: Pin = {
      id: 'saved-pin',
      x: .42,
      y: .61,
      angle: 14,
      createdAt: '2026-08-28T00:00:00.000Z',
    }
    const created = await createDoll({ name: '복원', faceBlob: new Blob(['face'], { type: 'image/webp' }) })
    await updateDoll(created.id, {
      interactionState: { ...created.interactionState, pins: [pin] },
    })
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /내 인형 보관함/ }))
    await user.click(await screen.findByRole('button', { name: '열기' }))
    await user.click(await screen.findByRole('button', { name: '저주방 들어가기' }))

    const restored = await screen.findByRole('button', { name: '복원 인형의 바늘 제거' })
    expect(restored.getAttribute('style')).toContain('--pin-x: 42%')
    expect(restored.getAttribute('style')).toContain('--pin-y: 61%')
  })

  it('바늘 저장 실패 시 확정된 상태로 되돌리고 오류를 안내한다', async () => {
    const { user, created } = await openCurseRoomFromArchive('실패')
    await user.click(screen.getByRole('button', { name: '바늘' }))
    const dollArea = mockDollBounds()
    const originalIndexedDB = globalThis.indexedDB
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined })
    try {
      fireEvent.click(dollArea, { clientX: 150, clientY: 247.5 })
      expect(await screen.findByRole('alert')).toHaveTextContent('저장된 상태로 되돌렸습니다')
      expect(screen.queryByRole('button', { name: '실패 인형의 바늘 제거' })).not.toBeInTheDocument()
    } finally {
      Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: originalIndexedDB })
    }
    expect((await getDoll(created.id))?.interactionState.pins).toEqual([])
  })

  it('흔들기 도구로 포인터 드래그한 뒤 중앙으로 복귀한다', async () => {
    const { user } = await openCurseRoomFromArchive('흔들')
    const shakeButton = screen.getByRole('button', { name: '흔들기' })
    await user.click(shakeButton)
    expect(shakeButton).toHaveAttribute('aria-pressed', 'true')
    const dollArea = mockDollBounds()

    const pointerDown = new MouseEvent('pointerdown', { bubbles: true, clientX: 40 })
    const pointerMove = new MouseEvent('pointermove', { bubbles: true, clientX: 140 })
    const pointerUp = new MouseEvent('pointerup', { bubbles: true, clientX: 140 })
    Object.defineProperty(pointerDown, 'pointerId', { value: 1 })
    Object.defineProperty(pointerMove, 'pointerId', { value: 1 })
    Object.defineProperty(pointerUp, 'pointerId', { value: 1 })
    fireEvent(dollArea, pointerDown)
    fireEvent(dollArea, pointerMove)
    expect(screen.getByTestId('room-doll-transform').getAttribute('style')).toContain('rotate(12deg)')
    const cry = screen.getByTestId('shake-cry')
    expect(cry).toHaveTextContent('악!')
    expect(cry).toHaveClass('is-right')
    expect(cry).toHaveAttribute('aria-hidden', 'true')
    fireEvent(dollArea, pointerUp)
    expect(screen.getByTestId('room-doll-transform')).toHaveStyle({ transform: 'translateX(0px) rotate(0deg)' })
    expect(screen.getByTestId('room-doll-transform')).toHaveClass('is-returning')
    expect(screen.queryByTestId('shake-cry')).not.toBeInTheDocument()
  })

  it('흔들기 도구를 좌우 방향키로 조작하고 자동으로 중앙에 복귀한다', async () => {
    const { user } = await openCurseRoomFromArchive('키보드')
    await user.click(screen.getByRole('button', { name: '흔들기' }))
    const dollArea = screen.getByRole('application', { name: /좌우 방향키로 흔드세요/ })
    vi.useFakeTimers()

    fireEvent.keyDown(dollArea, { key: 'ArrowLeft' })
    expect(screen.getByTestId('room-doll-transform')).toHaveStyle({ transform: 'translateX(-48px) rotate(-8deg)' })
    expect(screen.getByTestId('shake-cry')).toHaveClass('is-left')

    act(() => vi.advanceTimersByTime(140))
    expect(screen.getByTestId('room-doll-transform')).toHaveStyle({ transform: 'translateX(0px) rotate(0deg)' })
    expect(screen.getByTestId('room-doll-transform')).toHaveClass('is-returning')

    act(() => vi.advanceTimersByTime(480))
    expect(screen.getByTestId('room-doll-transform')).not.toHaveClass('is-returning')
  })

  it('흔드는 방향이 바뀔 때만 제한적으로 새 악! 글씨를 표시한다', async () => {
    const { user } = await openCurseRoomFromArchive('반전')
    await user.click(screen.getByRole('button', { name: '흔들기' }))
    const dollArea = mockDollBounds()
    const dispatchPointer = (type: string, clientX: number) => {
      const event = new MouseEvent(type, { bubbles: true, clientX })
      Object.defineProperty(event, 'pointerId', { value: 7 })
      fireEvent(dollArea, event)
    }

    dispatchPointer('pointerdown', 100)
    dispatchPointer('pointermove', 140)
    expect(screen.getAllByTestId('shake-cry')).toHaveLength(1)

    dispatchPointer('pointermove', 145)
    dispatchPointer('pointermove', 148)
    expect(screen.getAllByTestId('shake-cry')).toHaveLength(1)

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200))
    })
    dispatchPointer('pointermove', 110)
    const cries = screen.getAllByTestId('shake-cry')
    expect(cries).toHaveLength(2)
    expect(cries[0]).toHaveClass('is-right')
    expect(cries[1]).toHaveClass('is-left')
    expect(cries.every((element) => element.getAttribute('aria-hidden') === 'true')).toBe(true)
    expect(document.querySelector('audio')).not.toBeInTheDocument()

    dispatchPointer('pointerup', 110)
    expect(screen.queryByTestId('shake-cry')).not.toBeInTheDocument()
  })

  it('인형 태우기와 정화하기 도구가 실제 확인 대화상자를 연다', async () => {
    const { user } = await openCurseRoomFromArchive('준비')
    await user.click(screen.getByRole('button', { name: '인형 태우기' }))
    const burnDialog = screen.getByRole('dialog', { name: '인형 태우기' })
    expect(within(burnDialog).getByText(/인형은 삭제되지 않으며/)).toBeInTheDocument()
    await user.click(within(burnDialog).getByRole('button', { name: '취소' }))

    await user.click(screen.getByRole('button', { name: '정화하기' }))
    expect(screen.getByRole('dialog', { name: '인형 정화하기' })).toHaveTextContent('얼굴 사진과 이름, 인형 자체는 그대로 유지됩니다')
  })
})

describe('인형 태우기', () => {
  it('999ms에 놓으면 진행률과 저장 상태를 초기화하고 실행하지 않는다', async () => {
    const { user, created } = await openCurseRoomFromArchive('중단')
    const frames = mockAnimationFrames()
    const dialog = await openDollBurnDialog(user)
    const holdButton = within(dialog).getByRole('button', { name: '1초간 눌러 인형 태우기' })

    fireEvent.pointerDown(holdButton, { pointerId: 1 })
    act(() => frames.runAt(999))
    expect(within(dialog).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '99')
    fireEvent.pointerUp(holdButton, { pointerId: 1 })

    expect(within(dialog).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
    expect(screen.queryByTestId('doll-burn-effect')).not.toBeInTheDocument()
    expect((await getDoll(created.id))?.interactionState.charredUntil).toBeNull()
  })

  it('1000ms 포인터 입력으로 ISO 만료 시각을 저장하고 별도 래퍼에서 연출한다', async () => {
    const { user, created } = await openCurseRoomFromArchive('연소')
    const beforeBurnRecord = await getDoll(created.id)
    const before = Date.now()
    const effect = await completeDollBurnHold(user)
    const after = Date.now()

    const stored = await getDoll(created.id)
    expect(stored?.interactionState.charredUntil).toEqual(expect.any(String))
    expect(Date.parse(stored?.interactionState.charredUntil ?? '')).toBeGreaterThan(before + 59_000)
    expect(Date.parse(stored?.interactionState.charredUntil ?? '')).toBeLessThanOrEqual(after + 60_000)
    expect(stored).toMatchObject({ id: created.id, name: created.name, createdAt: created.createdAt })
    expect(stored?.faceBlob).toEqual(beforeBurnRecord?.faceBlob)

    const charredDoll = document.querySelector('.room-composite')
    expect(charredDoll).toHaveAttribute('data-charred', 'true')
    const charredImage = charredDoll?.querySelector('.composite-doll-charred')
    expect(charredImage).toHaveAttribute('src', expect.stringContaining('doll-female-charred-v1.png'))
    expect(charredImage).toHaveAttribute('alt', '')
    expect(charredImage).toHaveAttribute('aria-hidden', 'true')
    const motionWrapper = screen.getByTestId('doll-burn-motion-wrapper')
    const manualTransform = screen.getByTestId('room-doll-transform')
    expect(motionWrapper).toHaveClass('is-burning')
    expect(motionWrapper).toContainElement(manualTransform)
    expect(manualTransform).toHaveStyle({ transform: 'translateX(0px) rotate(0deg)' })

    const flames = Array.from(effect.querySelectorAll('img'))
    expect(flames).toHaveLength(2)
    flames.forEach((flame) => {
      expect(flame).toHaveAttribute('src', expect.stringContaining('/assets/effects/talisman-flame-v1.png'))
      expect(flame).toHaveAttribute('alt', '')
      expect(flame).toHaveAttribute('aria-hidden', 'true')
    })
    within(screen.getByRole('toolbar', { name: '저주방 도구' }))
      .getAllByRole('button')
      .forEach((button) => expect(button).toBeDisabled())
    expect(screen.getByText('인형이 화면 속에서 타오릅니다.')).toBeInTheDocument()

    fireEvent.animationEnd(effect)
    await waitFor(() => expect(screen.getByRole('button', { name: '바늘' })).toBeEnabled())
    expect(screen.getByText('그을림은 1분 뒤 사라져요.')).toBeInTheDocument()
    expect(charredDoll).toHaveAttribute('data-charred', 'true')
  })

  it.each([
    ['Space', ' '],
    ['Enter', 'Enter'],
  ] as const)('%s 키를 1000ms 유지하면 실행한다', async (_label, key) => {
    const { user, created } = await openCurseRoomFromArchive('키입력')
    await completeDollBurnHold(user, key)

    expect((await getDoll(created.id))?.interactionState.charredUntil).toEqual(expect.any(String))
    expect(document.querySelector('.room-composite')).toHaveAttribute('data-charred', 'true')
  })

  it('저장 실패 시 불꽃과 그을림을 적용하지 않고 다시 누를 수 있게 복구한다', async () => {
    const { user, created } = await openCurseRoomFromArchive('실패')
    const frames = mockAnimationFrames()
    const dialog = await openDollBurnDialog(user)
    const holdButton = within(dialog).getByRole('button', { name: '1초간 눌러 인형 태우기' })
    const originalIndexedDB = globalThis.indexedDB

    fireEvent.pointerDown(holdButton, { pointerId: 2 })
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined })
    await act(async () => {
      frames.runAt(1000)
      await Promise.resolve()
    })
    expect(await within(dialog).findByText(/이전 모습으로 유지됩니다/)).toBeInTheDocument()
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: originalIndexedDB })

    expect(screen.queryByTestId('doll-burn-effect')).not.toBeInTheDocument()
    expect(document.querySelector('.room-composite')).not.toHaveAttribute('data-charred')
    expect(document.querySelector('.room-composite .composite-doll-charred'))
      .toHaveAttribute('src', expect.stringContaining('doll-female-charred-v1.png'))
    expect(within(dialog).getByRole('button', { name: '1초간 눌러 인형 태우기' })).toBeEnabled()
    expect((await getDoll(created.id))?.interactionState.charredUntil).toBeNull()
  })

  it('재진입 시 남은 그을림을 복원하고 보관함 카드에도 표시한다', async () => {
    const created = await createDoll({ name: '복원', faceBlob: new Blob(['face'], { type: 'image/webp' }) })
    const charredUntil = new Date(Date.now() + 45_000).toISOString()
    await updateDoll(created.id, {
      interactionState: { ...created.interactionState, charredUntil },
    })
    const user = await openExistingDollInCurseRoom()

    expect(document.querySelector('.room-composite')).toHaveAttribute('data-charred', 'true')
    expect(screen.queryByTestId('doll-burn-effect')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '← 나가기' }))
    const state = await screen.findByLabelText('복원 인형 상태')
    expect(state).toHaveTextContent('그을림')
    const archiveComposite = document.querySelector('.stored-doll-preview .composite-doll')
    expect(archiveComposite).toHaveAttribute('data-charred', 'true')
    const archiveCharredImage = archiveComposite?.querySelector('.composite-doll-charred')
    expect(archiveCharredImage).toHaveAttribute('src', expect.stringContaining('doll-female-charred-v1.png'))
    expect(archiveCharredImage).toHaveAttribute('alt', '')
    expect(archiveCharredImage).toHaveAttribute('aria-hidden', 'true')
    await waitFor(() => expect(archiveComposite?.querySelector('.face-layer img')).toBeInTheDocument())
    expect(archiveComposite?.querySelector('.name-layer')).toHaveTextContent('복원')
  })

  it('만료된 그을림은 진입 즉시 화면과 IndexedDB에서 정리한다', async () => {
    const created = await createDoll({ name: '만료', faceBlob: new Blob(['face'], { type: 'image/webp' }) })
    await updateDoll(created.id, {
      interactionState: {
        ...created.interactionState,
        charredUntil: new Date(Date.now() - 1_000).toISOString(),
      },
    })
    await openExistingDollInCurseRoom()

    expect(document.querySelector('.room-composite')).not.toHaveAttribute('data-charred')
    expect(document.querySelector('.room-composite .composite-doll-base'))
      .toHaveAttribute('src', expect.stringContaining('doll-female-base-v1.png'))
    expect(screen.getByText('인형의 그을림이 사라졌어요.')).toBeInTheDocument()
    await waitFor(async () => {
      expect((await getDoll(created.id))?.interactionState.charredUntil).toBeNull()
    })
  })

  it('비활성 탭에서 돌아오면 실제 현재 시각으로 만료를 다시 확인한다', async () => {
    const created = await createDoll({ name: '탭복귀', faceBlob: new Blob(['face'], { type: 'image/webp' }) })
    const expiresAt = Date.now() + 30_000
    await updateDoll(created.id, {
      interactionState: {
        ...created.interactionState,
        charredUntil: new Date(expiresAt).toISOString(),
      },
    })
    await openExistingDollInCurseRoom()
    expect(document.querySelector('.room-composite')).toHaveAttribute('data-charred', 'true')

    vi.spyOn(Date, 'now').mockReturnValue(expiresAt + 1)
    fireEvent(document, new Event('visibilitychange'))

    await waitFor(async () => expect((await getDoll(created.id))?.interactionState.charredUntil).toBeNull())
    expect(document.querySelector('.room-composite')).not.toHaveAttribute('data-charred')
  })

  it('보관함 카드는 만료된 그을림 값을 정상 상태로 처리한다', async () => {
    const created = await createDoll({ name: '카드', faceBlob: new Blob(['face'], { type: 'image/webp' }) })
    await updateDoll(created.id, {
      interactionState: {
        ...created.interactionState,
        charredUntil: new Date(Date.now() - 1_000).toISOString(),
      },
    })
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /내 인형 보관함/ }))

    expect(await screen.findByLabelText('카드 인형 상태')).toHaveTextContent('깨끗함')
    expect(document.querySelector('.stored-doll-preview .composite-doll')).not.toHaveAttribute('data-charred')
  })

  it('저장 시 설정한 60초 타이머가 화면과 IndexedDB를 자동 복구한다', async () => {
    const timeoutSpy = vi.spyOn(window, 'setTimeout')
    const { user, created } = await openCurseRoomFromArchive('자동')
    await completeDollBurnHold(user)
    const expiryCall = timeoutSpy.mock.calls.find(([, delay]) => (
      typeof delay === 'number' && delay > 59_000 && delay <= 60_000
    ))
    expect(expiryCall).toBeDefined()
    const storedExpiry = Date.parse((await getDoll(created.id))?.interactionState.charredUntil ?? '')
    vi.spyOn(Date, 'now').mockReturnValue(storedExpiry)

    await act(async () => {
      const callback = expiryCall?.[0]
      if (typeof callback === 'function') callback()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(document.querySelector('.room-composite')).not.toHaveAttribute('data-charred')
    await waitFor(async () => expect((await getDoll(created.id))?.interactionState.charredUntil).toBeNull())
    expect(screen.getByText('인형의 그을림이 사라졌어요.')).toBeInTheDocument()
  })

  it('화면 이탈 시 남은 그을림 타이머를 정리한다', async () => {
    const timeoutSpy = vi.spyOn(window, 'setTimeout')
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout')
    const created = await createDoll({ name: '정리', faceBlob: new Blob(['face'], { type: 'image/webp' }) })
    await updateDoll(created.id, {
      interactionState: {
        ...created.interactionState,
        charredUntil: new Date(Date.now() + 50_000).toISOString(),
      },
    })
    const user = await openExistingDollInCurseRoom()
    const expiryIndex = timeoutSpy.mock.calls.findIndex(([, delay]) => typeof delay === 'number' && delay > 49_000)
    const timerId = timeoutSpy.mock.results[expiryIndex]?.value

    await user.click(screen.getByRole('button', { name: '← 나가기' }))

    expect(expiryIndex).toBeGreaterThanOrEqual(0)
    expect(clearTimeoutSpy).toHaveBeenCalledWith(timerId)
  })

  it('움직임 감소 환경에서도 저장과 불꽃 표시를 동일하게 실행한다', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)', media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(),
      removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    })))
    const { user, created } = await openCurseRoomFromArchive('감소')
    const effect = await completeDollBurnHold(user)

    expect(effect.querySelectorAll('img')).toHaveLength(2)
    expect((await getDoll(created.id))?.interactionState.charredUntil).toEqual(expect.any(String))
    expect(document.querySelector('.room-composite')).toHaveAttribute('data-charred', 'true')
  })
})

describe('정화하기', () => {
  const preparedPin: Pin = {
    id: 'purify-pin', x: .5, y: .55, angle: 3, createdAt: '2026-08-31T00:00:00.000Z',
  }

  async function createPreparedDoll(name: string) {
    const created = await createDoll({ name, faceBlob: new Blob(['kept-face'], { type: 'image/webp' }) })
    return updateDoll(created.id, {
      interactionState: {
        pins: [preparedPin],
        selectedCurse: 'mansabultong',
        talismanStatus: 'attached',
        charredUntil: new Date(Date.now() + 50_000).toISOString(),
      },
    })
  }

  it('취소와 Escape는 아무 상태도 바꾸지 않고 정화 버튼으로 포커스를 돌린다', async () => {
    const prepared = await createPreparedDoll('취소')
    const user = await openExistingDollInCurseRoom()
    const purifyButton = screen.getByRole('button', { name: '정화하기' })
    await user.click(purifyButton)
    const dialog = screen.getByRole('dialog', { name: '인형 정화하기' })
    await user.click(within(dialog).getByRole('button', { name: '취소' }))
    await waitFor(() => expect(purifyButton).toHaveFocus())
    expect((await getDoll(prepared.id))?.interactionState).toEqual(prepared.interactionState)

    await user.click(purifyButton)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: '인형 정화하기' })).not.toBeInTheDocument()
    await waitFor(() => expect(purifyButton).toHaveFocus())
    expect((await getDoll(prepared.id))?.interactionState).toEqual(prepared.interactionState)
  })

  it('확정 시 상호작용만 한 번에 초기화하고 얼굴·이름·ID와 인형 레코드를 유지한다', async () => {
    const prepared = await createPreparedDoll('정화')
    const user = await openExistingDollInCurseRoom()
    const putSpy = vi.spyOn(IDBObjectStore.prototype, 'put')
    await user.click(screen.getByRole('button', { name: '정화하기' }))
    const confirm = within(screen.getByRole('dialog', { name: '인형 정화하기' }))
      .getByRole('button', { name: '모두 정화하기' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)

    expect(await screen.findByText('인형을 깨끗하게 정화했어요.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: '정화하기' })).not.toBeDisabled())
    expect(putSpy).toHaveBeenCalledTimes(1)
    const stored = await getDoll(prepared.id)
    expect(stored?.interactionState).toEqual({
      pins: [], selectedCurse: null, talismanStatus: null, charredUntil: null,
    })
    expect(stored).toMatchObject({ id: prepared.id, name: prepared.name, createdAt: prepared.createdAt })
    expect(stored?.faceBlob).toEqual(prepared.faceBlob)
    expect(screen.queryByRole('button', { name: '정화 인형의 바늘 제거' })).not.toBeInTheDocument()
    expect(screen.queryByRole('img', { name: '만사불통 부적' })).not.toBeInTheDocument()
    expect(document.querySelector('.room-composite')).not.toHaveAttribute('data-charred')
    expect(document.querySelector('.room-composite .composite-doll-base'))
      .toHaveAttribute('src', expect.stringContaining('doll-female-base-v1.png'))
    expect(screen.queryByTestId('shake-cry')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '← 나가기' }))
    expect(await screen.findByLabelText('정화 인형 상태')).toHaveTextContent('깨끗함')
  })

  it('저장 실패 시 화면과 저장된 상호작용 상태를 모두 유지한다', async () => {
    const prepared = await createPreparedDoll('실패')
    const user = await openExistingDollInCurseRoom()
    await user.click(screen.getByRole('button', { name: '정화하기' }))
    const dialog = screen.getByRole('dialog', { name: '인형 정화하기' })
    const originalIndexedDB = globalThis.indexedDB
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined })
    fireEvent.click(within(dialog).getByRole('button', { name: '모두 정화하기' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('기존 상태는 그대로 유지됩니다')
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: originalIndexedDB })

    expect((await getDoll(prepared.id))?.interactionState).toEqual(prepared.interactionState)
    expect(screen.getByRole('button', { name: '실패 인형의 바늘 제거' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '만사불통 부적' })).toBeInTheDocument()
    expect(document.querySelector('.room-composite')).toHaveAttribute('data-charred', 'true')
  })
})

describe('부적 선택과 부착', () => {
  it('부적 버튼으로 패널을 열고 Escape로 닫은 뒤 버튼으로 포커스를 돌린다', async () => {
    const { user } = await openCurseRoomFromArchive('패널')
    const talismanButton = screen.getByRole('button', { name: '부적' })
    const panel = await openTalismanPanel(user)

    expect(panel).toBeInTheDocument()
    expect(talismanButton).toHaveAttribute('aria-pressed', 'true')
    expect(within(panel).getByRole('tab', { name: '오컬트 저주' })).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: '부적 선택' })).not.toBeInTheDocument()
    expect(talismanButton).toHaveFocus()
  })

  it('오컬트와 장난 저주 탭에 승인된 항목을 정확히 5개씩 표시한다', async () => {
    const { user } = await openCurseRoomFromArchive('목록')
    const panel = await openTalismanPanel(user)
    const occultList = within(panel).getByRole('list', { name: '오컬트 저주 목록' })

    expect(within(occultList).getAllByRole('button')).toHaveLength(5)
    expect(within(occultList).getByRole('button', { name: /^만사불통/ })).toBeInTheDocument()
    expect(within(occultList).getByRole('button', { name: /^인연단절/ })).toBeInTheDocument()

    await user.click(within(panel).getByRole('tab', { name: '장난 저주' }))
    expect(within(panel).getByRole('tab', { name: '장난 저주' })).toHaveAttribute('aria-selected', 'true')
    const prankList = within(panel).getByRole('list', { name: '장난 저주 목록' })
    expect(within(prankList).getAllByRole('button')).toHaveLength(5)
    expect(within(prankList).getByRole('button', { name: /^양말축축/ })).toBeInTheDocument()
    expect(within(prankList).getByRole('button', { name: /^엘베놓침/ })).toBeInTheDocument()
  })

  it('저주를 미리 본 뒤 2×2 이름 장식과 저장 상태를 반영한다', async () => {
    const { user, created } = await openCurseRoomFromArchive('부착')
    const panel = await selectTalisman(user, '만사불통')
    const preview = within(panel).getByRole('img', { name: '만사불통 부적' })
    expect(preview).toHaveAttribute('data-aspect-ratio', '1:1.8')
    expect(preview.querySelectorAll('.talisman-writing > span')).toHaveLength(4)
    expect(preview.querySelector('.talisman-frame')).toBeInTheDocument()
    expect(preview.querySelectorAll('.talisman-ornament i')).toHaveLength(18)

    await user.click(within(panel).getByRole('button', { name: '이 부적 붙이기' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '부적 선택' })).not.toBeInTheDocument())

    const attached = screen.getByRole('img', { name: '만사불통 부적' })
    expect(attached).toHaveAttribute('data-aspect-ratio', '1:1.8')
    expect(attached.querySelectorAll('.talisman-writing > span')).toHaveLength(4)
    await waitFor(async () => {
      const stored = await getDoll(created.id)
      expect(stored).toBeDefined()
      expect(stored?.interactionState.selectedCurse).toBe('mansabultong')
      expect(stored?.interactionState.talismanStatus).toBe('attached')
      expect(stored!.updatedAt >= created.updatedAt).toBe(true)
    })
  })

  it('기존 부적 교체 확인을 Escape와 취소 버튼으로 취소한다', async () => {
    const { user, created } = await openCurseRoomFromArchive('교체')
    let panel = await selectTalisman(user, '만사불통')
    await user.click(within(panel).getByRole('button', { name: '이 부적 붙이기' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '부적 선택' })).not.toBeInTheDocument())

    panel = await selectTalisman(user, '망신살이')
    await user.click(within(panel).getByRole('button', { name: '이 부적 붙이기' }))
    expect(screen.getByRole('dialog', { name: '기존 부적을 바꿀까요?' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: '기존 부적을 바꿀까요?' })).not.toBeInTheDocument()

    await user.click(within(panel).getByRole('button', { name: '이 부적 붙이기' }))
    await user.click(screen.getByRole('button', { name: '교체 취소' }))
    expect(screen.queryByRole('dialog', { name: '기존 부적을 바꿀까요?' })).not.toBeInTheDocument()
    expect((await getDoll(created.id))?.interactionState.selectedCurse).toBe('mansabultong')

    await user.click(within(panel).getByRole('button', { name: '취소' }))
    expect(document.querySelector('.talisman-layer .talisman-paper')).toHaveAttribute('aria-label', '만사불통 부적')
  })

  it('교체를 확인하면 새 부적을 저장하면서 기존 바늘 상태를 보존한다', async () => {
    const { user, created } = await openCurseRoomFromArchive('확인')
    await user.click(screen.getByRole('button', { name: '바늘' }))
    const dollArea = mockDollBounds()
    fireEvent.click(dollArea, { clientX: 150, clientY: 247.5 })
    await waitFor(async () => expect((await getDoll(created.id))?.interactionState.pins).toHaveLength(1))

    let panel = await selectTalisman(user, '만사불통')
    await user.click(within(panel).getByRole('button', { name: '이 부적 붙이기' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '부적 선택' })).not.toBeInTheDocument())

    panel = await selectTalisman(user, '망신살이')
    expect(within(panel).getByRole('button', { name: /^만사불통/ })).toHaveClass('is-attached')
    await user.click(within(panel).getByRole('button', { name: '이 부적 붙이기' }))
    await user.click(screen.getByRole('button', { name: '교체하기' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '부적 선택' })).not.toBeInTheDocument())

    expect(screen.getByRole('img', { name: '망신살이 부적' })).toBeInTheDocument()
    await waitFor(async () => {
      const stored = await getDoll(created.id)
      expect(stored?.interactionState.selectedCurse).toBe('mangsinsari')
      expect(stored?.interactionState.talismanStatus).toBe('attached')
      expect(stored?.interactionState.pins).toHaveLength(1)
    })
  })

  it('부적 저장 실패 시 기존 부적 상태로 복구하고 오류를 표시한다', async () => {
    const { user, created } = await openCurseRoomFromArchive('오류')
    let panel = await selectTalisman(user, '만사불통')
    await user.click(within(panel).getByRole('button', { name: '이 부적 붙이기' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '부적 선택' })).not.toBeInTheDocument())

    panel = await selectTalisman(user, '악운강림')
    await user.click(within(panel).getByRole('button', { name: '이 부적 붙이기' }))
    const originalIndexedDB = globalThis.indexedDB
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined })
    try {
      await user.click(screen.getByRole('button', { name: '교체하기' }))
      expect(await within(panel).findByRole('alert')).toHaveTextContent('기존 부적은 그대로 유지됩니다')
    } finally {
      Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: originalIndexedDB })
    }

    expect((await getDoll(created.id))?.interactionState.selectedCurse).toBe('mansabultong')
    await user.click(within(panel).getByRole('button', { name: '취소' }))
    expect(screen.getByRole('img', { name: '만사불통 부적' })).toBeInTheDocument()
  })

  it('저주방 재진입 시 부적을 복원하되 효과는 자동 재생하지 않는다', async () => {
    const { user } = await openCurseRoomFromArchive('복귀')
    const panel = await selectTalisman(user, '양말축축', 'prank')
    await user.click(within(panel).getByRole('button', { name: '이 부적 붙이기' }))
    expect(await screen.findByTestId('curse-effect-yangmalchukchuk')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '← 나가기' }))
    await screen.findByRole('heading', { name: '내 인형 보관함' })
    await user.click(screen.getByRole('button', { name: '열기' }))
    await user.click(await screen.findByRole('button', { name: '저주방 들어가기' }))

    expect(await screen.findByRole('img', { name: '양말축축 부적' })).toBeInTheDocument()
    expect(screen.queryByTestId('curse-effect-yangmalchukchuk')).not.toBeInTheDocument()
  })

  it.each(CURSES)('$name 부착 성공 직후 해당 시각 효과를 한 번 표시한다', async (curse) => {
    const { user } = await openCurseRoomFromArchive('효과')
    const panel = await selectTalisman(user, curse.name, curse.category)
    await user.click(within(panel).getByRole('button', { name: '이 부적 붙이기' }))

    const effect = await screen.findByTestId(`curse-effect-${curse.id}`)
    const effectImages = effect.querySelectorAll('img')
    expect(effect).toHaveAttribute('aria-hidden', 'true')
    expect(effectImages.length).toBe(curse.id === 'elbenotchim' ? 2 : 1)
    effectImages.forEach((image) => {
      expect(image).toHaveAttribute('src', expect.stringContaining(`/assets/effects/curse-${curse.id}.png`))
      expect(image).toHaveAttribute('alt', '')
    })
    expect(effect.querySelector('i')).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: `${curse.name} 부적` })).toBeInTheDocument()
  })

  it('효과 이미지가 로드되지 않아도 부적 부착 상태를 유지한다', async () => {
    const { user } = await openCurseRoomFromArchive('오류')
    await attachTalisman(user)
    const effect = await screen.findByTestId('curse-effect-mansabultong')
    const image = effect.querySelector('img')

    expect(image).not.toBeNull()
    fireEvent.error(image!)
    expect(image).toHaveAttribute('hidden')
    expect(effect).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '만사불통 부적' })).toBeInTheDocument()
  })

  it('움직임 감소 환경에서도 부착 성공 효과 이미지를 렌더링한다', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })))
    const { user } = await openCurseRoomFromArchive('감소')
    await attachTalisman(user, '악운강림')

    const effect = await screen.findByTestId('curse-effect-agungangrim')
    expect(effect.querySelector('img')).toHaveAttribute(
      'src',
      expect.stringContaining('/assets/effects/curse-agungangrim.png'),
    )
  })
})

describe('통합 주문과 부적 태우기', () => {
  it('도구 모음에서 독립 주문 버튼과 부적 없는 주문 진입 경로를 제거한다', async () => {
    await openCurseRoomFromArchive('준비')
    const toolbar = screen.getByRole('toolbar', { name: '저주방 도구' })

    expect(within(toolbar).getAllByRole('button')).toHaveLength(5)
    expect(within(toolbar).queryByRole('button', { name: '주문 외우기' })).not.toBeInTheDocument()
    expect(screen.queryByText('먼저 부적을 붙여 주세요')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: /주문 외우기/ })).not.toBeInTheDocument()
  })

  it('부적 태우기 확인 후 동일 비율 부적과 주문 문구가 있는 주문 화면을 연다', async () => {
    const { user } = await openCurseRoomFromArchive('주문')
    await attachTalisman(user)
    const panel = await openBurnSpell(user)

    expect(within(panel).getByText('주문을 마치면 부적이 타오릅니다')).toBeInTheDocument()
    expect(within(panel).getByText((_, element) => element?.classList.contains('spell-chant') === true))
      .toHaveTextContent('실실 꼬여 길길 막혀, 만사불통 얍!')
    expect(within(panel).getByRole('progressbar', { name: '주문 시전 진행률' })).toHaveAttribute('aria-valuenow', '0')
    expect(within(panel).getByRole('img', { name: '만사불통 부적' })).toHaveAttribute('data-aspect-ratio', '1:1.8')
    const visibleTalismanSurfaces = Array.from(document.querySelectorAll('.talisman-paper'))
    expect(visibleTalismanSurfaces.length).toBeGreaterThanOrEqual(3)
    expect(visibleTalismanSurfaces.every((surface) => surface.getAttribute('data-aspect-ratio') === '1:1.8')).toBe(true)
    expect(within(panel).getByRole('button', { name: '길게 눌러 주문 외우기' })).toHaveFocus()
    expect(screen.queryByTestId('talisman-burn-effect')).not.toBeInTheDocument()
  })

  it('Escape로 주문을 취소하면 부적과 저주를 유지하고 태우기 버튼으로 포커스를 돌린다', async () => {
    const { user, created } = await openCurseRoomFromArchive('취소')
    await attachTalisman(user)
    await openBurnSpell(user)

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog', { name: '만사불통 주문 외우기' })).not.toBeInTheDocument()
    const burnButton = screen.getByRole('button', { name: '부적 태우기' })
    await waitFor(() => expect(burnButton).toHaveFocus())
    expect(screen.queryByTestId('talisman-burn-effect')).not.toBeInTheDocument()
    expect((await getDoll(created.id))?.interactionState.selectedCurse).toBe('mansabultong')
    expect((await getDoll(created.id))?.interactionState.talismanStatus).toBe('attached')
  })

  it('1.5초 전에 놓거나 취소하면 진행을 초기화하고 연소하지 않는다', async () => {
    const { user } = await openCurseRoomFromArchive('중단')
    await attachTalisman(user)
    const frames = mockAnimationFrames()
    const panel = await openBurnSpell(user)
    const holdButton = within(panel).getByRole('button', { name: '길게 눌러 주문 외우기' })

    fireEvent.pointerDown(holdButton, { pointerId: 1 })
    act(() => frames.runAt(1499))
    expect(within(panel).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '99')
    expect(screen.queryByTestId('talisman-burn-effect')).not.toBeInTheDocument()
    fireEvent.pointerUp(holdButton, { pointerId: 1 })
    expect(within(panel).getByText('주문이 취소됐어요')).toBeInTheDocument()
    expect(within(panel).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
    expect(screen.queryByTestId('talisman-burn-effect')).not.toBeInTheDocument()

    await user.click(within(panel).getByRole('button', { name: '취소하고 돌아가기' }))
    expect(frames.cancel).toHaveBeenCalled()
    expect(document.querySelector('.talisman-layer .talisman-paper')).toHaveAttribute('aria-label', '만사불통 부적')
  })

  it('현재 부적 정보에서 태우기 확인을 취소하면 저장 상태를 유지한다', async () => {
    const { user, created } = await openCurseRoomFromArchive('확인')
    await attachTalisman(user)
    await user.click(screen.getByRole('button', { name: '부적' }))
    const infoPanel = await screen.findByRole('dialog', { name: '만사불통' })
    await user.click(within(infoPanel).getByRole('button', { name: '부적 태우기' }))
    const confirm = screen.getByRole('dialog', { name: '만사불통 부적을 태울까요?' })

    await user.click(within(confirm).getByRole('button', { name: '취소' }))

    expect(screen.queryByRole('dialog', { name: '만사불통 부적을 태울까요?' })).not.toBeInTheDocument()
    expect(within(infoPanel).getByRole('button', { name: '부적 태우기' })).toHaveFocus()
    expect((await getDoll(created.id))?.interactionState.selectedCurse).toBe('mansabultong')
  })

  it('불꽃 후반부에 maximum 효과와 주문을 표시하고 불꽃 종료 후 같은 효과를 유지한다', async () => {
    const { user } = await openCurseRoomFromArchive('절정')
    await attachTalisman(user)
    const frames = mockAnimationFrames()
    const panel = await openBurnSpell(user)
    const holdButton = within(panel).getByRole('button', { name: '길게 눌러 주문 외우기' })
    vi.useFakeTimers()

    fireEvent.pointerDown(holdButton, { pointerId: 1 })
    fireEvent.pointerDown(holdButton, { pointerId: 1 })
    expect(frames.request).toHaveBeenCalledTimes(1)
    act(() => frames.runAt(1500))

    expect(screen.queryByRole('dialog', { name: '만사불통 주문 외우기' })).not.toBeInTheDocument()
    const burnEffect = screen.getByTestId('talisman-burn-effect')
    const burnImages = Array.from(burnEffect.querySelectorAll('img'))
    expect(burnImages).toHaveLength(3)
    expect(burnImages[0]).toHaveAttribute('src', expect.stringContaining('/assets/effects/talisman-flame-v1.png'))
    expect(burnImages[1]).toHaveAttribute('src', expect.stringContaining('/assets/effects/talisman-flame-v1.png'))
    expect(burnImages[2]).toHaveAttribute('src', expect.stringContaining('/assets/effects/talisman-ash-v1.png'))
    burnImages.forEach((image) => expect(image).toHaveAttribute('alt', ''))
    expect(burnEffect.querySelector('i')).toBeNull()
    expect(screen.queryByTestId('curse-effect-mansabultong')).not.toBeInTheDocument()
    expect(screen.queryByText('실실 꼬여 길길 막혀, 만사불통 얍!')).not.toBeInTheDocument()
    expect(screen.getByText('만사불통 부적이 화면 속에서 타오릅니다.')).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(TALISMAN_EFFECT_START_MS - 1))
    expect(screen.queryByTestId('curse-effect-mansabultong')).not.toBeInTheDocument()
    expect(screen.queryByText('실실 꼬여 길길 막혀, 만사불통 얍!')).not.toBeInTheDocument()

    act(() => vi.advanceTimersByTime(1))
    const maximumEffect = screen.getByTestId('curse-effect-mansabultong')
    expect(maximumEffect).toHaveClass('is-maximum')
    expect(maximumEffect).toHaveAttribute('data-effect-intensity', 'maximum')
    const roomChant = screen.getByText('실실 꼬여 길길 막혀, 만사불통 얍!')
    expect(roomChant).toHaveClass('room-burn-chant')
    expect(roomChant).toHaveAttribute('role', 'status')
    expect(roomChant).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByText('만사불통의 기운이 최고조로 치솟습니다.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '정화하기' })).toBeDisabled()
    expect(screen.queryByTestId('chant-burst')).not.toBeInTheDocument()
    expect(TALISMAN_EFFECT_START_MS).toBe(TALISMAN_BURN_DURATION_MS - TALISMAN_EFFECT_OVERLAP_MS)

    act(() => {
      vi.advanceTimersByTime(TALISMAN_EFFECT_OVERLAP_MS - 1)
    })
    expect(screen.getByTestId('talisman-burn-effect')).toBeInTheDocument()
    vi.useRealTimers()
    await finishTalismanBurnAnimation()

    expect(screen.queryByTestId('talisman-burn-effect')).not.toBeInTheDocument()
    expect(screen.getByTestId('curse-effect-mansabultong')).toBe(maximumEffect)
    expect(screen.getByText('실실 꼬여 길길 막혀, 만사불통 얍!')).toBe(roomChant)
    expect(await screen.findByText('부적은 재가 되고 저주는 화면 속에서 끝났습니다.')).toBeInTheDocument()
  })

  it('키보드 Space로 주문을 완료한 뒤 부적 상태만 초기화하고 바늘을 유지한다', async () => {
    const { user, created } = await openCurseRoomFromArchive('태우기')
    await user.click(screen.getByRole('button', { name: '바늘' }))
    fireEvent.click(mockDollBounds(), { clientX: 150, clientY: 247.5 })
    await waitFor(async () => expect((await getDoll(created.id))?.interactionState.pins).toHaveLength(1))
    await attachTalisman(user)
    const frames = mockAnimationFrames()
    const panel = await openBurnSpell(user)
    const holdButton = within(panel).getByRole('button', { name: '길게 눌러 주문 외우기' })
    fireEvent.keyDown(holdButton, { key: ' ' })
    act(() => frames.runAt(1500))
    fireEvent.keyUp(holdButton, { key: ' ' })
    expect(await screen.findByTestId('talisman-burn-effect')).toBeInTheDocument()
    expect(screen.queryByText('실실 꼬여 길길 막혀, 만사불통 얍!')).not.toBeInTheDocument()
    await finishTalismanBurnAnimation()

    expect(await screen.findByText('부적은 재가 되고 저주는 화면 속에서 끝났습니다.')).toBeInTheDocument()
    const stored = await getDoll(created.id)
    expect(stored?.interactionState.selectedCurse).toBeNull()
    expect(stored?.interactionState.talismanStatus).toBeNull()
    expect(stored?.interactionState.pins).toHaveLength(1)
    expect(screen.getByRole('toolbar', { name: '저주방 도구' })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: '만사불통 부적' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('talisman-burn-effect')).not.toBeInTheDocument()
    expect(screen.queryByText('실실 꼬여 길길 막혀, 만사불통 얍!')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '주문 외우기' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '부적' }))
    expect(await screen.findByRole('dialog', { name: '부적 선택' })).toBeInTheDocument()
  })

  it('부적 태우기 저장 실패 시 이전 부적을 복원하고 다시 시도할 수 있다', async () => {
    const { user, created } = await openCurseRoomFromArchive('실패')
    await attachTalisman(user)
    const frames = mockAnimationFrames()
    const panel = await openBurnSpell(user)
    const originalIndexedDB = globalThis.indexedDB

    fireEvent.pointerDown(within(panel).getByRole('button', { name: '길게 눌러 주문 외우기' }), { pointerId: 1 })
    act(() => frames.runAt(1500))
    await screen.findByTestId('talisman-burn-effect')
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined })
    await finishTalismanBurnAnimation()
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: originalIndexedDB })

    expect(await screen.findByText('부적 상태를 저장하지 못했어요. 다시 시도해 주세요.')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '만사불통 부적' })).toBeInTheDocument()
    expect((await getDoll(created.id))?.interactionState.selectedCurse).toBe('mansabultong')
    await user.click(screen.getByRole('button', { name: '부적' }))
    expect(await screen.findByRole('button', { name: '부적 태우기' })).toBeEnabled()
  })

  it('태운 부적은 저주방에 다시 들어와도 복원되지 않는다', async () => {
    const { user } = await openCurseRoomFromArchive('재진입')
    await attachTalisman(user)
    const frames = mockAnimationFrames()
    const panel = await openBurnSpell(user)
    fireEvent.pointerDown(within(panel).getByRole('button', { name: '길게 눌러 주문 외우기' }), { pointerId: 1 })
    act(() => frames.runAt(1500))
    await screen.findByTestId('talisman-burn-effect')
    await finishTalismanBurnAnimation()
    await screen.findByText('부적은 재가 되고 저주는 화면 속에서 끝났습니다.')

    await user.click(screen.getByRole('button', { name: '← 나가기' }))
    await screen.findByRole('heading', { name: '내 인형 보관함' })
    await user.click(screen.getByRole('button', { name: '열기' }))
    await user.click(await screen.findByRole('button', { name: '저주방 들어가기' }))

    expect(screen.queryByRole('button', { name: '주문 외우기' })).not.toBeInTheDocument()
    expect(screen.queryByRole('img', { name: '만사불통 부적' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('talisman-burn-effect')).not.toBeInTheDocument()
    expect(screen.queryByTestId('curse-effect-mansabultong')).not.toBeInTheDocument()
  })

  it('연소 중 저주방을 나가면 남은 연소 타이머를 정리하고 부적 상태를 유지한다', async () => {
    const { user, created } = await openCurseRoomFromArchive('정리')
    await attachTalisman(user)
    const frames = mockAnimationFrames()
    const panel = await openBurnSpell(user)
    fireEvent.pointerDown(within(panel).getByRole('button', { name: '길게 눌러 주문 외우기' }), { pointerId: 1 })
    act(() => frames.runAt(1500))
    await screen.findByTestId('talisman-burn-effect')
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout')

    await user.click(screen.getByRole('button', { name: '← 나가기' }))
    await screen.findByRole('heading', { name: '내 인형 보관함' })

    expect(clearTimeoutSpy).toHaveBeenCalled()
    expect(screen.queryByTestId('talisman-burn-effect')).not.toBeInTheDocument()
    expect((await getDoll(created.id))?.interactionState.selectedCurse).toBe('mansabultong')
    expect((await getDoll(created.id))?.interactionState.talismanStatus).toBe('attached')
  })

  it('움직임 감소 환경에서도 주문 완료부터 연소 저장까지 진행한다', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)', media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(),
      removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    })))
    const { user, created } = await openCurseRoomFromArchive('감소')
    await attachTalisman(user)
    const frames = mockAnimationFrames()
    const panel = await openBurnSpell(user)
    vi.useFakeTimers()
    fireEvent.pointerDown(within(panel).getByRole('button', { name: '길게 눌러 주문 외우기' }), { pointerId: 1 })
    act(() => frames.runAt(1500))
    expect(screen.getByTestId('talisman-burn-effect')).toBeInTheDocument()
    expect(screen.queryByTestId('curse-effect-mansabultong')).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(TALISMAN_EFFECT_START_MS))
    expect(screen.getByTestId('curse-effect-mansabultong')).toHaveAttribute('data-effect-intensity', 'maximum')
    vi.useRealTimers()
    await finishTalismanBurnAnimation()
    await waitFor(async () => expect((await getDoll(created.id))?.interactionState.selectedCurse).toBeNull())
  })
})

describe('서비스 안내 모달', () => {
  it('안내 내용을 열고 닫기 버튼으로 닫는다', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '서비스 안내' }))
    const dialog = screen.getByRole('dialog', { name: '안심하고 마음을 놓아두세요' })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText(/실제 효력을 주장하지 않는 가상 스트레스 해소 놀이입니다/)).toBeInTheDocument()
    expect(screen.getByText(/사용자 콘텐츠를 다른 사람에게 공개하거나 전송하지 않습니다/)).toBeInTheDocument()
    expect(screen.getByText(/만 14세 이상 이용을 권장합니다/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '서비스 안내 닫기' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Escape 키로 모달을 닫고 서비스 안내 버튼에 포커스를 돌려준다', async () => {
    const user = userEvent.setup()
    render(<App />)

    const openButton = screen.getByRole('button', { name: '서비스 안내' })
    await user.click(openButton)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(openButton).toHaveFocus()
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import {
  DOLL_LIMIT_MESSAGE,
  MAX_DOLLS,
  countDolls,
  createDoll,
  deleteAllDolls,
  deleteDoll,
  getAllDolls,
  getDoll,
  markDollUsed,
  renameDoll,
  updateDoll,
} from '../src/dollDatabase'

const faceBlob = () => new Blob(['webp-face'], { type: 'image/webp' })

beforeEach(async () => {
  await deleteAllDolls()
})

describe('IndexedDB 인형 저장소', () => {
  it('인형을 생성하고 ID로 조회한다', async () => {
    const created = await createDoll({ name: ' 김아무 ', faceBlob: faceBlob() })
    const stored = await getDoll(created.id)

    expect(stored).toMatchObject({
      id: created.id,
      name: '김아무',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      lastUsedAt: expect.any(String),
      interactionState: {
        pins: [],
        selectedCurse: null,
        talismanStatus: null,
        charredUntil: null,
      },
    })
    expect(created.faceBlob).toBeInstanceOf(Blob)
    expect(created.faceBlob.type).toBe('image/webp')
    expect(stored).toHaveProperty('faceBlob')
    expect(await countDolls()).toBe(1)
  })

  it('동시에 저장해도 최대 5개를 초과하지 않는다', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: MAX_DOLLS + 1 }, (_, index) => (
        createDoll({ name: `인형${index}`, faceBlob: faceBlob() })
      )),
    )

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(MAX_DOLLS)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect(await countDolls()).toBe(MAX_DOLLS)
    await expect(createDoll({ name: '초과', faceBlob: faceBlob() }))
      .rejects.toThrow(DOLL_LIMIT_MESSAGE)
  })

  it('마지막 사용 시간이 최신인 인형부터 반환한다', async () => {
    const first = await createDoll({ name: '첫째', faceBlob: faceBlob() })
    const second = await createDoll({ name: '둘째', faceBlob: faceBlob() })
    await updateDoll(first.id, { lastUsedAt: '2099-01-01T00:00:00.000Z' })

    const dolls = await getAllDolls()
    expect(dolls.map((doll) => doll.id)).toEqual([first.id, second.id])
  })

  it('이름 변경과 마지막 사용 시각 갱신을 저장한다', async () => {
    const created = await createDoll({ name: '이전', faceBlob: faceBlob() })
    const renamed = await renameDoll(created.id, ' 새이름 ')
    await new Promise((resolve) => setTimeout(resolve, 2))
    const used = await markDollUsed(created.id)

    expect(renamed.name).toBe('새이름')
    expect(used.lastUsedAt >= created.lastUsedAt).toBe(true)
    expect((await getDoll(created.id))?.name).toBe('새이름')
  })

  it('개별 삭제와 전체 삭제를 지원한다', async () => {
    const first = await createDoll({ name: '하나', faceBlob: faceBlob() })
    await createDoll({ name: '둘', faceBlob: faceBlob() })

    await deleteDoll(first.id)
    expect(await getDoll(first.id)).toBeUndefined()
    expect(await countDolls()).toBe(1)

    await deleteAllDolls()
    expect(await getAllDolls()).toEqual([])
  })
})

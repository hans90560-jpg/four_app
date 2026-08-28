export type CurseCategory = 'occult' | 'prank'

export type CurseId =
  | 'mansabultong'
  | 'mangsinsari'
  | 'agungangrim'
  | 'apgilbongswae'
  | 'inyeondanjeol'
  | 'yangmalchukchuk'
  | 'gyeottamjangnyeol'
  | 'wangyeodeureum'
  | 'sinhoyeonsok'
  | 'elbenotchim'

export type CurseDefinition = {
  id: CurseId
  name: string
  category: CurseCategory
  description: string
  chant: string
}

export const CURSES: CurseDefinition[] = [
  { id: 'mansabultong', name: '만사불통', category: 'occult', description: '붉고 짙은 실이 잠깐 엉켜요.', chant: '실실 꼬여 길길 막혀, 만사불통 얍!' },
  { id: 'mangsinsari', name: '망신살이', category: 'occult', description: '만화적인 시선과 작은 봉인이 나타나요.', chant: '감춘 허세 드러나라, 망신살이 얍!' },
  { id: 'agungangrim', name: '악운강림', category: 'occult', description: '작은 회색 구름과 번개가 지나가요.', chant: '작은 먹구름 따라붙어, 악운강림 얍!' },
  { id: 'apgilbongswae', name: '앞길봉쇄', category: 'occult', description: '붉은 리본이 앞을 가로질러요.', chant: '붉은 실아 길을 막아, 앞길봉쇄 얍!' },
  { id: 'inyeondanjeol', name: '인연단절', category: 'occult', description: '두 가닥 붉은 실이 빛과 함께 갈라져요.', chant: '이어진 실 여기서 끊고, 인연단절 얍!' },
  { id: 'yangmalchukchuk', name: '양말축축', category: 'prank', description: '신발 주변에 파란 물방울이 톡톡 나타나요.', chant: '마른 양말 물을 만나, 발끝까지 축축 얍!' },
  { id: 'gyeottamjangnyeol', name: '겨땀장렬', category: 'prank', description: '양쪽 겨드랑이에 만화 땀방울이 나타나요.', chant: '숨은 땀아 솟아나라, 겨땀장렬 얍!' },
  { id: 'wangyeodeureum', name: '왕여드름', category: 'prank', description: '부적 위에 붉은 스티커 점이 나타나요.', chant: '작은 점아 크게 솟아, 왕여드름 얍!' },
  { id: 'sinhoyeonsok', name: '신호연속', category: 'prank', description: '빨간 신호등 표시가 차례로 켜져요.', chant: '가는 길마다 빨간불, 신호연속 얍!' },
  { id: 'elbenotchim', name: '엘베놓침', category: 'prank', description: '작은 엘리베이터 문이 닫혀요.', chant: '한 발 늦게 문 닫혀라, 엘베놓침 얍!' },
]

export const CURSES_BY_CATEGORY: Record<CurseCategory, CurseDefinition[]> = {
  occult: CURSES.filter((curse) => curse.category === 'occult'),
  prank: CURSES.filter((curse) => curse.category === 'prank'),
}

export function getCurseById(id: CurseId | null): CurseDefinition | undefined {
  return id ? CURSES.find((curse) => curse.id === id) : undefined
}

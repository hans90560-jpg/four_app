import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { CurseId } from './curses'

export const DOLL_DATABASE_NAME = 'sokpuri-doll-room'
export const DOLL_STORE_NAME = 'dolls'
export const DOLL_DATABASE_VERSION = 1
export const MAX_DOLLS = 5
export const DOLL_LIMIT_MESSAGE = '인형은 최대 5개까지 보관할 수 있어요. 기존 인형을 삭제한 뒤 다시 만들어 주세요.'

export type Pin = {
  id: string
  x: number
  y: number
  angle: number
  createdAt: string
}

export type DollInteractionState = {
  pins: Pin[]
  selectedCurse: CurseId | null
  talismanStatus: 'attached' | null
  charredUntil: string | null
}

export type DollRecord = {
  id: string
  name: string
  faceBlob: Blob
  createdAt: string
  updatedAt: string
  lastUsedAt: string
  interactionState: DollInteractionState
}

export type CreateDollInput = {
  name: string
  faceBlob: Blob
}

type DollUpdates = Partial<Pick<DollRecord, 'name' | 'faceBlob' | 'lastUsedAt' | 'interactionState'>>

interface DollDatabaseSchema extends DBSchema {
  dolls: {
    key: string
    value: DollRecord
    indexes: {
      lastUsedAt: string
    }
  }
}

export class DollStorageError extends Error {
  readonly code: 'unavailable' | 'limit' | 'not-found' | 'invalid-name'

  constructor(
    code: DollStorageError['code'],
    message: string,
  ) {
    super(message)
    this.name = 'DollStorageError'
    this.code = code
  }
}

let databasePromise: Promise<IDBPDatabase<DollDatabaseSchema>> | null = null

function requireIndexedDB() {
  if (typeof indexedDB === 'undefined') {
    throw new DollStorageError(
      'unavailable',
      '이 브라우저에서는 인형 보관함을 사용할 수 없어요.',
    )
  }
}

function getDatabase(): Promise<IDBPDatabase<DollDatabaseSchema>> {
  requireIndexedDB()
  if (!databasePromise) {
    databasePromise = openDB<DollDatabaseSchema>(
      DOLL_DATABASE_NAME,
      DOLL_DATABASE_VERSION,
      {
        upgrade(database) {
          const store = database.createObjectStore(DOLL_STORE_NAME, { keyPath: 'id' })
          store.createIndex('lastUsedAt', 'lastUsedAt')
        },
        terminated() {
          databasePromise = null
        },
      },
    ).catch((error) => {
      databasePromise = null
      throw error
    })
  }
  return databasePromise
}

function createId(): string {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID()

  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}

function validateName(name: string): string {
  const normalized = name.trim()
  if (Array.from(normalized).length === 0 || Array.from(normalized).length > 4) {
    throw new DollStorageError('invalid-name', '이름은 한글 기준 1~4글자로 입력해 주세요.')
  }
  return normalized
}

function emptyInteractionState(): DollInteractionState {
  return {
    pins: [],
    selectedCurse: null,
    talismanStatus: null,
    charredUntil: null,
  }
}

function normalizeRecord(record: DollRecord): DollRecord {
  const interactionState = record.interactionState as Partial<DollInteractionState> | undefined
  return {
    ...record,
    interactionState: {
      pins: Array.isArray(interactionState?.pins) ? interactionState.pins : [],
      selectedCurse: interactionState?.selectedCurse ?? null,
      talismanStatus: interactionState?.talismanStatus ?? null,
      charredUntil: typeof interactionState?.charredUntil === 'string'
        ? interactionState.charredUntil
        : null,
    },
  }
}

export async function getAllDolls(): Promise<DollRecord[]> {
  const database = await getDatabase()
  const records = await database.getAllFromIndex(DOLL_STORE_NAME, 'lastUsedAt')
  return records.reverse().map(normalizeRecord)
}

export async function getDoll(id: string): Promise<DollRecord | undefined> {
  const database = await getDatabase()
  const record = await database.get(DOLL_STORE_NAME, id)
  return record ? normalizeRecord(record) : undefined
}

export async function createDoll(input: CreateDollInput): Promise<DollRecord> {
  const database = await getDatabase()
  const transaction = database.transaction(DOLL_STORE_NAME, 'readwrite')
  const count = await transaction.store.count()

  if (count >= MAX_DOLLS) {
    await transaction.done
    throw new DollStorageError('limit', DOLL_LIMIT_MESSAGE)
  }

  const timestamp = new Date().toISOString()
  const record: DollRecord = {
    id: createId(),
    name: validateName(input.name),
    faceBlob: input.faceBlob,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastUsedAt: timestamp,
    interactionState: emptyInteractionState(),
  }

  await transaction.store.add(record)
  await transaction.done
  return record
}

export async function updateDoll(id: string, updates: DollUpdates): Promise<DollRecord> {
  const database = await getDatabase()
  const transaction = database.transaction(DOLL_STORE_NAME, 'readwrite')
  const current = await transaction.store.get(id)

  if (!current) {
    await transaction.done
    throw new DollStorageError('not-found', '저장된 인형을 찾을 수 없어요.')
  }

  const normalizedCurrent = normalizeRecord(current)
  const updated: DollRecord = {
    ...normalizedCurrent,
    ...updates,
    name: updates.name === undefined ? normalizedCurrent.name : validateName(updates.name),
    id: normalizedCurrent.id,
    createdAt: normalizedCurrent.createdAt,
    updatedAt: new Date().toISOString(),
  }

  await transaction.store.put(updated)
  await transaction.done
  return updated
}

export function renameDoll(id: string, name: string): Promise<DollRecord> {
  return updateDoll(id, { name })
}

export async function deleteDoll(id: string): Promise<void> {
  const database = await getDatabase()
  await database.delete(DOLL_STORE_NAME, id)
}

export async function deleteAllDolls(): Promise<void> {
  const database = await getDatabase()
  await database.clear(DOLL_STORE_NAME)
}

export async function countDolls(): Promise<number> {
  const database = await getDatabase()
  return database.count(DOLL_STORE_NAME)
}

export function markDollUsed(id: string): Promise<DollRecord> {
  return updateDoll(id, { lastUsedAt: new Date().toISOString() })
}

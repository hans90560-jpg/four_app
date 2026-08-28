export const FACE_ASPECT_RATIO = 1.03
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024

export const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export type PhotoPosition = {
  x: number
  y: number
}

export type PhotoDimensions = {
  width: number
  height: number
}

export type PhotoLayout = {
  width: number
  height: number
  localMarginX: number
  localMarginY: number
}

export type DecodedPhoto = PhotoDimensions & {
  source: CanvasImageSource
  close?: () => void
}

export function validatePhotoFile(file: File): string {
  if (!ALLOWED_PHOTO_TYPES.includes(file.type as (typeof ALLOWED_PHOTO_TYPES)[number])) {
    return '지원하지 않는 파일 형식이에요. JPG, PNG, WebP 사진을 선택해주세요.'
  }

  if (file.size > MAX_PHOTO_BYTES) {
    return '사진이 너무 커요. 10MB 이하의 사진을 선택해주세요.'
  }

  return ''
}

export function countNameCharacters(value: string): number {
  return Array.from(value.trim()).length
}

export function isValidDollName(value: string): boolean {
  const length = countNameCharacters(value)
  return length > 0 && length <= 4
}

export function getPhotoLayout(
  dimensions: PhotoDimensions,
  zoom: number,
  rotation = 0,
): PhotoLayout {
  const imageAspect = dimensions.width / dimensions.height
  const radians = rotation * Math.PI / 180
  const absoluteCosine = Math.abs(Math.cos(radians))
  const absoluteSine = Math.abs(Math.sin(radians))
  const requiredWidth = absoluteCosine * FACE_ASPECT_RATIO + absoluteSine
  const requiredHeight = absoluteSine * FACE_ASPECT_RATIO + absoluteCosine
  const coverScale = Math.max(requiredWidth / imageAspect, requiredHeight)
  const drawnWidth = imageAspect * coverScale * zoom
  const drawnHeight = coverScale * zoom

  return {
    width: drawnWidth / FACE_ASPECT_RATIO,
    height: drawnHeight,
    localMarginX: Math.max(0, (drawnWidth - requiredWidth) / 2),
    localMarginY: Math.max(0, (drawnHeight - requiredHeight) / 2),
  }
}

export function clampPhotoPosition(
  position: PhotoPosition,
  dimensions: PhotoDimensions,
  zoom: number,
  rotation = 0,
): PhotoPosition {
  const { localMarginX, localMarginY } = getPhotoLayout(dimensions, zoom, rotation)
  const radians = rotation * Math.PI / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const screenX = position.x * FACE_ASPECT_RATIO
  const screenY = position.y
  const localX = cosine * screenX + sine * screenY
  const localY = -sine * screenX + cosine * screenY
  const clampedLocalX = Math.min(localMarginX, Math.max(-localMarginX, localX))
  const clampedLocalY = Math.min(localMarginY, Math.max(-localMarginY, localY))

  return {
    x: (cosine * clampedLocalX - sine * clampedLocalY) / FACE_ASPECT_RATIO,
    y: sine * clampedLocalX + cosine * clampedLocalY,
  }
}

export function normalizeRotation(rotation: number): number {
  const normalized = ((rotation % 360) + 360) % 360
  return normalized > 180 ? normalized - 360 : normalized
}

function loadHtmlImage(objectUrl: string): Promise<DecodedPhoto> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => {
      resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
      })
    }
    image.onerror = () => reject(new Error('사진을 불러오지 못했습니다.'))
    image.src = objectUrl
  })
}

export async function decodePhoto(file: File, objectUrl: string): Promise<DecodedPhoto> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      }
    } catch {
      // 일부 브라우저는 특정 이미지의 ImageBitmap 디코딩만 지원하지 않는다.
    }
  }

  return loadHtmlImage(objectUrl)
}

export function createAdjustedFaceWebP(
  source: CanvasImageSource,
  dimensions: PhotoDimensions,
  zoom: number,
  position: PhotoPosition,
  rotation: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 1024

  const context = canvas.getContext('2d')
  if (!context) {
    return Promise.reject(new Error('이 브라우저에서는 이미지 처리를 사용할 수 없어요.'))
  }

  const faceWidth = 1024
  const faceHeight = faceWidth / FACE_ASPECT_RATIO
  const layout = getPhotoLayout(dimensions, zoom, rotation)
  const drawWidth = layout.width * faceWidth
  const drawHeight = layout.height * faceHeight
  const centerX = 512 + position.x * faceWidth
  const centerY = 512 + position.y * faceHeight

  context.save()
  context.beginPath()
  context.ellipse(512, 512, faceWidth / 2, faceHeight / 2, 0, 0, Math.PI * 2)
  context.clip()
  context.translate(centerX, centerY)
  context.rotate(rotation * Math.PI / 180)
  context.drawImage(
    source,
    -drawWidth / 2,
    -drawHeight / 2,
    drawWidth,
    drawHeight,
  )
  context.restore()

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error('완성 이미지를 만들지 못했어요. 다시 시도해주세요.'))
      }
    }, 'image/webp', 0.9)
  })
}

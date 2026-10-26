/** Browser-local pet appearance; uploaded images never enter a Session or Host request. */
const STORAGE_KEY = 'team-dsh:pet-appearance:v1'
const MAX_IMAGE_BYTES = 1024 * 1024
const MAX_DATA_URL_LENGTH = Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 64
const IMAGE_DATA_URL = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/

export type PetAppearance = { kind: 'whale' | 'cat' | 'custom'; image: string | null }
export type AppearanceError = 'load' | 'save' | 'size' | 'format' | 'decode'

/** Read only this plugin's preference, retaining an error when browser storage is unavailable. */
export function readAppearance(): { value: PetAppearance; error: AppearanceError | null } {
  const fallback: PetAppearance = { kind: 'whale', image: null }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return { value: fallback, error: null }
    const value: unknown = JSON.parse(raw)
    if (value && typeof value === 'object' && 'kind' in value && 'image' in value
      && (value.kind === 'whale' || value.kind === 'cat' || value.kind === 'custom')
      && (value.image === null || (typeof value.image === 'string' && value.image.length <= MAX_DATA_URL_LENGTH && IMAGE_DATA_URL.test(value.image)))
      && (value.kind !== 'custom' || value.image !== null)) return { value: { kind: value.kind, image: value.image }, error: null }
    return { value: fallback, error: 'load' }
  } catch (_error) { return { value: fallback, error: 'load' } }
}

/** Save before changing the displayed choice so storage failures keep the old appearance. */
export function saveAppearance(value: PetAppearance): boolean {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); return true }
  catch (_error) { return false }
}

/** Validate upload size, encoding and browser decoding before it can replace a saved image. */
export async function readPetImage(file: File): Promise<{ image: string } | { error: AppearanceError }> {
  if (file.size > MAX_IMAGE_BYTES) return { error: 'size' }
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return { error: 'format' }
  let bytes: Uint8Array
  try { bytes = new Uint8Array(await file.arrayBuffer()) }
  catch (_error) { return { error: 'decode' } }
  const matches = (offset: number, signature: readonly number[]) => signature.every((byte, index) => bytes[offset + index] === byte)
  const valid = file.type === 'image/png' ? matches(0, [137, 80, 78, 71, 13, 10, 26, 10])
    : file.type === 'image/jpeg' ? matches(0, [255, 216, 255])
    : matches(0, [82, 73, 70, 70]) && matches(8, [87, 69, 66, 80])
  if (!valid) return { error: 'format' }
  const image = new Image()
  try {
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Unreadable image'))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
    image.src = data
    await image.decode()
    if (image.naturalWidth === 0 || image.naturalHeight === 0) return { error: 'decode' }
    return { image: data }
  } catch (_error) { return { error: 'decode' } }
  finally { image.removeAttribute('src') }
}

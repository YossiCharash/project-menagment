// ---------------------------------------------------------------------------
// Attachment kind classification
// ---------------------------------------------------------------------------
// Single source of truth for deciding how an attachment should be rendered,
// based purely on its file name extension. Keeps that decision out of the view
// components (DRY) so image/audio/file branching stays consistent everywhere.

export type AttachmentKind = 'image' | 'audio' | 'file'

const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg',
])

const AUDIO_EXTENSIONS: ReadonlySet<string> = new Set([
  'webm', 'ogg', 'oga', 'mp3', 'm4a', 'wav', 'aac', 'mp4',
])

/** Lower-cased extension (without the dot) of a file name, or '' if none. */
function extensionOf(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf('.')
  if (lastDotIndex < 0 || lastDotIndex === fileName.length - 1) return ''
  return fileName.slice(lastDotIndex + 1).toLowerCase()
}

/** Classify an attachment as an image, audio clip, or generic file. */
export function attachmentKindOf(fileName: string | null | undefined): AttachmentKind {
  const extension = extensionOf(fileName ?? '')
  if (IMAGE_EXTENSIONS.has(extension)) return 'image'
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio'
  return 'file'
}

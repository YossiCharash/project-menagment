// ---------------------------------------------------------------------------
// Attachment kind classification
// ---------------------------------------------------------------------------
// Single source of truth for deciding how an attachment should be rendered,
// based purely on its file name extension. Keeps that decision out of the view
// components (DRY) so image/video/audio/file branching stays consistent
// everywhere.

export type AttachmentKind = 'image' | 'video' | 'audio' | 'file'

const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg',
])

const VIDEO_EXTENSIONS: ReadonlySet<string> = new Set([
  'mp4', 'm4v', 'mov', 'avi', 'mkv', 'ogv', '3gp', '3gpp', 'wmv', 'mpeg', 'mpg',
])

const AUDIO_EXTENSIONS: ReadonlySet<string> = new Set([
  'webm', 'ogg', 'oga', 'mp3', 'm4a', 'wav', 'aac',
])

/** Lower-cased extension (without the dot) of a file name, or '' if none. */
function extensionOf(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf('.')
  if (lastDotIndex < 0 || lastDotIndex === fileName.length - 1) return ''
  return fileName.slice(lastDotIndex + 1).toLowerCase()
}

/** Classify an attachment as an image, video, audio clip, or generic file. */
export function attachmentKindOf(fileName: string | null | undefined): AttachmentKind {
  const extension = extensionOf(fileName ?? '')
  if (IMAGE_EXTENSIONS.has(extension)) return 'image'
  if (VIDEO_EXTENSIONS.has(extension)) return 'video'
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio'
  return 'file'
}

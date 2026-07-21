import { Paperclip } from 'lucide-react'
import { cn } from '../../lib/utils'
import { attachmentKindOf } from './attachmentKind'

// ---------------------------------------------------------------------------
// AttachmentView
// ---------------------------------------------------------------------------
// Single responsibility: render ONE attachment in the right form for its kind —
// an inline image thumbnail, a video player, an audio player, or a download
// link. Callers pass
// the already-resolved absolute URL so this component stays decoupled from any
// particular URL-resolution helper (DRY: URL logic lives once per call site).

export interface AttachmentViewProps {
  fileName: string
  /** Absolute URL to the file, already resolved by the caller. */
  fileUrl: string | null
  className?: string
}

export default function AttachmentView({ fileName, fileUrl, className }: AttachmentViewProps) {
  const kind = attachmentKindOf(fileName)
  const href = fileUrl ?? '#'

  if (kind === 'image' && fileUrl) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={fileName}
        className={cn('inline-block', className)}
      >
        <img
          src={fileUrl}
          alt={fileName}
          className="max-h-32 max-w-[160px] rounded border border-gray-200 dark:border-gray-600 object-cover"
        />
      </a>
    )
  }

  if (kind === 'video' && fileUrl) {
    return (
      <video
        controls
        src={fileUrl}
        className={cn('max-h-48 max-w-[280px] rounded border border-gray-200 dark:border-gray-600', className)}
        title={fileName}
      >
        <a href={href} target="_blank" rel="noopener noreferrer">{fileName}</a>
      </video>
    )
  }

  if (kind === 'audio' && fileUrl) {
    return (
      <audio
        controls
        src={fileUrl}
        className={cn('h-9 max-w-[220px]', className)}
        title={fileName}
      >
        <a href={href} target="_blank" rel="noopener noreferrer">{fileName}</a>
      </audio>
    )
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={fileName}
      className={cn(
        // Explicit text/background colours (never inherited): this chip is also
        // rendered inside coloured chat bubbles, where an inherited white text
        // colour would make the file name unreadable.
        'inline-flex items-center gap-1 px-2 py-1 rounded-md max-w-[200px] text-xs font-medium',
        'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100',
        'border border-gray-300 dark:border-gray-600 shadow-sm',
        'hover:bg-gray-100 dark:hover:bg-gray-700',
        className,
      )}
    >
      <Paperclip className="w-3 h-3 flex-shrink-0 text-gray-500 dark:text-gray-400" />
      <span className="truncate" dir="auto">{fileName}</span>
    </a>
  )
}

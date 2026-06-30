import { Paperclip } from 'lucide-react'
import { cn } from '../../lib/utils'
import { attachmentKindOf } from './attachmentKind'

// ---------------------------------------------------------------------------
// AttachmentView
// ---------------------------------------------------------------------------
// Single responsibility: render ONE attachment in the right form for its kind —
// an inline image thumbnail, an audio player, or a download link. Callers pass
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
        'inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-600 text-xs hover:bg-gray-200 dark:hover:bg-gray-500 max-w-[160px]',
        className,
      )}
    >
      <Paperclip className="w-3 h-3 flex-shrink-0" />
      <span className="truncate">{fileName}</span>
    </a>
  )
}

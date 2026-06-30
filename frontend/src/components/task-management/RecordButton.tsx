import { useCallback } from 'react'
import { Mic, Square } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAudioRecorder } from './useAudioRecorder'

// ---------------------------------------------------------------------------
// RecordButton
// ---------------------------------------------------------------------------
// Single responsibility: present the record / stop control plus a running
// timer, and hand the finished recording File to the caller. Wraps
// useAudioRecorder so every place that captures voice notes (task chat, task
// description) shares the exact same UX without duplicating it (DRY).

export interface RecordButtonProps {
  /** Called with the recorded File once the user stops recording. */
  onRecorded: (file: File) => void
  /** Disable the control (e.g. while a send/save is in flight). */
  disabled?: boolean
  className?: string
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export default function RecordButton({ onRecorded, disabled, className }: RecordButtonProps) {
  const { isSupported, isRecording, durationSec, startRecording, stopRecording } = useAudioRecorder()

  const handleStop = useCallback(async () => {
    const file = await stopRecording()
    if (file) onRecorded(file)
  }, [stopRecording, onRecorded])

  if (!isSupported) return null

  if (isRecording) {
    return (
      <div className={cn('inline-flex items-center gap-1.5', className)}>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
          <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" aria-hidden="true" />
          {formatDuration(durationSec)}
        </span>
        <button
          type="button"
          onClick={handleStop}
          className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
          title="עצור הקלטה"
          aria-label="עצור הקלטה"
        >
          <Square className="w-4 h-4" />
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={startRecording}
      disabled={disabled}
      className={cn(
        'p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50',
        className,
      )}
      title="הקלט הודעה קולית"
      aria-label="הקלט הודעה קולית"
    >
      <Mic className="w-4 h-4" />
    </button>
  )
}

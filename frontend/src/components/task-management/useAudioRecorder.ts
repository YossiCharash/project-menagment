import { useCallback, useEffect, useRef, useState } from 'react'

// ---------------------------------------------------------------------------
// useAudioRecorder
// ---------------------------------------------------------------------------
// Single responsibility: record microphone audio into a File. Wraps the browser
// MediaRecorder API so every UI that needs voice recording reuses the same
// lifecycle (permission, timer, track cleanup) instead of duplicating it.

const RECORDED_MIME_TYPE = 'audio/webm'
const TIMER_INTERVAL_MS = 1000

export interface AudioRecorder {
  /** Whether this browser supports MediaRecorder + getUserMedia. */
  isSupported: boolean
  /** True while a recording is in progress. */
  isRecording: boolean
  /** Elapsed recording time in whole seconds. */
  durationSec: number
  /** Human-readable error from the last failed start, or null. */
  error: string | null
  /** Begin capturing microphone audio. */
  startRecording: () => Promise<void>
  /** Stop and resolve to the recorded File (null if nothing was captured). */
  stopRecording: () => Promise<File | null>
  /** Abort the current recording and discard any captured audio. */
  cancelRecording: () => void
}

function detectSupport(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function' &&
    typeof window.MediaRecorder !== 'undefined'
  )
}

export function useAudioRecorder(): AudioRecorder {
  const [isSupported] = useState<boolean>(detectSupport)
  const [isRecording, setIsRecording] = useState(false)
  const [durationSec, setDurationSec] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const releaseStream = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
    mediaStreamRef.current = null
  }, [])

  const startRecording = useCallback(async () => {
    if (!isSupported || isRecording) return
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      recordedChunksRef.current = []
      const recorder = new MediaRecorder(stream)
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data)
        }
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setDurationSec(0)
      setIsRecording(true)
      stopTimer()
      timerRef.current = setInterval(() => {
        setDurationSec((seconds) => seconds + 1)
      }, TIMER_INTERVAL_MS)
    } catch {
      releaseStream()
      setError('לא ניתן לגשת למיקרופון. בדוק הרשאות.')
    }
  }, [isSupported, isRecording, stopTimer, releaseStream])

  const stopRecording = useCallback(async (): Promise<File | null> => {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      return null
    }
    return new Promise<File | null>((resolve) => {
      recorder.onstop = () => {
        stopTimer()
        releaseStream()
        setIsRecording(false)
        mediaRecorderRef.current = null
        const chunks = recordedChunksRef.current
        recordedChunksRef.current = []
        if (chunks.length === 0) {
          resolve(null)
          return
        }
        const blob = new Blob(chunks, { type: RECORDED_MIME_TYPE })
        const fileName = `recording-${Date.now()}.webm`
        resolve(new File([blob], fileName, { type: RECORDED_MIME_TYPE }))
      }
      recorder.stop()
    })
  }, [stopTimer, releaseStream])

  const cancelRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null
      recorder.stop()
    }
    stopTimer()
    releaseStream()
    recordedChunksRef.current = []
    mediaRecorderRef.current = null
    setIsRecording(false)
    setDurationSec(0)
  }, [stopTimer, releaseStream])

  // Release the microphone if the component unmounts mid-recording.
  useEffect(() => {
    return () => {
      stopTimer()
      releaseStream()
      mediaRecorderRef.current = null
    }
  }, [stopTimer, releaseStream])

  return {
    isSupported,
    isRecording,
    durationSec,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
  }
}

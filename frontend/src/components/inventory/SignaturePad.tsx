import { useRef, useCallback, useState, useEffect } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SignaturePadProps {
  onConfirm: (signatureHash: string, signatureDataUrl: string) => void
  onCancel: () => void
  title: string
  description?: string
  /** When true, the component renders its own title and description. Defaults to true. */
  showHeader?: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CANVAS_WIDTH = 400
const CANVAS_HEIGHT = 160
const STROKE_COLOR = '#1e293b'
const STROKE_WIDTH = 2
const BACKGROUND_COLOR = '#ffffff'
const EMPTY_VALIDATION_MESSAGE = '\u05D9\u05E9 \u05DC\u05D7\u05EA\u05D5\u05DD \u05DC\u05E4\u05E0\u05D9 \u05D0\u05D9\u05E9\u05D5\u05E8'

const BTN_PRIMARY =
  'bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50'
const BTN_SECONDARY =
  'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fillCanvasWhite(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = BACKGROUND_COLOR
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
}

function isCanvasEmpty(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d')
  if (!ctx) return true

  const imageData = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  const pixels = imageData.data

  // Check if every pixel is white (R=255, G=255, B=255, A=255)
  for (let i = 0; i < pixels.length; i += 4) {
    if (
      pixels[i] !== 255 ||
      pixels[i + 1] !== 255 ||
      pixels[i + 2] !== 255 ||
      pixels[i + 3] !== 255
    ) {
      return false
    }
  }
  return true
}

async function computeSha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function getCanvasPoint(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SignaturePad({
  onConfirm,
  onCancel,
  title,
  description,
  showHeader = true,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawingRef = useRef(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  // Initialize canvas with white background
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    fillCanvasWhite(ctx)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = STROKE_COLOR
    ctx.lineWidth = STROKE_WIDTH
  }, [])

  // ── Drawing Primitives ──────────────────────────────────────────────────

  const beginStroke = useCallback((x: number, y: number) => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return

    isDrawingRef.current = true
    setValidationError(null)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }, [])

  const continueStroke = useCallback((x: number, y: number) => {
    if (!isDrawingRef.current) return

    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return

    ctx.lineTo(x, y)
    ctx.stroke()
  }, [])

  const endStroke = useCallback(() => {
    isDrawingRef.current = false
  }, [])

  // ── Mouse Handlers ──────────────────────────────────────────────────────

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return

      const { x, y } = getCanvasPoint(canvas, e.clientX, e.clientY)
      beginStroke(x, y)
    },
    [beginStroke],
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return

      const { x, y } = getCanvasPoint(canvas, e.clientX, e.clientY)
      continueStroke(x, y)
    },
    [continueStroke],
  )

  // ── Touch Handlers ──────────────────────────────────────────────────────

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault()
      const canvas = canvasRef.current
      if (!canvas) return

      const touch = e.touches[0]
      const { x, y } = getCanvasPoint(canvas, touch.clientX, touch.clientY)
      beginStroke(x, y)
    },
    [beginStroke],
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault()
      const canvas = canvasRef.current
      if (!canvas) return

      const touch = e.touches[0]
      const { x, y } = getCanvasPoint(canvas, touch.clientX, touch.clientY)
      continueStroke(x, y)
    },
    [continueStroke],
  )

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault()
      endStroke()
    },
    [endStroke],
  )

  // ── Actions ─────────────────────────────────────────────────────────────

  const handleClear = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    fillCanvasWhite(ctx)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = STROKE_COLOR
    ctx.lineWidth = STROKE_WIDTH
    setValidationError(null)
  }, [])

  const handleConfirm = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return

    if (isCanvasEmpty(canvas)) {
      setValidationError(EMPTY_VALIDATION_MESSAGE)
      return
    }

    setIsProcessing(true)
    try {
      const dataUrl = canvas.toDataURL('image/png')
      const hash = await computeSha256Hex(dataUrl)
      onConfirm(hash, dataUrl)
    } finally {
      setIsProcessing(false)
    }
  }, [onConfirm])

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div dir="rtl" className="p-6 space-y-4">
      {/* Header (rendered only in standalone mode) */}
      {showHeader && (
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            {title}
          </h3>
          {description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {description}
            </p>
          )}
        </div>
      )}

      {/* Description only (when header is handled externally) */}
      {!showHeader && description && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {description}
        </p>
      )}

      {/* Canvas */}
      <div className="flex justify-center">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="border border-dashed border-gray-400 dark:border-gray-500 rounded-lg bg-white cursor-crosshair touch-none"
          role="img"
          aria-label={title}
          tabIndex={0}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={endStroke}
          onMouseLeave={endStroke}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
      </div>

      {/* Clear Button */}
      <div className="flex justify-start">
        <button
          type="button"
          onClick={handleClear}
          className={BTN_SECONDARY}
        >
          {'\u05E0\u05E7\u05D4'}
        </button>
      </div>

      {/* Validation Error */}
      {validationError && (
        <p
          role="alert"
          className="text-sm text-red-600 dark:text-red-400 font-medium"
        >
          {validationError}
        </p>
      )}

      {/* Action Buttons */}
      <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-gray-700">
        <button type="button" onClick={onCancel} className={BTN_SECONDARY}>
          {'\u05D1\u05D9\u05D8\u05D5\u05DC'}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isProcessing}
          className={BTN_PRIMARY}
        >
          {isProcessing
            ? '\u05DE\u05E2\u05D1\u05D3...'
            : '\u05D0\u05E9\u05E8 \u05D1\u05D7\u05EA\u05D9\u05DE\u05D4'}
        </button>
      </div>
    </div>
  )
}

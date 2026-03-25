import React from 'react'
import { useNavigate } from 'react-router-dom'
import { SlidersHorizontal, X } from 'lucide-react'

interface SettingsOverlayProps {
  title: string
  subtitle: string
  maxWidth?: string
  children: React.ReactNode
  /** Elements rendered outside the panel but inside the backdrop (e.g. delete modals) */
  auxiliaryContent?: React.ReactNode
}

/**
 * Floating overlay panel for settings pages.
 * Renders a fixed-position backdrop with a scrollable settings panel.
 * Closes via backdrop click or the X button using navigate(-1).
 */
const SettingsOverlay: React.FC<SettingsOverlayProps> = ({
  title,
  subtitle,
  maxWidth = 'max-w-2xl',
  children,
  auxiliaryContent,
}) => {
  const navigate = useNavigate()

  const handleClose = () => navigate(-1)

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4" dir="rtl">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/40" onClick={handleClose} />

        {/* Floating panel */}
        <div
          className={`relative z-10 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full ${maxWidth} max-h-[80vh] overflow-y-auto`}
        >
          {/* Header with close button */}
          <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                <SlidersHorizontal className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>

          {/* Content */}
          <div className="p-5">
            {children}
          </div>
        </div>
      </div>

      {auxiliaryContent}
    </>
  )
}

export default SettingsOverlay

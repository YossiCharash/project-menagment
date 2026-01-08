import React, { useState, FormEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock, Eye, EyeOff, X } from 'lucide-react'
import api from '../lib/api'

interface ChangePasswordModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  isRequired?: boolean // If true, user cannot close without changing password
}

export default function ChangePasswordModal({ 
  isOpen, 
  onClose, 
  onSuccess,
  isRequired = false 
}: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (newPassword.length < 8) {
      setError('הסיסמה חייבת להכיל לפחות 8 תווים')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('הסיסמאות אינן תואמות')
      return
    }

    setLoading(true)
    try {
      await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword
      })
      
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setError(null)
      onSuccess()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'שגיאה בשינוי הסיסמה')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  // Prevent closing modal if password change is required
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (isRequired && e.target === e.currentTarget) {
      // Prevent closing by clicking backdrop
      e.preventDefault()
      e.stopPropagation()
    }
  }

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
        onClick={handleBackdropClick}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md"
        >
          <div className="p-6 relative">
            {!isRequired && (
              <button
                onClick={onClose}
                className="absolute top-4 left-4 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors z-10"
              >
                <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            )}
            {isRequired && (
              <div className="absolute top-4 left-4">
                <div className="w-8 h-8 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
                  <Lock className="w-4 h-4 text-red-600 dark:text-red-400" />
                </div>
              </div>
            )}
            
            <div className="text-center mb-6">
              <div className="mx-auto w-16 h-16 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-4">
                <Lock className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                {isRequired ? 'שינוי סיסמה נדרש' : 'שינוי סיסמה'}
              </h2>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                {isRequired 
                  ? 'עליך לשנות את הסיסמה הזמנית לפני המשך השימוש במערכת'
                  : 'הזינו את הסיסמה הנוכחית והסיסמה החדשה'
                }
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {isRequired ? 'סיסמה זמנית' : 'סיסמה נוכחית'}
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full pr-10 pl-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                    placeholder={isRequired ? "הזינו את הסיסמה הזמנית שקיבלתם במייל" : "הזינו את הסיסמה הנוכחית"}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showCurrentPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {isRequired && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    הסיסמה הזמנית נשלחה לכם במייל
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  סיסמה חדשה
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full pr-10 pl-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                    placeholder="הזינו סיסמה חדשה (לפחות 8 תווים)"
                    minLength={8}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  אימות סיסמה חדשה
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pr-10 pl-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                    placeholder="הזינו שוב את הסיסמה החדשה"
                    minLength={8}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                  <p className="text-red-600 dark:text-red-400 text-sm font-medium">{error}</p>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {loading ? 'משנה סיסמה...' : 'שנה סיסמה'}
                </button>
                {!isRequired && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
                  >
                    ביטול
                  </button>
                )}
              </div>
            </form>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}


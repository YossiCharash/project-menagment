import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useAppDispatch } from '../utils/hooks'
import { fetchMe, login, clearPasswordChangeRequirement } from '../store/slices/authSlice'
import { useSelector } from 'react-redux'
import type { RootState } from '../store'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Mail, Lock, ArrowRight } from 'lucide-react'
import { LoadingSpinner } from '../components/ui/Loading'
import { Logo } from '../components/ui/Logo'
import { cn } from '../lib/utils'
import ChangePasswordModal from '../components/ChangePasswordModal'

export default function Login() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { loading, error, token, me, requiresPasswordChange } = useSelector((s: RootState) => s.auth)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false)

  // Handle successful login
  useEffect(() => {
    if (token && !loading && !requiresPasswordChange) {
      // Navigate immediately after getting token (unless password change is required)
      const redirectPath = localStorage.getItem('redirectAfterLogin')
      if (redirectPath) {
        localStorage.removeItem('redirectAfterLogin')
        navigate(redirectPath)
      } else {
        navigate('/')
      }
      // Fetch user data in background
      if (!me) dispatch(fetchMe())
    } else if (token && requiresPasswordChange) {
      // Show password change modal if required - DO NOT navigate until password is changed
      setShowChangePasswordModal(true)
      // Prevent navigation - user must change password first
    }
  }, [token, loading, requiresPasswordChange, dispatch, navigate, me])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      await dispatch(login({ email, password }))
    } finally {
      setIsSubmitting(false)
    }
  }


  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md"
      >
        {/* Logo and Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-center mb-8"
        >
          <div className="flex justify-center mb-4">
            <Logo size="3xl" showText={false} />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            ברוכים הבאים
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            התחברו למערכת ניהול הנכסים שלכם
          </p>
        </motion.div>

        {/* Login Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-6"
        >
          <form onSubmit={onSubmit} className="space-y-4">
            {/* Email Field */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                כתובת אימייל
              </label>
              <div className="relative">
                <Mail className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pr-9 pl-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  placeholder="הזינו את כתובת האימייל שלכם"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                סיסמה
              </label>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pr-9 pl-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  placeholder="הזינו את הסיסמה שלכם"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3"
              >
                <p className="text-red-600 dark:text-red-400 text-sm font-medium">{error}</p>
              </motion.div>
            )}

            {/* Submit Button */}
            <motion.button
              type="submit"
              disabled={isSubmitting || loading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={cn(
                "w-full py-2.5 px-5 text-sm bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center gap-2",
                (isSubmitting || loading) && "opacity-50 cursor-not-allowed"
              )}
            >
              {(isSubmitting || loading) ? (
                <>
                  <LoadingSpinner size="sm" className="text-white" />
                  <span>מתחבר...</span>
                </>
              ) : (
                <>
                  <span>התחברות</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </motion.button>

          </form>

        </motion.div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="text-center mt-8"
        >
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            © 2024 מערכת ניהול נכסים. כל הזכויות שמורות.
          </p>
        </motion.div>
      </motion.div>

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={showChangePasswordModal}
        onClose={() => {
          // Only allow closing if password change is not required
          if (!requiresPasswordChange) {
            setShowChangePasswordModal(false)
            dispatch(clearPasswordChangeRequirement())
          }
          // If required, do nothing - user cannot close without changing password
        }}
        onSuccess={() => {
          setShowChangePasswordModal(false)
          dispatch(clearPasswordChangeRequirement())
          dispatch(fetchMe())
          const redirectPath = localStorage.getItem('redirectAfterLogin')
          if (redirectPath) {
            localStorage.removeItem('redirectAfterLogin')
            navigate(redirectPath)
          } else {
            navigate('/')
          }
        }}
        isRequired={requiresPasswordChange}
      />
    </div>
  )
}
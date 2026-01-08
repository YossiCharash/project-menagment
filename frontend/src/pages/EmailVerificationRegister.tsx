import React, { FormEvent, useEffect, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../utils/hooks'
import { clearAuthState, login } from '../store/slices/authSlice'
import { Link, useNavigate } from 'react-router-dom'
import api from '../lib/api'
import { Mail, Shield, User, Lock, ArrowRight, CheckCircle } from 'lucide-react'
import { motion } from 'framer-motion'

export default function EmailVerificationRegister() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { loading, error, token } = useAppSelector(s => s.auth)
  const [step, setStep] = useState<'form' | 'verify'>('form')
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    password: '',
    confirmPassword: '',
    userType: 'member' as 'admin' | 'member'
  })
  const [verificationCode, setVerificationCode] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [verificationSent, setVerificationSent] = useState(false)

  useEffect(() => {
    if (token) {
      navigate('/')
    }
  }, [token, navigate])

  const handleFormSubmit = async (e: FormEvent) => {
    e.preventDefault()
    
    if (formData.password !== formData.confirmPassword) {
      return
    }
    
    setIsSubmitting(true)
    
    try {
      await api.post('/email-verification/send', {
        email: formData.email,
        full_name: formData.full_name,
        verification_type: formData.userType === 'admin' ? 'admin_register' : 'member_register'
      })
      
      setVerificationSent(true)
      setStep('verify')
    } catch (err: any) {
      // Error sending verification
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleVerificationSubmit = async (e: FormEvent) => {
    e.preventDefault()
    
    setIsSubmitting(true)
    
    try {
      await api.post('/email-verification/confirm', {
        email: formData.email,
        verification_code: verificationCode,
        password: formData.password
      })

      // Auto login after successful registration
      await dispatch(login({ 
        email: formData.email, 
        password: formData.password 
      }))
    } catch (err: any) {
      // Verification error
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
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-center mb-8"
        >
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl mb-4 shadow-lg">
            <Mail className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            {step === 'form' ? 'רישום למערכת' : 'אימות כתובת אימייל'}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {step === 'form' 
              ? 'מלאו את הפרטים וקבלו קוד אימות באימייל' 
              : 'הזינו את קוד האימות שנשלח לאימייל שלכם'
            }
          </p>
        </motion.div>

        {/* Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-8"
        >
          {step === 'form' ? (
            <form onSubmit={handleFormSubmit} className="space-y-6">
              {/* User Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">סוג משתמש</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData({...formData, userType: 'member'})}
                    className={`px-4 py-3 rounded-xl border-2 transition-all duration-200 ${
                      formData.userType === 'member'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                        : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    משתמש רגיל
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({...formData, userType: 'admin'})}
                    className={`px-4 py-3 rounded-xl border-2 transition-all duration-200 ${
                      formData.userType === 'admin'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                        : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    מנהל מערכת
                  </button>
                </div>
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">שם מלא</label>
                <div className="relative">
                  <User className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    required
                    value={formData.full_name}
                    onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                    className="w-full pr-10 pl-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                    placeholder="הזינו את השם המלא שלכם"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">כתובת אימייל</label>
                <div className="relative">
                  <Mail className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    className="w-full pr-10 pl-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                    placeholder="הזינו את כתובת האימייל שלכם"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">סיסמה</label>
                <div className="relative">
                  <Lock className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="password"
                    required
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    className="w-full pr-10 pl-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                    placeholder="הזינו סיסמה חזקה (לפחות 8 תווים)"
                    minLength={8}
                  />
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">אישור סיסמה</label>
                <div className="relative">
                  <Lock className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="password"
                    required
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                    className="w-full pr-10 pl-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                    placeholder="הזינו שוב את הסיסמה"
                    minLength={8}
                  />
                </div>
                {formData.password && formData.confirmPassword && formData.password !== formData.confirmPassword && (
                  <p className="text-red-500 text-xs mt-1">הסיסמאות אינן תואמות</p>
                )}
              </div>

              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                  <p className="text-red-600 dark:text-red-400 text-sm font-medium">{error}</p>
                </div>
              )}

              <motion.button
                type="submit"
                disabled={isSubmitting || loading || formData.password !== formData.confirmPassword}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full py-3 px-6 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? 'שולח קוד אימות...' : 'שלח קוד אימות'}
                <ArrowRight className="w-5 h-5" />
              </motion.button>
            </form>
          ) : (
            <form onSubmit={handleVerificationSubmit} className="space-y-6">
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
                <div className="flex items-center">
                  <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400 mr-3" />
                  <div>
                    <h3 className="text-sm font-medium text-green-800 dark:text-green-200">קוד אימות נשלח</h3>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                      נשלח קוד אימות לכתובת: {formData.email}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">קוד אימות</label>
                <input
                  type="text"
                  required
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-center font-mono tracking-wider"
                  placeholder="הזינו קוד האימות (6 ספרות)"
                  maxLength={6}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 text-center">
                  הקוד תקף למשך 15 דקות
                </p>
              </div>

              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                  <p className="text-red-600 dark:text-red-400 text-sm font-medium">{error}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep('form')}
                  className="flex-1 px-4 py-3 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
                >
                  חזור
                </button>
                <motion.button
                  type="submit"
                  disabled={isSubmitting || loading || verificationCode.length !== 6}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex-1 py-3 px-6 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50"
                >
                  {isSubmitting ? 'מאמת...' : 'אמת כתובת אימייל'}
                </motion.button>
              </div>
            </form>
          )}

          {/* Links */}
          <div className="mt-6 text-center space-y-2">
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              כבר יש לכם חשבון?{' '}
              <Link
                to="/login"
                className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors"
              >
                התחברו כאן
              </Link>
            </p>
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}

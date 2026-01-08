import { FormEvent, useEffect, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../utils/hooks'
import { clearAuthState, registerAdmin } from '../store/slices/authSlice'
import { Link, useNavigate } from 'react-router-dom'
import api from '../lib/api'

export default function AdminRegister() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { loading, error, registered } = useAppSelector(s => s.auth)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  useEffect(() => {
    if (registered) {
      dispatch(clearAuthState())
      navigate('/')
    }
  }, [registered, dispatch, navigate])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    
    if (password !== confirmPassword) {
      return
    }
    
    try {
      // Try to register as super admin first
      await api.post('/auth/register-super-admin', {
        email,
        full_name: fullName,
        password
      })

      // Auto login after successful registration
      await dispatch(login({ 
        email, 
        password 
      }))
    } catch (err) {
      // Registration error
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-orange-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-8">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">רישום מנהל מערכת</h1>
          <p className="text-gray-600 dark:text-gray-400">הרשמה למנהל מערכת עם הרשאות מלאות</p>
        </div>
        
        <form onSubmit={onSubmit} className="space-y-4">
          {/* Full Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">שם מלא</label>
            <input 
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all duration-200" 
              placeholder="הזינו את השם המלא שלכם" 
              value={fullName} 
              onChange={e=>setFullName(e.target.value)} 
              type="text"
              required
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">כתובת אימייל</label>
            <input 
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all duration-200" 
              placeholder="הזינו את כתובת האימייל שלכם" 
              value={email} 
              onChange={e=>setEmail(e.target.value)} 
              type="email"
              required
            />
          </div>
          
          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">סיסמה</label>
            <input 
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all duration-200" 
              placeholder="הזינו סיסמה חזקה (לפחות 8 תווים)" 
              type="password" 
              value={password} 
              onChange={e=>setPassword(e.target.value)} 
              minLength={8}
              required
            />
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">אישור סיסמה</label>
            <input 
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all duration-200" 
              placeholder="הזינו שוב את הסיסמה" 
              type="password" 
              value={confirmPassword} 
              onChange={e=>setConfirmPassword(e.target.value)} 
              minLength={8}
              required
            />
            {password && confirmPassword && password !== confirmPassword && (
              <p className="text-red-500 text-xs mt-1">הסיסמאות אינן תואמות</p>
            )}
          </div>

          {/* Warning */}
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div>
                <h3 className="text-sm font-medium text-amber-800 dark:text-amber-200">אזהרה</h3>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                  רישום מנהל מערכת מעניק הרשאות מלאות למערכת. וודאו שאתם מורשים ליצור חשבון מנהל.
                </p>
              </div>
            </div>
          </div>
          
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
              <p className="text-red-600 dark:text-red-400 text-sm font-medium">{error}</p>
            </div>
          )}
          
          <button 
            className="w-full py-3 px-6 bg-gradient-to-r from-red-500 to-orange-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed" 
            disabled={loading || password !== confirmPassword}
          >
            {loading ? 'יוצר מנהל...' : 'צור מנהל מערכת'}
          </button>
        </form>
        
        <div className="text-center mt-6">
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            רוצים להירשם כמשתמש רגיל?{' '}
            <Link className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors" to="/register">
              הרשמה רגילה
            </Link>
          </p>
          <p className="text-gray-600 dark:text-gray-400 text-sm mt-2">
            כבר יש לכם חשבון?{' '}
            <Link className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors" to="/login">
              התחברו כאן
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

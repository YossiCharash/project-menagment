import React, { FormEvent, useEffect, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../utils/hooks'
import { clearAuthState, register, registerAdmin, registerMember } from '../store/slices/authSlice'
import { Link, useNavigate } from 'react-router-dom'

export default function Register() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { loading, error, registered } = useAppSelector(s => s.auth)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [groupId, setGroupId] = useState('')
  const [userType, setUserType] = useState<'admin' | 'member'>('member')

  useEffect(() => {
    if (registered) {
      dispatch(clearAuthState())
      navigate('/login')
    }
  }, [registered, dispatch, navigate])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    
    if (userType === 'admin') {
      await dispatch(registerAdmin({ 
        email, 
        full_name: fullName, 
        password 
      }))
    } else {
      await dispatch(registerMember({ 
        email, 
        full_name: fullName, 
        password, 
        group_id: parseInt(groupId) 
      }))
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2 text-center">הרשמה למערכת</h1>
        <p className="text-gray-600 dark:text-gray-400 text-center mb-6">צרו חשבון חדש כדי להתחיל</p>
        
        <form onSubmit={onSubmit} className="space-y-4">
          {/* User Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">סוג משתמש</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setUserType('member')}
                className={`px-4 py-3 rounded-xl border-2 transition-all duration-200 ${
                  userType === 'member'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                משתמש רגיל
              </button>
              <button
                type="button"
                onClick={() => setUserType('admin')}
                className={`px-4 py-3 rounded-xl border-2 transition-all duration-200 ${
                  userType === 'admin'
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
            <input 
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200" 
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
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200" 
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
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200" 
              placeholder="הזינו סיסמה חזקה (לפחות 8 תווים)" 
              type="password" 
              value={password} 
              onChange={e=>setPassword(e.target.value)} 
              minLength={8}
              required
            />
          </div>

          {/* Group ID - Only for members */}
          {userType === 'member' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">מספר קבוצה</label>
              <input 
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200" 
                placeholder="הזינו מספר קבוצה (לדוגמה: 1)" 
                value={groupId} 
                onChange={e=>setGroupId(e.target.value)} 
                type="number"
                required
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                המנהל יקבע את מספר הקבוצה שלכם
              </p>
            </div>
          )}
          
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
              <p className="text-red-600 dark:text-red-400 text-sm font-medium">{error}</p>
            </div>
          )}
          
          <button 
            className="w-full py-3 px-6 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed" 
            disabled={loading}
          >
            {loading ? 'יוצר חשבון...' : `צור חשבון ${userType === 'admin' ? 'מנהל' : 'משתמש'}`}
          </button>
        </form>
        
        <div className="text-center mt-6">
          <p className="text-gray-600 dark:text-gray-400 text-sm">
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

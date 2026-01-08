import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAppDispatch } from '../utils/hooks'
import { fetchMe } from '../store/slices/authSlice'
import { LoadingSpinner } from '../components/ui/Loading'
import { CheckCircle, XCircle } from 'lucide-react'

export default function OAuthCallback() {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState<string>('')

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get token from URL
        const token = searchParams.get('token')
        const error = searchParams.get('error')

        if (error) {
          setStatus('error')
          setErrorMessage(decodeURIComponent(error))
          setTimeout(() => {
            navigate('/login')
          }, 3000)
          return
        }

        if (!token) {
          setStatus('error')
          setErrorMessage('לא התקבל token מהאימות')
          setTimeout(() => {
            navigate('/login')
          }, 3000)
          return
        }

        // Save token
        localStorage.setItem('token', token)

        // Fetch user data
        await dispatch(fetchMe() as any)

        setStatus('success')

        // Redirect to dashboard after a short delay
        setTimeout(() => {
          const redirectPath = localStorage.getItem('redirectAfterLogin')
          if (redirectPath) {
            localStorage.removeItem('redirectAfterLogin')
            navigate(redirectPath)
          } else {
            navigate('/')
          }
        }, 1500)
      } catch (err: any) {
        setStatus('error')
        setErrorMessage(err.message || 'שגיאה בעת אימות')
        setTimeout(() => {
          navigate('/login')
        }, 3000)
      }
    }

    handleCallback()
  }, [searchParams, dispatch, navigate])

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-8 max-w-md w-full text-center">
        {status === 'loading' && (
          <>
            <LoadingSpinner size="lg" className="mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              מבצע אימות...
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              אנא המתינו
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              אימות הושלם בהצלחה!
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              מעבירים אתכם לדשבורד...
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              שגיאה באימות
            </h2>
            <p className="text-red-600 dark:text-red-400 mb-4">
              {errorMessage}
            </p>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              מעבירים אתכם חזרה לדף ההתחברות...
            </p>
          </>
        )}
      </div>
    </div>
  )
}

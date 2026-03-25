import { useEffect, useState, useRef, type FormEvent } from 'react'
import { useAppDispatch, useAppSelector } from '../utils/hooks'
import { fetchMe } from '../store/slices/authSlice'
import api, { avatarUrl } from '../lib/api'
import { Moon, Sun, User, Mail, Phone } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'

export default function Settings() {
  const dispatch = useAppDispatch()
  const { me, loading: authLoading } = useAppSelector(s => s.auth)
  const { theme, toggleTheme } = useTheme()
  const [activeTab, setActiveTab] = useState<'profile' | 'display'>('profile')

  const [avatarUploading, setAvatarUploading] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  // Profile form (אזור אישי)
  const [profileFullName, setProfileFullName] = useState('')
  const [profileEmail, setProfileEmail] = useState('')
  const [profilePhone, setProfilePhone] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSuccess, setProfileSuccess] = useState(false)

  // Fetch user data if not loaded
  useEffect(() => {
    if (!me && !authLoading) {
      dispatch(fetchMe())
    }
  }, [me, authLoading, dispatch])

  useEffect(() => {
    // Reset errors when switching tabs
    setProfileError(null)

    // Sync profile form from me when opening profile tab
    if (activeTab === 'profile' && me) {
      setProfileFullName(me.full_name ?? '')
      setProfileEmail(me.email ?? '')
      setProfilePhone(me.phone ?? '')
    }
  }, [activeTab, me])

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) {
      alert('נא לבחור קובץ תמונה (JPG, PNG וכו\')')
      return
    }
    setAvatarUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      await api.post('/users/me/avatar', formData)
      dispatch(fetchMe())
    } catch (err: any) {
      alert(err.response?.data?.detail || 'שגיאה בהעלאת התמונה')
    } finally {
      setAvatarUploading(false)
      e.target.value = ''
      avatarInputRef.current && (avatarInputRef.current.value = '')
    }
  }

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault()
    setProfileError(null)
    setProfileSuccess(false)
    setProfileSaving(true)
    try {
      await api.patch('/users/me/profile', {
        full_name: profileFullName.trim() || undefined,
        email: profileEmail.trim() || undefined,
        phone: profilePhone.trim() || undefined,
      })
      dispatch(fetchMe())
      setProfileSuccess(true)
      setTimeout(() => setProfileSuccess(false), 3000)
    } catch (err: any) {
      const detail = err.response?.data?.detail
      setProfileError(
        typeof detail === 'string'
          ? detail
          : Array.isArray(detail)
            ? detail.map((x: any) => x?.msg ?? x).join(', ')
            : err.message || 'שגיאה בשמירת הפרופיל'
      )
    } finally {
      setProfileSaving(false)
    }
  }

  // Show loading while checking auth
  if (authLoading || !me) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">טוען...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">הגדרות</h1>
            <p className="text-gray-600 dark:text-gray-400">ניהול הגדרות מערכת</p>
          </div>

          {/* Tabs - wrap so all items stay visible on narrow screens */}
          <div className="settings-tabs-wrapper mb-6 border-b border-gray-200 dark:border-gray-700 min-w-0">
            <div className="settings-tabs flex flex-wrap gap-2 sm:gap-4">
              <button
                onClick={() => setActiveTab('profile')}
                className={`settings-tab px-4 py-2 font-medium transition-colors border-b-2 flex-shrink-0 whitespace-nowrap -mb-px ${
                  activeTab === 'profile'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                אזור אישי
              </button>
              <button
                onClick={() => setActiveTab('display')}
                className={`settings-tab px-4 py-2 font-medium transition-colors border-b-2 flex-shrink-0 whitespace-nowrap -mb-px ${
                  activeTab === 'display'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                תצוגה
              </button>
            </div>
          </div>

          {/* Profile Tab Content - אזור אישי */}
          {activeTab === 'profile' && (
            <div>
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                  <User className="w-5 h-5 text-indigo-500" />
                  אזור אישי
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">עדכן את פרטי הפרופיל והתמונה שלך</p>
              </div>

              {/* Avatar */}
              <div className="mb-8 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <h3 className="text-base font-medium text-gray-900 dark:text-white mb-3">תמונת פרופיל</h3>
                <div className="flex items-center gap-6">
                  {(me as any)?.avatar_url && avatarUrl((me as any).avatar_url) ? (
                    <img src={avatarUrl((me as any).avatar_url)!} alt="" className="w-20 h-20 rounded-full object-cover border-2 border-gray-300 dark:border-gray-600" />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-2xl font-medium text-gray-600 dark:text-gray-400 border-2 border-gray-300 dark:border-gray-600">
                      {me?.full_name?.charAt(0) || '?'}
                    </div>
                  )}
                  <div>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarUpload}
                    />
                    <button
                      type="button"
                      disabled={avatarUploading}
                      onClick={() => avatarInputRef.current?.click()}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                    >
                      {avatarUploading ? 'מעלה...' : 'העלה / החלף תמונה'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Profile form */}
              <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <h3 className="text-base font-medium text-gray-900 dark:text-white mb-4">פרטים אישיים</h3>
                <form onSubmit={handleSaveProfile} className="space-y-4">
                  {profileError && (
                    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
                      {profileError}
                    </div>
                  )}
                  {profileSuccess && (
                    <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm">
                      הפרופיל נשמר בהצלחה
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">שם מלא</label>
                    <div className="relative">
                      <User className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="text"
                        value={profileFullName}
                        onChange={(e) => setProfileFullName(e.target.value)}
                        className="w-full pr-10 pl-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        placeholder="השם שלך"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">אימייל</label>
                    <div className="relative">
                      <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="email"
                        value={profileEmail}
                        onChange={(e) => setProfileEmail(e.target.value)}
                        className="w-full pr-10 pl-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        placeholder="your@email.com"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">מספר טלפון</label>
                    <div className="relative">
                      <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="tel"
                        value={profilePhone}
                        onChange={(e) => setProfilePhone(e.target.value)}
                        className="w-full pr-10 pl-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        placeholder="050-1234567"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={profileSaving}
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg disabled:opacity-50"
                  >
                    {profileSaving ? 'שומר...' : 'שמור שינויים'}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* Display Tab Content */}
          {activeTab === 'display' && (
            <div>
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">הגדרות תצוגה</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">בחר את סוג התצוגה של המערכת</p>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                      מצב תצוגה
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        onClick={() => {
                          if (theme !== 'light') toggleTheme()
                        }}
                        className={`flex flex-col items-center gap-3 p-4 rounded-lg border-2 transition-all ${
                          theme === 'light'
                            ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-gray-400 dark:hover:border-gray-500'
                        }`}
                      >
                        <Sun className={`w-8 h-8 ${theme === 'light' ? 'text-blue-600' : 'text-gray-400'}`} />
                        <div className="text-center">
                          <div className={`font-medium ${theme === 'light' ? 'text-blue-600' : 'text-gray-700 dark:text-gray-300'}`}>
                            מצב בהיר
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            תצוגה בהירה ונוחה
                          </div>
                        </div>
                      </button>
                      <button
                        onClick={() => {
                          if (theme !== 'dark') toggleTheme()
                        }}
                        className={`flex flex-col items-center gap-3 p-4 rounded-lg border-2 transition-all ${
                          theme === 'dark'
                            ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-gray-400 dark:hover:border-gray-500'
                        }`}
                      >
                        <Moon className={`w-8 h-8 ${theme === 'dark' ? 'text-blue-600' : 'text-gray-400'}`} />
                        <div className="text-center">
                          <div className={`font-medium ${theme === 'dark' ? 'text-blue-600' : 'text-gray-700 dark:text-gray-300'}`}>
                            מצב כהה
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            תצוגה כהה ונוחה לעיניים
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-gray-200 dark:border-gray-600">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {theme === 'dark'
                        ? 'המערכת מוצגת כעת במצב כהה. זה יכול לעזור להפחית עייפות עיניים בסביבות חשוכות.'
                        : 'המערכת מוצגת כעת במצב בהיר. זה מתאים לסביבות מוארות.'
                      }
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

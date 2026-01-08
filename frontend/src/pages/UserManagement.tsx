import { useEffect, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../utils/hooks'
import { fetchMe } from '../store/slices/authSlice'
import api from '../lib/api'

interface User {
  id: number
  email: string
  full_name: string
  role: 'Admin' | 'Member'
  group_id?: number
  is_active: boolean
  created_at: string
}

export default function UserManagement() {
  const dispatch = useAppDispatch()
  const { me, loading: authLoading } = useAppSelector(s => s.auth)
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAddUser, setShowAddUser] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  
  // Add user form state
  const [newUser, setNewUser] = useState({
    email: '',
    full_name: '',
    role: 'Member' as 'Admin' | 'Member'
  })
  
  // Edit user form state
  const [editUser, setEditUser] = useState({
    full_name: '',
    role: 'Member' as 'Admin' | 'Member',
    is_active: true
  })

  // Fetch user data if not loaded
  useEffect(() => {
    if (!me && !authLoading) {
      dispatch(fetchMe())
    }
  }, [me, authLoading, dispatch])

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

  // Check if user is admin
  if (me.role !== 'Admin') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">גישה נדחית</h1>
          <p className="text-gray-600 dark:text-gray-400">רק מנהלי מערכת יכולים לגשת לעמוד זה</p>
        </div>
      </div>
    )
  }

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const response = await api.get('/users')
      setUsers(response.data)
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      // Use the new admin create user endpoint - password will be generated automatically
      const response = await api.post('/auth/admin/create-user', {
        email: newUser.email,
        full_name: newUser.full_name,
        role: newUser.role
      })
      
      if (response.data) {
        setNewUser({ email: '', full_name: '', role: 'Member' })
        setShowAddUser(false)
        await fetchUsers() // Wait for users to be fetched
        alert('משתמש נוצר בהצלחה! סיסמה זמנית נשלחה במייל.')
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to create user')
    }
  }

  const handleDeleteUser = async (userId: number, userName: string) => {
    if (!confirm(`האם אתה בטוח שברצונך למחוק את המשתמש ${userName}? פעולה זו אינה ניתנת לביטול.`)) {
      return
    }

    setError(null)
    setLoading(true)
    try {
      await api.delete(`/users/${userId}`)
      await fetchUsers() // Refresh the list
      alert('משתמש נמחק בהצלחה')
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to delete user'
      setError(errorMessage)
      alert(`שגיאה במחיקת המשתמש: ${errorMessage}`)
    } finally {
      setLoading(false)
    }
  }

  const handleEditUser = (user: User) => {
    setEditingUser(user)
    setEditUser({
      full_name: user.full_name,
      role: user.role,
      is_active: user.is_active
    })
  }

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingUser) return

    setError(null)
    setLoading(true)
    try {
      await api.put(`/users/${editingUser.id}`, {
        full_name: editUser.full_name,
        role: editUser.role,
        is_active: editUser.is_active
      })
      
      setEditingUser(null)
      setEditUser({ full_name: '', role: 'Member', is_active: true })
      await fetchUsers() // Refresh the list
      alert('משתמש עודכן בהצלחה')
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to update user'
      setError(errorMessage)
      alert(`שגיאה בעדכון המשתמש: ${errorMessage}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">ניהול משתמשים</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">ניהול משתמשי המערכת והרשאות</p>
            </div>
            <button
              onClick={() => setShowAddUser(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              הוסף משתמש
            </button>
          </div>

          {/* Edit User Modal */}
          {editingUser && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md mx-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">ערוך משתמש</h2>
                <form onSubmit={handleUpdateUser} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">שם מלא</label>
                    <input
                      type="text"
                      value={editUser.full_name}
                      onChange={(e) => setEditUser({...editUser, full_name: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">תפקיד</label>
                    <select
                      value={editUser.role}
                      onChange={(e) => setEditUser({...editUser, role: e.target.value as 'Admin' | 'Member'})}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      required
                    >
                      <option value="Member">משתמש</option>
                      <option value="Admin">מנהל מערכת</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={editUser.is_active}
                        onChange={(e) => setEditUser({...editUser, is_active: e.target.checked})}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">משתמש פעיל</span>
                    </label>
                  </div>
                  
                  {error && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                      <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
                    </div>
                  )}
                  
                  <div className="flex gap-3">
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      עדכן משתמש
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingUser(null)
                        setEditUser({ full_name: '', role: 'Member', is_active: true })
                      }}
                      className="flex-1 px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
                    >
                      ביטול
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Add User Modal */}
          {showAddUser && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md mx-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">הוסף משתמש חדש</h2>
                <form onSubmit={handleAddUser} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">שם מלא</label>
                    <input
                      type="text"
                      value={newUser.full_name}
                      onChange={(e) => setNewUser({...newUser, full_name: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">אימייל</label>
                    <input
                      type="email"
                      value={newUser.email}
                      onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">תפקיד</label>
                    <select
                      value={newUser.role}
                      onChange={(e) => setNewUser({...newUser, role: e.target.value as 'Admin' | 'Member'})}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      required
                    >
                      <option value="Member">משתמש</option>
                      <option value="Admin">מנהל מערכת</option>
                    </select>
                  </div>
                  
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <p className="text-sm text-blue-800 dark:text-blue-300">
                      <strong>שים לב:</strong> סיסמה זמנית תיווצר אוטומטית ותישלח למשתמש במייל. המשתמש יתבקש לשנות את הסיסמה בהתחברות הראשונה.
                    </p>
                  </div>
                  
                  <div className="flex gap-3">
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      הוסף משתמש
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddUser(false)}
                      className="flex-1 px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
                    >
                      ביטול
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Users List */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">שם מלא</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">אימייל</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">תפקיד</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">סטטוס</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-gray-500 dark:text-gray-400">
                      טוען משתמשים...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-gray-500 dark:text-gray-400">
                      אין משתמשים במערכת
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="border-b border-gray-200 dark:border-gray-700">
                      <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">{user.full_name}</td>
                      <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">{user.email}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          user.role === 'Admin' 
                            ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                        }`}>
                          {user.role === 'Admin' ? 'מנהל' : 'משתמש'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          user.is_active 
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
                        }`}>
                          {user.is_active ? 'פעיל' : 'לא פעיל'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          <button 
                            onClick={() => handleEditUser(user)}
                            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium px-3 py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                            title="ערוך משתמש"
                          >
                            ערוך
                          </button>
                          <button 
                            onClick={() => handleDeleteUser(user.id, user.full_name)}
                            className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-sm font-medium px-3 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            title="מחק משתמש"
                          >
                            מחק
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {error && (
            <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

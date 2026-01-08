import React, { useEffect, useState } from 'react'
import { useAppSelector } from '../utils/hooks'
import { 
  Plus, 
  Copy, 
  Trash2, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Mail, 
  User,
  Calendar,
  Key
} from 'lucide-react'
import { motion } from 'framer-motion'

interface AdminInvite {
  id: number
  invite_code: string
  email: string
  full_name: string
  is_used: boolean
  used_at: string | null
  expires_at: string
  created_at: string
  is_expired: boolean
}

export default function AdminInviteManagement() {
  const { me } = useAppSelector(s => s.auth)
  const [invites, setInvites] = useState<AdminInvite[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newInvite, setNewInvite] = useState({
    email: '',
    full_name: '',
    expires_days: 7
  })

  // Check if user is admin
  if (me?.role !== 'Admin') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">גישה נדחית</h1>
          <p className="text-gray-600 dark:text-gray-400">רק מנהלי מערכת יכולים לגשת לעמוד זה</p>
        </div>
      </div>
    )
  }

  const fetchInvites = async () => {
    setLoading(true)
    try {
      const response = await fetch('/admin-invites/', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })
      if (response.ok) {
        const data = await response.json()
        setInvites(data)
      } else {
        throw new Error('Failed to fetch invites')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const createInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const response = await fetch('/admin-invites/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(newInvite)
      })
      
      if (response.ok) {
        setShowCreateModal(false)
        setNewInvite({ email: '', full_name: '', expires_days: 7 })
        fetchInvites()
      } else {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to create invite')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const copyInviteCode = (code: string) => {
    navigator.clipboard.writeText(code)
    // You could add a toast notification here
  }

  const deleteInvite = async (inviteId: number) => {
    if (!confirm('האם אתם בטוחים שברצונכם למחוק את ההזמנה?')) {
      return
    }

    try {
      const response = await fetch(`/admin-invites/${inviteId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })
      
      if (response.ok) {
        fetchInvites()
      } else {
        throw new Error('Failed to delete invite')
      }
    } catch (err: any) {
      setError(err.message)
    }
  }

  useEffect(() => {
    fetchInvites()
  }, [])

  const getStatusIcon = (invite: AdminInvite) => {
    if (invite.is_used) {
      return <CheckCircle className="w-5 h-5 text-green-500" />
    } else if (invite.is_expired) {
      return <XCircle className="w-5 h-5 text-red-500" />
    } else {
      return <Clock className="w-5 h-5 text-yellow-500" />
    }
  }

  const getStatusText = (invite: AdminInvite) => {
    if (invite.is_used) {
      return 'נוצל'
    } else if (invite.is_expired) {
      return 'פג תוקף'
    } else {
      return 'פעיל'
    }
  }

  const getStatusColor = (invite: AdminInvite) => {
    if (invite.is_used) {
      return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
    } else if (invite.is_expired) {
      return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
    } else {
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">ניהול הזמנות מנהלים</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">יצירה וניהול הזמנות למנהלי מערכת חדשים</p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              צור הזמנה
            </button>
          </div>

          {/* Invites List */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">סטטוס</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">קוד הזמנה</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">שם מלא</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">אימייל</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">תאריך יצירה</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">תאריך תפוגה</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-gray-500 dark:text-gray-400">
                      טוען הזמנות...
                    </td>
                  </tr>
                ) : invites.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-gray-500 dark:text-gray-400">
                      אין הזמנות במערכת
                    </td>
                  </tr>
                ) : (
                  invites.map((invite) => (
                    <tr key={invite.id} className="border-b border-gray-200 dark:border-gray-700">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(invite)}
                          <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(invite)}`}>
                            {getStatusText(invite)}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm font-mono">
                            {invite.invite_code}
                          </code>
                          <button
                            onClick={() => copyInviteCode(invite.invite_code)}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                            title="העתק קוד"
                          >
                            <Copy className="w-4 h-4 text-gray-500" />
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">{invite.full_name}</td>
                      <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">{invite.email}</td>
                      <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400">
                        {new Date(invite.created_at).toLocaleDateString('he-IL')}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400">
                        {new Date(invite.expires_at).toLocaleDateString('he-IL')}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          {!invite.is_used && !invite.is_expired && (
                            <button
                              onClick={() => deleteInvite(invite.id)}
                              className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-sm flex items-center gap-1"
                            >
                              <Trash2 className="w-4 h-4" />
                              מחק
                            </button>
                          )}
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

        {/* Create Invite Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md mx-4"
            >
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">צור הזמנת מנהל</h2>
              <form onSubmit={createInvite} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">שם מלא</label>
                  <input
                    type="text"
                    value={newInvite.full_name}
                    onChange={(e) => setNewInvite({...newInvite, full_name: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">אימייל</label>
                  <input
                    type="email"
                    value={newInvite.email}
                    onChange={(e) => setNewInvite({...newInvite, email: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">תוקף (ימים)</label>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={newInvite.expires_days}
                    onChange={(e) => setNewInvite({...newInvite, expires_days: parseInt(e.target.value)})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    required
                  />
                </div>
                
                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                    disabled={loading}
                  >
                    {loading ? 'יוצר...' : 'צור הזמנה'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
                  >
                    ביטול
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  )
}

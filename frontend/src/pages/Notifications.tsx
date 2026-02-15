import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell,
  BellOff,
  Mail,
  MessageSquare,
  Calendar,
  FileText,
  RefreshCw,
  Send,
  ChevronLeft,
  User,
  Check
} from 'lucide-react'
import { useAppSelector } from '../utils/hooks'
import { useDispatch } from 'react-redux'
import type { AppDispatch } from '../store'
import { setUnreadCount as setUnreadCountStore } from '../store/slices/notificationsSlice'
import api from '../lib/api'
import type { Notification, NotificationType } from '../types/api'

const TYPE_LABELS: Record<NotificationType, string> = {
  instruction: 'הוראה',
  task_assignment: 'משימה',
  task_reminder: 'תזכורת',
  general: 'הודעה'
}

const TYPE_ICONS: Record<NotificationType, typeof Mail> = {
  instruction: FileText,
  task_assignment: Calendar,
  task_reminder: Bell,
  general: MessageSquare
}

function formatDate(s: string) {
  try {
    const d = new Date(s)
    const now = new Date()
    const sameDay = d.toDateString() === now.toDateString()
    if (sameDay) return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return s
  }
}

interface NotificationsProps {
  embedded?: boolean
}

export default function Notifications({ embedded }: NotificationsProps = {}) {
  const dispatch = useDispatch<AppDispatch>()
  const me = useAppSelector(s => s.auth.me)
  const isAdmin = me?.role === 'Admin'
  const [list, setList] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterUnread, setFilterUnread] = useState<boolean | null>(null)
  const [typeFilter, setTypeFilter] = useState<NotificationType | ''>('')
  const [sending, setSending] = useState(false)
  const [showSendForm, setShowSendForm] = useState(false)
  const [sendUserIds, setSendUserIds] = useState<number[]>([])
  const [sendTitle, setSendTitle] = useState('')
  const [sendBody, setSendBody] = useState('')
  const [sendType, setSendType] = useState<NotificationType>('general')
  const [usersForSelect, setUsersForSelect] = useState<Array<{ id: number; full_name: string }>>([])

  const fetchList = async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string | boolean> = {}
      if (filterUnread === true) params.unread_only = 'true'
      if (typeFilter) params.type_filter = typeFilter
      const { data } = await api.get<Notification[]>('/notifications/', { params })
      setList(data)
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'שגיאה בטעינת הודעות')
    } finally {
      setLoading(false)
    }
  }

  const fetchUnreadCount = async () => {
    try {
      const { data } = await api.get<{ count: number }>('/notifications/unread-count')
      setUnreadCount(data.count)
      dispatch(setUnreadCountStore(data.count))
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    fetchList()
    fetchUnreadCount()
  }, [filterUnread, typeFilter])

  const markRead = async (n: Notification, read: boolean) => {
    try {
      await api.patch(`/notifications/${n.id}/read`, null, { params: { read } })
      if (filterUnread === true && read) {
        // When viewing "unread only", remove the item from the list so it disappears
        setList(prev => prev.filter(x => x.id !== n.id))
      } else {
        setList(prev => prev.map(x => x.id === n.id ? { ...x, read_at: read ? new Date().toISOString() : null } : x))
      }
      fetchUnreadCount()
    } catch {
      // ignore
    }
  }

  const fetchUsers = async () => {
    try {
      const { data } = await api.get<Array<{ id: number; full_name: string }>>('/users/for-tasks')
      setUsersForSelect(data)
    } catch {
      setUsersForSelect([])
    }
  }

  useEffect(() => {
    if (showSendForm && isAdmin) fetchUsers()
  }, [showSendForm, isAdmin])

  const submitSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sendUserIds.length || !sendTitle.trim()) return
    setSending(true)
    try {
      await api.post('/notifications/send', {
        user_ids: sendUserIds,
        type: sendType,
        title: sendTitle.trim(),
        body: sendBody.trim() || null
      })
      setShowSendForm(false)
      setSendUserIds([])
      setSendTitle('')
      setSendBody('')
      fetchList()
      fetchUnreadCount()
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'שגיאה בשליחת הודעה')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-6" dir="rtl">
      {!embedded && (
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Bell className="w-7 h-7" />
          הודעות
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => { fetchList(); fetchUnreadCount(); }}
            className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            title="רענן"
          >
            <RefreshCw className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowSendForm(!showSendForm)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              <Send className="w-4 h-4" />
              שליחת הודעה
            </button>
          )}
        </div>
      </div>
      )}
      {embedded && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => { fetchList(); fetchUnreadCount(); }}
            className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            title="רענן"
          >
            <RefreshCw className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowSendForm(!showSendForm)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm"
            >
              <Send className="w-4 h-4" />
              שליחת הודעה
            </button>
          )}
        </div>
      )}

      {showSendForm && isAdmin && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm"
        >
          <form onSubmit={submitSend} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">למשתמשים</label>
              <select
                multiple
                value={sendUserIds.map(String)}
                onChange={e => setSendUserIds(Array.from(e.target.selectedOptions, o => parseInt(o.value, 10)))}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2 min-h-[80px]"
              >
                {usersForSelect.map(u => (
                  <option key={u.id} value={u.id}>{u.full_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">סוג</label>
              <select
                value={sendType}
                onChange={e => setSendType(e.target.value as NotificationType)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2"
              >
                {(Object.keys(TYPE_LABELS) as NotificationType[]).map(t => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">כותרת *</label>
              <input
                type="text"
                value={sendTitle}
                onChange={e => setSendTitle(e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תוכן (אופציונלי)</label>
              <textarea
                value={sendBody}
                onChange={e => setSendBody(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2"
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={sending || !sendUserIds.length || !sendTitle.trim()} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                {sending ? 'שולח...' : 'שלח'}
              </button>
              <button type="button" onClick={() => setShowSendForm(false)} className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500">
                ביטול
              </button>
            </div>
          </form>
        </motion.div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setFilterUnread(null)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterUnread === null ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
        >
          הכל
        </button>
        <button
          type="button"
          onClick={() => setFilterUnread(true)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${filterUnread === true ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
        >
          שלא נקראו
          {unreadCount > 0 && <span className="bg-blue-500 text-white text-xs rounded-full px-1.5 min-w-[1.25rem] text-center">{unreadCount}</span>}
        </button>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value as NotificationType | '')}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-1.5 text-sm"
        >
          <option value="">כל הסוגים</option>
          {(Object.keys(TYPE_LABELS) as NotificationType[]).map(t => (
            <option key={t} value={t}>{TYPE_LABELS[t]}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-3">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <RefreshCw className="w-8 h-8 text-gray-400 animate-spin" />
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-12 text-center text-gray-500 dark:text-gray-400">
          <BellOff className="w-12 h-12 mx-auto mb-3 opacity-60" />
          <p>אין הודעות</p>
        </div>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence mode="popLayout">
            {list.map(n => {
              const Icon = TYPE_ICONS[n.type] || Mail
              const isUnread = !n.read_at
              return (
                <motion.li
                  key={n.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={`rounded-xl border transition-colors ${isUnread ? 'border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'} hover:shadow-md`}
                >
                  <div className="p-4 flex gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700">
                            {TYPE_LABELS[n.type]}
                          </span>
                          {n.from_user_name && (
                            <span className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
                              <User className="w-3.5 h-3.5" />
                              {n.from_user_name}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{formatDate(n.created_at)}</span>
                      </div>
                      <h3 className={`font-medium mt-1 ${isUnread ? 'text-gray-900 dark:text-white' : 'text-gray-800 dark:text-gray-200'}`}>
                        {n.title}
                      </h3>
                      {n.body && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 whitespace-pre-wrap">{n.body}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        {n.task_id && (
                          <Link
                            to="/task-management?tab=calendar"
                            className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            <Calendar className="w-4 h-4" />
                            {n.task_title || 'משימה ביומן'}
                          </Link>
                        )}
                        {isUnread ? (
                          <button
                            type="button"
                            onClick={() => markRead(n, true)}
                            className="inline-flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                          >
                            <Check className="w-4 h-4" />
                            סמן כנקרא
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => markRead(n, false)}
                            className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                          >
                            סמן כלא נקרא
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  )
}

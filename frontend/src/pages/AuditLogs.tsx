import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Activity, 
  Filter, 
  Search, 
  User, 
  Calendar,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  FileText,
  FolderOpen,
  DollarSign,
  Users,
  Settings,
  Trash2,
  Edit,
  Plus,
  Eye,
  Upload,
  ArrowRight,
  Info,
  Tag,
  Hash,
  MapPin,
  Building2,
  CreditCard
} from 'lucide-react'
import { useAppDispatch, useAppSelector } from '../utils/hooks'
import { fetchMe } from '../store/slices/authSlice'
import api from '../lib/api'

interface AuditLog {
  id: number
  user_id: number | null
  user?: {
    id: number
    full_name: string
    email: string
  } | null
  action: string
  entity: string
  entity_id: string
  details: string | null
  created_at: string
}

const actionIcons: Record<string, any> = {
  create: Plus,
  update: Edit,
  delete: Trash2,
  view: Eye,
  view_list: Eye,
  archive: FolderOpen,
  restore: RefreshCw,
  upload_receipt: Upload,
  login: User,
  logout: User
}

const entityColors: Record<string, string> = {
  transaction: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  project: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  user: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  supplier: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  budget: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300'
}

const actionLabels: Record<string, string> = {
  create: 'יצירה',
  update: 'עדכון',
  delete: 'מחיקה',
  view: 'צפייה',
  view_list: 'צפייה ברשימה',
  archive: 'ארכוב',
  restore: 'שחזור',
  upload_receipt: 'העלאת קבלה',
  login: 'התחברות',
  logout: 'התנתקות'
}

const entityLabels: Record<string, string> = {
  transaction: 'עסקה',
  project: 'פרויקט',
  user: 'משתמש',
  supplier: 'ספק',
  budget: 'תקציב'
}

export default function AuditLogs() {
  const dispatch = useAppDispatch()
  const { me, loading: authLoading } = useAppSelector(s => s.auth)
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedLogs, setExpandedLogs] = useState<Set<number>>(new Set())
  
  // Filters
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({
    entity: '',
    action: '',
    startDate: '',
    endDate: '',
    userId: ''
  })
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const pageSize = 50

  useEffect(() => {
    if (!me && !authLoading) {
      dispatch(fetchMe())
    }
  }, [me, authLoading, dispatch])

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

  const fetchLogs = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.append('limit', pageSize.toString())
      params.append('offset', (page * pageSize).toString())
      
      // Always exclude view_list action
      params.append('exclude_action', 'view_list')
      
      if (filters.entity) params.append('entity', filters.entity)
      if (filters.action) params.append('action', filters.action)
      if (filters.startDate) params.append('start_date', new Date(filters.startDate).toISOString())
      if (filters.endDate) params.append('end_date', new Date(filters.endDate + 'T23:59:59').toISOString())
      if (filters.userId) params.append('user_id', filters.userId)

      const [logsResponse, countResponse] = await Promise.all([
        api.get(`/audit-logs/with-users?${params.toString()}`),
        api.get(`/audit-logs/count?${params.toString().replace(/limit=\d+&offset=\d+&?/g, '')}`)
      ])
      
      setLogs(logsResponse.data)
      setTotalCount(countResponse.data.count)
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'שגיאה בטעינת הלוגים')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [page, filters])

  const toggleExpand = (logId: number) => {
    const newExpanded = new Set(expandedLogs)
    if (newExpanded.has(logId)) {
      newExpanded.delete(logId)
    } else {
      newExpanded.add(logId)
    }
    setExpandedLogs(newExpanded)
  }


  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat('he-IL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date)
  }

  const parseDetails = (details: string | null) => {
    if (!details) return null
    try {
      return JSON.parse(details)
    } catch {
      return null
    }
  }

  const renderDetails = (details: any) => {
    if (!details || typeof details !== 'object') return null

    const getFieldLabel = (key: string): string => {
      const fieldLabels: Record<string, string> = {
        'amount': 'סכום',
        'type': 'סוג',
        'category': 'קטגוריה',
        'description': 'תיאור',
        'tx_date': 'תאריך עסקה',
        'supplier_id': 'מזהה ספק',
        'payment_method': 'אמצעי תשלום',
        'notes': 'הערות',
        'is_exceptional': 'חריגה',
        'is_generated': 'נוצר אוטומטית',
        'file_path': 'נתיב קובץ',
        'project_id': 'מזהה פרויקט',
        'project_name': 'שם פרויקט',
        'name': 'שם',
        'budget_monthly': 'תקציב חודשי',
        'budget_annual': 'תקציב שנתי',
        'address': 'כתובת',
        'city': 'עיר',
        'start_date': 'תאריך התחלה',
        'end_date': 'תאריך סיום'
      }
      return fieldLabels[key] || key
    }

    const renderValue = (value: any, key?: string): React.ReactNode => {
      if (value === null || value === undefined || value === '') return <span className="text-gray-400">-</span>
      if (typeof value === 'boolean') return <span className={value ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>{value ? 'כן' : 'לא'}</span>
      if (typeof value === 'number') return <span className="font-mono text-blue-600 dark:text-blue-400">{value.toLocaleString('he-IL')}</span>
      if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)) {
        return <span className="text-purple-600 dark:text-purple-400">{formatDate(value)}</span>
      }
      if (typeof value === 'string' && value.startsWith('₪')) {
        return <span className="font-semibold text-green-600 dark:text-green-400">{value}</span>
      }
      if (key === 'amount' && typeof value === 'string' && !isNaN(parseFloat(value))) {
        return <span className="font-semibold text-green-600 dark:text-green-400">₪{parseFloat(value).toLocaleString('he-IL')}</span>
      }
      if (typeof value === 'string' && (value === 'Income' || value === 'Expense')) {
        return <span className="text-blue-600 dark:text-blue-400">{value === 'Income' ? 'הכנסה' : 'הוצאה'}</span>
      }
      return <span className="text-gray-700 dark:text-gray-300 break-words">{String(value)}</span>
    }

    const renderField = (label: string, value: any, icon?: any, color?: string) => {
      if (value === null || value === undefined) return null
      const Icon = icon || Info
      return (
        <div className={`flex items-start gap-3 p-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 ${color || ''}`}>
          <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded text-blue-600 dark:text-blue-400 flex-shrink-0">
            <Icon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</div>
            <div className="text-sm">{renderValue(value)}</div>
          </div>
        </div>
      )
    }

    return (
      <div className="space-y-3">
        {/* Project Name */}
        {details.project_name && renderField('שם פרויקט', details.project_name, Building2, 'border-blue-200 dark:border-blue-800')}
        
        {/* Transaction Details - Show all transaction fields */}
        {details.type && renderField('סוג', details.type === 'Income' ? 'הכנסה' : 'הוצאה', DollarSign, 'border-green-200 dark:border-green-800')}
        {details.amount && renderField('סכום', `₪${parseFloat(details.amount).toLocaleString('he-IL')}`, CreditCard, 'border-green-200 dark:border-green-800')}
        {details.category && renderField('קטגוריה', details.category, Tag, 'border-purple-200 dark:border-purple-800')}
        {details.description && renderField('תיאור', details.description, FileText, 'border-gray-200 dark:border-gray-700')}
        {details.tx_date && renderField('תאריך עסקה', details.tx_date, Calendar, 'border-purple-200 dark:border-purple-800')}
        {details.supplier_id && renderField('מזהה ספק', details.supplier_id, Users, 'border-orange-200 dark:border-orange-800')}
        {(details.filename || details.file_path) && renderField('שם קובץ', details.filename || details.file_path, FileText, 'border-gray-200 dark:border-gray-700')}
        {details.payment_method && renderField('אמצעי תשלום', details.payment_method, CreditCard, 'border-blue-200 dark:border-blue-800')}
        {details.notes && renderField('הערות', details.notes, FileText, 'border-gray-200 dark:border-gray-700')}
        {details.is_exceptional !== undefined && renderField('חריגה', details.is_exceptional ? 'כן' : 'לא', Info, 'border-yellow-200 dark:border-yellow-800')}
        {details.is_generated !== undefined && renderField('נוצר אוטומטית', details.is_generated ? 'כן' : 'לא', RefreshCw, 'border-purple-200 dark:border-purple-800')}
        
        {/* Project Details */}
        {details.name && renderField('שם', details.name, Building2, 'border-blue-200 dark:border-blue-800')}
        {details.description && !details.tx_date && renderField('תיאור', details.description, FileText, 'border-gray-200 dark:border-gray-700')}
        {details.budget_monthly && renderField('תקציב חודשי', `₪${parseFloat(details.budget_monthly).toLocaleString('he-IL')}`, DollarSign, 'border-green-200 dark:border-green-800')}
        {details.budget_annual && renderField('תקציב שנתי', `₪${parseFloat(details.budget_annual).toLocaleString('he-IL')}`, DollarSign, 'border-green-200 dark:border-green-800')}
        {details.address && renderField('כתובת', details.address, MapPin, 'border-orange-200 dark:border-orange-800')}
        {details.city && renderField('עיר', details.city, MapPin, 'border-orange-200 dark:border-orange-800')}
        {details.start_date && renderField('תאריך התחלה', details.start_date, Calendar, 'border-purple-200 dark:border-purple-800')}
        {details.end_date && renderField('תאריך סיום', details.end_date, Calendar, 'border-purple-200 dark:border-purple-800')}
        
        {/* Update Changes */}
        {details.old_values && details.new_values && (
          <div className="space-y-4 mt-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white mb-3">
              <div className="p-1.5 bg-gradient-to-br from-orange-100 to-red-100 dark:from-orange-900/30 dark:to-red-900/30 rounded-lg">
                <ArrowRight className="w-4 h-4 text-orange-600 dark:text-orange-400" />
              </div>
              שינויים שבוצעו
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="text-xs font-semibold text-red-600 dark:text-red-400 mb-3 flex items-center gap-2 px-2">
                  <div className="p-1 bg-red-100 dark:bg-red-900/30 rounded">
                    <Trash2 className="w-3 h-3" />
                  </div>
                  ערכים ישנים
                </div>
                {Object.entries(details.old_values).map(([key, value]) => {
                  const newValue = details.new_values[key]
                  const hasChanged = String(value) !== String(newValue)
                  return (
                    <motion.div 
                      key={key}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`p-3 rounded-lg border-2 transition-all ${
                        hasChanged 
                          ? 'bg-red-50 dark:bg-red-900/10 border-red-300 dark:border-red-800/50 shadow-sm' 
                          : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      <div className="text-xs text-red-600 dark:text-red-400 font-semibold mb-1.5 uppercase tracking-wide">
                        {getFieldLabel(key)}
                      </div>
                      <div className="text-sm font-medium text-gray-800 dark:text-gray-200">{renderValue(value, key)}</div>
                    </motion.div>
                  )
                })}
              </div>
              <div className="space-y-2">
                <div className="text-xs font-semibold text-green-600 dark:text-green-400 mb-3 flex items-center gap-2 px-2">
                  <div className="p-1 bg-green-100 dark:bg-green-900/30 rounded">
                    <Plus className="w-3 h-3" />
                  </div>
                  ערכים חדשים
                </div>
                {Object.entries(details.new_values).map(([key, value]) => {
                  const oldValue = details.old_values[key]
                  const hasChanged = String(value) !== String(oldValue)
                  return (
                    <motion.div 
                      key={key}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`p-3 rounded-lg border-2 transition-all ${
                        hasChanged 
                          ? 'bg-green-50 dark:bg-green-900/10 border-green-300 dark:border-green-800/50 shadow-sm' 
                          : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      <div className="text-xs text-green-600 dark:text-green-400 font-semibold mb-1.5 uppercase tracking-wide">
                        {getFieldLabel(key)}
                      </div>
                      <div className="text-sm font-medium text-gray-800 dark:text-gray-200">{renderValue(value, key)}</div>
                    </motion.div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
        
        {/* Other fields - Show all remaining fields that weren't explicitly rendered above */}
        {(() => {
          const renderedKeys = new Set([
            'project_name', 'type', 'amount', 'category', 'description', 'tx_date', 
            'name', 'budget_monthly', 'budget_annual', 'address', 'city', 'old_values', 'new_values', 
            'supplier_id', 'filename', 'file_path', 'start_date', 'end_date', 'payment_method', 'notes',
            'is_exceptional', 'is_generated'
          ])
          
          return Object.entries(details)
            .filter(([key, value]) => {
              // Only show fields that weren't already rendered
              if (renderedKeys.has(key)) return false
              if (value === null || value === undefined || value === '') return false
              return true
            })
            .map(([key, value]) => {
              // Handle nested objects
              if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
                const nestedEntries = Object.entries(value)
                if (nestedEntries.length === 0) return null
                
                return (
                  <div key={key} className="p-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-2">
                      <Info className="w-3 h-3" />
                      {key}
                    </div>
                    <div className="space-y-2 pl-4 border-r-2 border-gray-200 dark:border-gray-700">
                      {nestedEntries.map(([nestedKey, nestedValue]) => (
                        <div key={nestedKey} className="text-sm">
                          <span className="font-medium text-gray-600 dark:text-gray-400">{nestedKey}:</span>{' '}
                          <span className="text-gray-700 dark:text-gray-300">{renderValue(nestedValue)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              }
              
              // Handle arrays
              if (Array.isArray(value)) {
                if (value.length === 0) return null
                return (
                  <div key={key} className="p-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-2">
                      <Info className="w-3 h-3" />
                      {key} ({value.length} פריטים)
                    </div>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {value.map((item, idx) => (
                        <div key={idx} className="text-sm text-gray-700 dark:text-gray-300 pl-4 py-1 border-l-2 border-gray-200 dark:border-gray-700">
                          {typeof item === 'object' && item !== null ? (
                            <div className="space-y-1">
                              {Object.entries(item).map(([itemKey, itemValue]) => (
                                <div key={itemKey}>
                                  <span className="font-medium text-gray-600 dark:text-gray-400">{itemKey}:</span>{' '}
                                  <span>{renderValue(itemValue)}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span>• {String(item)}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              }
              
              return renderField(key, value)
            })
        })()}
        
        {/* Show message if no details at all */}
        {Object.keys(details).length === 0 && (
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <div className="text-sm text-yellow-800 dark:text-yellow-300">
              אין פרטים נוספים להצגה
            </div>
          </div>
        )}
      </div>
    )
  }

  const clearFilters = () => {
    setFilters({
      entity: '',
      action: '',
      startDate: '',
      endDate: '',
      userId: ''
    })
    setPage(0)
  }

  const hasActiveFilters = Object.values(filters).some(v => v !== '')

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Activity className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">יומן פעילות</h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1">
                  מעקב אחר כל הפעולות במערכת
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
                  showFilters || hasActiveFilters
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700'
                }`}
              >
                <Filter className="w-4 h-4" />
                סינון
                {hasActiveFilters && (
                  <span className="bg-white text-blue-600 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                    !
                  </span>
                )}
              </button>
              <button
                onClick={fetchLogs}
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
              <div className="text-sm text-gray-600 dark:text-gray-400">סה"כ פעולות</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{totalCount}</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
              <div className="text-sm text-gray-600 dark:text-gray-400">בעמוד זה</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{logs.length}</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
              <div className="text-sm text-gray-600 dark:text-gray-400">עמוד נוכחי</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{page + 1}</div>
            </div>
          </div>
        </motion.div>

        {/* Filters */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6 bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    סוג ישות
                  </label>
                  <select
                    value={filters.entity}
                    onChange={(e) => setFilters({ ...filters, entity: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="">הכל</option>
                    <option value="transaction">עסקה</option>
                    <option value="project">פרויקט</option>
                    <option value="user">משתמש</option>
                    <option value="supplier">ספק</option>
                    <option value="budget">תקציב</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    סוג פעולה
                  </label>
                  <select
                    value={filters.action}
                    onChange={(e) => setFilters({ ...filters, action: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="">הכל</option>
                    <option value="create">יצירה</option>
                    <option value="update">עדכון</option>
                    <option value="delete">מחיקה</option>
                    <option value="view">צפייה</option>
                    <option value="archive">ארכוב</option>
                    <option value="restore">שחזור</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    מתאריך
                  </label>
                  <input
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    עד תאריך
                  </label>
                  <input
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div className="md:col-span-2 flex items-end gap-2">
                  <button
                    onClick={clearFilters}
                    className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    נקה סינון
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Logs List */}
        {loading && logs.length === 0 ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">טוען לוגים...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">לא נמצאו לוגים</p>
          </div>
        ) : (
          <div className="space-y-3">
            {logs.map((log, index) => {
              const ActionIcon = actionIcons[log.action] || Activity
              const details = parseDetails(log.details)
              const isExpanded = expandedLogs.has(log.id)

              return (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.02 }}
                  className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg transition-shadow"
                >
                  <div
                    className="p-4 cursor-pointer"
                    onClick={() => toggleExpand(log.id)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4 flex-1">
                        <div className={`p-2 rounded-lg ${entityColors[log.entity] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}>
                          <ActionIcon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${entityColors[log.entity] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}>
                              {entityLabels[log.entity] || log.entity}
                            </span>
                            <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                              {actionLabels[log.action] || log.action}
                            </span>
                            {details?.project_name && (
                              <span className="px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 flex items-center gap-1">
                                <Building2 className="w-3 h-3" />
                                {details.project_name}
                              </span>
                            )}
                            {details?.category && (
                              <span className="px-2 py-1 rounded text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 flex items-center gap-1">
                                <Tag className="w-3 h-3" />
                                {details.category}
                              </span>
                            )}
                          </div>
                          {details?.description && (
                            <div className="mb-2 text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
                              <span className="font-medium text-gray-600 dark:text-gray-400">תיאור: </span>
                              {details.description}
                            </div>
                          )}
                          <div className="mt-2 flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                            {log.user ? (
                              <div className="flex items-center gap-2">
                                <User className="w-4 h-4" />
                                <span className="font-medium">{log.user.full_name}</span>
                                <span className="text-gray-400">({log.user.email})</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <User className="w-4 h-4" />
                                <span>מערכת</span>
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4" />
                              <span>{formatDate(log.created_at)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors">
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-gray-500" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-gray-500" />
                        )}
                      </button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {isExpanded && details && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-gray-200 dark:border-gray-700 bg-gradient-to-br from-gray-50 to-blue-50/30 dark:from-gray-900/50 dark:to-blue-900/10"
                      >
                        <div className="p-6">
                          <div className="flex items-center gap-2 mb-4">
                            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                              <Info className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                            </div>
                            <h4 className="text-base font-semibold text-gray-900 dark:text-white">פרטים נוספים</h4>
                          </div>
                          <div className="space-y-3">
                            {renderDetails(details)}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )
            })}
          </div>
        )}

        {/* Pagination */}
        {totalCount > pageSize && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0 || loading}
              className="px-4 py-2 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              קודם
            </button>
            <span className="px-4 py-2 text-gray-700 dark:text-gray-300">
              עמוד {page + 1} מתוך {Math.ceil(totalCount / pageSize)}
            </span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page >= Math.ceil(totalCount / pageSize) - 1 || loading}
              className="px-4 py-2 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              הבא
            </button>
          </div>
        )}
      </div>
    </div>
  )
}


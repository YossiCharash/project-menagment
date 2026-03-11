import { useEffect, useState, useCallback, useRef, type ChangeEvent, type FormEvent } from 'react'
import { useAppDispatch, useAppSelector } from '../utils/hooks'
import { fetchMe } from '../store/slices/authSlice'
import { CategoryAPI, Category, CategoryCreate, SupplierAPI, Supplier, SupplierCreate, SupplierUpdate, QuoteStructureAPI, QuoteStructureItem } from '../lib/apiClient'
import api, { avatarUrl } from '../lib/api'
import { Plus, Trash2, Edit2, X, Check, Moon, Sun, Eye, Calendar, User, Mail, Phone } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useNavigate } from 'react-router-dom'
import DeleteSupplierModal from '../components/DeleteSupplierModal'
import DeleteCategoryModal from '../components/DeleteCategoryModal'

export default function Settings() {
  const dispatch = useAppDispatch()
  const { me, loading: authLoading } = useAppSelector(s => s.auth)
  const permissions = useAppSelector(s => s.permissions.permissions)
  const isAdmin = me?.role === 'Admin' || me?.role === 'SuperAdmin'
  const hasPermission = (resource: string) =>
    isAdmin || permissions.some(p => p.resource_type === resource)
  const canSeeCategories = hasPermission('category')
  const canSeeSuppliers = hasPermission('supplier')
  const canSeeQuoteStructure = hasPermission('quote')
  const { theme, toggleTheme } = useTheme()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [nameValidationError, setNameValidationError] = useState<string | null>(null)
  const [isValidatingName, setIsValidatingName] = useState(false)
  const [activeTab, setActiveTab] = useState<'profile' | 'categories' | 'suppliers' | 'display' | 'calendar' | 'quoteStructure'>('profile')
  
  // Suppliers state
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [suppliersLoading, setSuppliersLoading] = useState(false)
  const [suppliersError, setSuppliersError] = useState<string | null>(null)
  const [showAddSupplierForm, setShowAddSupplierForm] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [supplierFormData, setSupplierFormData] = useState<SupplierCreate>({
    name: '',
    contact_email: '',
    phone: '',
    category: '',
    annual_budget: undefined
  })
  const [availableCategories, setAvailableCategories] = useState<string[]>([])
  
  // Delete modals state
  const [showDeleteSupplierModal, setShowDeleteSupplierModal] = useState(false)
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null)
  const [supplierTransactionCount, setSupplierTransactionCount] = useState(0)
  const [showDeleteCategoryModal, setShowDeleteCategoryModal] = useState(false)
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null)
  const [categorySuppliers, setCategorySuppliers] = useState<Array<{ id: number; name: string; category: string | null; transaction_count: number }>>([])
  
  // Quote structure state
  const [showQuoteStructureForm, setShowQuoteStructureForm] = useState(false)
  const [newQuoteStructureName, setNewQuoteStructureName] = useState('')
  const [quoteStructureError, setQuoteStructureError] = useState<string | null>(null)
  const [quoteStructureLoading, setQuoteStructureLoading] = useState(false)
  const [quoteStructureItems, setQuoteStructureItems] = useState<QuoteStructureItem[]>([])

  // Calendar preferences (display tab) – synced from me when tab opens
  const [calendarDateDisplay, setCalendarDateDisplay] = useState<'gregorian' | 'hebrew' | 'both'>('gregorian')
  const [showJewishHolidays, setShowJewishHolidays] = useState(true)
  const [showIslamicHolidays, setShowIslamicHolidays] = useState(false)
  const [calendarSettingsSaving, setCalendarSettingsSaving] = useState(false)
  const [calendarSettingsError, setCalendarSettingsError] = useState<string | null>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  // Profile form (אזור אישי)
  const [profileFullName, setProfileFullName] = useState('')
  const [profileEmail, setProfileEmail] = useState('')
  const [profilePhone, setProfilePhone] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSuccess, setProfileSuccess] = useState(false)

  const navigate = useNavigate()

  // Fetch user data if not loaded
  useEffect(() => {
    if (!me && !authLoading) {
      dispatch(fetchMe())
    }
  }, [me, authLoading, dispatch])

  // Fetch categories
  const fetchCategories = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await CategoryAPI.getCategories()
      setCategories(data)
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'שגיאה בטעינת הקטגוריות')
    } finally {
      setLoading(false)
    }
  }

  // Reset to profile tab if non-admin somehow has an admin-only tab active
  useEffect(() => {
    if (
      (activeTab === 'categories' && !canSeeCategories) ||
      (activeTab === 'suppliers' && !canSeeSuppliers) ||
      (activeTab === 'quoteStructure' && !canSeeQuoteStructure)
    ) {
      setActiveTab('profile')
    }
  }, [isAdmin, activeTab])

  useEffect(() => {
    // Reset forms and errors when switching tabs
    setShowAddForm(false)
    setShowAddSupplierForm(false)
    setEditingSupplier(null)
    setNewCategoryName('')
    setSupplierFormData({
      name: '',
      contact_email: '',
      phone: '',
      category: '',
      annual_budget: undefined
    })
    setError(null)
    setSuppliersError(null)
    setNameValidationError(null)
    setShowQuoteStructureForm(false)
    setNewQuoteStructureName('')
    setQuoteStructureError(null)
    setCalendarSettingsError(null)
    setProfileError(null)

    // Sync profile form from me when opening profile tab
    if (activeTab === 'profile' && me) {
      setProfileFullName(me.full_name ?? '')
      setProfileEmail(me.email ?? '')
      setProfilePhone(me.phone ?? '')
    }
    // Sync calendar preferences from me when opening calendar tab
    if (activeTab === 'calendar' && me) {
      setCalendarDateDisplay(me.calendar_date_display ?? 'gregorian')
      setShowJewishHolidays(me.show_jewish_holidays ?? true)
      setShowIslamicHolidays(me.show_islamic_holidays ?? false)
    }
    
    // Load data based on active tab
    if (activeTab === 'categories') {
      fetchCategories()
    } else if (activeTab === 'suppliers') {
      fetchSuppliers()
      loadCategoriesForSuppliers()
    } else if (activeTab === 'quoteStructure') {
      fetchQuoteStructure()
    }
  }, [activeTab, me])

  const fetchQuoteStructure = async () => {
    setQuoteStructureLoading(true)
    setQuoteStructureError(null)
    try {
      const data = await QuoteStructureAPI.list(true)
      setQuoteStructureItems(data)
    } catch (err: any) {
      setQuoteStructureError(err.response?.data?.detail || err.message || 'שגיאה בטעינת חלוקת הצעת מחיר')
    } finally {
      setQuoteStructureLoading(false)
    }
  }

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

  const saveCalendarSettings = async () => {
    setCalendarSettingsSaving(true)
    setCalendarSettingsError(null)
    try {
      await api.patch('/users/me', {
        calendar_date_display: calendarDateDisplay,
        show_jewish_holidays: showJewishHolidays,
        show_islamic_holidays: showIslamicHolidays,
      })
      dispatch(fetchMe())
    } catch (err: any) {
      setCalendarSettingsError(err.response?.data?.detail || err.message || 'שגיאה בשמירת הגדרות לוח השנה')
    } finally {
      setCalendarSettingsSaving(false)
    }
  }

  // Load categories for suppliers dropdown
  const loadCategoriesForSuppliers = async () => {
    try {
      const categories = await CategoryAPI.getCategories()
      const categoryNames = categories.filter(cat => cat.is_active).map(cat => cat.name)
      setAvailableCategories(categoryNames)
    } catch (err) {
      console.error('Error loading categories for suppliers:', err)
    }
  }
  
  // Fetch suppliers
  const fetchSuppliers = async () => {
    setSuppliersLoading(true)
    setSuppliersError(null)
    try {
      const data = await SupplierAPI.getSuppliers()
      setSuppliers(data)
    } catch (err: any) {
      setSuppliersError(err.response?.data?.detail || err.message || 'שגיאה בטעינת הספקים')
    } finally {
      setSuppliersLoading(false)
    }
  }
  
  // Quote structure: add item
  const handleAddQuoteStructure = async (e: FormEvent) => {
    e.preventDefault()
    if (!newQuoteStructureName.trim()) {
      setQuoteStructureError('נא להזין שם פריט')
      return
    }
    setQuoteStructureError(null)
    setQuoteStructureLoading(true)
    try {
      await QuoteStructureAPI.create({ name: newQuoteStructureName.trim(), sort_order: quoteStructureItems.length })
      setNewQuoteStructureName('')
      setShowQuoteStructureForm(false)
      await fetchQuoteStructure()
    } catch (err: any) {
      setQuoteStructureError(err.response?.data?.detail || err.message || 'שגיאה בהוספת פריט')
    } finally {
      setQuoteStructureLoading(false)
    }
  }

  // Quote structure: delete item
  const handleDeleteQuoteStructure = async (itemId: number) => {
    if (!confirm('למחוק פריט זה מהחלוקה?')) return
    setQuoteStructureError(null)
    setQuoteStructureLoading(true)
    try {
      await QuoteStructureAPI.delete(itemId)
      await fetchQuoteStructure()
    } catch (err: any) {
      setQuoteStructureError(err.response?.data?.detail || err.message || 'שגיאה במחיקת פריט')
    } finally {
      setQuoteStructureLoading(false)
    }
  }

  // Handle add supplier
  const handleAddSupplier = async (e: FormEvent) => {
    e.preventDefault()
    
    if (!supplierFormData.name || !supplierFormData.name.trim()) {
      setSuppliersError('שם הספק הוא שדה חובה')
      return
    }
    if (!supplierFormData.category || !supplierFormData.category.trim()) {
      setSuppliersError('קטגוריה היא שדה חובה')
      return
    }
    
    setSuppliersError(null)
    setSuppliersLoading(true)
    try {
      await SupplierAPI.createSupplier({
        name: supplierFormData.name.trim(),
        contact_email: supplierFormData.contact_email?.trim() || undefined,
        phone: supplierFormData.phone?.trim() || undefined,
        category: supplierFormData.category || undefined,
        annual_budget: supplierFormData.annual_budget || undefined
      })
      setSupplierFormData({
        name: '',
        contact_email: '',
        phone: '',
        category: '',
        annual_budget: undefined
      })
      setShowAddSupplierForm(false)
      await fetchSuppliers()
    } catch (err: any) {
      const errorDetail = err.response?.data?.detail
      if (Array.isArray(errorDetail) && errorDetail[0]?.msg) {
        setSuppliersError(errorDetail[0].msg)
      } else {
        setSuppliersError(errorDetail || err.message || 'שגיאה ביצירת הספק')
      }
    } finally {
      setSuppliersLoading(false)
    }
  }
  
  // Handle edit supplier
  const handleEditSupplier = (supplier: Supplier) => {
    setEditingSupplier(supplier)
    setSupplierFormData({
      name: supplier.name,
      contact_email: supplier.contact_email || '',
      phone: supplier.phone || '',
      category: supplier.category || '',
      annual_budget: supplier.annual_budget || undefined
    })
  }
  
  // Handle update supplier
  const handleUpdateSupplier = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingSupplier) {
      return
    }
    
    if (!supplierFormData.name || !supplierFormData.name.trim()) {
      setSuppliersError('שם הספק הוא שדה חובה')
      return
    }
    if (!supplierFormData.category || !supplierFormData.category.trim()) {
      setSuppliersError('קטגוריה היא שדה חובה')
      return
    }
    
    setSuppliersError(null)
    setSuppliersLoading(true)
    try {
      await SupplierAPI.updateSupplier(editingSupplier.id, {
        name: supplierFormData.name.trim(),
        contact_email: supplierFormData.contact_email?.trim() || undefined,
        phone: supplierFormData.phone?.trim() || undefined,
        category: supplierFormData.category || undefined,
        annual_budget: supplierFormData.annual_budget || undefined
      })
      setEditingSupplier(null)
      setSupplierFormData({
        name: '',
        contact_email: '',
        phone: '',
        category: '',
        annual_budget: undefined
      })
      await fetchSuppliers()
    } catch (err: any) {
      const errorDetail = err.response?.data?.detail
      if (Array.isArray(errorDetail) && errorDetail[0]?.msg) {
        setSuppliersError(errorDetail[0].msg)
      } else {
        setSuppliersError(errorDetail || err.message || 'שגיאה בעדכון הספק')
      }
    } finally {
      setSuppliersLoading(false)
    }
  }
  
  // Handle delete supplier - opens modal
  const handleDeleteSupplier = async (supplierId: number, supplierName: string) => {
    const supplier = suppliers.find(s => s.id === supplierId)
    if (!supplier) return

    try {
      // Get transaction count
      const countData = await SupplierAPI.getSupplierTransactionCount(supplierId)
      setSupplierTransactionCount(countData.transaction_count)
      setSupplierToDelete(supplier)
      setShowDeleteSupplierModal(true)
    } catch (err: any) {
      setSuppliersError(err.response?.data?.detail || err.message || 'שגיאה בבדיקת עסקאות')
    }
  }

  // Confirm delete supplier after modal
  const confirmDeleteSupplier = async (transferToSupplierId?: number) => {
    if (!supplierToDelete) return

    setSuppliersError(null)
    setSuppliersLoading(true)
    try {
      await SupplierAPI.deleteSupplier(supplierToDelete.id, transferToSupplierId)
      setShowDeleteSupplierModal(false)
      setSupplierToDelete(null)
      setSupplierTransactionCount(0)
      await fetchSuppliers()
    } catch (err: any) {
      setSuppliersError(err.response?.data?.detail || err.message || 'שגיאה במחיקת הספק')
    } finally {
      setSuppliersLoading(false)
    }
  }
  
  const cancelSupplierEdit = () => {
    setEditingSupplier(null)
    setSupplierFormData({
      name: '',
      contact_email: '',
      phone: '',
      category: '',
      annual_budget: undefined
    })
    setSuppliersError(null)
  }

  // Validate category name in real-time
  const validateCategoryName = useCallback(async (name: string, excludeId?: number) => {
    if (!name || !name.trim()) {
      setNameValidationError('שם הקטגוריה לא יכול להיות ריק')
      return false
    }

    const trimmedName = name.trim()
    if (trimmedName.length > 100) {
      setNameValidationError('שם הקטגוריה לא יכול להיות ארוך מ-100 תווים')
      return false
    }

    // Check if name already exists
    setIsValidatingName(true)
    try {
      const allCategories = await CategoryAPI.getCategories(true) // Include inactive
      const existing = allCategories.find(
        cat => cat.name.toLowerCase() === trimmedName.toLowerCase() && cat.id !== excludeId
      )
      if (existing) {
        setNameValidationError('קטגוריה עם שם זה כבר קיימת')
        return false
      }
      setNameValidationError(null)
      return true
    } catch (err) {
      // If validation fails, don't block the user
      setNameValidationError(null)
      return true
    } finally {
      setIsValidatingName(false)
    }
  }, [])

  // Debounced validation for new category name
  useEffect(() => {
    if (!showAddForm || !newCategoryName) {
      setNameValidationError(null)
      return
    }

    const timeoutId = setTimeout(() => {
      validateCategoryName(newCategoryName)
    }, 500) // Wait 500ms after user stops typing

    return () => clearTimeout(timeoutId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newCategoryName, showAddForm])


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

  const handleAddCategory = async (e: FormEvent) => {
    e.preventDefault()
    
    // Final validation before submit
    const isValid = await validateCategoryName(newCategoryName)
    if (!isValid || nameValidationError) {
      setError(nameValidationError || 'שם הקטגוריה לא תקין')
      return
    }

    setError(null)
    setLoading(true)
    try {
      await CategoryAPI.createCategory({ name: newCategoryName.trim() })
      setNewCategoryName('')
      setNameValidationError(null)
      setShowAddForm(false)
      await fetchCategories()
    } catch (err: any) {
      const errorDetail = err.response?.data?.detail
      if (Array.isArray(errorDetail) && errorDetail[0]?.msg) {
        setError(errorDetail[0].msg)
        setNameValidationError(errorDetail[0].msg)
      } else {
        setError(errorDetail || err.message || 'שגיאה ביצירת הקטגוריה')
      }
    } finally {
      setLoading(false)
    }
  }


  const handleDeleteCategory = async (categoryId: number, categoryName: string) => {
    const category = categories.find(c => c.id === categoryId)
    if (!category) return

    try {
      // Get suppliers for this category
      const suppliers = await CategoryAPI.getCategorySuppliers(categoryId)
      setCategorySuppliers(suppliers)
      setCategoryToDelete(category)
      setShowDeleteCategoryModal(true)
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'שגיאה בטעינת הספקים')
    }
  }

  // Confirm delete category after modal
  const confirmDeleteCategory = async () => {
    if (!categoryToDelete) return

    setError(null)
    setLoading(true)
    try {
      await CategoryAPI.deleteCategory(categoryToDelete.id)
      setShowDeleteCategoryModal(false)
      setCategoryToDelete(null)
      setCategorySuppliers([])
      await fetchCategories()
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'שגיאה במחיקת הקטגוריה')
    } finally {
      setLoading(false)
    }
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
              {canSeeCategories && (
                <button
                  onClick={() => setActiveTab('categories')}
                  className={`settings-tab px-4 py-2 font-medium transition-colors border-b-2 flex-shrink-0 whitespace-nowrap -mb-px ${
                    activeTab === 'categories'
                      ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  ניהול קטגוריות
                </button>
              )}
              {canSeeSuppliers && (
                <button
                  onClick={() => setActiveTab('suppliers')}
                  className={`settings-tab px-4 py-2 font-medium transition-colors border-b-2 flex-shrink-0 whitespace-nowrap -mb-px ${
                    activeTab === 'suppliers'
                      ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  ניהול ספקים
                </button>
              )}
              {canSeeQuoteStructure && (
                <button
                  onClick={() => setActiveTab('quoteStructure')}
                  className={`settings-tab px-4 py-2 font-medium transition-colors border-b-2 flex-shrink-0 whitespace-nowrap -mb-px ${
                    activeTab === 'quoteStructure'
                      ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  חלוקת הצעת מחיר
                </button>
              )}
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
              <button
                onClick={() => setActiveTab('calendar')}
                className={`settings-tab px-4 py-2 font-medium transition-colors border-b-2 flex-shrink-0 whitespace-nowrap -mb-px ${
                  activeTab === 'calendar'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                לוח שנה
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

          {/* Categories Tab Content */}
          {activeTab === 'categories' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">קטגוריות הוצאות</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">ניהול קטגוריות הוצאות למערכת</p>
                </div>
                {!showAddForm && (
                  <button
                    onClick={() => setShowAddForm(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    הוסף קטגוריה
                  </button>
                )}
              </div>

          {error && (
            <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Add Category Form */}
          {showAddForm && (
            <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <form onSubmit={handleAddCategory} className="space-y-3">
                <div>
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => {
                      setNewCategoryName(e.target.value)
                      setError(null)
                    }}
                    placeholder="שם הקטגוריה"
                    className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 transition-colors ${
                      nameValidationError
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'
                    }`}
                    autoFocus
                  />
                  {nameValidationError && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{nameValidationError}</p>
                  )}
                  {isValidatingName && !nameValidationError && (
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">בודק...</p>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={loading || !!nameValidationError || isValidatingName || !newCategoryName.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Check className="w-4 h-4" />
                    שמור
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddForm(false)
                      setNewCategoryName('')
                      setError(null)
                      setNameValidationError(null)
                    }}
                    className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors flex items-center gap-2"
                  >
                    <X className="w-4 h-4" />
                    ביטול
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Categories List */}
          {loading && categories.length === 0 ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600 dark:text-gray-400">טוען קטגוריות...</p>
            </div>
          ) : categories.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400">אין קטגוריות עדיין. הוסף קטגוריה חדשה כדי להתחיל.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {categories.map((category) => (
                <div
                  key={category.id}
                  className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <span className="text-gray-900 dark:text-white font-medium">{category.name}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDeleteCategory(category.id, category.name)}
                      disabled={loading}
                      className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                      title="מחק"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
            </div>
          )}

          {/* Suppliers Tab Content */}
          {activeTab === 'suppliers' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">ניהול ספקים</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">ניהול ספקים למערכת</p>
                </div>
                {!showAddSupplierForm && !editingSupplier && (
                  <button
                    onClick={() => setShowAddSupplierForm(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    הוסף ספק
                  </button>
                )}
              </div>

              {suppliersError && (
                <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <p className="text-red-600 dark:text-red-400 text-sm">{suppliersError}</p>
                </div>
              )}

              {/* Add Supplier Form */}
              {showAddSupplierForm && (
                <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <form onSubmit={handleAddSupplier} className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          שם הספק *
                        </label>
                        <input
                          type="text"
                          value={supplierFormData.name}
                          onChange={(e) => setSupplierFormData({ ...supplierFormData, name: e.target.value })}
                          placeholder="שם הספק"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          קטגוריה *
                        </label>
                        <select
                          value={supplierFormData.category}
                          onChange={(e) => setSupplierFormData({ ...supplierFormData, category: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          required
                        >
                          <option value="">בחר קטגוריה</option>
                          {availableCategories.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          אימייל
                        </label>
                        <input
                          type="email"
                          value={supplierFormData.contact_email || ''}
                          onChange={(e) => setSupplierFormData({ ...supplierFormData, contact_email: e.target.value })}
                          placeholder="אימייל"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          טלפון
                        </label>
                        <input
                          type="tel"
                          value={supplierFormData.phone || ''}
                          onChange={(e) => setSupplierFormData({ ...supplierFormData, phone: e.target.value })}
                          placeholder="טלפון"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          תקציב שנתי
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={supplierFormData.annual_budget || ''}
                          onChange={(e) => setSupplierFormData({ ...supplierFormData, annual_budget: e.target.value === '' ? undefined : Number(e.target.value) })}
                          placeholder="תקציב שנתי"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <button
                        type="submit"
                        disabled={suppliersLoading}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Check className="w-4 h-4" />
                        שמור
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddSupplierForm(false)
                          setSupplierFormData({
                            name: '',
                            contact_email: '',
                            phone: '',
                            category: '',
                            annual_budget: undefined
                          })
                          setSuppliersError(null)
                        }}
                        className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors flex items-center gap-2"
                      >
                        <X className="w-4 h-4" />
                        ביטול
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Suppliers List */}
              {suppliersLoading && suppliers.length === 0 ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-600 dark:text-gray-400">טוען ספקים...</p>
                </div>
              ) : suppliers.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-600 dark:text-gray-400">אין ספקים עדיין. הוסף ספק חדש כדי להתחיל.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {suppliers.map((supplier) => (
                    <div
                      key={supplier.id}
                      className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      {editingSupplier?.id === supplier.id ? (
                        <form onSubmit={handleUpdateSupplier} className="space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                שם הספק *
                              </label>
                              <input
                                type="text"
                                value={supplierFormData.name}
                                onChange={(e) => setSupplierFormData({ ...supplierFormData, name: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                required
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                קטגוריה *
                              </label>
                              <select
                                value={supplierFormData.category}
                                onChange={(e) => setSupplierFormData({ ...supplierFormData, category: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                required
                              >
                                <option value="">בחר קטגוריה</option>
                                {availableCategories.map((cat) => (
                                  <option key={cat} value={cat}>
                                    {cat}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                אימייל
                              </label>
                              <input
                                type="email"
                                value={supplierFormData.contact_email || ''}
                                onChange={(e) => setSupplierFormData({ ...supplierFormData, contact_email: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                טלפון
                              </label>
                              <input
                                type="tel"
                                value={supplierFormData.phone || ''}
                                onChange={(e) => setSupplierFormData({ ...supplierFormData, phone: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                תקציב שנתי
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={supplierFormData.annual_budget || ''}
                                onChange={(e) => setSupplierFormData({ ...supplierFormData, annual_budget: e.target.value === '' ? undefined : Number(e.target.value) })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                          </div>
                          <div className="flex gap-3">
                            <button
                              type="submit"
                              disabled={suppliersLoading}
                              className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Check className="w-4 h-4" />
                              שמור
                            </button>
                            <button
                              type="button"
                              onClick={cancelSupplierEdit}
                              disabled={suppliersLoading}
                              className="px-3 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors flex items-center gap-2 disabled:opacity-50"
                            >
                              <X className="w-4 h-4" />
                              ביטול
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-4">
                            <div>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">שם</p>
                              <p className="text-gray-900 dark:text-white font-medium">{supplier.name}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">קטגוריה</p>
                              <p className="text-gray-900 dark:text-white">{supplier.category || '-'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">אימייל</p>
                              <p className="text-gray-900 dark:text-white">{supplier.contact_email || '-'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">טלפון</p>
                              <p className="text-gray-900 dark:text-white">{supplier.phone || '-'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">תקציב שנתי</p>
                              <p className="text-gray-900 dark:text-white">{supplier.annual_budget ? supplier.annual_budget.toLocaleString() : '-'}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => navigate(`/suppliers/${supplier.id}/documents`)}
                              className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                              title="צפה במסמכים"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleEditSupplier(supplier)}
                              className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                              title="ערוך"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteSupplier(supplier.id, supplier.name)}
                              disabled={suppliersLoading}
                              className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                              title="מחק"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Quote Structure Tab Content (חלוקת הצעת מחיר) */}
          {activeTab === 'quoteStructure' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">חלוקת הצעת מחיר</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">הגדר את הפריטים שיופיעו בבניית הצעות מחיר (בתווית הצעות מחיר תוכל לבחור אילו להוסיף להצעה)</p>
                </div>
                {!showQuoteStructureForm && (
                  <button
                    onClick={() => setShowQuoteStructureForm(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    הוסף פריט
                  </button>
                )}
              </div>

              {quoteStructureError && (
                <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <p className="text-red-600 dark:text-red-400 text-sm">{quoteStructureError}</p>
                </div>
              )}

              {showQuoteStructureForm && (
                <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <form onSubmit={handleAddQuoteStructure} className="space-y-3 flex flex-wrap items-end gap-3">
                    <div className="flex-1 min-w-[200px]">
                      <input
                        type="text"
                        value={newQuoteStructureName}
                        onChange={(e) => {
                          setNewQuoteStructureName(e.target.value)
                          setQuoteStructureError(null)
                        }}
                        placeholder="שם הפריט (למשל: ניהול, תחזוקה, ניקיון)"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={quoteStructureLoading || !newQuoteStructureName.trim()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                      >
                        <Check className="w-4 h-4" />
                        שמור
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowQuoteStructureForm(false)
                          setNewQuoteStructureName('')
                          setQuoteStructureError(null)
                        }}
                        className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors flex items-center gap-2"
                      >
                        <X className="w-4 h-4" />
                        ביטול
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {quoteStructureLoading && quoteStructureItems.length === 0 ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">טוען פריטים...</p>
                </div>
              ) : quoteStructureItems.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-600 dark:text-gray-400">אין פריטים עדיין. הוסף פריטים שיופיעו בבניית הצעות מחיר (למשל: ניהול, תחזוקה, ניקיון).</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {quoteStructureItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      <span className="text-gray-900 dark:text-white font-medium">{item.name}</span>
                      <div className="flex items-center gap-2">
                        {!item.is_active && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">(לא פעיל)</span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteQuoteStructure(item.id)}
                          disabled={quoteStructureLoading}
                          className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                          title="מחק"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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

          {/* Calendar Tab Content - הגדרות לוח שנה */}
          {activeTab === 'calendar' && (
            <div>
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-indigo-500" />
                  הגדרות לוח שנה (יומן משימות)
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">בחר איך להציג תאריכים ואילו חגים להציג בלוח השנה.</p>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">סוג תאריך בתאים</label>
                    <select
                      value={calendarDateDisplay}
                      onChange={(e) => setCalendarDateDisplay(e.target.value as 'gregorian' | 'hebrew' | 'both')}
                      className="w-full max-w-xs px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                      <option value="gregorian">לועזי בלבד</option>
                      <option value="hebrew">עברי בלבד</option>
                      <option value="both">עברי ולועזי</option>
                    </select>
                  </div>
                  <div className="flex flex-wrap gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showJewishHolidays}
                        onChange={(e) => setShowJewishHolidays(e.target.checked)}
                        className="rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">הצג חגי ישראל</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showIslamicHolidays}
                        onChange={(e) => setShowIslamicHolidays(e.target.checked)}
                        className="rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">הצג חגים אסלאמיים</span>
                    </label>
                  </div>
                  {calendarSettingsError && (
                    <p className="text-sm text-red-600 dark:text-red-400">{calendarSettingsError}</p>
                  )}
                  <button
                    type="button"
                    onClick={saveCalendarSettings}
                    disabled={calendarSettingsSaving}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    {calendarSettingsSaving ? 'שומר...' : 'שמור הגדרות לוח שנה'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Supplier Modal */}
      <DeleteSupplierModal
        isOpen={showDeleteSupplierModal}
        onClose={() => {
          setShowDeleteSupplierModal(false)
          setSupplierToDelete(null)
          setSupplierTransactionCount(0)
        }}
        onConfirm={confirmDeleteSupplier}
        supplier={supplierToDelete}
        allSuppliers={suppliers}
        transactionCount={supplierTransactionCount}
      />

      {/* Delete Category Modal */}
      <DeleteCategoryModal
        isOpen={showDeleteCategoryModal}
        onClose={() => {
          setShowDeleteCategoryModal(false)
          setCategoryToDelete(null)
          setCategorySuppliers([])
        }}
        onConfirm={confirmDeleteCategory}
        categoryName={categoryToDelete?.name || ''}
        suppliers={categorySuppliers}
        loading={loading}
      />
    </div>
  )
}


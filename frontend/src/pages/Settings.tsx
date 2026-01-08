import { useEffect, useState, useCallback } from 'react'
import { useAppDispatch, useAppSelector } from '../utils/hooks'
import { fetchMe } from '../store/slices/authSlice'
import { CategoryAPI, Category, CategoryCreate, SupplierAPI, Supplier, SupplierCreate, SupplierUpdate } from '../lib/apiClient'
import { Plus, Trash2, Edit2, X, Check, Moon, Sun, Eye } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useNavigate } from 'react-router-dom'
import DeleteSupplierModal from '../components/DeleteSupplierModal'
import DeleteCategoryModal from '../components/DeleteCategoryModal'

export default function Settings() {
  const dispatch = useAppDispatch()
  const { me, loading: authLoading } = useAppSelector(s => s.auth)
  const { theme, toggleTheme } = useTheme()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [nameValidationError, setNameValidationError] = useState<string | null>(null)
  const [isValidatingName, setIsValidatingName] = useState(false)
  const [activeTab, setActiveTab] = useState<'categories' | 'suppliers' | 'display'>('categories')
  
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
    
    // Load data based on active tab
    if (activeTab === 'categories') {
      fetchCategories()
    } else if (activeTab === 'suppliers') {
      fetchSuppliers()
      loadCategoriesForSuppliers()
    }
  }, [activeTab])
  
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
  
  // Handle add supplier
  const handleAddSupplier = async (e: React.FormEvent) => {
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

  const handleAddCategory = async (e: React.FormEvent) => {
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

          {/* Tabs */}
          <div className="mb-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex gap-4">
              <button
                onClick={() => {
                  setActiveTab('categories')
                }}
                className={`px-4 py-2 font-medium transition-colors border-b-2 ${
                  activeTab === 'categories'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                ניהול קטגוריות
              </button>
              <button
                onClick={() => {
                  setActiveTab('suppliers')
                }}
                className={`px-4 py-2 font-medium transition-colors border-b-2 ${
                  activeTab === 'suppliers'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                ניהול ספקים
              </button>
              <button
                onClick={() => {
                  setActiveTab('display')
                }}
                className={`px-4 py-2 font-medium transition-colors border-b-2 ${
                  activeTab === 'display'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                תצוגה
              </button>
            </div>
          </div>

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


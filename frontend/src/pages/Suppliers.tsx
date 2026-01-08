import { useEffect, useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../utils/hooks'
import { createSupplier, deleteSupplier, fetchSuppliers, updateSupplier } from '../store/slices/suppliersSlice'
import { CategoryAPI } from '../lib/apiClient'
import { Eye } from 'lucide-react'

export default function Suppliers() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { items, loading, error } = useAppSelector(s => s.suppliers)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [category, setCategory] = useState('')
  const [annualBudget, setAnnualBudget] = useState<number | ''>('')
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [availableCategories, setAvailableCategories] = useState<string[]>([])

  const [editId, setEditId] = useState<number | null>(null)

  useEffect(() => { 
    dispatch(fetchSuppliers())
    loadCategories()
  }, [dispatch])
  
  const loadCategories = async () => {
    try {
      const categories = await CategoryAPI.getCategories()
      const categoryNames = categories.filter(cat => cat.is_active).map(cat => cat.name)
      setAvailableCategories(categoryNames)
    } catch (err) {
      console.error('Error loading categories:', err)
    }
  }

  const onCreate = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)
    
    if (!name || name.trim() === '') {
      setFormError('שם הספק הוא שדה חובה')
      return
    }
    if (!category || category.trim() === '') {
      setFormError('קטגוריה היא שדה חובה')
      return
    }

    setSaving(true)
    try {
      const result = await dispatch(createSupplier({
        name: name.trim(),
        contact_email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        category: category || undefined,
        annual_budget: annualBudget === '' ? undefined : Number(annualBudget)
      }))
      if (createSupplier.rejected.match(result)) {
        setFormError(result.payload as string || 'שגיאה ביצירת ספק')
      } else {
        setName(''); setEmail(''); setPhone(''); setCategory(''); setAnnualBudget('')
        setFormError(null)
      }
    } catch (err: any) {
      setFormError(err.message || 'שגיאה ביצירת ספק')
    } finally {
      setSaving(false)
    }
  }

  const onUpdate = async (id: number) => {
    await dispatch(updateSupplier({
      id,
      changes: {
        name,
        contact_email: email || undefined,
        phone: phone || undefined,
        category: category || undefined,
        annual_budget: annualBudget === '' ? undefined : Number(annualBudget)
      }
    }))
    setEditId(null); setName(''); setEmail(''); setPhone(''); setCategory(''); setAnnualBudget('')
  }

  const onDelete = async (id: number) => {
    if (confirm('למחוק ספק לצמיתות?')) await dispatch(deleteSupplier(id))
  }


  const startEdit = (id: number) => {
    const s = items.find(x=>x.id===id)
    if (!s) return
    setEditId(id)
    setName(s.name)
    setEmail(s.contact_email ?? '')
    setPhone(s.phone ?? '')
    setCategory(s.category ?? '')
    setAnnualBudget(s.annual_budget ?? '')
  }

  return (
    <div className="space-y-4 relative">

      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">ספקים</h1>

      <div className="bg-white dark:bg-gray-800 p-4 rounded shadow border border-gray-200 dark:border-gray-700">
        <h2 className="font-semibold mb-2 text-gray-900 dark:text-white">הוספת ספק</h2>
        <form onSubmit={onCreate} className="grid md:grid-cols-4 gap-2">
          <input 
            className="border rounded p-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600" 
            placeholder="שם *" 
            value={name} 
            onChange={e=>setName(e.target.value)}
            required
            minLength={1}
          />
          <input 
            className="border rounded p-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600" 
            placeholder="אימייל" 
            type="email"
            value={email} 
            onChange={e=>setEmail(e.target.value)} 
          />
          <input 
            className="border rounded p-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600" 
            placeholder="טלפון" 
            value={phone} 
            onChange={e=>setPhone(e.target.value)} 
          />
          <select
            className="border rounded p-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600"
            value={category}
            onChange={e => setCategory(e.target.value)}
            required
          >
            <option value="">בחר קטגוריה</option>
            {availableCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          <input 
            className="border rounded p-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600" 
            placeholder="תקציב שנתי" 
            type="number" 
            step="0.01"
            min="0"
            value={annualBudget} 
            onChange={e=>setAnnualBudget(e.target.value === '' ? '' : Number(e.target.value))} 
          />
          {formError && (
            <div className="md:col-span-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm p-2 rounded">
              {formError}
            </div>
          )}
          <div className="md:col-span-4 flex justify-end">
            <button 
              type="submit"
              disabled={saving}
              className="bg-gray-900 dark:bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-800 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'שומר...' : 'הוסף ספק'}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white dark:bg-gray-800 p-4 rounded shadow border border-gray-200 dark:border-gray-700">
        <h2 className="font-semibold mb-2 text-gray-900 dark:text-white">רשימת ספקים</h2>
        {loading ? 'טוען...' : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-700 text-left">
                <th className="p-2 text-gray-900 dark:text-white">שם</th>
                <th className="p-2 text-gray-900 dark:text-white">אימייל</th>
                <th className="p-2 text-gray-900 dark:text-white">טלפון</th>
                <th className="p-2 text-gray-900 dark:text-white">קטגוריה</th>
                <th className="p-2 text-gray-900 dark:text-white">תקציב שנתי</th>
                <th className="p-2 text-gray-900 dark:text-white">מסמכים</th>
                <th className="p-2 text-gray-900 dark:text-white"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(s => (
                <tr key={s.id} className="border-t border-gray-200 dark:border-gray-700">
                  <td className="p-2 text-gray-900 dark:text-white">{editId===s.id ? <input className="border border-gray-300 dark:border-gray-600 p-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded" value={name} onChange={e=>setName(e.target.value)} /> : s.name}</td>
                  <td className="p-2 text-gray-900 dark:text-white">{editId===s.id ? <input className="border border-gray-300 dark:border-gray-600 p-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded" value={email} onChange={e=>setEmail(e.target.value)} /> : (s.contact_email ?? '')}</td>
                  <td className="p-2 text-gray-900 dark:text-white">{editId===s.id ? <input className="border border-gray-300 dark:border-gray-600 p-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded" value={phone} onChange={e=>setPhone(e.target.value)} /> : (s.phone ?? '')}</td>
                  <td className="p-2 text-gray-900 dark:text-white">
                    {editId===s.id ? (
                      <select
                        className="border border-gray-300 dark:border-gray-600 p-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded"
                        value={category}
                        onChange={e => setCategory(e.target.value)}
                        required
                      >
                        <option value="">בחר קטגוריה</option>
                        {availableCategories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    ) : (
                      s.category ?? ''
                    )}
                  </td>
                  <td className="p-2 text-gray-900 dark:text-white">{editId===s.id ? <input className="border border-gray-300 dark:border-gray-600 p-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded" type="number" value={annualBudget} onChange={e=>setAnnualBudget(e.target.value === '' ? '' : Number(e.target.value))} /> : (s.annual_budget ?? '')}</td>
                  <td className="p-2">
                    <button
                      onClick={() => navigate(`/suppliers/${s.id}/documents`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors text-sm font-medium"
                    >
                      <Eye className="w-4 h-4" />
                      צפה במסמכים
                    </button>
                  </td>
                  <td className="p-2 text-right">
                    {editId===s.id ? (
                      <>
                        <button className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded transition-colors" onClick={()=>onUpdate(s.id)}>שמור</button>
                        <button className="ml-2 px-2 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 rounded transition-colors" onClick={()=>setEditId(null)}>בטל</button>
                      </>
                    ) : (
                      <>
                        <button className="px-2 py-1 bg-yellow-500 hover:bg-yellow-600 text-white rounded transition-colors" onClick={()=>startEdit(s.id)}>ערוך</button>
                        <button className="ml-2 px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded transition-colors" onClick={()=>onDelete(s.id)}>מחק</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {error && <div className="text-red-600 dark:text-red-400 text-sm mt-2">{error}</div>}
      </div>

    </div>
  )
}

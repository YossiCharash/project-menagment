import { FormEvent, useEffect, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../utils/hooks'
import { archiveProject, createProject, fetchProjects, fetchProjectsWithArchived, restoreProject, updateProject, hardDeleteProject } from '../store/slices/projectsSlice'
import { Link, useNavigate } from 'react-router-dom'
import CategoryBarChart, { CategoryPoint } from '../components/charts/CategoryBarChart'
import { fetchMe } from '../store/slices/authSlice'
import Modal from '../components/Modal'
import api from '../lib/api'
import EnhancedDashboard from '../components/EnhancedDashboard'
import ModernDashboard from '../components/ModernDashboard'
import CreateProjectModal from '../components/CreateProjectModal'
import ProjectTreeView from '../components/ProjectTreeView'
import TestComponent from '../components/TestComponent'
import { ProjectWithFinance } from '../types/api'

export default function Dashboard() {
  const dispatch = useAppDispatch()
  const { items, loading, error } = useAppSelector(s => s.projects)
  const me = useAppSelector(s => s.auth.me)
  const navigate = useNavigate()

  // Enhanced dashboard state
  const [selectedProject, setSelectedProject] = useState<ProjectWithFinance | null>(null)
  const [editingProject, setEditingProject] = useState<ProjectWithFinance | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)

  // Legacy dashboard state (kept for backward compatibility)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [monthly, setMonthly] = useState<number>(0)
  const [annual, setAnnual] = useState<number>(0)
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [creating, setCreating] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [openCreate, setOpenCreate] = useState(false)
  const [projectCharts, setProjectCharts] = useState<Record<number, CategoryPoint[]>>({})
  const [showArchiveDeleteModal, setShowArchiveDeleteModal] = useState(false)
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false)
  const [selectedProjectForAction, setSelectedProjectForAction] = useState<{ id: number; name: string } | null>(null)
  const [deletePassword, setDeletePassword] = useState('')
  const [deletePasswordError, setDeletePasswordError] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => { if (!me) dispatch(fetchMe()) }, [dispatch, me])
  
  // Load projects for dashboard
  useEffect(() => {
    dispatch(fetchProjects())
  }, [dispatch])

  // Load project charts for dashboard
  useEffect(() => {
    const loadProjectCharts = async () => {
      const charts: Record<number, CategoryPoint[]> = {}
      const visible = items.filter((p: any) => p.is_active !== false)
      for (const p of visible) {
        try {
          const { data } = await api.get(`/transactions/project/${p.id}`)
          const map: Record<string, { income: number; expense: number }> = {}
          for (const t of data as any[]) {
            const cat = (t.category || 'ללא קטגוריה') as string
            if (!map[cat]) map[cat] = { income: 0, expense: 0 }
            if (t.type === 'Income') map[cat].income += Number(t.amount)
            else map[cat].expense += Number(t.amount)
          }
          charts[p.id] = Object.entries(map).map(([category, v]) => ({ category, income: v.income, expense: v.expense }))
        } catch { charts[p.id] = [] }
      }
      setProjectCharts(charts)
    }
    if (items.length) loadProjectCharts()
  }, [items])

  const resetForm = () => {
    setName(''); setDescription(''); setStartDate(''); setEndDate(''); setMonthly(0); setAnnual(0); setAddress(''); setCity(''); setLocalError(null); setEditingId(null)
  }

  const onCreateOrUpdate = async (e: FormEvent) => {
    e.preventDefault()
    setLocalError(null)
    setCreating(true)
    try {
      const payload: any = {
        name,
        budget_monthly: monthly,
        budget_annual: annual,
        description: description || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        address: address || undefined,
        city: city || undefined,
      }

      if (editingId) {
        const res = await dispatch(updateProject({ id: editingId, changes: payload }))
        if (updateProject.rejected.match(res)) setLocalError(res.payload as string)
        else { resetForm(); setOpenCreate(false) }
      } else {
        const res = await dispatch(createProject(payload))
        if (createProject.rejected.match(res)) setLocalError(res.payload as string)
        else { resetForm(); setOpenCreate(false) }
      }
    } finally { setCreating(false) }
  }

  const openEditModal = (id: number) => {
    const p = items.find(x => x.id === id)
    if (!p) return
    // @ts-expect-error
    if (p.is_active === false) return
    setEditingId(id)
    setName(p.name || '')
    // @ts-expect-error
    setDescription(p.description || '')
    // @ts-expect-error
    setStartDate(p.start_date || '')
    // @ts-expect-error
    setEndDate(p.end_date || '')
    setMonthly(p.budget_monthly ?? 0)
    setAnnual(p.budget_annual ?? 0)
    setAddress((p as any).address ?? '')
    setCity((p as any).city ?? '')
    setOpenCreate(true)
  }

  const onCloseModal = () => { setOpenCreate(false); resetForm() }

  const handleArchiveDeleteClick = (project: { id: number; name: string }) => {
    setSelectedProjectForAction(project)
    setShowArchiveDeleteModal(true)
  }

  const handleArchive = async () => {
    if (!selectedProjectForAction) return
    try {
      await dispatch(archiveProject(selectedProjectForAction.id)).unwrap()
      setShowArchiveDeleteModal(false)
      setSelectedProjectForAction(null)
      dispatch(fetchProjects())
    } catch (err: any) {
      alert('שגיאה בארכוב הפרויקט: ' + (err || 'Unknown error'))
    }
  }

  const handleDeleteChoice = () => {
    setShowArchiveDeleteModal(false)
    setShowDeleteConfirmModal(true)
  }

  const handleDeleteConfirm = async () => {
    if (!selectedProjectForAction) return
    if (!deletePassword) {
      setDeletePasswordError('נא להזין סיסמה')
      return
    }
    
    setIsDeleting(true)
    setDeletePasswordError('')
    
    try {
      await dispatch(hardDeleteProject({ id: selectedProjectForAction.id, password: deletePassword })).unwrap()
      setShowDeleteConfirmModal(false)
      setDeletePassword('')
      setSelectedProjectForAction(null)
      dispatch(fetchProjects())
    } catch (err: any) {
      setDeletePasswordError(err || 'סיסמה שגויה או שגיאה במחיקה')
    } finally {
      setIsDeleting(false)
    }
  }

  // Legacy archive function - kept for backward compatibility if needed
  const archive = async (id: number) => {
    const project = items.find(p => p.id === id)
    if (project) {
      handleArchiveDeleteClick({ id, name: project.name || `פרויקט ${id}` })
    }
  }

  const restore = async (id: number) => {
    await dispatch(restoreProject(id))
  }

  const isAdmin = me?.role === 'Admin'
  const canDelete = me?.role === 'Admin' // Only Admin can delete

  // Enhanced dashboard handlers
  const handleProjectClick = (project: ProjectWithFinance) => {
    setSelectedProject(project)
    // Navigate to project detail page
    navigate(`/projects/${project.id}`)
  }

  const handleProjectEdit = (project: ProjectWithFinance) => {
    setEditingProject(project)
    setShowCreateModal(true)
  }

  const handleProjectSuccess = (project: any) => {
    // Refresh the dashboard
    dispatch(fetchProjects())
  }

  const visibleItems = items?.filter?.((p: any) => p?.is_active !== false) ?? []

  return (
    <div className="space-y-6">
      {/* Modern Dashboard - Clean view without create project option or welcome section */}
      <ModernDashboard
        onProjectClick={handleProjectClick}
        onProjectEdit={handleProjectEdit}
      />

      <Modal open={openCreate} onClose={onCloseModal} title={editingId ? 'עריכת פרויקט' : 'יצירת פרויקט'}>
        <form onSubmit={onCreateOrUpdate} className="space-y-2">
          <div>
            <label className="block text-xs text-gray-600 mb-1">שם פרויקט</label>
            <input className="w-full border rounded p-2" value={name} onChange={e=>setName(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">תיאור</label>
            <textarea className="w-full border rounded p-2" value={description} onChange={e=>setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-600 mb-1">תאריך התחלה</label>
              <input className="border rounded p-2 w-full" type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">תאריך סיום</label>
              <input className="border rounded p-2 w-full" type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-600 mb-1">כתובת</label>
              <input className="border rounded p-2 w-full" value={address} onChange={e=>setAddress(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">עיר</label>
              <input className="border rounded p-2 w-full" value={city} onChange={e=>setCity(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-600 mb-1">תקציב חודשי</label>
              <input className="border rounded p-2 w-full" type="number" value={monthly} onChange={e=>setMonthly(Number(e.target.value))} />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">תקציב שנתי</label>
              <input className="border rounded p-2 w-full" type="number" value={annual} onChange={e=>setAnnual(Number(e.target.value))} />
            </div>
          </div>
          {localError && <div className="text-red-600 text-sm">{localError}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="px-3 py-2 bg-gray-200 rounded" onClick={onCloseModal}>בטל</button>
            <button className="px-3 py-2 bg-gray-900 text-white rounded" disabled={creating}>{creating ? 'שומר...' : (editingId ? 'שמור' : 'צור')}</button>
          </div>
        </form>
      </Modal>

      {/* Enhanced Create Project Modal */}
      <CreateProjectModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleProjectSuccess}
        editingProject={editingProject}
      />

      {/* Archive/Delete Choice Modal */}
      <Modal
        open={showArchiveDeleteModal}
        onClose={() => {
          setShowArchiveDeleteModal(false)
          setSelectedProjectForAction(null)
        }}
        title="מה תרצה לעשות?"
      >
        <div className="space-y-4">
          <p className="text-gray-700 dark:text-gray-300">
            בחר פעולה עבור הפרויקט "{selectedProjectForAction?.name}":
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleArchive}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              ארכב
            </button>
            <button
              onClick={handleDeleteChoice}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              מחק לצמיתות
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal with Password */}
      <Modal
        open={showDeleteConfirmModal}
        onClose={() => {
          setShowDeleteConfirmModal(false)
          setDeletePassword('')
          setDeletePasswordError('')
        }}
        title="מחיקת פרויקט לצמיתות"
      >
        <div className="space-y-4">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-red-800 dark:text-red-200 font-semibold mb-2">
              אזהרה: פעולה זו אינה הפיכה!
            </p>
            <p className="text-red-700 dark:text-red-300 text-sm">
              הפרויקט "{selectedProjectForAction?.name}" ימחק לצמיתות יחד עם כל העסקאות והקבצים שלו.
              לא ניתן לשחזר את המידע לאחר המחיקה.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              הזן סיסמה לאימות:
            </label>
            <input
              type="password"
              value={deletePassword}
              onChange={(e) => {
                setDeletePassword(e.target.value)
                setDeletePasswordError('')
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              placeholder="סיסמה"
              autoFocus
            />
            {deletePasswordError && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{deletePasswordError}</p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setShowDeleteConfirmModal(false)
                setDeletePassword('')
                setDeletePasswordError('')
              }}
              className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              disabled={isDeleting}
            >
              ביטול
            </button>
            <button
              onClick={handleDeleteConfirm}
              disabled={isDeleting || !deletePassword}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDeleting ? 'מוחק...' : 'מחק לצמיתות'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

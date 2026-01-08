import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { 
  Plus, 
  Search, 
  Filter, 
  Grid, 
  List,
  Edit,
  Archive,
  Eye,
  RefreshCw,
  ArrowLeft
} from 'lucide-react'
import { ProjectWithFinance } from '../types/api'
import { DashboardAPI } from '../lib/apiClient'
import { useAppDispatch, useAppSelector } from '../utils/hooks'
import { archiveProject, hardDeleteProject } from '../store/slices/projectsSlice'
import Modal from '../components/Modal'
import CreateProjectModal from '../components/CreateProjectModal'
import CategoryBarChart, { CategoryPoint } from '../components/charts/CategoryBarChart'
import api from '../lib/api'

interface ProjectCardProps {
  project: ProjectWithFinance
  projectChart?: CategoryPoint[]
  onProjectClick?: (project: ProjectWithFinance) => void
  onProjectEdit?: (project: ProjectWithFinance) => void
  onProjectArchive?: (project: ProjectWithFinance) => void
}

const ProjectCard: React.FC<ProjectCardProps> = ({ 
  project, 
  projectChart,
  onProjectClick, 
  onProjectEdit, 
  onProjectArchive 
}) => {
  const getStatusColor = (status: 'green' | 'yellow' | 'red') => {
    switch (status) {
      case 'green': return 'bg-green-100 text-green-800 border-green-200'
      case 'yellow': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'red': return 'bg-red-100 text-red-800 border-red-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getStatusText = (status: 'green' | 'yellow' | 'red') => {
    switch (status) {
      case 'green': return 'רווחי'
      case 'yellow': return 'מאוזן'
      case 'red': return 'הפסדי'
      default: return 'לא ידוע'
    }
  }

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking on buttons or interactive elements
    const target = e.target as HTMLElement
    if (target.closest('button') || target.closest('a')) {
      return
    }
    onProjectClick?.(project)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      onClick={handleCardClick}
      className="bg-white dark:bg-gray-800 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 border border-gray-200 dark:border-gray-700 cursor-pointer"
    >
      <div className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              {project.name}
            </h3>
            {project.description && (
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">
                {project.description}
              </p>
            )}
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(project.status_color)}`}>
            {getStatusText(project.status_color)}
          </span>
        </div>

        <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
          {project.address && (
            <div className="flex items-center gap-2">
              <span className="text-gray-400">📍</span>
              <span>{project.address}, {project.city}</span>
            </div>
          )}
          
          {/* Removed num_residents and monthly_price_per_apartment display */}
        </div>

        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-600">
          {/* Profitability Status - Prominent Display */}
          <div className="mb-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-700">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">סטטוס רווחיות</span>
              <span className={`px-2 py-1 rounded-full text-xs font-bold ${getStatusColor(project.status_color)}`}>
                {getStatusText(project.status_color)}
              </span>
            </div>
            <div className="text-center">
              <div className={`text-2xl font-bold ${(project.profit_percent || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {(project.profit_percent || 0) >= 0 ? '+' : ''}{(project.profit_percent || 0).toFixed(1)}%
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">רווח/הפסד שנתי</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-gray-500 dark:text-gray-400 text-xs">הכנסות השנה</div>
              <div className="font-semibold text-green-600 dark:text-green-400">
                {((project.budget_monthly || 0) > 0 ? (project.budget_monthly || 0) * 12 : (project.income_month_to_date || 0)).toFixed(0)} ₪
              </div>
            </div>
            <div>
              <div className="text-gray-500 dark:text-gray-400 text-xs">הוצאות השנה</div>
              <div className="font-semibold text-red-600 dark:text-red-400">
                {(project.expense_month_to_date || 0).toFixed(0)} ₪
              </div>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
            <div className="flex justify-between items-center">
              <span className="text-gray-500 dark:text-gray-400 text-xs">רווח/הפסד נטו</span>
              <span className={`font-bold ${((project.income_month_to_date || 0) - (project.expense_month_to_date || 0)) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {((project.income_month_to_date || 0) - (project.expense_month_to_date || 0)) >= 0 ? '+' : ''}{((project.income_month_to_date || 0) - (project.expense_month_to_date || 0)).toFixed(0)} ₪
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
          <div className="flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onProjectClick?.(project)
              }}
              className="flex-1 px-3 py-2 text-sm bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/40 transition-colors flex items-center justify-center gap-2"
            >
              <Eye className="w-4 h-4" />
              צפה
            </button>
            {onProjectEdit && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onProjectEdit(project)
                }}
                className="px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                <Edit className="w-4 h-4" />
              </button>
            )}
            {onProjectArchive && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onProjectArchive(project)
                }}
                className="px-3 py-2 text-sm bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/40 transition-colors"
              >
                <Archive className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default function Subprojects() {
  const { parentId } = useParams()
  const navigate = useNavigate()
  const me = useAppSelector(s => s.auth.me)
  const canDelete = me?.role === 'Admin' // Only Admin can delete
  
  const [subprojects, setSubprojects] = useState<ProjectWithFinance[]>([])
  const [parentProject, setParentProject] = useState<ProjectWithFinance | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [projectCharts, setProjectCharts] = useState<Record<number, CategoryPoint[]>>({})
  
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [cityFilter, setCityFilter] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingProject, setEditingProject] = useState<ProjectWithFinance | null>(null)
  const dispatch = useAppDispatch()
  const [showArchiveDeleteModal, setShowArchiveDeleteModal] = useState(false)
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false)
  const [selectedProjectForAction, setSelectedProjectForAction] = useState<ProjectWithFinance | null>(null)
  const [deletePassword, setDeletePassword] = useState('')
  const [deletePasswordError, setDeletePasswordError] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    if (parentId) {
      loadSubprojectsData()
    }
  }, [parentId])

  const loadSubprojectsData = async () => {
    if (!parentId) return
    
    setLoading(true)
    setError(null)
    try {
      // Load parent project info
      const parentData = await DashboardAPI.getDashboardSnapshot()
      const parent = parentData.projects.find(p => p.id === parseInt(parentId))
      setParentProject(parent || null)

      // Load subprojects
      const { data } = await api.get(`/projects/${parentId}/subprojects`)
      setSubprojects(data || [])
      
      // Load charts for subprojects
      await loadProjectCharts(data || [])
    } catch (err: any) {
      // Subprojects data loading error
      setError(err.message || 'שגיאה בטעינת התת-פרויקטים')
    } finally {
      setLoading(false)
    }
  }

  const loadProjectCharts = async (projects: ProjectWithFinance[]) => {
    const charts: Record<number, CategoryPoint[]> = {}
    const visible = projects.filter((p: any) => p.is_active !== false)
    
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
      } catch { 
        charts[p.id] = [] 
      }
    }
    setProjectCharts(charts)
  }

  const handleProjectClick = (project: ProjectWithFinance) => {
    navigate(`/projects/${project.id}`)
  }

  const handleProjectEdit = (project: ProjectWithFinance) => {
    setEditingProject(project)
    setShowCreateModal(true)
  }

  const handleProjectArchive = (project: ProjectWithFinance) => {
    setSelectedProjectForAction(project)
    setShowArchiveDeleteModal(true)
  }

  const handleArchive = async () => {
    if (!selectedProjectForAction) return
    try {
      await dispatch(archiveProject(selectedProjectForAction.id)).unwrap()
      setShowArchiveDeleteModal(false)
      setSelectedProjectForAction(null)
      await loadSubprojectsData()
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
      await loadSubprojectsData()
    } catch (err: any) {
      setDeletePasswordError(err || 'סיסמה שגויה או שגיאה במחיקה')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleCreateProject = () => {
    setEditingProject(null)
    setShowCreateModal(true)
  }

  const handleProjectSuccess = () => {
    setShowCreateModal(false)
    setEditingProject(null)
    loadSubprojectsData()
  }

  const filteredProjects = subprojects?.filter((project: any) => {
    const matchesSearch = project.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         project.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         project.address?.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesStatus = !statusFilter || project.status_color === statusFilter
    const matchesCity = !cityFilter || project.city?.toLowerCase().includes(cityFilter.toLowerCase())
    
    return matchesSearch && matchesStatus && matchesCity && project.is_active !== false
  }) || []

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">טוען תת-פרויקטים...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded">
          {error}
        </div>
        <button
          onClick={() => navigate('/projects')}
          className="bg-gray-900 text-white px-4 py-2 rounded"
        >
          חזור לפרויקטים
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/projects')}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              תת-פרויקטים של {parentProject?.name || 'פרויקט'}
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              ניהול וצפייה בתת-פרויקטים של הפרויקט הראשי
            </p>
          </div>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleCreateProject}
          className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          <span>צור תת-פרויקט חדש</span>
        </motion.button>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              חיפוש
            </label>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="חפש תת-פרויקט..."
                className="w-full pr-10 pl-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              סטטוס רווחיות
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">כל הסטטוסים</option>
              <option value="green">רווחי (10%+)</option>
              <option value="yellow">מאוזן (-10% עד 10%)</option>
              <option value="red">הפסדי (-10% ומטה)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              עיר
            </label>
            <input
              type="text"
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              placeholder="סינון לפי עיר..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              תצוגה
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg transition-colors ${
                  viewMode === 'grid' 
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300' 
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                }`}
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg transition-colors ${
                  viewMode === 'list' 
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300' 
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                }`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          נמצאו {filteredProjects.length} תת-פרויקטים
        </div>
        <button
          onClick={loadSubprojectsData}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          רענן
        </button>
      </div>

      {/* Projects Grid/List */}
      {filteredProjects.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-500 dark:text-gray-400 text-lg">
            לא נמצאו תת-פרויקטים המתאימים לחיפוש
          </div>
        </div>
      ) : (
        <div className={`grid gap-6 ${
          viewMode === 'grid' 
            ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' 
            : 'grid-cols-1'
        }`}>
          {filteredProjects.map((project: any) => (
            <ProjectCard
              key={project.id}
              project={project}
              projectChart={projectCharts[project.id]}
              onProjectClick={handleProjectClick}
              onProjectEdit={handleProjectEdit}
              onProjectArchive={canDelete ? handleProjectArchive : undefined}
            />
          ))}
        </div>
      )}

      {/* Create Project Modal */}
      <CreateProjectModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleProjectSuccess}
        editingProject={editingProject}
        parentProjectId={parentId ? parseInt(parentId) : undefined}
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


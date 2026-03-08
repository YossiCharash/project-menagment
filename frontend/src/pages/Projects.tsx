import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useAppDispatch, useAppSelector } from '../utils/hooks'
import { PermissionGuard } from '../components/ui/PermissionGuard'
import { usePermission } from '../hooks/usePermission'
import { fetchMe } from '../store/slices/authSlice'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Plus,
  Search,
  Filter,
  Grid,
  List,
  Edit,
  Archive,
  RefreshCw,
  RotateCcw,
  ImageOff,
  MoreVertical
} from 'lucide-react'
import { ProjectWithFinance, DashboardSnapshot } from '../types/api'
import { DashboardAPI, ProjectAPI } from '../lib/apiClient'
import { archiveProject, hardDeleteProject } from '../store/slices/projectsSlice'
import Modal from '../components/Modal'
import CreateProjectModal from '../components/CreateProjectModal'
import CreateTransactionModal from '../components/CreateTransactionModal'
import GroupTransactionModal from '../components/GroupTransactionModal'
import CategoryBarChart, { CategoryPoint } from '../components/charts/CategoryBarChart'
import api from '../lib/api'

interface ProjectCardProps {
  project: ProjectWithFinance
  projectChart?: CategoryPoint[]
  onProjectClick?: (project: ProjectWithFinance) => void
  onProjectEdit?: (project: ProjectWithFinance) => void
  onProjectArchive?: (project: ProjectWithFinance) => void
  onProjectRestore?: (project: ProjectWithFinance) => void
  onCreateSubproject?: (project: ProjectWithFinance) => void
  onAddTransaction?: (project: ProjectWithFinance) => void
  hasSubprojects?: boolean
}

const ProjectCard: React.FC<ProjectCardProps> = React.memo(({ 
  project, 
  projectChart,
  onProjectClick, 
  onProjectEdit, 
  onProjectArchive,
  onProjectRestore,
  onCreateSubproject,
  onAddTransaction,
  hasSubprojects = false
}) => {
  const [imgError, setImgError] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  // Check if this is a parent project using the is_parent_project field
  const isParentProject = project.is_parent_project === true
  const getStatusColor = (status: 'green' | 'yellow' | 'red') => {
    switch (status) {
      case 'green': return 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800'
      case 'yellow': return 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800'
      case 'red': return 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800'
      default: return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-600'
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

  const getProfitabilityDetails = (project: ProjectWithFinance) => {
    const profit = (project.income_month_to_date || 0) - (project.expense_month_to_date || 0)
    const profitPercent = project.profit_percent || 0
    
    return {
      profit,
      profitPercent,
      isProfitable: profitPercent >= 10,
      isLoss: profitPercent <= -10,
      isBalanced: profitPercent > -10 && profitPercent < 10
    }
  }

  const getImageUrl = (imageUrl: string | null | undefined): string | null => {
    if (!imageUrl) return null
    // If backend already returned full URL (S3 / CloudFront), use as-is
    if (imageUrl.startsWith('http')) {
      return imageUrl
    }
    const apiUrl = import.meta.env.VITE_API_URL || ''
    // @ts-ignore
    const baseUrl = apiUrl ? apiUrl.replace('/api/v1', '') : ''
    return `${baseUrl}/uploads/${imageUrl}`
  }

  const imageUrl = getImageUrl(project.image_url)

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
      className={`relative bg-white dark:bg-gray-800 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 border-2 cursor-pointer ${menuOpen ? 'z-50' : ''} ${
        project.is_active === false
          ? 'border-gray-300 dark:border-gray-600 opacity-75'
          : hasSubprojects
            ? 'border-blue-400 dark:border-blue-500'
            : 'border-gray-200 dark:border-gray-600'
      }`}
      dir="rtl"
    >
      <div className="p-3">
        <div className="mb-1.5 rounded-lg overflow-hidden h-16 bg-gray-100 dark:bg-gray-700 w-full relative">
          {imageUrl && !imgError ? (
            <img
              src={imageUrl}
              alt={project.name}
              className="w-full h-full object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
              <ImageOff className="w-6 h-6 mb-1 opacity-50" />
            </div>
          )}
        </div>

        <div className="flex justify-between items-start mb-1">
          <div className="flex-1 min-w-0">
            <div className="flex items-center flex-wrap gap-1.5 mb-1">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white leading-tight break-words">
                {project.name}
              </h3>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(project.status_color)}`}>
              {getStatusText(project.status_color)}
            </span>
            {project.is_active === false && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                מאורכב
              </span>
            )}
          </div>
        </div>



        {/* Kebab menu - positioned top-left in RTL (visually top-right) */}
        <div className="absolute top-2 left-2 z-10" ref={menuRef}>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen(prev => !prev)
            }}
            className="p-1.5 rounded-lg bg-white/80 dark:bg-gray-800/80 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors shadow-sm"
            title="אפשרויות"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {menuOpen && (
            <div className="absolute left-0 mt-1 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg py-1 z-20" dir="rtl">
              {onAddTransaction && project.is_active !== false && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuOpen(false)
                    onAddTransaction(project)
                  }}
                  className="w-full text-right px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4 text-blue-500" />
                  הוסף עסקה
                </button>
              )}
              {isParentProject && onCreateSubproject && project.is_active !== false && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuOpen(false)
                    onCreateSubproject(project)
                  }}
                  className="w-full text-right px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4 text-purple-500" />
                  צור תת-פרויקט
                </button>
              )}
              {onProjectEdit && project.is_active !== false && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuOpen(false)
                    onProjectEdit(project)
                  }}
                  className="w-full text-right px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                >
                  <Edit className="w-4 h-4 text-gray-500" />
                  ערוך
                </button>
              )}
              {onProjectArchive && project.is_active !== false && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuOpen(false)
                    onProjectArchive(project)
                  }}
                  className="w-full text-right px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                >
                  <Archive className="w-4 h-4" />
                  ארכב
                </button>
              )}
              {onProjectRestore && project.is_active === false && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuOpen(false)
                    onProjectRestore(project)
                  }}
                  className="w-full text-right px-3 py-2 text-sm text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  שחזר
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
})

export default function Projects() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const me = useAppSelector(s => s.auth.me)
  
  const [dashboardData, setDashboardData] = useState<DashboardSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [projectCharts, setProjectCharts] = useState<Record<number, CategoryPoint[]>>({})
  
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [cityFilter, setCityFilter] = useState('')
  const [projectTypeFilter, setProjectTypeFilter] = useState('') // Default: show parent projects and regular projects without subprojects
  const [archiveFilter, setArchiveFilter] = useState<'active' | 'archived' | 'all'>('active')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showTransactionModal, setShowTransactionModal] = useState(false)
  const [showGroupTransactionModal, setShowGroupTransactionModal] = useState(false)
  const [transactionProject, setTransactionProject] = useState<ProjectWithFinance | null>(null)
  const [editingProject, setEditingProject] = useState<ProjectWithFinance | null>(null)
  const [selectedParentProject, setSelectedParentProject] = useState<ProjectWithFinance | null>(null)
  const [archivingProject, setArchivingProject] = useState<number | null>(null)
  const archiveFilterRef = useRef(archiveFilter)
  const lastLocationKeyRef = useRef(location.key)
  const [showArchiveDeleteModal, setShowArchiveDeleteModal] = useState(false)
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false)
  const [selectedProjectForAction, setSelectedProjectForAction] = useState<ProjectWithFinance | null>(null)
  const [deletePassword, setDeletePassword] = useState('')
  const [deletePasswordError, setDeletePasswordError] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    archiveFilterRef.current = archiveFilter
  }, [archiveFilter])

  useEffect(() => {
    if (!me) {
      dispatch(fetchMe())
      return
    }
    loadProjectsData(archiveFilter !== 'active')
  }, [dispatch, me, archiveFilter])

  // Refresh data only when navigating back to this page after it was left
  useEffect(() => {
    if (lastLocationKeyRef.current === location.key) return
    lastLocationKeyRef.current = location.key

    if (location.pathname === '/projects') {
      loadProjectsData(archiveFilterRef.current !== 'active')
    }
  }, [location.key])

  // Auto-refresh financial data every 30 seconds (only when tab is visible)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!loading && !document.hidden) {
        loadProjectsData(archiveFilter !== 'active')
      }
    }, 30000) // 30 seconds

    return () => clearInterval(interval)
  }, [archiveFilter, loading])

  const loadProjectsData = async (includeArchived = false) => {
    setLoading(true)
    setError(null)
    try {
      // Load dashboard snapshot for active projects
      const data = await DashboardAPI.getDashboardSnapshot()
      
      // Ensure all projects have financial data properly formatted
      if (data.projects) {
        data.projects = data.projects.map((p: any) => {
          // Get all possible field names that might contain financial data
          const incomeValue = p.income_month_to_date ?? p.income ?? 0
          const expenseValue = p.expense_month_to_date ?? p.expense ?? p.expenses ?? 0
          const profitValue = p.profit_percent ?? p.profit_percentage ?? 0
          const statusValue = p.status_color ?? p.status ?? 'yellow'
          
          return {
            ...p,
            income_month_to_date: Number(incomeValue),
            expense_month_to_date: Number(expenseValue),
            profit_percent: Number(profitValue),
            status_color: statusValue,
            total_value: Number(p.total_value ?? p.budget_monthly ?? p.budget_annual ?? 0)
          }
        })
      }
      
      // If we need archived projects, load them separately and merge
      if (includeArchived || archiveFilter !== 'active') {
        try {
          const archivedProjects = await ProjectAPI.getProjects(true)
          // Get only archived projects
          const archived = archivedProjects.filter((p: any) => p.is_active === false)
          
          // Convert archived projects to ProjectWithFinance format (with basic structure)
          const archivedWithFinance: ProjectWithFinance[] = archived.map((p: any) => ({
            ...p,
            income_month_to_date: 0,
            expense_month_to_date: 0,
            profit_percent: 0,
            status_color: 'yellow' as const,
            total_value: 0
          }))
          
          // Merge active and archived projects
          data.projects = [...data.projects, ...archivedWithFinance]
        } catch (archivedErr) {
          // Continue with only active projects if archived loading fails
        }
      }
      
      setDashboardData(data)
      await loadProjectCharts(data.projects)
    } catch (err: any) {
      setError(err.message || 'שגיאה בטעינת הנתונים')
    } finally {
      setLoading(false)
    }
  }

  const loadProjectCharts = async (projects: ProjectWithFinance[]) => {
    const visible = projects.filter((p: any) => p.is_active !== false)
    
    // Load all chart data in parallel instead of sequentially
    const results = await Promise.allSettled(
      visible.map(async (p) => {
        const { data } = await api.get(`/transactions/project/${p.id}`)
        const map: Record<string, { income: number; expense: number }> = {}
        for (const t of data as any[]) {
          const cat = (t.category || 'ללא קטגוריה') as string
          if (!map[cat]) map[cat] = { income: 0, expense: 0 }
          if (t.type === 'Income') map[cat].income += Number(t.amount)
          else map[cat].expense += Number(t.amount)
        }
        return {
          id: p.id,
          points: Object.entries(map).map(([category, v]) => ({ category, income: v.income, expense: v.expense }))
        }
      })
    )

    const charts: Record<number, CategoryPoint[]> = {}
    for (const r of results) {
      if (r.status === 'fulfilled') {
        charts[r.value.id] = r.value.points
      }
    }
    // For visible projects that failed, set empty array
    for (const p of visible) {
      if (!(p.id in charts)) charts[p.id] = []
    }
    setProjectCharts(charts)
  }

  const handleProjectClick = useCallback((project: ProjectWithFinance) => {
    // Check if project is a parent project
    // If it's a parent project, always navigate to dashboard (even if no subprojects yet)
    if (project.is_parent_project === true) {
      // Navigate to parent project detail page with consolidated view (dashboard)
      navigate(`/projects/${project.id}/parent`)
    } else {
      // Navigate to regular project detail page
      navigate(`/projects/${project.id}`)
    }
  }, [navigate])

  const handleProjectEdit = useCallback((project: ProjectWithFinance) => {
    setEditingProject(project)
    setShowCreateModal(true)
  }, [])

  const handleProjectArchive = useCallback(async (project: ProjectWithFinance) => {
    setSelectedProjectForAction(project)
    setShowArchiveDeleteModal(true)
  }, [])

  const handleArchive = async () => {
    if (!selectedProjectForAction) return
    try {
      setArchivingProject(selectedProjectForAction.id)
      await dispatch(archiveProject(selectedProjectForAction.id)).unwrap()
      setShowArchiveDeleteModal(false)
      setSelectedProjectForAction(null)
      await loadProjectsData(archiveFilter !== 'active')
    } catch (err: any) {
      alert(err.response?.data?.detail || 'שגיאה בארכוב הפרויקט')
    } finally {
      setArchivingProject(null)
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
      await loadProjectsData(archiveFilter !== 'active')
    } catch (err: any) {
      setDeletePasswordError(err || 'סיסמה שגויה או שגיאה במחיקה')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleProjectRestore = useCallback(async (project: ProjectWithFinance) => {
    if (confirm('האם לשחזר את הפרויקט?')) {
      try {
        setArchivingProject(project.id)
        await ProjectAPI.restoreProject(project.id)
        await loadProjectsData(archiveFilter !== 'active')
      } catch (err: any) {
        alert(err.response?.data?.detail || 'שגיאה בשחזור הפרויקט')
      } finally {
        setArchivingProject(null)
      }
    }
  }, [archiveFilter])

  const [projectTypeToCreate, setProjectTypeToCreate] = useState<'regular' | 'parent'>('regular')

  const handleCreateProject = (type: 'regular' | 'parent' = 'regular') => {
    setEditingProject(null)
    setSelectedParentProject(null)
    setProjectTypeToCreate(type)
    setShowCreateModal(true)
  }

  const handleCreateSubproject = useCallback((parentProject: ProjectWithFinance) => {
    setEditingProject(null)
    setSelectedParentProject(parentProject)
    setShowCreateModal(true)
  }, [])

  const handleAddTransaction = useCallback((project: ProjectWithFinance) => {
    setTransactionProject(project)
    setShowTransactionModal(true)
  }, [])

  const handleProjectSuccess = (project?: any) => {
    setShowCreateModal(false)
    setEditingProject(null)
    // Reload projects data without causing page reload
    loadProjectsData(archiveFilter !== 'active').catch(err => {
      console.error('Error reloading projects:', err)
    })
  }

  const filteredProjects = dashboardData?.projects?.filter((project: any) => {
    // Always exclude subprojects (projects with relation_project set)
    // Only show parent projects and regular projects (projects without a parent)
    if (project.relation_project) {
      return false
    }

    const matchesSearch = project.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         project.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         project.address?.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesStatus = !statusFilter || project.status_color === statusFilter
    const matchesCity = !cityFilter || project.city?.toLowerCase().includes(cityFilter.toLowerCase())
    
    // Filter by project type (parent projects vs regular projects)
    let matchesType = true
    if (projectTypeFilter === 'parent') {
      matchesType = project.is_parent_project === true // Only parent projects
    } else if (projectTypeFilter === 'subproject') {
      matchesType = false // Subprojects are never shown on this page
    }
    // If no filter is selected, show both parent and regular projects (but not subprojects)

    // Filter by archive status
    let matchesArchive = true
    if (archiveFilter === 'active') {
      matchesArchive = project.is_active !== false
    } else if (archiveFilter === 'archived') {
      matchesArchive = project.is_active === false
    } // 'all' shows everything
    
    return matchesSearch && matchesStatus && matchesCity && matchesType && matchesArchive
  }) || []

  // Pre-compute which projects have subprojects (O(N) Set lookup instead of O(N*M) .some() per card)
  const parentProjectIds = useMemo(() => {
    const ids = new Set<number>()
    dashboardData?.projects?.forEach((p: any) => {
      if (p.relation_project) ids.add(p.relation_project)
    })
    return ids
  }, [dashboardData?.projects])

  const isAdmin = me?.role === 'Admin'
  const canWriteProject = usePermission('write', 'project')
  const canDeleteProject = usePermission('delete', 'project')

  if (loading && !dashboardData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">טוען פרויקטים...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">פרויקטים</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            ניהול וצפייה בכל הפרויקטים במערכת
          </p>
        </div>
        <div className="flex items-center gap-3">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowGroupTransactionModal(true)}
            className="px-6 py-3 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            <span>עסקה קבוצתית</span>
          </motion.button>
          <PermissionGuard action="write" resource="project">
            <>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleCreateProject('regular')}
                className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                <span>צור פרויקט</span>
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleCreateProject('parent')}
                className="px-6 py-3 bg-gradient-to-r from-green-500 to-teal-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                <span>צור פרויקט על</span>
              </motion.button>
            </>
          </PermissionGuard>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
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
                placeholder="חפש פרויקט..."
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
              סוג פרויקט
            </label>
            <select
              value={projectTypeFilter}
              onChange={(e) => setProjectTypeFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">כל הפרויקטים</option>
              <option value="parent">פרויקטים ראשיים</option>
              <option value="subproject">תת-פרויקטים</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              סטטוס ארכוב
            </label>
            <select
              value={archiveFilter}
              onChange={(e) => setArchiveFilter(e.target.value as 'active' | 'archived' | 'all')}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="active">פעילים בלבד</option>
              <option value="archived">מאורכבים בלבד</option>
              <option value="all">הכל</option>
            </select>
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
          נמצאו {filteredProjects.length} פרויקטים
        </div>
        <button
          onClick={() => loadProjectsData(archiveFilter !== 'active')}
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
            לא נמצאו פרויקטים המתאימים לחיפוש
          </div>
        </div>
      ) : (
        <div className={`grid gap-3 max-w-6xl mx-auto ${
          viewMode === 'grid'
            ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5'
            : 'grid-cols-1'
        }`}>
          {filteredProjects.map((project: any) => (
              <ProjectCard
                key={project.id}
                project={project}
                projectChart={projectCharts[project.id]}
                onProjectClick={handleProjectClick}
                onProjectEdit={handleProjectEdit}
                onProjectArchive={canDeleteProject ? handleProjectArchive : undefined}
                onProjectRestore={canWriteProject ? handleProjectRestore : undefined}
                onCreateSubproject={canWriteProject ? handleCreateSubproject : undefined}
                onAddTransaction={handleAddTransaction}
                hasSubprojects={parentProjectIds.has(project.id)}
              />
          ))}
        </div>
      )}

      {/* Create Project Modal */}
      <CreateProjectModal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false)
          setSelectedParentProject(null)
        }}
        onSuccess={handleProjectSuccess}
        editingProject={editingProject}
        projectType={projectTypeToCreate}
        parentProjectId={selectedParentProject?.id}
      />

      {/* Create Transaction Modal */}
      {transactionProject && (
        <CreateTransactionModal
          isOpen={showTransactionModal}
          onClose={() => {
            setShowTransactionModal(false)
            setTransactionProject(null)
          }}
          onSuccess={() => {
            setShowTransactionModal(false)
            setTransactionProject(null)
            loadProjectsData(archiveFilter !== 'active')
          }}
          projectId={transactionProject.id}
          isSubproject={!!transactionProject.relation_project}
          projectName={transactionProject.name}
          allowSubprojectSelection={transactionProject.is_parent_project === true}
        />
      )}

      {/* Group Transaction Modal */}
      <GroupTransactionModal
        isOpen={showGroupTransactionModal}
        onClose={() => setShowGroupTransactionModal(false)}
        onSuccess={() => {
          loadProjectsData(archiveFilter !== 'active')
        }}
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

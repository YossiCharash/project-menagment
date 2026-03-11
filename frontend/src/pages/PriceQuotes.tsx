import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Search,
  Eye,
  FileText,
  ChevronDown,
  Trash2,
  CheckCircle,
  Building2,
  Grid,
  List,
  Edit,
  BarChart3,
  TrendingUp,
  Clock,
  Pencil,
} from 'lucide-react'
import { QuoteProjectsAPI, QuoteSubjectsAPI, QuoteProject, type QuoteSubject } from '../lib/apiClient'
import QuoteSubjectModal from '../components/QuoteSubjectModal'
import DeleteQuoteSubjectModal from '../components/DeleteQuoteSubjectModal'
import SubjectQuotesFloatingModal, { type SubjectWithQuotes } from '../components/SubjectQuotesFloatingModal'
import { ProjectAPI } from '../lib/apiClient'
import type { Project } from '../types/api'
import CreateProjectModal from '../components/CreateProjectModal'
import CreateParentProjectSimpleModal from '../components/CreateParentProjectSimpleModal'
import ProjectQuotesFloatingModal from '../components/ProjectQuotesFloatingModal'

export interface ProjectWithQuotes extends Project {
  quotes?: QuoteProject[]
  quotesLoading?: boolean
  expanded?: boolean
  subprojects?: ProjectWithQuotes[]
}

const QuoteCard = ({
  q,
  onEdit,
  onApprove,
  onDelete,
  onView,
  onAddChild,
  showAddChild = false,
  canApprove = true,
}: {
  q: QuoteProject
  onEdit?: (q: QuoteProject) => void
  onApprove?: (q: QuoteProject) => void
  onDelete?: (q: QuoteProject) => void
  onView: (q: QuoteProject) => void
  onAddChild?: (q: QuoteProject) => void
  showAddChild?: boolean
  /** כשבאותו פרויקט כבר אושרה הצעה אחת – לא להציג אישור להצעות אחרות */
  canApprove?: boolean
}) => (
  <motion.div
    key={q.id}
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 shadow-sm hover:shadow-md transition-all"
  >
    <div className="flex items-start justify-between gap-2 mb-2">
      <h4 className="font-medium text-gray-900 dark:text-white line-clamp-1">{q.name}</h4>
      <span
        className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium ${
          q.status === 'approved'
            ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-800'
            : 'bg-amber-100 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
        }`}
      >
        {q.status === 'approved' ? 'אושרה' : 'טיוטה'}
      </span>
    </div>
    {q.description && (
      <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mb-3 h-8">
        {q.description}
      </p>
    )}
    <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-100 dark:border-gray-700">
      <div className="text-[10px] text-gray-500">
        {q.quote_lines?.length ?? 0} פריטים
      </div>
      <div className="flex gap-1">
        <button
          onClick={() => onView(q)}
          className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
          title="צפה"
        >
          <Eye className="w-4 h-4" />
        </button>
        {showAddChild && q.status === 'draft' && (
          <button
            onClick={() => onAddChild?.(q)}
            className="p-1.5 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-md transition-colors"
            title="הוסף תת-הצעה"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
        {q.status === 'draft' && (
          <>
            <button
              onClick={() => onEdit?.(q)}
              className="p-1.5 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
              title="ערוך"
            >
              <Edit className="w-4 h-4" />
            </button>
            {canApprove && (
              <button
                onClick={() => onApprove?.(q)}
                className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-md transition-colors"
                title="אשר"
              >
                <CheckCircle className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => onDelete?.(q)}
              className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
              title="מחק"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
  </motion.div>
)

const ParentQuoteCard = ({
  quote,
  onToggleExpand,
  isExpanded,
  onAddChildQuote,
  onEditQuote,
  onApproveQuote,
  onDeleteQuote,
  onViewQuote,
  children,
}: {
  quote: QuoteProject & { children?: QuoteProject[] }
  onToggleExpand: (id: number) => void
  isExpanded: boolean
  onAddChildQuote: (parentId: number) => void
  onEditQuote: (q: QuoteProject) => void
  onApproveQuote: (q: QuoteProject) => void
  onDeleteQuote: (q: QuoteProject) => void
  onViewQuote: (q: QuoteProject) => void
  children?: React.ReactNode
}) => {
  return (
    <motion.div
      layout
      className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm hover:shadow-md transition-all"
    >
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
        onClick={() => onToggleExpand(quote.id)}
      >
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="w-12 h-12 rounded-lg bg-purple-100 dark:bg-purple-900/20 flex-shrink-0 flex items-center justify-center">
            <FileText className="w-6 h-6 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-gray-900 dark:text-white truncate" title={quote.name}>
              {quote.name}
            </h3>
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 overflow-hidden">
              <span
                className={`px-1.5 py-0.5 rounded whitespace-nowrap flex-shrink-0 ${
                  quote.status === 'approved'
                    ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'
                    : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
                }`}
              >
                {quote.status === 'approved' ? 'אושרה' : 'טיוטה'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => onViewQuote(quote)}
            className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors flex-shrink-0"
            title="צפה"
          >
            <Eye className="w-4 h-4" />
          </button>
          {quote.status === 'draft' && (
            <button
              onClick={() => onEditQuote(quote)}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex-shrink-0"
              title="ערוך"
            >
              <Edit className="w-4 h-4" />
            </button>
          )}
          <ChevronDown
            className={`w-5 h-5 text-gray-400 transition-transform duration-300 ml-1 flex-shrink-0 ${
              isExpanded ? '' : '-rotate-90'
            }`}
          />
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-gray-100 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-900/10"
          >
            <div className="p-4 space-y-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

const ProjectQuoteCard = ({
  project,
  onOpenQuotesModal,
  onEditProject,
  viewMode,
}: {
  project: ProjectWithQuotes
  onOpenQuotesModal: (project: ProjectWithQuotes) => void
  onEditProject: (p: ProjectWithQuotes) => void
  viewMode: 'grid' | 'list'
}) => {
  const [imgError, setImgError] = useState(false)
  const imageUrl = useMemo(() => {
    if (!project.image_url) return null
    if (project.image_url.startsWith('http')) return project.image_url
    const apiUrl = import.meta.env.VITE_API_URL || ''
    const baseUrl = apiUrl ? apiUrl.replace('/api/v1', '') : ''
    return `${baseUrl}/uploads/${project.image_url}`
  }, [project.image_url])

  return (
    <motion.div
      layout
      className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm hover:shadow-md transition-all ${
        viewMode === 'list' ? 'flex flex-col' : ''
      }`}
    >
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
        onClick={() => onOpenQuotesModal(project)}
      >
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-700 flex-shrink-0 overflow-hidden">
            {imageUrl && !imgError ? (
              <img
                src={imageUrl}
                alt={project.name}
                className="w-full h-full object-cover"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                <Building2 className="w-6 h-6" />
              </div>
            )}
          </div>
          <div className="min-w-[5rem] flex-1 overflow-hidden">
            <h3 className="font-bold text-lg text-gray-900 dark:text-white line-clamp-2" title={project.name}>
              {project.name}
            </h3>
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 overflow-hidden flex-nowrap">
              {project.subprojects && project.subprojects.length > 0 ? (
                <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded font-medium whitespace-nowrap flex-shrink-0">
                  פרויקט על
                </span>
              ) : (
                <span className="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded whitespace-nowrap flex-shrink-0">
                  פרויקט
                </span>
              )}
              {project.city && (
                <>
                  <span className="flex-shrink-0">•</span>
                  <span className="truncate whitespace-nowrap">{project.city}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => onEditProject(project)}
            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors flex-shrink-0"
            title="ערוך פרויקט"
          >
            <Edit className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  )
}

export default function PriceQuotes() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<ProjectWithQuotes[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'draft' | 'approved' | ''>('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [approvingId, setApprovingId] = useState<number | null>(null)

  // Approve quote
  const [quoteToApprove, setQuoteToApprove] = useState<QuoteProject | null>(null)
  const [approveChildQueue, setApproveChildQueue] = useState<QuoteProject[]>([])
  const [approveParentProjectId, setApproveParentProjectId] = useState<number | null>(null)

  const [showCreateParentProjectModal, setShowCreateParentProjectModal] = useState(false)
  const [createSubprojectForParentId, setCreateSubprojectForParentId] = useState<number | null>(null)
  const [showSelectParentForSubproject, setShowSelectParentForSubproject] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [projectQuotesModal, setProjectQuotesModal] = useState<ProjectWithQuotes | null>(null)
  const [standaloneQuotes, setStandaloneQuotes] = useState<QuoteProject[]>([])

  // פרויקטים (נושאי הצעה) + הצעות לכל פרויקט
  const [subjectsWithQuotes, setSubjectsWithQuotes] = useState<{ subject: QuoteSubject; quotes: QuoteProject[] }[]>([])
  const [subjectsLoading, setSubjectsLoading] = useState(true)
  const [showCreateSubjectModal, setShowCreateSubjectModal] = useState(false)
  const [editingSubject, setEditingSubject] = useState<QuoteSubject | null>(null)
  const [selectedSubjectWithQuotes, setSelectedSubjectWithQuotes] = useState<SubjectWithQuotes | null>(null)
  const [deleteSubjectModal, setDeleteSubjectModal] = useState<{ subject: QuoteSubject; quotesCount: number } | null>(null)

  const loadProjects = useCallback(async () => {
    setProjectsLoading(true)
    setError(null)
    try {
      // 2 parallel calls instead of N+2
      const [list, allQuotes] = await Promise.all([
        ProjectAPI.getProjects(true),
        QuoteProjectsAPI.list(undefined, undefined, undefined, statusFilter || undefined, true),
      ])

      // Group quotes by project_id and standalone
      const quotesByProjectId: Record<number, QuoteProject[]> = {}
      const standalone: QuoteProject[] = []
      for (const q of allQuotes) {
        if (q.project_id != null) {
          ;(quotesByProjectId[q.project_id] ??= []).push(q)
        } else if (q.quote_subject_id == null) {
          standalone.push(q)
        }
      }

      const active = list.filter((p: Project) => p.is_active)
      const topLevel = active.filter((p: any) => !p.relation_project)
      const withSubs: ProjectWithQuotes[] = topLevel.map((p: Project) => ({
        ...p,
        subprojects: active.filter((sp: any) => sp.relation_project === p.id),
        quotes: [],
        expanded: false,
      }))

      const withQuotes: ProjectWithQuotes[] = withSubs.map((p) => {
        const subprojects = (p.subprojects ?? []).map((sp) => ({
          ...sp,
          quotes: quotesByProjectId[sp.id] ?? [],
        }))
        return {
          ...p,
          quotes: quotesByProjectId[p.id] ?? [],
          subprojects,
        }
      })

      const hasQuotes = (p: ProjectWithQuotes) =>
        (p.quotes?.length ?? 0) > 0 || (p.subprojects?.some((s) => (s.quotes?.length ?? 0) > 0) ?? false)
      const showInQuotesTab = (p: ProjectWithQuotes) => !!p.show_in_quotes_tab
      const filtered = withQuotes
        .filter(
          (p) =>
            hasQuotes(p) ||
            showInQuotesTab(p) ||
            (p.subprojects ?? []).some((s) => !!s.show_in_quotes_tab)
        )
        .map((p) => ({
          ...p,
          subprojects: (p.subprojects ?? []).filter(
            (s) => (s.quotes?.length ?? 0) > 0 || !!s.show_in_quotes_tab
          ),
        }))
      setProjects(filtered)
      setStandaloneQuotes(standalone)
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'שגיאה בטעינת הפרויקטים')
    } finally {
      setProjectsLoading(false)
    }
  }, [statusFilter])

  const loadQuotesForProject = useCallback(
    async (projectId: number) => {
      try {
        const list = await QuoteProjectsAPI.list(undefined, projectId, undefined, statusFilter || undefined)
        return list
      } catch {
        return []
      }
    },
    [statusFilter]
  )

  const loadSubjectsWithQuotes = useCallback(async (): Promise<SubjectWithQuotes[]> => {
    setSubjectsLoading(true)
    try {
      // 2 parallel calls instead of M+1
      const [subjects, allQuotes] = await Promise.all([
        QuoteSubjectsAPI.list(),
        QuoteProjectsAPI.list(undefined, undefined, undefined, statusFilter || undefined, true),
      ])

      // Group quotes by subject_id
      const quotesBySubjectId: Record<number, QuoteProject[]> = {}
      for (const q of allQuotes) {
        if (q.quote_subject_id != null) {
          ;(quotesBySubjectId[q.quote_subject_id] ??= []).push(q)
        }
      }

      const withQuotes: SubjectWithQuotes[] = subjects.map((subject) => ({
        subject,
        quotes: quotesBySubjectId[subject.id] ?? [],
      }))
      setSubjectsWithQuotes(withQuotes)
      return withQuotes
    } catch {
      setSubjectsWithQuotes([])
      return []
    } finally {
      setSubjectsLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  useEffect(() => {
    loadSubjectsWithQuotes()
  }, [loadSubjectsWithQuotes])

  const openAddQuoteForProject = (projectId: number) => {
    navigate(`/price-quotes/new?projectId=${projectId}`)
  }

  const openAddQuoteForSubject = (subjectId: number) => {
    navigate(`/price-quotes/new?subjectId=${subjectId}`)
  }

  const openAddQuote = openAddQuoteForProject

  const openEditModal = (q: QuoteProject) => {
    navigate(`/price-quotes/${q.id}`)
  }

  const handleDeleteQuote = async (q: QuoteProject) => {
    if (q.status !== 'draft') return
    if (!confirm('למחוק הצעת מחיר זו? לא ניתן לשחזר.')) return
    setDeletingId(q.id)
    try {
      await QuoteProjectsAPI.delete(q.id)
      if (q.project_id) {
        const quotes = await loadQuotesForProject(q.project_id)
        setProjects((prev) =>
          prev.map((p) => {
            if (p.id === q.project_id) return { ...p, quotes }
            if (p.subprojects) {
              return {
                ...p,
                subprojects: p.subprojects.map((sp) => (sp.id === q.project_id ? { ...sp, quotes } : sp)),
              }
            }
            return p
          })
        )
      } else {
        setStandaloneQuotes((prev) => prev.filter((x) => x.id !== q.id))
      }
      const updated = await loadSubjectsWithQuotes()
      const subId = q.quote_subject_id ?? null
      if (subId != null && selectedSubjectWithQuotes?.subject.id === subId) {
        const entry = updated.find((e) => e.subject.id === subId)
        if (entry) setSelectedSubjectWithQuotes(entry)
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'שגיאה במחיקת ההצעה')
    } finally {
      setDeletingId(null)
    }
  }

  const quoteToInitialFormData = (q: QuoteProject) => {
    const totalFromLines = (q.quote_lines ?? []).reduce((s, l) => s + (l.amount ?? 0), 0)
    const monthly = totalFromLines > 0 ? totalFromLines : 0
    const today = new Date().toISOString().slice(0, 10)
    return {
      name: q.name,
      description: q.description || undefined,
      num_residents: q.num_residents ?? undefined,
      budget_monthly: monthly,
      budget_annual: monthly * 12,
      contract_duration_months: 12,
      start_date: today,
    }
  }

  const openApproveWithProject = (q: QuoteProject) => {
    setQuoteToApprove(q)
    setApproveChildQueue([])
    setApproveParentProjectId(null)
  }

  const handleApproveQuote = (q: QuoteProject) => {
    if (q.status !== 'draft') return
    // תמיד פותחים את קומפוננטת יצירת הפרויקט לפני אישור – המשתמש ממלא/מאשר ואז נוצר הפרויקט וההצעה מאושרת
    openApproveWithProject(q)
  }

  const handleApproveProjectSuccess = async (project: Project, quote: QuoteProject) => {
    await QuoteProjectsAPI.approve(quote.id, project.id)
    const children =
      quote.children_count > 0
        ? await QuoteProjectsAPI.list(quote.id, undefined, undefined, statusFilter || undefined)
        : []
    if (children.length > 0) {
      setApproveParentProjectId(project.id)
      setQuoteToApprove(children[0])
      setApproveChildQueue(children.slice(1))
    } else {
      setQuoteToApprove(null)
      setApproveChildQueue([])
      setApproveParentProjectId(null)
      await loadProjects()
    }
  }

  const handleApproveChildProjectSuccess = async (project: Project, quote: QuoteProject) => {
    await QuoteProjectsAPI.approve(quote.id, project.id)
    const remaining = approveChildQueue.slice(1)
    if (remaining.length > 0) {
      setQuoteToApprove(remaining[0])
      setApproveChildQueue(remaining)
    } else {
      setQuoteToApprove(null)
      setApproveChildQueue([])
      setApproveParentProjectId(null)
      await loadProjects()
    }
  }

  const filterQuotes = (quotes: QuoteProject[]) =>
    quotes.filter(
      (q) =>
        !searchTerm ||
        q.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (q.description || '').toLowerCase().includes(searchTerm.toLowerCase())
    )

  const allQuotesFlat = useMemo(() => {
    const fromProjects = projects.flatMap((p) => [
      ...(p.quotes ?? []),
      ...(p.subprojects?.flatMap((s) => s.quotes ?? []) ?? []),
    ])
    const fromSubjects = subjectsWithQuotes.flatMap(({ quotes }) => quotes)
    const byId = new Map<number, QuoteProject>()
    ;[...standaloneQuotes, ...fromProjects, ...fromSubjects].forEach((q) => byId.set(q.id, q))
    return Array.from(byId.values())
  }, [projects, standaloneQuotes, subjectsWithQuotes])

  const filteredQuotes = useMemo(
    () =>
      allQuotesFlat.filter(
        (q) =>
          !searchTerm ||
          q.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (q.description || '').toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [allQuotesFlat, searchTerm]
  )

  const loading = projectsLoading

  const stats = useMemo(() => {
    return {
      total: allQuotesFlat.length,
      draft: allQuotesFlat.filter((q) => q.status === 'draft').length,
      approved: allQuotesFlat.filter((q) => q.status === 'approved').length,
    }
  }, [allQuotesFlat])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900" dir="rtl">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">הצעות מחיר</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">ניהול ומעקב אחר הצעות מחיר</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowCreateSubjectModal(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all shadow-md"
            >
              <Plus className="w-5 h-5" />
              <span>הוספת פרויקט</span>
            </motion.button>
          </div>
        </div>

        {/* Stats Summary Section */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center gap-4"
          >
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-blue-600 dark:text-blue-400">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">סה"כ הצעות</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center gap-4"
          >
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-amber-600 dark:text-amber-400">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">בטיוטה</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.draft}</p>
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center gap-4"
          >
            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl text-green-600 dark:text-green-400">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">מאושרות</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.approved}</p>
            </div>
          </motion.div>
        </div>

        {/* Filters Section */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="חיפוש לפי שם או תיאור..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pr-10 pl-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'draft' | 'approved' | '')}
              className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            >
              <option value="">כל הסטטוסים</option>
              <option value="draft">טיוטה</option>
              <option value="approved">אושרה</option>
            </select>
            <div className="flex gap-2">
              <button
                onClick={() => setViewMode('grid')}
                className={`flex-1 flex items-center justify-center gap-2 rounded-xl border transition-all ${
                  viewMode === 'grid'
                    ? 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-900/20 dark:border-blue-800'
                    : 'bg-gray-50 border-gray-200 text-gray-500 dark:bg-gray-700 dark:border-gray-600'
                }`}
              >
                <Grid className="w-4 h-4" />
                תצוגת רשת
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`flex-1 flex items-center justify-center gap-2 rounded-xl border transition-all ${
                  viewMode === 'list'
                    ? 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-900/20 dark:border-blue-800'
                    : 'bg-gray-50 border-gray-200 text-gray-500 dark:bg-gray-700 dark:border-gray-600'
                }`}
              >
                <List className="w-4 h-4" />
                תצוגת רשימה
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            {error}
          </div>
        )}

        {(loading || subjectsLoading) ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent" />
            <p className="text-gray-500 dark:text-gray-400 font-medium">טוען נתונים...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* פרויקטים (נושאי הצעה) – בתוך כל פרויקט יוצרים הצעות מחיר */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">פרויקטים</h2>
              {subjectsWithQuotes.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-8 text-center">
                  <p className="text-gray-500 dark:text-gray-400 mb-4">אין עדיין פרויקטים. צור פרויקט ואז תוכל להוסיף אליו הצעות מחיר.</p>
                  <button
                    type="button"
                    onClick={() => setShowCreateSubjectModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700"
                  >
                    <Plus className="w-4 h-4" />
                    הוספת פרויקט
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {subjectsWithQuotes.map(({ subject, quotes }) => {
                    const subjectLabel = [
                      subject.address,
                      subject.num_apartments != null ? subject.num_apartments + ' דירות' : null,
                      subject.num_buildings != null ? subject.num_buildings + ' בניינים' : null,
                    ].filter(Boolean).join(' • ') || 'פרויקט #' + subject.id
                    return (
                      <motion.button
                        key={subject.id}
                        type="button"
                        initial={{ opacity: 0, scale: 0.92 }}
                        animate={{ opacity: 1, scale: 1 }}
                        onClick={() => setSelectedSubjectWithQuotes({ subject, quotes })}
                        className="aspect-square min-h-[120px] flex flex-col items-center justify-center p-4 rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition-all text-right"
                      >
                        <span className="font-medium text-gray-900 dark:text-white text-sm line-clamp-2 text-center leading-tight">
                          {subjectLabel}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                          {quotes.length} הצעות
                        </span>
                      </motion.button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <QuoteSubjectModal
        isOpen={showCreateSubjectModal}
        onClose={() => setShowCreateSubjectModal(false)}
        onSuccess={() => {
          setShowCreateSubjectModal(false)
          loadSubjectsWithQuotes()
        }}
      />

      <QuoteSubjectModal
        isOpen={!!editingSubject}
        subject={editingSubject}
        onClose={() => setEditingSubject(null)}
        onSuccess={(updated) => {
          setEditingSubject(null)
          setSubjectsWithQuotes((prev) =>
            prev.map((item) =>
              item.subject.id === updated.id ? { ...item, subject: updated } : item
            )
          )
          if (selectedSubjectWithQuotes?.subject.id === updated.id) {
            setSelectedSubjectWithQuotes((prev) => prev ? { ...prev, subject: updated } : null)
          }
        }}
      />

      <SubjectQuotesFloatingModal
        subjectWithQuotes={selectedSubjectWithQuotes}
        onClose={() => setSelectedSubjectWithQuotes(null)}
        onViewQuote={(quote) => navigate(`/price-quotes/${quote.id}`)}
        onEditQuote={openEditModal}
        onApproveQuote={handleApproveQuote}
        onDeleteQuote={handleDeleteQuote}
        onAddQuote={(subjectId) => openAddQuoteForSubject(subjectId)}
        onEditSubject={(sub) => setEditingSubject(sub)}
        onDeleteSubject={(sub, quotesCount) => setDeleteSubjectModal({ subject: sub, quotesCount })}
      />

      <DeleteQuoteSubjectModal
        subject={deleteSubjectModal?.subject ?? null}
        quotesCount={deleteSubjectModal?.quotesCount ?? 0}
        onClose={() => setDeleteSubjectModal(null)}
        onSuccess={() => {
          setDeleteSubjectModal(null)
          setSelectedSubjectWithQuotes(null)
          loadSubjectsWithQuotes()
        }}
      />

      {/* קומפוננטה צפה – הצעות שאושרו והצעות אחרות */}
      <ProjectQuotesFloatingModal
        project={
          projectQuotesModal
            ? projects.find((p) => p.id === projectQuotesModal.id) ?? projectQuotesModal
            : null
        }
        onClose={() => setProjectQuotesModal(null)}
        filterQuotes={filterQuotes}
        onViewQuote={(q) => navigate(`/price-quotes/${q.id}`)}
        onEditQuote={openEditModal}
        onApproveQuote={handleApproveQuote}
        onDeleteQuote={handleDeleteQuote}
        onAddQuote={(pid) => navigate(`/price-quotes/new?projectId=${pid}`)}
        onNavigateToParent={(id) => {
          navigate(`/projects/${id}/parent`)
          setProjectQuotesModal(null)
        }}
        onNavigateToProject={(id) => {
          navigate(`/projects/${id}`)
          setProjectQuotesModal(null)
        }}
      />

      {/* Select Parent for Subproject */}
      {showSelectParentForSubproject && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowSelectParentForSubproject(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-8 border border-gray-100 dark:border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">בחר פרויקט אב לפרויקט הרגיל</h2>
            {projects.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500 dark:text-gray-400 mb-6">
                  אין פרויקטים על זמינים. צור קודם פרויקט על.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setCreateSubprojectForParentId(p.id)
                      setShowSelectParentForSubproject(false)
                    }}
                    className="w-full flex items-center gap-4 p-4 text-right rounded-xl border border-gray-100 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-200 dark:hover:border-blue-800 transition-all group"
                  >
                    <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded-lg group-hover:bg-blue-100 dark:group-hover:bg-blue-800 transition-colors">
                      <Building2 className="w-5 h-5 text-gray-400 group-hover:text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-gray-900 dark:text-white">{p.name}</div>
                      <div className="text-xs text-gray-500">
                        {p.subprojects?.length ?? 0} תתי-פרויקטים
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            <div className="mt-8 flex justify-end">
              <button
                type="button"
                onClick={() => setShowSelectParentForSubproject(false)}
                className="px-6 py-2.5 text-gray-600 dark:text-gray-400 font-medium hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-all"
              >
                ביטול
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Create Parent Project - modal פשוט עם שם + תיאור בלבד */}
      <CreateParentProjectSimpleModal
        isOpen={showCreateParentProjectModal}
        onClose={() => {
          setShowCreateParentProjectModal(false)
          setEditingProject(null)
        }}
        onSuccess={() => {
          setShowCreateParentProjectModal(false)
          setEditingProject(null)
          loadProjects()
        }}
        editingProject={showCreateParentProjectModal ? editingProject : null}
      />

      {/* Create subproject (תת-פרויקט) – נפתח רק מתוך הוספת תת-הצעה לפרויקט קיים */}
      <CreateProjectModal
        isOpen={createSubprojectForParentId != null}
        onClose={() => setCreateSubprojectForParentId(null)}
        onSuccess={() => {
          setCreateSubprojectForParentId(null)
          loadProjects()
        }}
        editingProject={null}
        createMode="quoteSubproject"
        parentProjectId={createSubprojectForParentId ?? undefined}
        openWithoutParentSelection={false}
      />

      {/* Approve Quote Modal – תמיד נפתח לפני יצירת הפרויקט ואישור ההצעה */}
      {quoteToApprove && (
        <CreateProjectModal
          isOpen={true}
          onClose={() => {
            setQuoteToApprove(null)
            setApproveChildQueue([])
            setApproveParentProjectId(null)
          }}
          onSuccess={async (project) => {
            if (approveParentProjectId != null) {
              await handleApproveChildProjectSuccess(project, quoteToApprove)
            } else {
              await handleApproveProjectSuccess(project, quoteToApprove)
            }
          }}
          parentProjectId={approveParentProjectId ?? undefined}
          initialFormData={quoteToInitialFormData(quoteToApprove)}
          titleOverride={
            approveParentProjectId != null
              ? `אשר תת-הצעה – צור תת-פרויקט (${approveChildQueue.length + 1} נותרו)`
              : 'אשר הצעת מחיר – צור פרויקט חדש'
          }
          projectType="regular"
          nameReadOnly={true}
        />
      )}
    </div>
  )
}

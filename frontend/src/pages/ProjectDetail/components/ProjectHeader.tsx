import { motion } from 'framer-motion'
import { History, Edit, Archive } from 'lucide-react'
import { formatDate } from '../../../lib/utils'
import { PermissionGuard } from '../../../components/ui/PermissionGuard'

interface ProjectHeaderProps {
  id: string | undefined
  projectName: string
  projectImageUrl: string | null
  projectStartDate: string | null
  projectEndDate: string | null
  contractFileUrl: string | null
  isParentProject: boolean
  isAdmin: boolean
  totalPeriods: number
  hasFund: boolean
  fundData: any
  isViewingHistoricalPeriod: boolean
  onShowContractModal: () => void
  onShowPreviousYearsModal: () => void
  onShowCreateTransactionModal: () => void
  onShowAddBudgetForm: () => void
  onShowCreateFundModal: () => void
  onEditProject: () => void
  onArchiveDeleteClick: () => void
  onNavigate: (path: string) => void
}

export default function ProjectHeader({
  id,
  projectName,
  projectImageUrl,
  projectStartDate,
  projectEndDate,
  contractFileUrl,
  isParentProject,
  isAdmin,
  totalPeriods,
  hasFund,
  fundData,
  isViewingHistoricalPeriod,
  onShowContractModal,
  onShowPreviousYearsModal,
  onShowCreateTransactionModal,
  onShowAddBudgetForm,
  onShowCreateFundModal,
  onEditProject,
  onArchiveDeleteClick,
  onNavigate
}: ProjectHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="project-detail-header flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between min-w-0"
    >
      <div className="project-detail-header-info flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-4 mb-4">
          {projectImageUrl && (
            <div className="project-detail-header-image rounded-lg overflow-hidden flex-shrink-0">
              <img
                src={projectImageUrl}
                alt={projectName || `פרויקט #${id}`}
                className="w-32 h-32 object-cover"
              />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="project-detail-heading text-fluid-2xl md:text-3xl font-bold text-gray-900 dark:text-white break-words">
              {projectName || `פרויקט #${id}`}
            </h1>
            <p className="project-detail-body text-gray-600 dark:text-gray-400 text-fluid-base whitespace-nowrap">
              ניהול פיננסי מפורט
            </p>
            {!isParentProject && (
              <div className="mt-2 flex flex-wrap items-center gap-3 text-fluid-sm text-gray-600 dark:text-gray-400">
                <span className="flex items-center gap-1 shrink-0">
                  <span className="text-gray-400 dark:text-gray-500">📅</span>
                  <span className="font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">תאריך התחלה:</span>
                  <span className="whitespace-nowrap">{formatDate(projectStartDate)}</span>
                </span>
                <span className="hidden sm:block text-gray-300 dark:text-gray-600">|</span>
                <span className="flex items-center gap-1 shrink-0">
                  <span className="text-gray-400 dark:text-gray-500">🏁</span>
                  <span className="font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">תאריך סיום:</span>
                  <span className="whitespace-nowrap">{formatDate(projectEndDate)}</span>
                </span>
              </div>
            )}
            {contractFileUrl && (
              <>
                <span className="hidden sm:block text-gray-300 dark:text-gray-600">|</span>
                <button
                  type="button"
                  onClick={onShowContractModal}
                  className="project-detail-header-link flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                >
                  <span className="text-gray-400 dark:text-gray-500">📄</span>
                  <span className="font-medium">חוזה הפרויקט</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="project-detail-header-actions flex flex-col gap-3 w-full md:w-auto flex-shrink-0">
        <div className="flex flex-wrap gap-3 justify-end">
          {totalPeriods > 0 && (
            <button
              onClick={onShowPreviousYearsModal}
              className="project-detail-header-button px-4 py-2 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-lg hover:from-gray-700 hover:to-gray-800 transition-all shadow-md flex items-center gap-2 text-fluid-sm whitespace-nowrap flex-shrink-0"
            >
              <History className="w-4 h-4 shrink-0" />
              תקופות ושנים
            </button>
          )}
          <PermissionGuard action="write" resource="transaction">
            <button
              onClick={onShowCreateTransactionModal}
              className="project-detail-header-button px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all shadow-md flex items-center gap-2 text-fluid-sm whitespace-nowrap flex-shrink-0"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              צור עסקה חדשה
            </button>
          </PermissionGuard>
          <PermissionGuard action="write" resource="budget">
            <button
              type="button"
              onClick={onShowAddBudgetForm}
              className="project-detail-header-button px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 text-fluid-sm whitespace-nowrap flex-shrink-0"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              + הוסף תקציב
            </button>
          </PermissionGuard>
          {!hasFund && !fundData && (
            <PermissionGuard action="write" resource="budget">
              <button
                onClick={onShowCreateFundModal}
                className="project-detail-header-button px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2 text-fluid-sm whitespace-nowrap flex-shrink-0"
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                הוסף קופה
              </button>
            </PermissionGuard>
          )}
        </div>
        <div className="flex flex-wrap gap-3 justify-end">
          <PermissionGuard action="update" resource="project">
            <button
              onClick={onEditProject}
              className="project-detail-header-button px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors flex items-center gap-2 text-fluid-sm whitespace-nowrap flex-shrink-0"
            >
              <Edit className="w-4 h-4 shrink-0" />
              ערוך פרויקט
            </button>
          </PermissionGuard>
          <PermissionGuard action="delete" resource="project">
            <button
              onClick={onArchiveDeleteClick}
              className="project-detail-header-button px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center gap-2 text-fluid-sm whitespace-nowrap flex-shrink-0"
            >
              <Archive className="w-4 h-4 shrink-0" />
              ארכב / מחק
            </button>
          </PermissionGuard>
          <button
            onClick={() => onNavigate('/dashboard')}
            className="project-detail-header-button px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-fluid-sm whitespace-nowrap flex-shrink-0"
          >
            ← חזור לדשבורד
          </button>
        </div>
      </div>
    </motion.div>
  )
}

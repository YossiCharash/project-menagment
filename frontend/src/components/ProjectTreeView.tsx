import React, { useState } from 'react'
import { Project } from '../types/api'

interface ProjectTreeViewProps {
  projects: Project[]
  onProjectSelect?: (project: Project) => void
  onProjectEdit?: (project: Project) => void
  onProjectArchive?: (project: Project) => void
  selectedProjectId?: number
  showActions?: boolean
}

interface ProjectTreeNodeProps {
  project: Project
  level: number
  onProjectSelect?: (project: Project) => void
  onProjectEdit?: (project: Project) => void
  onProjectArchive?: (project: Project) => void
  selectedProjectId?: number
  showActions?: boolean
}

const ProjectTreeNode: React.FC<ProjectTreeNodeProps> = ({
  project,
  level,
  onProjectSelect,
  onProjectEdit,
  onProjectArchive,
  selectedProjectId,
  showActions = false
}) => {
  const [isExpanded, setIsExpanded] = useState(true)
  const hasChildren = project.children && project.children.length > 0
  const isSelected = selectedProjectId === project.id

  const handleToggle = () => {
    if (hasChildren) {
      setIsExpanded(!isExpanded)
    }
  }

  const handleProjectClick = () => {
    onProjectSelect?.(project)
  }

  const getStatusColor = (project: Project) => {
    // This would ideally come from the backend, but we'll calculate it client-side
    const profit = project.total_value || 0
    const budget = project.budget_monthly || 1
    const profitPercent = (profit / budget) * 100
    
    if (profitPercent >= 10) return 'text-green-600'
    if (profitPercent <= -10) return 'text-red-600'
    return 'text-yellow-600'
  }

  return (
    <div className="select-none">
      <div
        className={`flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-gray-50 ${
          isSelected ? 'bg-blue-50 border-l-2 border-blue-500' : ''
        }`}
        style={{ paddingLeft: `${level * 20 + 8}px` }}
        onClick={handleProjectClick}
      >
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleToggle()
            }}
            className="w-4 h-4 flex items-center justify-center text-gray-500 hover:text-gray-700"
          >
            {isExpanded ? '▼' : '▶'}
          </button>
        )}
        {!hasChildren && <div className="w-4" />}
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{project.name}</span>
            <span className={`text-xs px-2 py-1 rounded ${getStatusColor(project)}`}>
              {project.total_value >= 0 ? '+' : ''}{project.total_value?.toFixed(0) || 0}
            </span>
          </div>
          <div className="text-xs text-gray-500 truncate">
            {project.address && `${project.address}, `}
            {project.city}
            {/* Removed num_residents display */}
          </div>
        </div>

        {showActions && (
          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => onProjectEdit?.(project)}
              className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded hover:bg-yellow-200"
            >
              ערוך
            </button>
            <button
              onClick={() => onProjectArchive?.(project)}
              className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded hover:bg-red-200"
            >
              ארכב
            </button>
          </div>
        )}
      </div>

      {hasChildren && isExpanded && (
        <div>
          {project.children!.map((child) => (
            <ProjectTreeNode
              key={child.id}
              project={child}
              level={level + 1}
              onProjectSelect={onProjectSelect}
              onProjectEdit={onProjectEdit}
              onProjectArchive={onProjectArchive}
              selectedProjectId={selectedProjectId}
              showActions={showActions}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const ProjectTreeView: React.FC<ProjectTreeViewProps> = ({
  projects,
  onProjectSelect,
  onProjectEdit,
  onProjectArchive,
  selectedProjectId,
  showActions = false
}) => {
  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-4 border-b">
        <h3 className="text-lg font-semibold">מבנה פרויקטים</h3>
      </div>
      <div className="max-h-96 overflow-y-auto">
        {projects.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            אין פרויקטים להצגה
          </div>
        ) : (
          projects.map((project) => (
            <ProjectTreeNode
              key={project.id}
              project={project}
              level={0}
              onProjectSelect={onProjectSelect}
              onProjectEdit={onProjectEdit}
              onProjectArchive={onProjectArchive}
              selectedProjectId={selectedProjectId}
              showActions={showActions}
            />
          ))
        )}
      </div>
    </div>
  )
}

export default ProjectTreeView

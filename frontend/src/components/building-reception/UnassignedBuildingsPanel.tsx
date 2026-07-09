import { useState } from 'react'
import { Building2, Link2 } from 'lucide-react'
import type { BuildingListItem, BuildingProjectListItem } from '../../types/api'
import { ACCENT } from './constants'

interface UnassignedBuildingsPanelProps {
  /** Buildings with no project yet (project_id === null). */
  buildings: BuildingListItem[]
  projects: BuildingProjectListItem[]
  onAssign: (buildingId: number, projectId: number) => void
}

/**
 * A recovery banner for legacy buildings that predate the "every building lives
 * inside a project" rule. Such buildings are hidden from the main tabs, so this
 * panel surfaces them and lets the user attach each one to a project instead of
 * losing it. Renders nothing once every building is assigned.
 *
 * Single Responsibility: it only owns the per-row project selection; the actual
 * persistence is delegated upward via `onAssign`.
 */
export default function UnassignedBuildingsPanel({
  buildings,
  projects,
  onAssign,
}: UnassignedBuildingsPanelProps) {
  // Per-building chosen project id; falls back to the first project on render.
  const [choices, setChoices] = useState<Record<number, number>>({})

  if (buildings.length === 0) return null

  return (
    <section
      dir="rtl"
      className="mb-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3"
    >
      <div className="flex items-center gap-2 mb-2.5">
        <Building2 className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        <span className="text-sm font-bold text-amber-800 dark:text-amber-300">
          בניינים ללא שיוך לפרויקט
        </span>
        <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
          שייך כל בניין לפרויקט כדי שיופיע בתצוגה.
        </span>
      </div>

      {projects.length === 0 ? (
        <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
          תחילה צור פרויקט (כפתור "פרויקט"), ואז תוכל לשייך אליו את הבניינים.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {buildings.map((building) => {
            const selectedProjectId = choices[building.id] ?? projects[0].id
            return (
              <li
                key={building.id}
                className="flex items-center gap-2 flex-wrap bg-white dark:bg-gray-800 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2"
              >
                <span className="flex-1 min-w-[120px] text-sm font-bold text-gray-900 dark:text-white">
                  {building.name}
                  {building.address && (
                    <span className="mr-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                      · {building.address}
                    </span>
                  )}
                </span>
                <select
                  aria-label={`פרויקט עבור ${building.name}`}
                  value={selectedProjectId}
                  onChange={(event) =>
                    setChoices((current) => ({ ...current, [building.id]: Number(event.target.value) }))
                  }
                  dir="rtl"
                  className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm font-semibold bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 outline-none"
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => onAssign(building.id, selectedProjectId)}
                  className="text-sm font-bold text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                  style={{ background: ACCENT }}
                >
                  <Link2 className="w-4 h-4" />
                  שייך
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

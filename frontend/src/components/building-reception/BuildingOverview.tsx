import { KeyRound, Package, ClipboardX, Plus, Layers, FolderPlus, Pencil, Trash2, LayoutGrid, Building as BuildingIcon } from 'lucide-react'
import type { Apartment, Building, BuildingListItem, BuildingProjectListItem } from '../../types/api'
import { ACCENT, PALETTE, groupByFloor } from './constants'
import ApartmentCell from './ApartmentCell'

/** One building's physical floors × apartments grid. Reused by the single- and
 *  all-buildings views. When `onAddApartment` is omitted (overview mode) the
 *  per-floor add button is hidden — the overview is read-only. */
function FloorsGrid({
  apartments,
  onSelectApartment,
  onAddApartment,
}: {
  apartments: Apartment[]
  onSelectApartment: (apartment: Apartment) => void
  onAddApartment?: (floor: number) => void
}) {
  const floors = groupByFloor(apartments)
  if (floors.length === 0) {
    return <div className="text-sm font-semibold text-gray-400 text-center py-8">אין דירות בבניין זה עדיין.</div>
  }
  return (
    <div className="flex flex-col gap-2.5">
      {floors.map(({ floor, units }) => (
        <div
          key={floor}
          className="flex gap-3 items-stretch bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 py-3"
        >
          <div className="flex-shrink-0 w-[78px] flex flex-col justify-center items-center text-center border-l border-gray-200 dark:border-gray-700 pl-2">
            <Layers className="w-5 h-5 text-gray-400 mb-1" />
            <div className="font-extrabold text-sm text-gray-900 dark:text-white leading-none">קומה {floor}</div>
            <div className="text-[10.5px] font-medium text-gray-400 mt-0.5">{units.length} דירות</div>
          </div>
          <div className="flex-1 flex flex-wrap gap-2.5">
            {units.map((apartment) => (
              <ApartmentCell key={apartment.id} apartment={apartment} onSelect={onSelectApartment} />
            ))}
            {onAddApartment && (
              <button
                type="button"
                onClick={() => onAddApartment(floor)}
                className="w-[62px] h-[62px] rounded-xl border border-dashed flex items-center justify-center flex-shrink-0"
                style={{ color: ACCENT, borderColor: `${ACCENT}80`, background: `${ACCENT}0D` }}
                aria-label={`הוספת דירה לקומה ${floor}`}
                title="הוספת דירה"
              >
                <Plus className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

interface BuildingOverviewProps {
  projects: BuildingProjectListItem[]
  selectedProjectId: number | null
  buildings: BuildingListItem[]
  activeBuilding: Building | null
  loading: boolean
  /** Admin-only: gate the create/delete controls for whole buildings & projects. */
  canManageBuildings: boolean
  /** When true, every building in the project is shown stacked on one screen. */
  allBuildingsMode: boolean
  /** Fully-loaded buildings (with apartments) for the all-buildings view. */
  overviewBuildings: Building[]
  overviewLoading: boolean
  onToggleAllBuildings: () => void
  onSelectProject: (projectId: number | null) => void
  onCreateProject: () => void
  onEditProject: (project: BuildingProjectListItem) => void
  onDeleteProject: (projectId: number) => void
  onSelectBuilding: (buildingId: number) => void
  onCreateBuilding: () => void
  onDeleteBuilding: (buildingId: number) => void
  onSelectApartment: (apartment: Apartment) => void
  onAddApartment: (floor: number) => void
}

const LEGEND: Array<{ label: string; color: string }> = [
  { label: 'מאוכלסת', color: PALETTE.occupied },
  { label: 'פנויה', color: PALETTE.vacant },
  { label: 'שטח משותף', color: PALETTE.common },
]

/**
 * The main "מבט-על מתחם" view: building selector tabs, KPI legend and the
 * physical floors × apartments grid. Delegates every action upward; holds no
 * data-fetching logic of its own.
 */
export default function BuildingOverview({
  projects,
  selectedProjectId,
  buildings,
  activeBuilding,
  loading,
  canManageBuildings,
  allBuildingsMode,
  overviewBuildings,
  overviewLoading,
  onToggleAllBuildings,
  onSelectProject,
  onCreateProject,
  onEditProject,
  onDeleteProject,
  onSelectBuilding,
  onCreateBuilding,
  onDeleteBuilding,
  onSelectApartment,
  onAddApartment,
}: BuildingOverviewProps) {
  // Buildings are always scoped to a project — only the selected project's
  // buildings are shown in the tab strip.
  const visibleBuildings =
    selectedProjectId === null ? [] : buildings.filter((building) => building.project_id === selectedProjectId)
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null
  // Guard against a stale active building that belongs to another project.
  const activeInProject = activeBuilding !== null && visibleBuildings.some((building) => building.id === activeBuilding.id)
  // Apartments of the currently-open building; grouping into floors happens once
  // inside FloorsGrid, so we only need the flat list (and its length) here.
  const activeApartments = activeInProject && activeBuilding ? activeBuilding.apartments : []
  const compound = activeInProject ? activeBuilding?.compound_name ?? activeBuilding?.address ?? '' : ''

  return (
    <section dir="rtl" className="flex-1 min-w-0">
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <span className="text-xs font-extrabold text-gray-500 dark:text-gray-400 ml-1">פרויקטים:</span>
        {projects.map((project) => {
          const active = project.id === selectedProjectId
          return (
            <button
              key={project.id}
              type="button"
              onClick={() => onSelectProject(project.id)}
              className="text-xs font-bold px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1.5"
              style={{
                color: active ? '#fff' : '#6B6B7B',
                background: active ? ACCENT : 'transparent',
                borderColor: active ? ACCENT : '#E2E2E8',
              }}
            >
              {project.name}
              <span className="opacity-70">({project.buildings_count})</span>
            </button>
          )
        })}
        {canManageBuildings && (
          <button
            type="button"
            onClick={onCreateProject}
            className="text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1 border border-dashed"
            style={{ color: ACCENT, borderColor: `${ACCENT}73`, background: `${ACCENT}12` }}
          >
            <FolderPlus className="w-4 h-4" />
            פרויקט
          </button>
        )}
        {canManageBuildings && selectedProject && (
          <button
            type="button"
            onClick={() => onEditProject(selectedProject)}
            className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
            aria-label="עריכת פרויקט"
            title={`עריכת הפרויקט "${selectedProject.name}"`}
          >
            <Pencil className="w-4 h-4" />
          </button>
        )}
        {canManageBuildings && selectedProject && (
          <button
            type="button"
            onClick={() => onDeleteProject(selectedProject.id)}
            className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
            aria-label="מחיקת פרויקט"
            title={`מחיקת הפרויקט "${selectedProject.name}"`}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex items-end justify-between gap-4 flex-wrap mb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white leading-tight">
            מבט-על מתחם{compound ? ` · ${compound}` : ''}
          </h1>
          <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 mt-1">
            תצוגה לפי הסדר הפיזי של הבניין — קומות ודירות כפי שהן בפועל
          </p>
        </div>

        <div className="flex items-center gap-2">
          {visibleBuildings.length > 1 && (
            <button
              type="button"
              onClick={onToggleAllBuildings}
              className="text-sm font-bold px-3 py-2.5 rounded-xl flex items-center gap-1.5 border transition-colors"
              style={{
                color: allBuildingsMode ? '#fff' : ACCENT,
                background: allBuildingsMode ? ACCENT : `${ACCENT}12`,
                borderColor: `${ACCENT}73`,
              }}
              aria-pressed={allBuildingsMode}
              title="הצגת כל הבניינים במסך אחד"
            >
              <LayoutGrid className="w-[18px] h-[18px]" />
              {allBuildingsMode ? 'בניין בודד' : 'כל הבניינים'}
            </button>
          )}
          <div className={`flex bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-1 gap-1 ${allBuildingsMode ? 'opacity-40 pointer-events-none' : ''}`}>
            {visibleBuildings.map((building) => {
              const active = building.id === activeBuilding?.id
              return (
                <button
                  key={building.id}
                  type="button"
                  onClick={() => onSelectBuilding(building.id)}
                  className="text-sm font-bold px-3.5 py-2 rounded-lg leading-tight text-center transition-colors"
                  style={{
                    color: active ? '#fff' : '#6B6B7B',
                    background: active ? ACCENT : 'transparent',
                  }}
                >
                  <span className="block">{building.name}</span>
                  {building.address && (
                    <span className="block text-[10.5px] font-medium opacity-80">{building.address}</span>
                  )}
                </button>
              )
            })}
          </div>
          {canManageBuildings && (
            <button
              type="button"
              onClick={onCreateBuilding}
              className="text-sm font-bold px-3 py-2.5 rounded-xl flex items-center gap-1.5 border border-dashed"
              style={{ color: ACCENT, borderColor: `${ACCENT}73`, background: `${ACCENT}12` }}
            >
              <Plus className="w-5 h-5" />
              בניין
            </button>
          )}
          {canManageBuildings && activeInProject && activeBuilding && (
            <button
              type="button"
              onClick={() => onDeleteBuilding(activeBuilding.id)}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-400 border border-gray-200 dark:border-gray-700 hover:text-red-500 hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-900/20"
              aria-label={`מחיקת הבניין "${activeBuilding.name}"`}
              title={`מחיקת הבניין "${activeBuilding.name}"`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 mb-4">
        <span className="text-xs font-bold text-gray-600 dark:text-gray-300">מקרא:</span>
        {LEGEND.map((item) => (
          <span key={item.label} className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300">
            <span className="w-3 h-3 rounded" style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
        <span className="w-px h-4 bg-gray-200 dark:bg-gray-600" />
        <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300">
          <KeyRound className="w-4 h-4" style={{ color: PALETTE.keyDesk }} />
          מפתח אצל הדלפק
        </span>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300">
          <KeyRound className="w-4 h-4" style={{ color: PALETTE.keyOut }} />
          הוצאנו מפתח
        </span>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300">
          <Package className="w-4 h-4" style={{ color: PALETTE.delivery }} />
          משלוח ממתין
        </span>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300">
          <ClipboardX className="w-4 h-4" style={{ color: PALETTE.task }} />
          משימה פתוחה
        </span>
      </div>

      {visibleBuildings.length === 0 ? (
        <div className="text-sm font-semibold text-gray-400 text-center py-16">
          {projects.length === 0
            ? 'צור פרויקט כדי להתחיל, ואז הוסף אליו בניינים.'
            : selectedProject
              ? `אין בניינים בפרויקט "${selectedProject.name}". הוסף בניין כדי להתחיל.`
              : 'בחר פרויקט כדי להציג את הבניינים שלו.'}
        </div>
      ) : allBuildingsMode ? (
        overviewLoading ? (
          <div className="text-sm font-semibold text-gray-400 text-center py-16">טוען את כל הבניינים…</div>
        ) : (
          <div className="flex flex-col gap-6">
            {overviewBuildings.map((building) => (
              <div key={building.id}>
                <button
                  type="button"
                  onClick={() => onSelectBuilding(building.id)}
                  dir="rtl"
                  className="w-full text-right flex items-center gap-2.5 mb-2.5 group"
                  title={`מעבר לבניין "${building.name}"`}
                >
                  <span
                    className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: `${ACCENT}1F`, color: ACCENT }}
                  >
                    <BuildingIcon className="w-5 h-5" />
                  </span>
                  <span className="leading-tight">
                    <span className="block text-lg font-extrabold text-gray-900 dark:text-white group-hover:underline">
                      {building.name}
                    </span>
                    {(building.compound_name || building.address) && (
                      <span className="block text-xs font-semibold text-gray-500 dark:text-gray-400">
                        {building.compound_name || building.address}
                      </span>
                    )}
                  </span>
                  <span className="text-xs font-bold text-gray-400 mr-auto">{building.apartments.length} דירות</span>
                </button>
                <FloorsGrid apartments={building.apartments} onSelectApartment={onSelectApartment} />
              </div>
            ))}
          </div>
        )
      ) : loading || !activeInProject ? (
        // Not-yet-reconciled active building (e.g. right after a project switch)
        // shows the neutral spinner rather than a misleading "no apartments".
        <div className="text-sm font-semibold text-gray-400 text-center py-16">טוען בניין…</div>
      ) : activeApartments.length === 0 ? (
        <div className="text-sm font-semibold text-gray-400 text-center py-16">לבניין זה אין דירות עדיין.</div>
      ) : (
        <FloorsGrid apartments={activeApartments} onSelectApartment={onSelectApartment} onAddApartment={onAddApartment} />
      )}
    </section>
  )
}

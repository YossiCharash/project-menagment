import { Link, Outlet, useLocation } from 'react-router-dom'
import {
  SlidersHorizontal,
  Package,
  Warehouse as WarehouseIcon,
  ArrowLeftRight,
  Archive,
  LayoutDashboard,
  FolderTree,
} from 'lucide-react'
import { useInventorySettings } from '../../contexts/InventorySettingsContext'

// ---- Tab Navigation Configuration -------------------------------------------

interface TabItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  isExactMatch: boolean
}

const TAB_ITEMS: TabItem[] = [
  { label: 'סקירה', href: '/inventory', icon: LayoutDashboard, isExactMatch: true },
  { label: 'ציוד קבוע', href: '/inventory/assets', icon: Package, isExactMatch: false },
  { label: 'מתכלים', href: '/inventory/consumables', icon: Archive, isExactMatch: false },
  { label: 'קטגוריות', href: '/inventory/categories', icon: FolderTree, isExactMatch: false },
  { label: 'מחסנים', href: '/inventory/warehouses', icon: WarehouseIcon, isExactMatch: false },
  { label: 'העברות', href: '/inventory/transfers', icon: ArrowLeftRight, isExactMatch: false },
]

// ---- Layout Component -------------------------------------------------------

export default function InventoryLayout() {
  return (
    <div dir="rtl" className="space-y-6">
      <LayoutHeader />
      <TabBar />
      <Outlet />
    </div>
  )
}

// ---- Header -----------------------------------------------------------------

function LayoutHeader() {
  const { open } = useInventorySettings()

  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          ניהול מלאי וציוד
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          סקירה כללית של ציוד, מחסנים ומלאי
        </p>
      </div>
      <button
        onClick={open}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm font-medium"
      >
        <SlidersHorizontal className="w-4 h-4" />
        הגדרות
      </button>
    </div>
  )
}

// ---- Tab Bar ----------------------------------------------------------------

function TabBar() {
  const location = useLocation()

  return (
    <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 pb-0">
      {TAB_ITEMS.map((tab) => {
        const isActive = tab.isExactMatch
          ? location.pathname === tab.href
          : location.pathname.startsWith(tab.href)
        const Icon = tab.icon

        return (
          <Link
            key={tab.href}
            to={tab.href}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              isActive
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <Icon className="w-4 h-4" />
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}

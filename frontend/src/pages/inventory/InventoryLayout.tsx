import { Link, Outlet, useLocation } from 'react-router-dom'
import { Package, Warehouse, ArrowLeftRight, Archive, SlidersHorizontal } from 'lucide-react'

const SUB_NAV_ITEMS = [
  { label: 'ציוד קבוע', href: '/inventory/assets', icon: Package },
  { label: 'מתכלים', href: '/inventory/consumables', icon: Archive },
  { label: 'מחסנים', href: '/inventory/warehouses', icon: Warehouse },
  { label: 'העברות', href: '/inventory/transfers', icon: ArrowLeftRight },
]

export default function InventoryLayout() {
  const location = useLocation()

  return (
    <div dir="rtl" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">ניהול מלאי וציוד</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">סקירה כללית של ציוד, מחסנים ומלאי</p>
        </div>
        <Link
          to="/inventory/settings"
          title="הגדרות מלאי"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm font-medium"
        >
          <SlidersHorizontal className="w-4 h-4" />
          הגדרות
        </Link>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 pb-0">
        {SUB_NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.href
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              to={item.href}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </Link>
          )
        })}
      </div>

      {/* Page Content */}
      <Outlet />
    </div>
  )
}

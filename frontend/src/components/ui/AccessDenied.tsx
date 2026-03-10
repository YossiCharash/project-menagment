import React from 'react'
import { Lock, ShieldOff } from 'lucide-react'

/** Shown when a user tries to access a specific page they don't have permission for */
export function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center p-8">
      <div className="w-24 h-24 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
        <Lock className="w-12 h-12 text-red-500 dark:text-red-400" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">אין הרשאת גישה</h1>
        <p className="text-gray-500 dark:text-gray-400 max-w-sm">
          אין לך הרשאות לצפות בדף זה. פנה למנהל המערכת כדי לקבל גישה.
        </p>
      </div>
    </div>
  )
}

/** Shown when a user has zero permissions at all (landing on dashboard) */
export function NoPermissions() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center p-8">
      <div className="w-24 h-24 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
        <ShieldOff className="w-12 h-12 text-orange-500 dark:text-orange-400" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">אין הרשאות במערכת</h1>
        <p className="text-gray-500 dark:text-gray-400 max-w-sm">
          לחשבונך אין הרשאות גישה לאף חלק במערכת. פנה למנהל המערכת כדי לקבל הרשאות.
        </p>
      </div>
    </div>
  )
}

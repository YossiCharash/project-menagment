import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link, useLocation } from 'react-router-dom'
import { 
  LayoutDashboard, 
  FolderOpen, 
  BarChart3, 
  Users, 
  Settings, 
  Menu, 
  X,
  ChevronLeft,
  ChevronRight,
  Home,
  FileText,
  Building2,
  UserCog,
  Activity
} from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { cn } from '../../lib/utils'
import { useSelector } from 'react-redux'
import type { RootState } from '../../store'
import { Logo } from './Logo'

interface SidebarProps {
  isCollapsed: boolean
  onToggle: () => void
}

const getNavigationItems = (userRole?: string) => {
  const baseItems = [
    {
      name: 'לוח בקרה',
      href: '/',
      icon: LayoutDashboard,
      description: 'סקירה כללית של הפרויקטים'
    },
    {
      name: 'פרויקטים',
      href: '/projects',
      icon: FolderOpen,
      description: 'ניהול פרויקטים ותת-פרויקטים'
    },
    {
      name: 'דוחות',
      href: '/reports',
      icon: BarChart3,
      description: 'דוחות פיננסיים ומעקב'
    }
  ]

  // Add admin-only items
  if (userRole === 'Admin') {
    baseItems.push({
      name: 'יומן פעילות',
      href: '/audit-logs',
      icon: Activity,
      description: 'מעקב אחר כל הפעולות במערכת'
    })
    baseItems.push({
      name: 'ניהול מנהלים',
      href: '/admin-management',
      icon: UserCog,
      description: 'ניהול מנהלי מערכת נוספים'
    })
    baseItems.push({
      name: 'ניהול משתמשים',
      href: '/users',
      icon: UserCog,
      description: 'ניהול משתמשי המערכת והרשאות'
    })
  }

  baseItems.push({
    name: 'הגדרות',
    href: '/settings',
    icon: Settings,
    description: 'הגדרות מערכת ומשתמש'
  })

  return baseItems
}

export function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  const location = useLocation()
  const { theme, toggleTheme } = useTheme()
  const me = useSelector((state: RootState) => state.auth.me)
  const navigationItems = getNavigationItems(me?.role)

  return (
    <motion.aside
      initial={false}
      animate={{ width: isCollapsed ? 80 : 280 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="fixed left-0 top-0 h-screen bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col z-30"
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <AnimatePresence>
            {!isCollapsed ? (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <Logo size="lg" showText={true} />
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Logo size="lg" showText={false} collapsed={true} />
              </motion.div>
            )}
          </AnimatePresence>
          
          <button
            onClick={onToggle}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            {isCollapsed ? (
              <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            ) : (
              <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            )}
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {navigationItems.map((item) => {
          const isActive = location.pathname === item.href
          const Icon = item.icon

          return (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                "group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
                isActive
                  ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              )}
            >
              <Icon className={cn(
                "w-5 h-5 flex-shrink-0",
                isActive ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"
              )} />
              
              <AnimatePresence>
                {!isCollapsed && (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.2 }}
                    className="flex-1 min-w-0"
                  >
                    <div className="font-medium">{item.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {item.description}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <AnimatePresence>
          {!isCollapsed && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.2 }}
              className="space-y-3"
            >
              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="w-5 h-5 flex-shrink-0">
                  {theme === 'dark' ? (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                    </svg>
                  )}
                </div>
                <span className="text-sm font-medium">
                  {theme === 'dark' ? 'מצב בהיר' : 'מצב כהה'}
                </span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.aside>
  )
}

interface MobileSidebarProps {
  isOpen: boolean
  onClose: () => void
}

export function MobileSidebar({ isOpen, onClose }: MobileSidebarProps) {
  const location = useLocation()
  const { theme, toggleTheme } = useTheme()
  const me = useSelector((state: RootState) => state.auth.me)
  const navigationItems = getNavigationItems(me?.role)

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={onClose}
          />
          
          {/* Sidebar */}
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="fixed inset-y-0 left-0 w-80 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 z-50 lg:hidden"
          >
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <Logo size="lg" showText={true} />
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <X className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                </button>
              </div>
            </div>

            <nav className="flex-1 p-4 space-y-2">
              {navigationItems.map((item) => {
                const isActive = location.pathname === item.href
                const Icon = item.icon

                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={onClose}
                    className={cn(
                      "group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
                      isActive
                        ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                        : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                    )}
                  >
                    <Icon className={cn(
                      "w-5 h-5 flex-shrink-0",
                      isActive ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"
                    )} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {item.description}
                      </div>
                    </div>
                  </Link>
                )
              })}
            </nav>

            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={toggleTheme}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="w-5 h-5 flex-shrink-0">
                  {theme === 'dark' ? (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                    </svg>
                  )}
                </div>
                <span className="text-sm font-medium">
                  {theme === 'dark' ? 'מצב בהיר' : 'מצב כהה'}
                </span>
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

import React, { useState, useEffect, Suspense } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import type { RootState } from './store'
import { motion, AnimatePresence } from 'framer-motion'
// Auth pages - keep eagerly loaded (first pages the user sees)
import Login from './pages/Login'
import Register from './pages/Register'
// Lazy-loaded pages (code splitting - only loaded when navigated to)
const AdminRegister = React.lazy(() => import('./pages/AdminRegister'))
const AdminInviteRegister = React.lazy(() => import('./pages/AdminInviteRegister'))
const AdminInviteManagement = React.lazy(() => import('./pages/AdminInviteManagement'))
const EmailVerificationRegister = React.lazy(() => import('./pages/EmailVerificationRegister'))
const OAuthCallback = React.lazy(() => import('./pages/OAuthCallback'))
const ResetPassword = React.lazy(() => import('./pages/ResetPassword'))
const AdminManagement = React.lazy(() => import('./pages/AdminManagement'))
const UserManagement = React.lazy(() => import('./pages/UserManagement'))
const AuditLogs = React.lazy(() => import('./pages/AuditLogs'))
const Dashboard = React.lazy(() => import('./pages/Dashboard'))
const Projects = React.lazy(() => import('./pages/Projects'))
const ProjectDetail = React.lazy(() => import('./pages/ProjectDetail'))
const Subprojects = React.lazy(() => import('./pages/Subprojects'))
const ParentProjectDetail = React.lazy(() => import('./components/ParentProjectDetail'))
const Reports = React.lazy(() => import('./pages/Reports'))
const PriceQuotes = React.lazy(() => import('./pages/PriceQuotes'))
const CreateQuotePage = React.lazy(() => import('./pages/CreateQuotePage'))
const QuoteDetail = React.lazy(() => import('./pages/QuoteDetail'))
const Suppliers = React.lazy(() => import('./pages/Suppliers'))
const SupplierDocuments = React.lazy(() => import('./pages/SupplierDocuments'))
const Settings = React.lazy(() => import('./pages/Settings'))
const UnforeseenTransactions = React.lazy(() => import('./pages/UnforeseenTransactions'))
const TaskManagement = React.lazy(() => import('./pages/TaskManagement'))
const TaskCalendar = React.lazy(() => import('./pages/TaskCalendar'))
const UserPermissions = React.lazy(() => import('./pages/UserPermissions'))
const Notifications = React.lazy(() => import('./pages/Notifications'))
const UserGuide = React.lazy(() => import('./pages/UserGuide'))
const InventoryDashboard = React.lazy(() => import('./pages/inventory/InventoryDashboard'))
const AssetsPage = React.lazy(() => import('./pages/inventory/AssetsPage'))
const ConsumablesPage = React.lazy(() => import('./pages/inventory/ConsumablesPage'))
const WarehousesPage = React.lazy(() => import('./pages/inventory/WarehousesPage'))
const TransfersPage = React.lazy(() => import('./pages/inventory/TransfersPage'))
const InventorySettings = React.lazy(() => import('./pages/inventory/InventorySettings'))
import { logout, fetchMe } from './store/slices/authSlice'
import { fetchUserPermissions, clearPermissions, selectHasAnyAccess } from './store/slices/permissionsSlice'
import { Sidebar, MobileSidebar } from './components/ui/Sidebar'
import { ThemeProvider } from './contexts/ThemeContext'
import { LoadingOverlay } from './components/ui/Loading'
import { Logo } from './components/ui/Logo'
import { Menu, LogOut, User } from 'lucide-react'
import { cn } from './lib/utils'
import { avatarUrl } from './lib/api'
import { AccessDenied, NoPermissions } from './components/ui/AccessDenied'

function RequireAuth({ children }: { children: JSX.Element }) {
  const dispatch = useDispatch()
  const token = useSelector((s: RootState) => s.auth.token)
  const me = useSelector((s: RootState) => s.auth.me)
  const loading = useSelector((s: RootState) => s.auth.loading)
  const requiresPasswordChange = useSelector((s: RootState) => s.auth.requiresPasswordChange)
  const permissionsLoaded = useSelector((s: RootState) => s.permissions.loaded)

  useEffect(() => {
    if (token && !me && !loading) {
      dispatch(fetchMe() as any)
    }
  }, [token, me, loading, dispatch])

  useEffect(() => {
    if (me && !permissionsLoaded) {
      dispatch(fetchUserPermissions(me.id) as any)
    }
  }, [me, permissionsLoaded, dispatch])

  // If no token, redirect to login
  if (!token) return <Navigate to="/login" replace />
  
  // If user requires password change, redirect to login to show password change modal
  if (requiresPasswordChange) {
    return <Navigate to="/login" replace />
  }
  
  // If loading user data, show loading
  if (loading) {
    return <LoadingOverlay message="טוען נתוני משתמש..." />
  }

  return children
}

function RequirePermission({ resource, children }: { resource: string; children: JSX.Element }) {
  const canAccess = useSelector(selectHasAnyAccess(resource))
  const permissionsLoaded = useSelector((s: RootState) => s.permissions.loaded)
  if (!permissionsLoaded) return null
  if (!canAccess) return <AccessDenied />
  return children
}

function RequireAnyPermission({ children }: { children: JSX.Element }) {
  const permissions = useSelector((s: RootState) => s.permissions.permissions)
  const permissionsLoaded = useSelector((s: RootState) => s.permissions.loaded)
  const me = useSelector((s: RootState) => s.auth.me)
  if (!permissionsLoaded) return null
  if (me?.role === 'Admin') return children
  if (permissions.length === 0) return <NoPermissions />
  return children
}

function AppContent() {
  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useDispatch()
  const token = useSelector((s: RootState) => s.auth.token)

  // Guide is a fully standalone page – no sidebar, no header, no auth wrapper
  if (location.pathname === '/guide') {
    return (
      <Suspense fallback={<LoadingOverlay message="טוען..." />}>
        <UserGuide />
      </Suspense>
    )
  }
  const me = useSelector((s: RootState) => s.auth.me)
  const loading = useSelector((s: RootState) => s.auth.loading)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  // Auto-validate token and fetch user data on app startup if token exists
  useEffect(() => {
    if (token && !me && !loading) {
      // Token exists but user data is not loaded - fetch it
      dispatch(fetchMe() as any)
    }
  }, [token, me, loading, dispatch])

  const onLogout = () => {
    dispatch(logout())
    dispatch(clearPermissions())
    // Soft reload to clear any stale state while keeping UX snappy
    navigate('/login', { replace: true })
  }

  // If not authenticated, show auth pages and ensure deep links to dashboard/projects go to login then back
  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Suspense fallback={<LoadingOverlay message="טוען..." />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/admin-register" element={<AdminRegister />} />
          <Route path="/admin-invite" element={<AdminInviteRegister />} />
          <Route path="/email-register" element={<EmailVerificationRegister />} />
          <Route path="/auth/callback" element={<OAuthCallback />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        </Suspense>
      </div>
    )
  }

  return (
    <div className="min-h-screen h-screen flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar 
          isCollapsed={sidebarCollapsed} 
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </div>

      {/* Mobile Sidebar */}
      <MobileSidebar 
        isOpen={mobileSidebarOpen} 
        onClose={() => setMobileSidebarOpen(false)}
      />

      {/* Main Content */}
      <div className={cn(
        "flex-1 flex flex-col min-h-0 min-w-0 transition-all duration-300 overflow-hidden",
        sidebarCollapsed ? "lg:mr-[80px]" : "lg:mr-[280px]"
      )}>
        {/* Top Navigation */}
        <header className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 lg:px-6 z-20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setMobileSidebarOpen(true)}
                className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <Menu className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
              <Logo size="lg" showText={false} />
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                {me?.avatar_url && avatarUrl(me.avatar_url) ? (
                  <img
                    src={avatarUrl(me.avatar_url)!}
                    alt=""
                    className="w-8 h-8 rounded-full object-cover flex-shrink-0 ring-1 ring-gray-200 dark:ring-gray-600"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  </div>
                )}
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {me?.full_name || me?.email}
                </span>
              </div>
              <button
                onClick={onLogout}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title="התנתקות"
              >
                <LogOut className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 lg:p-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="w-full"
          >
            <Suspense fallback={<LoadingOverlay message="טוען..." />}>
            <Routes>
              <Route path="/" element={<RequireAuth><RequireAnyPermission><Dashboard /></RequireAnyPermission></RequireAuth>} />
              <Route path="/dashboard" element={<RequireAuth><RequireAnyPermission><Dashboard /></RequireAnyPermission></RequireAuth>} />
              <Route path="/projects" element={<RequireAuth><RequirePermission resource="project"><Projects /></RequirePermission></RequireAuth>} />
              <Route path="/projects/:id" element={<RequireAuth><RequirePermission resource="project"><ProjectDetail /></RequirePermission></RequireAuth>} />
              <Route path="/projects/:projectId/unforeseen-transactions" element={<RequireAuth><RequirePermission resource="project"><UnforeseenTransactions /></RequirePermission></RequireAuth>} />
              <Route path="/projects/:id/parent" element={<RequireAuth><RequirePermission resource="project"><ParentProjectDetail /></RequirePermission></RequireAuth>} />
              <Route path="/projects/:parentId/subprojects" element={<RequireAuth><RequirePermission resource="project"><Subprojects /></RequirePermission></RequireAuth>} />
              <Route path="/reports" element={<RequireAuth><RequirePermission resource="report"><Reports /></RequirePermission></RequireAuth>} />
              <Route path="/price-quotes" element={<RequireAuth><RequirePermission resource="quote"><PriceQuotes /></RequirePermission></RequireAuth>} />
              <Route path="/price-quotes/new" element={<RequireAuth><RequirePermission resource="quote"><CreateQuotePage /></RequirePermission></RequireAuth>} />
              <Route path="/price-quotes/:id" element={<RequireAuth><RequirePermission resource="quote"><QuoteDetail key={location.pathname} /></RequirePermission></RequireAuth>} />
              <Route path="/suppliers" element={<RequireAuth><RequirePermission resource="supplier"><Suppliers /></RequirePermission></RequireAuth>} />
              <Route path="/task-management" element={<RequireAuth><RequirePermission resource="task"><TaskManagement /></RequirePermission></RequireAuth>} />
              <Route path="/task-calendar" element={<Navigate to="/task-management" replace />} />
              <Route path="/inventory" element={<RequireAuth><InventoryDashboard /></RequireAuth>} />
              <Route path="/inventory/assets" element={<RequireAuth><AssetsPage /></RequireAuth>} />
              <Route path="/inventory/consumables" element={<RequireAuth><ConsumablesPage /></RequireAuth>} />
              <Route path="/inventory/warehouses" element={<RequireAuth><WarehousesPage /></RequireAuth>} />
              <Route path="/inventory/transfers" element={<RequireAuth><TransfersPage /></RequireAuth>} />
              <Route path="/inventory/settings" element={<RequireAuth><InventorySettings /></RequireAuth>} />
              <Route path="/notifications" element={<Navigate to="/task-management?tab=messages" replace />} />
              <Route path="/suppliers/:supplierId/documents" element={<RequireAuth><RequirePermission resource="supplier"><SupplierDocuments /></RequirePermission></RequireAuth>} />
              <Route path="/users" element={<RequireAuth><UserManagement /></RequireAuth>} />
              <Route path="/users/:userId/permissions" element={<RequireAuth><UserPermissions /></RequireAuth>} />
              <Route path="/my-profile" element={<Navigate to="/settings" replace />} />
              <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
              <Route path="/audit-logs" element={<RequireAuth><AuditLogs /></RequireAuth>} />
              <Route path="/admin-invites" element={<RequireAuth><AdminInviteManagement /></RequireAuth>} />
              <Route path="/admin-management" element={<RequireAuth><AdminManagement /></RequireAuth>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </Suspense>
          </motion.div>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  )
}

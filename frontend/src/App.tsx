import React, { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import type { RootState } from './store'
import { motion, AnimatePresence } from 'framer-motion'
import Login from './pages/Login'
import Register from './pages/Register'
import AdminRegister from './pages/AdminRegister'
import AdminInviteRegister from './pages/AdminInviteRegister'
import AdminInviteManagement from './pages/AdminInviteManagement'
import EmailVerificationRegister from './pages/EmailVerificationRegister'
import OAuthCallback from './pages/OAuthCallback'
import ResetPassword from './pages/ResetPassword'
import AdminManagement from './pages/AdminManagement'
import UserManagement from './pages/UserManagement'
import AuditLogs from './pages/AuditLogs'
import Dashboard from './pages/Dashboard'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import Subprojects from './pages/Subprojects'
import ParentProjectDetail from './components/ParentProjectDetail'
import Reports from './pages/Reports'
import Suppliers from './pages/Suppliers'
import SupplierDocuments from './pages/SupplierDocuments'
import Settings from './pages/Settings'
import { logout, fetchMe } from './store/slices/authSlice'
import { Sidebar, MobileSidebar } from './components/ui/Sidebar'
import { ThemeProvider } from './contexts/ThemeContext'
import { LoadingOverlay } from './components/ui/Loading'
import { Logo } from './components/ui/Logo'
import { Menu, LogOut, User } from 'lucide-react'
import { cn } from './lib/utils'

function RequireAuth({ children }: { children: JSX.Element }) {
  const dispatch = useDispatch()
  const token = useSelector((s: RootState) => s.auth.token)
  const me = useSelector((s: RootState) => s.auth.me)
  const loading = useSelector((s: RootState) => s.auth.loading)
  const requiresPasswordChange = useSelector((s: RootState) => s.auth.requiresPasswordChange)

  useEffect(() => {
    if (token && !me && !loading) {
      dispatch(fetchMe() as any)
    }
  }, [token, me, loading, dispatch])

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

function AppContent() {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const token = useSelector((s: RootState) => s.auth.token)
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
    // Soft reload to clear any stale state while keeping UX snappy
    navigate('/login', { replace: true })
  }

  // If not authenticated, show auth pages and ensure deep links to dashboard/projects go to login then back
  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
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
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
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
        "flex-1 flex flex-col min-w-0 transition-all duration-300",
        sidebarCollapsed ? "lg:ml-[80px]" : "lg:ml-[280px]"
      )}>
        {/* Top Navigation */}
        <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 lg:px-6 sticky top-0 z-20">
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
                <User className="w-4 h-4 text-gray-600 dark:text-gray-400" />
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
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="max-w-7xl mx-auto"
          >
            <Routes>
              <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
              <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
              <Route path="/projects" element={<RequireAuth><Projects /></RequireAuth>} />
              <Route path="/projects/:id" element={<RequireAuth><ProjectDetail /></RequireAuth>} />
              <Route path="/projects/:id/parent" element={<RequireAuth><ParentProjectDetail /></RequireAuth>} />
              <Route path="/projects/:parentId/subprojects" element={<RequireAuth><Subprojects /></RequireAuth>} />
              <Route path="/reports" element={<RequireAuth><Reports /></RequireAuth>} />
              <Route path="/suppliers" element={<RequireAuth><Suppliers /></RequireAuth>} />
              <Route path="/suppliers/:supplierId/documents" element={<RequireAuth><SupplierDocuments /></RequireAuth>} />
              <Route path="/users" element={<RequireAuth><UserManagement /></RequireAuth>} />
              <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
              <Route path="/audit-logs" element={<RequireAuth><AuditLogs /></RequireAuth>} />
              <Route path="/admin-invites" element={<RequireAuth><AdminInviteManagement /></RequireAuth>} />
              <Route path="/admin-management" element={<RequireAuth><AdminManagement /></RequireAuth>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
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

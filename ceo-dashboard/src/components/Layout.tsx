import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  UserPlus,
  LogOut,
  Building2,
} from 'lucide-react';
import { removeToken } from '../lib/auth';
import api from '../lib/api';
import type { CEOUser } from '../types';

interface LayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'לוח בקרה', icon: <LayoutDashboard size={20} /> },
  { to: '/tenants', label: 'מנהלי פרויקטים', icon: <Users size={20} /> },
  { to: '/tenants/new', label: 'הוסף מנהל', icon: <UserPlus size={20} /> },
];

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState<CEOUser | null>(null);

  useEffect(() => {
    api
      .get<CEOUser>('/auth/me')
      .then((res) => setUser(res.data))
      .catch(() => {
        /* user info is non-critical */
      });
  }, []);

  const handleLogout = () => {
    removeToken();
    navigate('/login');
  };

  const isActive = (path: string): boolean => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col flex-shrink-0">
        {/* Logo */}
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <Building2 size={28} className="text-blue-400" />
            <div>
              <h1 className="text-lg font-bold">BMS CEO</h1>
              <p className="text-xs text-slate-400">ניהול מערכת</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive(item.to)
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {item.icon}
              <span className="text-sm font-medium">{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* User info & Logout */}
        <div className="p-4 border-t border-slate-700">
          {user && (
            <p className="text-xs text-slate-400 mb-3 truncate">{user.email}</p>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <LogOut size={18} />
            <span className="text-sm">התנתק</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-gray-50 p-8">
        {children}
      </main>
    </div>
  );
}

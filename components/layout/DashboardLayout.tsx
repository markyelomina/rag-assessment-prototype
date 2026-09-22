'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { ToastProvider } from '@/components/ui/ToastContext';

type NavItem = 
  | { type: 'link'; href: string; label: string; match: string; exact?: boolean }
  | { type: 'divider'; label: string };

interface DashboardLayoutProps {
  children: React.ReactNode;
  role: 'learner' | 'faculty' | 'admin';
  hideSidebar?: boolean;
}

export default function DashboardLayout({ children, role, hideSidebar = false }: DashboardLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [userName, setUserName] = useState('Loading...');
  const [userEmail, setUserEmail] = useState('Loading...');

  useEffect(() => {
    const fetchUserProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        setUserEmail(user.email ?? 'Email not available');

        const { data: profileData } = await supabase
          .from('Users')
          .select('name')
          .eq('user_id', user.id)
          .single();

        if (profileData) {
          setUserName(`${profileData.name}`);
        }
      } else {
        router.push('/login');
      }
    };

    fetchUserProfile();
  }, [router]);

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  const themeConfig = {
    learner: {
      title: 'RPLE Platform',
      colorText: 'text-blue-400',
      colorBgActive: 'bg-blue-600',
      colorBorder: 'border-blue-500',
      colorBadge: 'bg-blue-900 bg-opacity-50 text-blue-400',
      roleLabel: 'Learner Account',
      nav: [
        { type: 'link', href: '/learner', label: 'Weekly Activity', match: '/learner', exact: true },
        { type: 'link', href: '/learner/exams', label: 'Scheduled Mock Exams', match: '/learner/exams' },
        { type: 'link', href: '/learner/performance', label: 'Historical Performance', match: '/learner/performance' },
        { type: 'link', href: '/learner/roadmap', label: 'PRC Progress Roadmap', match: '/learner/roadmap' },
      ] as NavItem[]
    },
    faculty: {
      title: 'RPLE Platform',
      colorText: 'text-emerald-400',
      colorBgActive: 'bg-blue-600', 
      colorBorder: 'border-emerald-500',
      colorBadge: 'bg-emerald-900 bg-opacity-50 text-emerald-400',
      roleLabel: 'Faculty Account',
      nav: [
        { type: 'link', href: '/faculty', label: 'Dashboard Overview', match: '/faculty', exact: true },
        { type: 'link', href: '/faculty/exams', label: 'Exam Management', match: '/faculty/exams' },
        { type: 'link', href: '/faculty/analytics', label: 'Student Analytics & Grades', match: '/faculty/analytics' },
        { type: 'link', href: '/faculty/materials', label: 'Reference Materials', match: '/faculty/materials' },
      ] as NavItem[]
    },
    admin: {
      title: 'RPLE Admin',
      colorText: 'text-purple-400',
      colorBgActive: 'bg-blue-600',
      colorBorder: 'border-purple-500',
      colorBadge: 'bg-purple-900 bg-opacity-50 text-purple-400',
      roleLabel: 'System Administrator',
      nav: [
        { type: 'link', href: '/admin', label: 'System Overview', match: '/admin', exact: true },
        { type: 'link', href: '/admin/users', label: 'Global User Directory', match: '/admin/users' },
        { type: 'link', href: '/admin/rag', label: 'Knowledge Base', match: '/admin/rag' },
        { type: 'divider', label: 'Access & Structure' },
        { type: 'link', href: '/admin/cohorts', label: 'Cohort Management', match: '/admin/cohorts' },
        { type: 'link', href: '/admin/permissions', label: 'Roles & Permissions', match: '/admin/permissions' },
        { type: 'divider', label: 'Security' },
        { type: 'link', href: '/admin/logs', label: 'System Audit Logs', match: '/admin/logs' },
      ] as NavItem[]
    }
  };

  const currentTheme = themeConfig[role];

  if (hideSidebar) {
    return (
      <ToastProvider>
        <div className="min-h-screen bg-slate-50">{children}</div>
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <div className="min-h-screen bg-slate-50 flex flex-col">
        
        {/* Mobile Header */}
        <div className="md:hidden bg-slate-900 text-white p-4 flex justify-between items-center z-40 relative shadow-md">
          <span className={`font-bold text-lg ${currentTheme.colorText}`}>{currentTheme.title}</span>
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 text-slate-300 hover:text-white focus:outline-none"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isMobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Fixed Sidebar */}
        <aside 
          className={`bg-slate-900 text-white flex flex-col fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-300 overflow-hidden ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
        >
          <div className="w-72 flex flex-col h-full bg-slate-900">
            <div className="p-6 border-b border-slate-800 flex flex-col items-center text-center">
              <div className={`w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center overflow-hidden mb-4 border-2 shadow-lg ${currentTheme.colorBorder}`}>
                <svg className="w-12 h-12 text-slate-400 mt-2" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <h2 className="font-bold text-lg text-white">{userName}</h2>
              <p className="text-xs text-slate-400 mt-1">{userEmail}</p>
              <span className={`mt-3 px-3 py-1 text-[10px] rounded uppercase font-bold tracking-wider ${currentTheme.colorBadge}`}>
                {currentTheme.roleLabel}
              </span>
            </div>

            <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
              {currentTheme.nav.map((item, index) => {
                if (item.type === 'divider') {
                  return (
                    <div key={index} className="pt-4 pb-2">
                      <p className="px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{item.label}</p>
                    </div>
                  );
                }

                const isActive = item.exact 
                  ? pathname === item.match 
                  : pathname.startsWith(item.match);

                return (
                  <Link 
                    key={index}
                    href={item.href}
                    onClick={closeMobileMenu}
                    className={`block w-full text-left px-4 py-3 rounded-lg text-sm font-bold transition-colors ${isActive ? `${currentTheme.colorBgActive} text-white shadow-sm` : 'text-slate-300 hover:bg-slate-800'}`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            
            <div className="p-4 border-t border-slate-800">
              <button 
                onClick={() => router.push('/login')}
                className="w-full text-center bg-slate-800 hover:bg-slate-700 text-xs py-3 rounded-md font-bold transition-colors text-slate-300"
              >
                Sign Out
              </button>
            </div>
          </div>
        </aside>

        {/* Mobile Overlay */}
        {isMobileMenuOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={closeMobileMenu}
          ></div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 flex justify-center w-full md:pl-72 transition-all duration-300">
          <div className="w-full max-w-7xl p-6 md:p-10">
            {children}
          </div>
        </main>

      </div>
    </ToastProvider>
  );
}
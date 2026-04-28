'use client';

import { Inter } from 'next/font/google';
import './globals.css';
import { NotificationProvider } from '@/lib/notifications';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import React, { createContext, useContext, useState, useEffect } from 'react';

const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'] });

/* ─── Role Context ─────────────────────────────────────────────── */
type Role = 'scm_head' | 'supervisor' | 'finance' | 'qc' | 'vendor' | 'gate' | null;
interface RoleCtx { role: Role; setRole: (r: Role) => void; }
export const RoleContext = createContext<RoleCtx>({ role: null, setRole: () => {} });
export const useRole = () => useContext(RoleContext);

/* ─── Sidebar Nav Config ───────────────────────────────────────── */
const NAV_SECTIONS = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', label: 'Control Tower', icon: IconTower, roles: ['scm_head', 'supervisor', 'finance'] },
      { href: '/dock-queue', label: 'Dock Queue', icon: IconDock, roles: ['scm_head', 'supervisor', 'gate'] },
      { href: '/gate-entry', label: 'Gate Entry', icon: IconGate, roles: ['scm_head', 'supervisor', 'gate'] },
    ],
  },
  {
    label: 'Inbound Ops',
    items: [
      { href: '/receiving', label: 'Receiving & QC', icon: IconScan, roles: ['scm_head', 'supervisor', 'qc'] },
      { href: '/discrepancy', label: 'Discrepancy', icon: IconDiscrepancy, roles: ['scm_head', 'supervisor', 'qc', 'finance'] },
      { href: '/exceptions', label: 'Exception Queue', icon: IconAlert, roles: ['scm_head', 'supervisor', 'finance'] },
      { href: '/alerts', label: 'Alert Center', icon: IconBell, roles: ['scm_head', 'supervisor', 'finance'] },
    ],
  },
  {
    label: 'Data & Visibility',
    items: [
      { href: '/inventory', label: 'Inventory Ledger', icon: IconInventory, roles: ['scm_head', 'supervisor', 'finance'] },
      { href: '/master-data', label: 'Master Data', icon: IconDatabase, roles: ['scm_head'] },
      { href: '/vendor-scorecard', label: 'Vendor Scorecard', icon: IconScore, roles: ['scm_head', 'finance', 'vendor'] },
    ],
  },
  {
    label: 'Vendor Portal',
    items: [
      { href: '/shipments/new', label: 'New ASN', icon: IconShipment, roles: ['scm_head', 'vendor'] },
      { href: '/appointments', label: 'Appointments', icon: IconCalendar, roles: ['scm_head', 'vendor', 'gate'] },
      { href: '/compliance', label: 'Compliance', icon: IconDoc, roles: ['scm_head', 'vendor'] },
    ],
  },
];

/* ─── SVG Icons ────────────────────────────────────────────────── */
function IconTower({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.5h14M5 10h10M7 6.5h6M10 3v3.5M10 10v3.5M10 16.5V20" />
    </svg>
  );
}
function IconDock({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <rect x="2" y="10" width="16" height="8" rx="1" />
      <path strokeLinecap="round" d="M6 10V6M14 10V6M4 6h12" />
    </svg>
  );
}
function IconGate({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" d="M3 17V5l7-3 7 3v12M10 17V11M7 9h2M11 9h2M7 13h2M11 13h2" />
    </svg>
  );
}
function IconAlert({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 3L2 17h16L10 3zm0 5v4m0 3h.01" />
    </svg>
  );
}
function IconBell({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" d="M10 2a6 6 0 016 6c0 3 1 5 2 6H2c1-1 2-3 2-6a6 6 0 016-6zM8 18a2 2 0 004 0" />
    </svg>
  );
}
function IconInventory({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <rect x="2" y="2" width="7" height="7" rx="1" />
      <rect x="11" y="2" width="7" height="7" rx="1" />
      <rect x="2" y="11" width="7" height="7" rx="1" />
      <rect x="11" y="11" width="7" height="7" rx="1" />
    </svg>
  );
}
function IconScore({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" d="M10 2L12.5 7.5H18L13.5 11L15.5 17L10 13.5L4.5 17L6.5 11L2 7.5H7.5L10 2z" />
    </svg>
  );
}
function IconShipment({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" d="M2 7h11M2 11h8M2 15h5M13 7l4 4-4 4M17 11H9" />
    </svg>
  );
}
function IconCalendar({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <rect x="2" y="4" width="16" height="14" rx="2" />
      <path strokeLinecap="round" d="M6 2v4M14 2v4M2 10h16" />
    </svg>
  );
}
function IconDoc({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" d="M12 2H5a1 1 0 00-1 1v14a1 1 0 001 1h10a1 1 0 001-1V6l-4-4zm0 0v4h4M7 10h6M7 13h4" />
    </svg>
  );
}
function IconScan({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <rect x="2" y="4" width="5" height="12" rx="1" />
      <rect x="9" y="4" width="2" height="12" rx="0.5" />
      <rect x="13" y="4" width="3" height="12" rx="1" />
      <rect x="17" y="4" width="2" height="12" rx="0.5" />
    </svg>
  );
}
function IconDiscrepancy({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 3L2 17h16L10 3zm0 5v4m0 3h.01" />
      <path strokeLinecap="round" d="M7 7h6" />
    </svg>
  );
}
function IconDatabase({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <ellipse cx="10" cy="5" rx="7" ry="2.5" />
      <path strokeLinecap="round" d="M3 5v5c0 1.38 3.13 2.5 7 2.5S17 11.38 17 10V5" />
      <path strokeLinecap="round" d="M3 10v5c0 1.38 3.13 2.5 7 2.5S17 16.38 17 15v-5" />
    </svg>
  );
}
function IconLogout({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" d="M13 3h4a1 1 0 011 1v12a1 1 0 01-1 1h-4M9 14l4-4-4-4M3 10h10" />
    </svg>
  );
}

/* ─── Role Label Map ─────────────────────────────────────────────*/
const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  scm_head:   { label: 'SCM Head',        color: 'text-[#00ff88]' },
  supervisor: { label: 'Inbound Supvr',   color: 'text-[#3b82f6]' },
  finance:    { label: 'Finance User',     color: 'text-[#f59e0b]' },
  qc:         { label: 'QC Associate',     color: 'text-[#a78bfa]' },
  vendor:     { label: 'Vendor User',      color: 'text-[#22c55e]' },
  gate:       { label: 'Gate Staff',       color: 'text-[#94a3b8]' },
};

/* ─── Sidebar Component ────────────────────────────────────────── */
function Sidebar({ role, onLogout, onLinkClick }: { role: Role; onLogout: () => void; onLinkClick?: () => void }) {
  const pathname = usePathname();
  const [time, setTime] = useState('');

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const roleInfo = role ? ROLE_LABELS[role] : null;

  return (
    <aside
      style={{ width: 'var(--sidebar-width)', minWidth: 'var(--sidebar-width)' }}
      className="h-screen flex flex-col bg-[#060818] border-r border-white/[0.06] overflow-y-auto overflow-x-hidden sticky top-0"
    >
      {/* Logo */}
      <div className="px-4 pt-5 pb-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 bg-[#00ff88] rounded-lg rotate-12 flex-shrink-0 shadow-[0_0_15px_rgba(0,255,136,0.4)]" />
          <span className="text-sm font-bold tracking-tight glow-text">SUMOSAVE</span>
        </div>
        {/* SAP / Live status */}
        <div className="flex items-center gap-2 text-[10px] text-white/30">
          <span className="flex items-center gap-1">
            <span className="live-dot" />
            <span className="text-[#00ff88]/60">WMS Live</span>
          </span>
          <span className="text-white/10">·</span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3b82f6]" />
            <span>SAP Synced</span>
          </span>
        </div>
        <div className="text-[10px] text-white/20 mt-1 font-mono">{time}</div>
      </div>

      {/* Nav sections */}
      <nav className="flex-1 py-3 px-2 space-y-0.5">
        {NAV_SECTIONS.map(section => {
          const visibleItems = section.items.filter(item => 
            !item.roles || (role && item.roles.includes(role))
          );
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.label}>
              <div className="sidebar-section">{section.label}</div>
              {visibleItems.map(item => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onLinkClick}
                    className={`sidebar-item ${active ? 'sidebar-item-active' : ''}`}
                  >
                    <item.icon className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{item.label}</span>
                    {active && (
                      <span className="ml-auto w-1 h-1 rounded-full bg-[#00ff88]" />
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* User / Role footer */}
      <div className="border-t border-white/[0.06] p-3">
        {roleInfo && (
          <div className="flex items-center gap-2 px-1 py-2 mb-2">
            <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold flex-shrink-0">
              {roleInfo.label.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className={`text-xs font-semibold truncate ${roleInfo.color}`}>{roleInfo.label}</p>
              <p className="text-[10px] text-white/25">DC-Bangalore</p>
            </div>
          </div>
        )}
        <button
          onClick={onLogout}
          className="sidebar-item w-full text-red-400/60 hover:text-red-400 hover:bg-red-500/5"
        >
          <IconLogout className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}

/* ─── Top Bar ──────────────────────────────────────────────────── */
function TopBar({ onMenuClick }: { onMenuClick: () => void }) {
  const pathname = usePathname();

  const crumb = (() => {
    const map: Record<string, string> = {
      '/dashboard': 'Control Tower',
      '/dock-queue': 'Dock Queue',
      '/gate-entry': 'Gate Entry',
      '/receiving': 'Receiving & QC',
      '/discrepancy': 'Discrepancy',
      '/exceptions': 'Exception Queue',
      '/alerts': 'Alert Center',
      '/inventory': 'Inventory Ledger',
      '/master-data': 'Master Data',
      '/vendor-scorecard': 'Vendor Scorecard',
      '/shipments/new': 'New ASN',
      '/appointments': 'Appointments',
      '/compliance': 'Compliance',
    };
    return map[pathname] || 'Dashboard';
  })();

  return (
    <header className="h-12 border-b border-white/[0.06] bg-[#060818]/80 backdrop-blur-md flex items-center justify-between px-3 md:px-5 sticky top-0 z-40">
      <div className="flex items-center gap-2 text-sm">
        <button onClick={onMenuClick} className="p-1.5 -ml-1.5 mr-1 lg:hidden text-white/60 hover:text-white hover:bg-white/5 rounded-md transition-colors">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <span className="text-white/25 text-xs hidden sm:inline">WMS</span>
        <span className="text-white/15 hidden sm:inline">/</span>
        <span className="text-white/75 text-xs font-medium truncate max-w-[120px] sm:max-w-none">{crumb}</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-1.5 text-[10px] bg-green-500/10 border border-green-500/20 text-green-400 px-2 py-1 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          All Systems Operational
        </div>
        <Link href="/alerts" className="relative p-1.5 rounded-md text-white/40 hover:text-white hover:bg-white/5 transition-colors">
          <IconBell className="w-4 h-4" />
          <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-[#ef4444] border border-[#060818]" />
        </Link>
      </div>
    </header>
  );
}

/* ─── Root Layout ──────────────────────────────────────────────── */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Initialise role from sessionStorage so sidebar survives page refresh
  const [role, setRoleState] = useState<Role>(null);
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // Rehydrate role from sessionStorage on first render
  useEffect(() => {
    const stored = sessionStorage.getItem('wms_role_id') as Role | null;
    if (stored) setRoleState(stored);
    setMounted(true);
  }, []);

  // Persist role whenever it changes
  const setRole = (r: Role) => {
    setRoleState(r);
    if (r) {
      sessionStorage.setItem('wms_role_id', r);
    } else {
      sessionStorage.removeItem('wms_role_id');
    }
  };

  const isAuthPage = pathname === '/' || pathname === '/onboarding';

  const handleLogout = () => {
    setRole(null);
    // Clear all WMS session data
    ['wms_token', 'wms_user_id', 'wms_dc_id', 'wms_roles', 'wms_role_id'].forEach(
      k => sessionStorage.removeItem(k)
    );
    router.push('/');
  };

  return (
    <html lang="en">
      <head>
        <title>SumoSave WMS — Warehouse Management System</title>
        <meta name="description" content="SumoSave Phase 1 Warehouse Management System — Inbound Supply Chain Operations" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body className={inter.className}>
        <RoleContext.Provider value={{ role, setRole }}>
          <NotificationProvider>
            {isAuthPage ? (
              <main className="min-h-screen">{children}</main>
            ) : (
              <div className="flex h-screen overflow-hidden relative">
                {/* Mobile Overlay */}
                {mobileMenuOpen && (
                  <div 
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
                    onClick={() => setMobileMenuOpen(false)}
                  />
                )}
                
                {/* Sidebar Wrapper */}
                <div className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                  <Sidebar role={role} onLogout={handleLogout} onLinkClick={() => setMobileMenuOpen(false)} />
                </div>

                <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                  <TopBar onMenuClick={() => setMobileMenuOpen(true)} />
                  <main className="flex-1 overflow-y-auto overflow-x-hidden bg-[#060818]">
                    {children}
                  </main>
                </div>
              </div>
            )}
          </NotificationProvider>
        </RoleContext.Provider>
      </body>
    </html>
  );
}

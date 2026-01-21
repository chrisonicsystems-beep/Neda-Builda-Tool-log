
import React from 'react';
import { 
  ClipboardList, 
  User, 
  ShieldCheck, 
  Sparkles, 
  LogOut,
  RefreshCcw
} from 'lucide-react';
import { View, UserRole } from '../types';

export const LOGO_URL = "https://lirp.cdn-website.com/f1362e52/dms3rep/multi/opt/png_Primary-logo-navy-wording--no-bg-04029866-296w.png";

export const NedaLogo: React.FC<{ size?: number; className?: string }> = ({ size = 40, className = "" }) => (
  <img 
    src={LOGO_URL}
    alt="Neda Builda"
    style={{ height: size, width: 'auto' }}
    className={`object-contain ${className}`}
  />
);

interface LayoutProps {
  activeView: View;
  setView: (view: View) => void;
  userRole: UserRole;
  onLogout: () => void;
  onRefresh?: () => void;
  isSyncing?: boolean;
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ activeView, setView, userRole, onLogout, onRefresh, isSyncing, children }) => {
  const canSeeDashboard = userRole === UserRole.ADMIN || userRole === UserRole.MANAGER;

  return (
    <div className="flex flex-col min-h-screen max-w-md mx-auto bg-white shadow-xl relative">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-slate-100 px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="flex items-center">
             <NedaLogo size={32} />
          </div>
          <div className="flex flex-col border-l border-slate-200 pl-3">
            <h1 className="font-extrabold text-neda-navy tracking-tight leading-none text-base">Neda Tool</h1>
            <span className="text-[6px] font-bold text-slate-400 uppercase tracking-widest leading-tight mt-0.5">Powered by <span className="text-neda-orange font-black">Chrisonic Systems</span></span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {onRefresh && (
            <button 
              onClick={onRefresh}
              className={`p-2 transition-all rounded-xl ${isSyncing ? 'text-neda-orange' : 'text-slate-400 hover:text-neda-navy'}`}
              disabled={isSyncing}
            >
              <RefreshCcw size={18} className={isSyncing ? 'animate-spin' : ''} />
            </button>
          )}
          <button 
            onClick={onLogout}
            className="p-2 text-slate-400 hover:text-red-500 transition-colors"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 pb-24 overflow-y-auto px-4 py-6">
        {children}
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-slate-100 px-6 py-3 flex justify-between items-center z-30 shadow-[0_-4px_12px_rgba(20,41,72,0.06)]">
        <NavItem 
          icon={<ClipboardList size={22} />} 
          label="Inventory" 
          active={activeView === 'INVENTORY'} 
          onClick={() => setView('INVENTORY')} 
        />
        <NavItem 
          icon={<User size={22} />} 
          label="My Kit" 
          active={activeView === 'MY_TOOLS'} 
          onClick={() => setView('MY_TOOLS')} 
        />
        {canSeeDashboard && (
          <NavItem 
            icon={<ShieldCheck size={22} />} 
            label={userRole === UserRole.ADMIN ? "Admin" : "Manager"} 
            active={activeView === 'ADMIN_DASHBOARD'} 
            onClick={() => setView('ADMIN_DASHBOARD')} 
          />
        )}
        <NavItem 
          icon={<Sparkles size={22} />} 
          label="Pulse-AI" 
          active={activeView === 'AI_ASSISTANT'} 
          onClick={() => setView('AI_ASSISTANT')} 
        />
      </nav>
    </div>
  );
};

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ icon, label, active, onClick }) => (
  <button 
    onClick={onClick}
    className={`flex flex-col items-center gap-1 transition-all ${
      active ? 'text-neda-orange scale-105' : 'text-slate-400'
    }`}
  >
    {icon}
    <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
  </button>
);

export default Layout;

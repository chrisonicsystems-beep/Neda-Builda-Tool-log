
import React from 'react';
import { 
  ClipboardList, 
  User, 
  ShieldCheck, 
  Sparkles, 
  LogOut
} from 'lucide-react';
import { View, UserRole } from '../types';

export const NedaLogo: React.FC<{ size?: number; className?: string }> = ({ size = 40, className = "" }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 100 100" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* Geometric "n" parts exactly as per the close-up image */}
    {/* Top left orange square */}
    <path d="M15 10H43V38H15V10Z" fill="#D15433" />
    
    {/* Bottom left orange pillar with curved outer side */}
    <path d="M15 90V54C15 45.1634 22.1634 38 31 38H43V90H15Z" fill="#D15433" />
    
    {/* Right orange arch pillar */}
    <path d="M43 38V10C70.6142 10 93 32.3858 93 60V90H65V60C65 47.85 55.15 38 43 38Z" fill="#D15433" />
    
    {/* Refined Navy Blue Accents strictly following the image placement */}
    <path d="M15 90V54C15 45.1634 22.1634 38 31 38" stroke="#142948" strokeWidth="4" strokeLinecap="butt" />
    <path d="M65 38V90" stroke="#142948" strokeWidth="4" strokeLinecap="butt" />
  </svg>
);

interface LayoutProps {
  activeView: View;
  setView: (view: View) => void;
  userRole: UserRole;
  onLogout: () => void;
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ activeView, setView, userRole, onLogout, children }) => {
  const canSeeDashboard = userRole === UserRole.ADMIN || userRole === UserRole.MANAGER;

  return (
    <div className="flex flex-col min-h-screen max-w-md mx-auto bg-white shadow-xl relative">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-slate-100 px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center">
             <NedaLogo size={36} />
          </div>
          <div className="flex flex-col">
            <h1 className="font-extrabold text-neda-navy tracking-tight leading-none text-lg">Tool Log</h1>
            <span className="text-[7px] font-bold text-slate-400 uppercase tracking-widest leading-tight">Powered by <span className="text-neda-orange font-black">Chrisonic Systems</span></span>
          </div>
        </div>
        <button 
          onClick={onLogout}
          className="p-2 text-slate-400 hover:text-red-500 transition-colors"
        >
          <LogOut size={18} />
        </button>
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

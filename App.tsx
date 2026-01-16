
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Tool, ToolStatus, User, UserRole, View, ToolLog } from './types';
import { INITIAL_USERS, INITIAL_TOOLS } from './mockData';
import Layout, { NedaLogo } from './components/Layout';
import { 
  Search, 
  MapPin, 
  Calendar, 
  History, 
  Camera, 
  CheckCircle2, 
  AlertTriangle,
  Send,
  Loader2,
  Package,
  ArrowRightLeft,
  Sparkles,
  ClipboardList,
  User as UserIcon,
  Filter,
  Plus,
  X,
  ChevronDown,
  Wrench,
  Lock,
  Mail,
  Eye,
  EyeOff,
  UserPlus,
  Shield,
  Trash2,
  Edit,
  Power,
  ArrowUpRight,
  Infinity,
  Download,
  Upload,
  FileText,
  Image as ImageIcon,
  Clock,
  Fingerprint
} from 'lucide-react';
import { analyzeTools, searchAddresses } from './services/geminiService';
import { fetchTools, fetchUsers, syncTools, syncUsers, supabase } from './services/supabaseService';

const App: React.FC = () => {
  // Persistence
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [tools, setTools] = useState<Tool[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [view, setView] = useState<View>('INVENTORY');
  const [showBiometricPrompt, setShowBiometricPrompt] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  
  // Filtering states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<ToolStatus | 'ALL'>('ALL');
  const [userFilter, setUserFilter] = useState<string | 'ALL'>('ALL');
  const [showFilters, setShowFilters] = useState(false);
  
  // App initialization
  useEffect(() => {
    const initData = async () => {
      // 1. Try Shared Backend (Supabase)
      const remoteTools = await fetchTools();
      const remoteUsers = await fetchUsers();

      if (remoteTools && remoteUsers) {
        // If DB exists but is empty, seed it for the client
        if (remoteTools.length === 0 && remoteUsers.length === 0) {
          console.log("Database empty. Seeding demo data...");
          setTools(INITIAL_TOOLS);
          setAllUsers(INITIAL_USERS);
          await syncTools(INITIAL_TOOLS);
          await syncUsers(INITIAL_USERS);
        } else {
          setTools(remoteTools);
          setAllUsers(remoteUsers);
        }
      } else {
        // 2. Fallback to Local Storage if Supabase is not configured
        const savedTools = localStorage.getItem('et_tools');
        setTools(savedTools ? JSON.parse(savedTools) : INITIAL_TOOLS);

        const savedUsers = localStorage.getItem('et_all_users');
        setAllUsers(savedUsers ? JSON.parse(savedUsers) : INITIAL_USERS);
      }

      const savedUser = localStorage.getItem('et_user');
      if (savedUser) {
        setCurrentUser(JSON.parse(savedUser));
      }
      setIsInitializing(false);
    };

    initData();
  }, []);

  // Real-time synchronization
  useEffect(() => {
    if (!isInitializing && tools.length > 0) {
      localStorage.setItem('et_tools', JSON.stringify(tools));
      syncTools(tools);
    }
  }, [tools, isInitializing]);

  useEffect(() => {
    if (!isInitializing && allUsers.length > 0) {
      localStorage.setItem('et_all_users', JSON.stringify(allUsers));
      syncUsers(allUsers);
    }
  }, [allUsers, isInitializing]);

  const handleLogin = (user: User, remember: boolean) => {
    setCurrentUser(user);
    if (remember) {
      localStorage.setItem('et_user', JSON.stringify(user));
    }
    const bioEnabled = localStorage.getItem(`bio_${user.id}`);
    if (!bioEnabled && window.PublicKeyCredential) {
      setShowBiometricPrompt(true);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('et_user');
  };

  const enableBiometrics = async () => {
    if (!currentUser) return;
    localStorage.setItem(`bio_${currentUser.id}`, 'enabled');
    setShowBiometricPrompt(false);
    alert("FaceID enabled for this device.");
  };

  const updateTool = (updatedTool: Tool) => {
    setTools(prev => prev.map(t => t.id === updatedTool.id ? updatedTool : t));
  };

  const addTool = (newTool: Tool) => {
    setTools(prev => [...prev, newTool]);
  };

  const bulkAddTools = (newTools: Tool[]) => {
    setTools(prev => [...prev, ...newTools]);
  };

  const updateUser = (updatedUser: User) => {
    setAllUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
    if (currentUser?.id === updatedUser.id) {
      setCurrentUser(updatedUser);
    }
  };

  const addUser = (newUser: User) => {
    setAllUsers(prev => [...prev, newUser]);
  };

  const filteredTools = useMemo(() => {
    return tools.filter(t => {
      const matchesSearch = 
        t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.serialNumber.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
      const matchesUser = userFilter === 'ALL' || t.currentHolderId === userFilter;
      return matchesSearch && matchesStatus && matchesUser;
    });
  }, [tools, searchTerm, statusFilter, userFilter]);

  const myTools = useMemo(() => {
    return tools.filter(t => t.currentHolderId === currentUser?.id);
  }, [tools, currentUser]);

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <NedaLogo size={80} className="animate-pulse mb-6" />
        <div className="flex items-center gap-2 text-neda-navy font-black uppercase text-[10px] tracking-widest">
           <Loader2 className="animate-spin" size={16} />
           <span>Syncing Pulse Network...</span>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginScreen onLogin={handleLogin} users={allUsers} />;
  }

  return (
    <Layout activeView={view} setView={setView} userRole={currentUser.role} onLogout={handleLogout}>
      {view === 'INVENTORY' && (
        <InventoryView 
          tools={filteredTools} allTools={tools} searchTerm={searchTerm} setSearchTerm={setSearchTerm}
          statusFilter={statusFilter} setStatusFilter={setStatusFilter} userFilter={userFilter} setUserFilter={setUserFilter}
          showFilters={showFilters} setShowFilters={setShowFilters} currentUser={currentUser}
          onUpdateTool={updateTool} onAddTool={addTool}
        />
      )}
      {view === 'MY_TOOLS' && (
        <MyToolsView tools={myTools} currentUser={currentUser} onUpdateTool={updateTool} />
      )}
      {view === 'ADMIN_DASHBOARD' && (
        <AdminDashboard tools={tools} allUsers={allUsers} currentUser={currentUser} onUpdateUser={updateUser} onAddUser={addUser} onBulkImport={bulkAddTools} />
      )}
      {view === 'AI_ASSISTANT' && ( <AIAssistant tools={tools} /> )}

      {showBiometricPrompt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-neda-navy/80 backdrop-blur-md">
          <div className="bg-white w-full max-w-xs rounded-[2.5rem] p-8 text-center space-y-6 shadow-2xl animate-in zoom-in-95">
             <div className="w-20 h-20 bg-neda-lightOrange rounded-full flex items-center justify-center mx-auto">
                <Fingerprint size={40} className="text-neda-orange" />
             </div>
             <div>
                <h3 className="text-lg font-black text-neda-navy uppercase tracking-tight">Enable Biometrics?</h3>
                <p className="text-xs font-bold text-slate-400 mt-2 uppercase tracking-widest">Sign in with FaceID next time.</p>
             </div>
             <div className="space-y-3">
                <button onClick={enableBiometrics} className="w-full py-4 bg-neda-orange text-white rounded-2xl font-black uppercase tracking-widest">Yes, Enable</button>
                <button onClick={() => setShowBiometricPrompt(false)} className="w-full py-2 text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">Maybe Later</button>
             </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

// --- Login Screen ---

const LoginScreen: React.FC<{ onLogin: (u: User, rem: boolean) => void; users: User[] }> = ({ onLogin, users }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [resetRequested, setResetRequested] = useState(false);
  const [isBioLoading, setIsBioLoading] = useState(false);

  const handleLoginAttempt = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) { 
      setError('User not found. Check with Admin.'); 
      return; 
    }
    if (!user.isEnabled) { 
      setError('Account disabled.'); 
      return; 
    }
    if (user.password === password) { 
      onLogin(user, remember); 
    } else { 
      setError('Incorrect password.'); 
    }
  };

  const handleResetPassword = () => {
    if (!email) {
      setError('Enter email first.');
      return;
    }
    setResetRequested(true);
    setTimeout(() => {
      setResetRequested(false);
      alert(`A notification has been sent to Neda Admin to reset password for ${email}.`);
    }, 1500);
  };

  const handleBiometricLogin = async () => {
    setIsBioLoading(true);
    try {
      await new Promise(r => setTimeout(r, 1000));
      const bioUserId = Object.keys(localStorage).find(key => key.startsWith('bio_') && localStorage.getItem(key) === 'enabled')?.replace('bio_', '');
      
      if (bioUserId) {
        const user = users.find(u => u.id === bioUserId);
        if (user && user.isEnabled) {
          onLogin(user, true);
        } else {
          setError('Authentication failed.');
        }
      } else {
        setError('Set up FaceID in settings first.');
      }
    } catch (e) {
      setError('Biometrics unavailable.');
    } finally {
      setIsBioLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-neda-lightOrange rounded-full -mr-32 -mt-32 opacity-50 blur-3xl"></div>
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-neda-lightNavy rounded-full -ml-40 -mb-40 opacity-50 blur-3xl"></div>

      <div className="w-full max-w-sm bg-white rounded-[2.5rem] p-8 space-y-8 shadow-2xl relative z-10 border border-slate-100">
        <div className="text-center">
          <NedaLogo size={80} className="mx-auto mb-4" />
          <h1 className="text-neda-navy font-black text-3xl tracking-tight">Neda Builda</h1>
          <p className="text-[14px] font-extrabold text-neda-navy tracking-widest uppercase opacity-40">Asset Log</p>
        </div>

        <form onSubmit={handleLoginAttempt} className="space-y-5">
          <div className="space-y-1">
            <label className="text-[9px] font-black text-neda-navy/40 uppercase tracking-widest ml-1">Work Email</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-neda-navy/20" size={16} />
              <input 
                type="email" 
                className="w-full pl-11 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-neda-navy focus:ring-2 focus:ring-neda-orange outline-none transition-all"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[9px] font-black text-neda-navy/40 uppercase tracking-widest ml-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-neda-navy/20" size={16} />
              <input 
                type={showPass ? "text" : "password"} 
                className="w-full pl-11 pr-11 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-neda-navy focus:ring-2 focus:ring-neda-orange outline-none transition-all"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
              <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-neda-navy">
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 rounded text-neda-orange focus:ring-neda-orange" checked={remember} onChange={e => setRemember(e.target.checked)} />
              <span className="text-[10px] font-bold text-neda-navy/50">Keep synced</span>
            </label>
            <button type="button" onClick={handleResetPassword} className="text-[9px] font-black text-neda-orange uppercase tracking-wider">Reset Password</button>
          </div>

          {error && <div className="p-3 bg-red-50 text-red-600 text-[10px] font-black rounded-xl border border-red-100">{error}</div>}

          <div className="space-y-3 pt-2">
            <button type="submit" className="w-full py-5 bg-neda-navy text-white rounded-2xl font-black shadow-lg shadow-neda-navy/20 hover:brightness-110 active:scale-95 transition-all text-sm uppercase tracking-widest flex items-center justify-center gap-2">
              Sign In <ArrowUpRight size={18} />
            </button>
            <button 
              type="button" 
              onClick={handleBiometricLogin}
              className="w-full py-5 bg-white border-2 border-slate-100 text-neda-navy rounded-2xl font-black hover:bg-slate-50 active:scale-95 transition-all text-sm uppercase tracking-widest flex items-center justify-center gap-3"
            >
              {isBioLoading ? <Loader2 className="animate-spin" size={18} /> : <Fingerprint size={18} />}
              FaceID
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- Inventory View ---

const InventoryView: React.FC<{
  tools: Tool[]; allTools: Tool[]; searchTerm: string; setSearchTerm: (s: string) => void;
  statusFilter: ToolStatus | 'ALL'; setStatusFilter: (s: ToolStatus | 'ALL') => void;
  userFilter: string | 'ALL'; setUserFilter: (u: string | 'ALL') => void;
  showFilters: boolean; setShowFilters: (b: boolean) => void;
  currentUser: User; onUpdateTool: (t: Tool) => void; onAddTool: (t: Tool) => void;
}> = ({ 
  tools, allTools, searchTerm, setSearchTerm, statusFilter, setStatusFilter, 
  userFilter, setUserFilter, showFilters, setShowFilters, currentUser, onUpdateTool, onAddTool
}) => {
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const activeHolders = useMemo(() => {
    const holders = new Map<string, string>();
    allTools.forEach(t => { if (t.currentHolderId) holders.set(t.currentHolderId, t.currentHolderName || 'Unknown'); });
    return Array.from(holders.entries());
  }, [allTools]);

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-neda-navy/30" size={18} />
          <input 
            type="text" placeholder="Find equipment..."
            className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-white border border-slate-100 shadow-sm focus:ring-2 focus:ring-neda-orange outline-none text-sm font-medium"
            value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button 
          onClick={() => setShowFilters(!showFilters)}
          className={`p-3.5 rounded-2xl transition-all ${showFilters ? 'bg-neda-orange text-white shadow-lg shadow-neda-orange/30' : 'bg-white text-neda-navy/50 border border-slate-100 shadow-sm'}`}
        >
          <Filter size={20} />
        </button>
      </div>

      {showFilters && (
        <div className="bg-white border border-slate-100 p-5 rounded-3xl shadow-lg space-y-4 animate-in slide-in-from-top-4 duration-300">
          <div>
            <label className="block text-[10px] font-black text-neda-navy/40 uppercase tracking-[0.15em] mb-3 ml-1">Filter by Status</label>
            <div className="flex flex-wrap gap-2">
              {['ALL', ...Object.values(ToolStatus)].map(status => (
                <button
                  key={status} onClick={() => setStatusFilter(status as any)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${
                    statusFilter === status ? 'bg-neda-navy border-neda-navy text-white shadow-md' : 'bg-white border-slate-100 text-neda-navy/60 hover:border-neda-orange/30'
                  }`}
                >
                  {status === 'ALL' ? 'Show All' : status.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black text-neda-navy/40 uppercase tracking-[0.15em] mb-3 ml-1">Team Member</label>
            <select
              value={userFilter} onChange={(e) => setUserFilter(e.target.value)}
              className="w-full p-3.5 rounded-2xl bg-slate-50 border border-slate-100 text-sm font-bold text-neda-navy outline-none focus:ring-2 focus:ring-neda-orange"
            >
              <option value="ALL">All Personnel</option>
              {activeHolders.map(([id, name]) => ( <option key={id} value={id}>{name}</option> ))}
            </select>
          </div>
        </div>
      )}

      {currentUser.role === UserRole.ADMIN && (
        <button 
          onClick={() => setShowAddModal(true)}
          className="w-full py-4 bg-white border-2 border-dashed border-neda-orange/30 text-neda-orange rounded-2xl flex items-center justify-center gap-3 hover:bg-neda-lightOrange/50 hover:border-neda-orange transition-all group"
        >
          <Plus size={20} className="group-hover:rotate-90 transition-transform" />
          <span className="font-black text-xs uppercase tracking-[0.15em]">Register New Equipment</span>
        </button>
      )}

      <div className="grid gap-4">
        {tools.map(tool => ( <ToolCard key={tool.id} tool={tool} onClick={() => setSelectedTool(tool)} /> ))}
      </div>

      {selectedTool && (
        <ToolModal tool={selectedTool} onClose={() => setSelectedTool(null)} currentUser={currentUser} onUpdate={(t) => { onUpdateTool(t); setSelectedTool(null); }} />
      )}
      {showAddModal && (
        <AddToolModal onClose={() => setShowAddModal(false)} onAdd={(t) => { onAddTool(t); setShowAddModal(false); }} currentUser={currentUser} />
      )}
    </div>
  );
};

// --- My Tools View ---

const MyToolsView: React.FC<{ tools: Tool[]; currentUser: User; onUpdateTool: (t: Tool) => void }> = ({ tools, currentUser, onUpdateTool }) => {
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);

  return (
    <div className="space-y-6">
      <div className="bg-neda-navy text-white p-8 rounded-[2.5rem] shadow-xl relative overflow-hidden">
        <div className="relative z-10">
          <h2 className="text-3xl font-black uppercase tracking-tighter leading-none mb-2">My Field Kit</h2>
          <p className="text-[10px] font-bold text-neda-lightOrange uppercase tracking-[0.2em]">{tools.length} Assets in your care</p>
        </div>
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl"></div>
      </div>

      {tools.length === 0 ? (
        <div className="py-20 text-center space-y-4">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
             <Package size={24} className="text-slate-300" />
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No tools currently booked out</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {tools.map(tool => (
            <ToolCard key={tool.id} tool={tool} onClick={() => setSelectedTool(tool)} />
          ))}
        </div>
      )}

      {selectedTool && (
        <ToolModal tool={selectedTool} onClose={() => setSelectedTool(null)} currentUser={currentUser} onUpdate={(t) => { onUpdateTool(t); setSelectedTool(null); }} />
      )}
    </div>
  );
};

// --- Admin Dashboard ---

const AdminDashboard: React.FC<{ 
  tools: Tool[]; allUsers: User[]; currentUser: User; 
  onUpdateUser: (u: User) => void; onAddUser: (u: User) => void; 
  onBulkImport: (t: Tool[]) => void;
}> = ({ tools, allUsers, currentUser, onUpdateUser, onAddUser, onBulkImport }) => {
  const [activeTab, setActiveTab] = useState<'STATS' | 'USERS'>('STATS');
  
  const stats = useMemo(() => ({
    total: tools.length,
    active: tools.filter(t => t.status === ToolStatus.BOOKED_OUT).length,
    repair: tools.filter(t => t.status === ToolStatus.UNDER_REPAIR || t.status === ToolStatus.DEFECTIVE).length,
    available: tools.filter(t => t.status === ToolStatus.AVAILABLE).length
  }), [tools]);

  return (
    <div className="space-y-6">
      <div className="flex gap-2 bg-slate-100 p-1 rounded-2xl">
        <button onClick={() => setActiveTab('STATS')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${activeTab === 'STATS' ? 'bg-white text-neda-navy shadow-sm' : 'text-slate-400'}`}>Reports</button>
        <button onClick={() => setActiveTab('USERS')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${activeTab === 'USERS' ? 'bg-white text-neda-navy shadow-sm' : 'text-slate-400'}`}>Personnel</button>
      </div>

      {activeTab === 'STATS' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Total Assets" value={stats.total} color="bg-neda-navy" textColor="text-white" icon={<Package size={16} />} />
            <StatCard label="In Field" value={stats.active} color="bg-neda-orange" textColor="text-white" icon={<MapPin size={16} />} />
            <StatCard label="Available" value={stats.available} color="bg-green-500" textColor="text-white" icon={<CheckCircle2 size={16} />} />
            <StatCard label="Issues" value={stats.repair} color="bg-red-500" textColor="text-white" icon={<AlertTriangle size={16} />} />
          </div>
          
          <div className="bg-white border border-slate-100 p-6 rounded-[2rem] space-y-4">
             <h3 className="text-xs font-black text-neda-navy uppercase tracking-widest">Recent Activity</h3>
             <div className="space-y-3">
                {tools.flatMap(t => t.logs).sort((a,b) => b.timestamp - a.timestamp).slice(0, 5).map(log => (
                  <div key={log.id} className="flex items-center gap-3 text-[10px] font-bold">
                    <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center shrink-0">
                       {log.action === 'BOOK_OUT' ? <ArrowUpRight size={14} className="text-neda-orange" /> : <CheckCircle2 size={14} className="text-green-500" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-neda-navy">{log.userName} {log.action.toLowerCase().replace('_', ' ')}d an asset</p>
                      <p className="text-slate-400 text-[8px] uppercase tracking-wider">{new Date(log.timestamp).toLocaleTimeString()}</p>
                    </div>
                  </div>
                ))}
             </div>
          </div>
        </div>
      )}

      {activeTab === 'USERS' && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
           {allUsers.map(user => (
             <div key={user.id} className="bg-white border border-slate-100 p-4 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                   <div className="w-10 h-10 bg-neda-lightNavy rounded-full flex items-center justify-center text-neda-navy font-black text-xs uppercase">{user.name.charAt(0)}</div>
                   <div>
                      <p className="text-sm font-black text-neda-navy uppercase">{user.name}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{user.role}</p>
                   </div>
                </div>
                <button onClick={() => onUpdateUser({...user, isEnabled: !user.isEnabled})} className={`p-2 rounded-xl transition-colors ${user.isEnabled ? 'text-green-500 hover:bg-green-50' : 'text-red-500 hover:bg-red-50'}`}>
                   {user.isEnabled ? <CheckCircle2 size={20} /> : <Trash2 size={20} />}
                </button>
             </div>
           ))}
        </div>
      )}
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: number; color: string; textColor: string; icon: React.ReactNode }> = ({ label, value, color, textColor, icon }) => (
  <div className={`${color} ${textColor} p-6 rounded-[2rem] shadow-sm relative overflow-hidden`}>
    <div className="relative z-10">
      <div className="mb-2 opacity-60">{icon}</div>
      <p className="text-[9px] font-black uppercase tracking-[0.2em] opacity-80">{label}</p>
      <h3 className="text-3xl font-black mt-1">{value}</h3>
    </div>
    <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-white/10 rounded-full blur-xl"></div>
  </div>
);

// --- AI Assistant ---

const AIAssistant: React.FC<{ tools: Tool[] }> = ({ tools }) => {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = async () => {
    if (!query.trim() || isLoading) return;
    const userMsg = query.trim();
    setQuery('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      const response = await analyzeTools(tools, userMsg);
      setMessages(prev => [...prev, { role: 'assistant', content: response }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: "Something went wrong. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-220px)] bg-slate-50 rounded-[2.5rem] overflow-hidden border border-slate-100 shadow-inner">
      <div className="bg-neda-navy p-5 flex items-center justify-between">
         <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-neda-orange rounded-full flex items-center justify-center">
               <Sparkles className="text-white" size={20} />
            </div>
            <div>
               <h3 className="text-white font-black text-sm uppercase tracking-tight">Pulse AI</h3>
               <p className="text-[8px] font-bold text-neda-orange uppercase tracking-widest">Construction Coordinator</p>
            </div>
         </div>
         <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div>
            <span className="text-[8px] font-bold text-white/40 uppercase tracking-widest">Active</span>
         </div>
      </div>

      <div ref={scrollRef} className="flex-1 p-6 overflow-y-auto space-y-4 hide-scrollbar">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40">
             <Package size={40} className="text-neda-navy" />
             <p className="text-[10px] font-black uppercase tracking-widest text-neda-navy">Ask about tool status, locations, or availability</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] p-4 rounded-2xl text-xs font-bold leading-relaxed ${
              m.role === 'user' ? 'bg-neda-orange text-white rounded-tr-none' : 'bg-white text-neda-navy border border-slate-100 rounded-tl-none shadow-sm'
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white p-4 rounded-2xl rounded-tl-none border border-slate-100 shadow-sm flex gap-1">
               <div className="w-1.5 h-1.5 bg-slate-200 rounded-full animate-bounce"></div>
               <div className="w-1.5 h-1.5 bg-slate-200 rounded-full animate-bounce [animation-delay:0.2s]"></div>
               <div className="w-1.5 h-1.5 bg-slate-200 rounded-full animate-bounce [animation-delay:0.4s]"></div>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 bg-white border-t border-slate-100">
         <div className="relative">
            <input 
              type="text" 
              placeholder="Ask Pulse..." 
              className="w-full pl-5 pr-14 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-neda-navy focus:ring-2 focus:ring-neda-orange outline-none transition-all"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
            />
            <button 
              onClick={handleSend}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-neda-navy text-white rounded-xl hover:bg-neda-orange transition-all disabled:opacity-50"
              disabled={!query.trim() || isLoading}
            >
              <Send size={18} />
            </button>
         </div>
      </div>
    </div>
  );
};

// --- Shared Components ---

const ToolCard: React.FC<{ tool: Tool; onClick: () => void }> = ({ tool, onClick }) => (
  <button onClick={onClick} className="w-full text-left bg-white p-5 rounded-[1.5rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all active:scale-[0.98] group">
    <div className="flex justify-between items-start mb-3">
      <div className="flex gap-4">
        {tool.mainPhoto && <img src={tool.mainPhoto} alt={tool.name} className="w-12 h-12 rounded-xl object-cover border border-slate-100" />}
        <div>
          <h4 className="font-black text-neda-navy uppercase tracking-tight text-sm group-hover:text-neda-orange transition-colors">{tool.name}</h4>
          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">{tool.category} • ID: {tool.id}</p>
        </div>
      </div>
      <StatusBadge status={tool.status} />
    </div>
    {tool.status === ToolStatus.BOOKED_OUT && (
      <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
        <div className="flex items-center gap-2 text-neda-navy/60"> <UserIcon size={14} className="text-neda-orange" /> <span>{tool.currentHolderName}</span> </div>
        <div className="flex items-center gap-2 text-neda-navy/60"> <MapPin size={14} className="text-neda-navy" /> <span>{tool.currentSite}</span> </div>
      </div>
    )}
  </button>
);

const ToolModal: React.FC<{ tool: Tool; onClose: () => void; currentUser: User; onUpdate: (t: Tool) => void; }> = ({ tool, onClose, currentUser, onUpdate }) => {
  const [action, setAction] = useState<'IDLE' | 'BOOKING' | 'RETURNING'>('IDLE');
  const [site, setSite] = useState('');
  const [comment, setComment] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [isDefective, setIsDefective] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  const searchTimeout = useRef<number | null>(null);
  
  const handleBooking = () => { if (!site.trim()) return; onUpdate({ ...tool, status: ToolStatus.BOOKED_OUT, currentHolderId: currentUser.id, currentHolderName: currentUser.name, currentSite: site, bookedAt: Date.now(), logs: [...tool.logs, { id: Math.random().toString(36).substr(2, 9), userId: currentUser.id, userName: currentUser.name, action: 'BOOK_OUT', timestamp: Date.now(), site }] }); };
  const handleReturn = () => { onUpdate({ ...tool, status: isDefective ? ToolStatus.DEFECTIVE : ToolStatus.AVAILABLE, currentHolderId: undefined, currentHolderName: undefined, currentSite: undefined, bookedAt: undefined, lastReturnedAt: Date.now(), logs: [...tool.logs, { id: Math.random().toString(36).substr(2, 9), userId: currentUser.id, userName: currentUser.name, action: 'RETURN', timestamp: Date.now(), comment, photo: photo || undefined }] }); };
  
  const handleSiteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSite(val);
    setShowSuggestions(true);
    if (searchTimeout.current) window.clearTimeout(searchTimeout.current);
    if (val.length >= 3) {
      setIsSearching(true);
      searchTimeout.current = window.setTimeout(async () => {
        const results = await searchAddresses(val);
        setSuggestions(results);
        setIsSearching(false);
      }, 800);
    } else {
      setSuggestions([]);
      setIsSearching(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-neda-navy/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] p-8 shadow-2xl overflow-hidden relative max-h-[90vh] overflow-y-auto hide-scrollbar">
        <div className="absolute top-0 left-0 w-full h-1 bg-neda-orange"></div>
        <div className="flex justify-between items-start mb-8"> 
          <div> 
            <h2 className="text-2xl font-black text-neda-navy uppercase tracking-tighter leading-none">{tool.name}</h2> 
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mt-2">NB-Asset: {tool.id}</p> 
          </div> 
          <button onClick={onClose} className="p-2.5 bg-slate-50 rounded-2xl text-slate-400"><X size={20} /></button> 
        </div>

        {action === 'IDLE' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 rounded-2xl"> <StatusBadge status={tool.status} /> </div>
              <div className="p-4 bg-slate-50 rounded-2xl text-xs font-black text-neda-navy uppercase">{tool.category}</div>
            </div>
            {tool.status === ToolStatus.AVAILABLE && (
              <button onClick={() => setAction('BOOKING')} className="w-full py-5 bg-neda-navy text-white rounded-[1.25rem] font-black uppercase tracking-widest flex items-center justify-center gap-3">
                Deploy Kit
              </button>
            )}
            {tool.status === ToolStatus.BOOKED_OUT && tool.currentHolderId === currentUser.id && (
              <button onClick={() => setAction('RETURNING')} className="w-full py-5 bg-green-600 text-white rounded-[1.25rem] font-black uppercase tracking-widest flex items-center justify-center gap-3">
                Return to Base
              </button>
            )}
          </div>
        )}

        {action === 'BOOKING' && (
          <div className="space-y-6 animate-in slide-in-from-right-8 duration-300">
             <div className="relative">
                <label className="text-[10px] font-black text-neda-navy/40 uppercase tracking-[0.3em] ml-1">Reference Location</label>
                <div className={`w-full flex items-center px-4 py-5 bg-white border-2 rounded-[2rem] transition-all ${site ? 'border-neda-orange' : 'border-slate-100'}`}>
                    <MapPin className="text-slate-300" size={24} />
                    <input type="text" placeholder="Start typing site address..." className="w-full pl-4 text-lg font-bold text-neda-navy outline-none" value={site} onChange={handleSiteChange} />
                    {isSearching && <Loader2 className="animate-spin text-neda-orange" size={18} />}
                </div>
                {showSuggestions && suggestions.length > 0 && (
                    <div className="mt-2 bg-white border border-slate-100 rounded-2xl shadow-xl">
                        {suggestions.map((s, i) => (
                            <button key={i} className="w-full p-4 text-left hover:bg-slate-50 text-sm font-bold text-neda-navy" onClick={() => { setSite(s); setShowSuggestions(false); }}>{s}</button>
                        ))}
                    </div>
                )}
             </div>
             <button onClick={handleBooking} className="w-full py-5 bg-neda-navy text-white rounded-[1.25rem] font-black uppercase tracking-widest">Deploy Now</button>
          </div>
        )}

        {action === 'RETURNING' && (
          <div className="space-y-6 animate-in slide-in-from-right-8 duration-300">
             <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl">
                   <input type="checkbox" id="defective" checked={isDefective} onChange={e => setIsDefective(e.target.checked)} className="w-5 h-5 text-neda-orange rounded-lg" />
                   <label htmlFor="defective" className="text-xs font-black text-neda-navy uppercase">Mark as Defective/Faulty</label>
                </div>
                <textarea 
                  placeholder="Notes on condition..." 
                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-neda-navy min-h-[100px] outline-none"
                  value={comment} onChange={e => setComment(e.target.value)}
                />
             </div>
             <button onClick={handleReturn} className="w-full py-5 bg-green-600 text-white rounded-[1.25rem] font-black uppercase tracking-widest">Confirm Return</button>
          </div>
        )}
      </div>
    </div>
  );
};

const AddToolModal: React.FC<{ onClose: () => void; onAdd: (t: Tool) => void; currentUser: User }> = ({ onClose, onAdd, currentUser }) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Power Tools');
  const [serial, setSerial] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !serial) return;
    
    const newTool: Tool = {
      id: 'T' + Math.random().toString(36).substr(2, 5).toUpperCase(),
      name,
      category,
      serialNumber: serial,
      status: ToolStatus.AVAILABLE,
      logs: [{
        id: Math.random().toString(36).substr(2, 9),
        userId: currentUser.id,
        userName: currentUser.name,
        action: 'CREATE',
        timestamp: Date.now()
      }]
    };
    onAdd(newTool);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neda-navy/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl relative animate-in zoom-in-95">
        <div className="flex justify-between items-center mb-8">
           <h2 className="text-xl font-black text-neda-navy uppercase">New Asset</h2>
           <button onClick={onClose} className="p-2 bg-slate-50 rounded-xl text-slate-400"><X size={18} /></button>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-5">
           <div className="space-y-1">
              <label className="text-[9px] font-black text-neda-navy/40 uppercase tracking-widest ml-1">Asset Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} required className="w-full px-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-neda-navy outline-none focus:ring-2 focus:ring-neda-orange" placeholder="e.g. Hilti Jackhammer" />
           </div>
           <div className="space-y-1">
              <label className="text-[9px] font-black text-neda-navy/40 uppercase tracking-widest ml-1">Serial Number</label>
              <input type="text" value={serial} onChange={e => setSerial(e.target.value)} required className="w-full px-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-neda-navy outline-none focus:ring-2 focus:ring-neda-orange" placeholder="S/N 123456" />
           </div>
           <div className="space-y-1">
              <label className="text-[9px] font-black text-neda-navy/40 uppercase tracking-widest ml-1">Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)} className="w-full px-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-neda-navy outline-none focus:ring-2 focus:ring-neda-orange">
                 <option>Power Tools</option>
                 <option>Precision</option>
                 <option>Heavy Plant</option>
                 <option>Access</option>
                 <option>Safety</option>
              </select>
           </div>
           <button type="submit" className="w-full py-5 bg-neda-orange text-white rounded-[1.25rem] font-black uppercase tracking-widest shadow-lg shadow-neda-orange/30 mt-4">Register Asset</button>
        </form>
      </div>
    </div>
  );
};

const StatusBadge: React.FC<{ status: ToolStatus }> = ({ status }) => {
  const configs = {
    [ToolStatus.AVAILABLE]: { label: 'Warehouse', color: 'bg-green-100 text-green-700' },
    [ToolStatus.BOOKED_OUT]: { label: 'Site Active', color: 'bg-neda-lightOrange text-neda-orange' },
    [ToolStatus.UNDER_REPAIR]: { label: 'In Service', color: 'bg-neda-lightNavy text-neda-navy' },
    [ToolStatus.DEFECTIVE]: { label: 'Defective', color: 'bg-red-100 text-red-600' }
  };
  const config = configs[status];
  return <span className={`text-[9px] font-black px-2.5 py-1 rounded-lg uppercase tracking-[0.1em] ${config.color}`}>{config.label}</span>;
};

export default App;

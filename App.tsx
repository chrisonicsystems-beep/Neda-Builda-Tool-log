
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

const App: React.FC = () => {
  // Persistence
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [tools, setTools] = useState<Tool[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [view, setView] = useState<View>('INVENTORY');
  const [showBiometricPrompt, setShowBiometricPrompt] = useState(false);
  
  // Filtering states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<ToolStatus | 'ALL'>('ALL');
  const [userFilter, setUserFilter] = useState<string | 'ALL'>('ALL');
  const [showFilters, setShowFilters] = useState(false);
  
  // App initialization
  useEffect(() => {
    const savedTools = localStorage.getItem('et_tools');
    setTools(savedTools ? JSON.parse(savedTools) : INITIAL_TOOLS);

    const savedUsers = localStorage.getItem('et_all_users');
    setAllUsers(savedUsers ? JSON.parse(savedUsers) : INITIAL_USERS);

    const savedUser = localStorage.getItem('et_user');
    if (savedUser) {
      setCurrentUser(JSON.parse(savedUser));
    }
  }, []);

  useEffect(() => {
    if (tools.length > 0) localStorage.setItem('et_tools', JSON.stringify(tools));
  }, [tools]);

  useEffect(() => {
    if (allUsers.length > 0) localStorage.setItem('et_all_users', JSON.stringify(allUsers));
  }, [allUsers]);

  const handleLogin = (user: User, remember: boolean) => {
    setCurrentUser(user);
    if (remember) {
      localStorage.setItem('et_user', JSON.stringify(user));
    }
    // Check if user has biometrics enabled for this device
    const bioEnabled = localStorage.getItem(`bio_${user.id}`);
    if (!bioEnabled && window.PublicKeyCredential) {
      // Suggest enabling biometrics after login
      setShowBiometricPrompt(true);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('et_user');
  };

  const enableBiometrics = async () => {
    if (!currentUser) return;
    try {
      // In a real app, we would use navigator.credentials.create()
      // For this demo, we simulate a successful biometric registration
      localStorage.setItem(`bio_${currentUser.id}`, 'enabled');
      setShowBiometricPrompt(false);
      alert("FaceID/TouchID enabled for your next login.");
    } catch (e) {
      console.error("Biometric setup failed", e);
    }
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

      {/* Biometric Enable Prompt Overlay */}
      {showBiometricPrompt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-neda-navy/80 backdrop-blur-md">
          <div className="bg-white w-full max-w-xs rounded-[2.5rem] p-8 text-center space-y-6 shadow-2xl animate-in zoom-in-95 duration-300">
             <div className="w-20 h-20 bg-neda-lightOrange rounded-full flex items-center justify-center mx-auto">
                <Fingerprint size={40} className="text-neda-orange" />
             </div>
             <div>
                <h3 className="text-lg font-black text-neda-navy uppercase tracking-tight">Enable Biometrics?</h3>
                <p className="text-xs font-bold text-slate-400 mt-2 uppercase tracking-widest leading-relaxed">Sign in faster with FaceID or TouchID on this device next time.</p>
             </div>
             <div className="space-y-3">
                <button onClick={enableBiometrics} className="w-full py-4 bg-neda-orange text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-neda-orange/20">Yes, Enable</button>
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
      setError('User not found. Try karin@nedabuilda.com'); 
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
      setError('Please enter your email first.');
      return;
    }
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      setError('Email not recognized.');
      return;
    }
    // Simulation logic
    setResetRequested(true);
    setTimeout(() => {
      setResetRequested(false);
      alert(`Password reset request for ${email} has been sent to the Administration Hub.`);
    }, 1500);
  };

  const handleBiometricLogin = async () => {
    setIsBioLoading(true);
    try {
      // Simulate WebAuthn/FaceID check
      await new Promise(r => setTimeout(r, 1000));
      
      // Look for any user that has biometrics enabled on this device
      // In real life, we would use navigator.credentials.get() and verify with backend
      const bioUserId = Object.keys(localStorage).find(key => key.startsWith('bio_') && localStorage.getItem(key) === 'enabled')?.replace('bio_', '');
      
      if (bioUserId) {
        const user = users.find(u => u.id === bioUserId);
        if (user && user.isEnabled) {
          onLogin(user, true);
        } else {
          setError('Biometric authentication failed or user disabled.');
        }
      } else {
        setError('No Biometric profile found on this device. Please log in with password first.');
      }
    } catch (e) {
      setError('FaceID/TouchID unavailable.');
    } finally {
      setIsBioLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Neda Builda Background Accents */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-neda-lightOrange rounded-full -mr-32 -mt-32 opacity-50 blur-3xl"></div>
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-neda-lightNavy rounded-full -ml-40 -mb-40 opacity-50 blur-3xl"></div>

      <div className="w-full max-w-sm bg-white rounded-[2.5rem] p-8 space-y-8 shadow-2xl shadow-neda-navy/10 relative z-10 border border-slate-100">
        <div className="text-center space-y-2">
          <div className="flex flex-col items-center">
             <div className="mb-4">
                <NedaLogo size={100} />
             </div>
             <h1 className="text-neda-navy font-black text-4xl tracking-tight">Neda Builda</h1>
             <p className="text-[16px] font-extrabold text-neda-navy tracking-widest uppercase mt-1">Tool Log</p>
          </div>
        </div>

        <form onSubmit={handleLoginAttempt} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-[10px] font-extrabold text-neda-navy/50 uppercase tracking-widest ml-1">Work Email</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-neda-navy/30" size={18} />
              <input 
                type="email" 
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:ring-2 focus:ring-neda-orange outline-none transition-all font-medium text-neda-navy placeholder:text-chrisonic-dark/10"
                placeholder="karin@nedabuilda.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-extrabold text-neda-navy/50 uppercase tracking-widest ml-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-neda-navy/30" size={18} />
              <input 
                type={showPass ? "text" : "password"} 
                className="w-full pl-12 pr-12 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:ring-2 focus:ring-neda-orange outline-none transition-all font-medium text-neda-navy placeholder:text-chrisonic-dark/10"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
              <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-neda-navy transition-colors">
                {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between py-1">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input type="checkbox" className="w-4 h-4 rounded border-slate-200 bg-slate-50 text-neda-orange focus:ring-neda-orange" checked={remember} onChange={e => setRemember(e.target.checked)} />
              <span className="text-xs font-bold text-neda-navy/60 group-hover:text-neda-navy transition-colors">Remember me</span>
            </label>
            <button 
              type="button" 
              onClick={handleResetPassword}
              disabled={resetRequested}
              className="text-[10px] font-black text-neda-orange hover:brightness-90 transition-all uppercase tracking-widest disabled:opacity-50"
            >
              {resetRequested ? 'Requesting...' : 'Reset Password'}
            </button>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-2 text-red-600 text-xs font-bold animate-in fade-in slide-in-from-top-1">
              <AlertTriangle size={14} /> {error}
            </div>
          )}

          <div className="space-y-3">
            <button type="submit" className="w-full py-5 bg-neda-orange text-white rounded-2xl font-black shadow-lg shadow-neda-orange/20 hover:brightness-105 active:scale-95 transition-all text-sm uppercase tracking-[0.2em] flex items-center justify-center gap-3">
              Sign in <ArrowUpRight size={18} strokeWidth={3} />
            </button>
            
            <button 
              type="button" 
              onClick={handleBiometricLogin}
              disabled={isBioLoading}
              className="w-full py-5 bg-neda-navy text-neda-orange border border-neda-orange/20 rounded-2xl font-black shadow-md hover:bg-neda-navy/95 active:scale-95 transition-all text-sm uppercase tracking-[0.2em] flex items-center justify-center gap-3"
            >
              {isBioLoading ? <Loader2 className="animate-spin" size={20} /> : <Fingerprint size={20} />}
              Sign in with FaceID
            </button>
          </div>
        </form>
        
        <div className="text-center pt-2">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em]">Asset Log powered by Chrisonic systems</p>
        </div>
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

const MyToolsView: React.FC<{ tools: Tool[]; currentUser: User; onUpdateTool: (t: Tool) => void; }> = ({ tools, currentUser, onUpdateTool }) => {
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  return (
    <div className="space-y-6">
      <div className="neda-gradient rounded-[2rem] p-7 text-white shadow-xl shadow-neda-navy/10 relative overflow-hidden">
        <div className="relative z-10">
          <h2 className="text-2xl font-black tracking-tight">Active Kit</h2>
          <p className="text-white/60 mt-1 text-sm font-bold uppercase tracking-widest">{tools.length} Assets Registered to you</p>
        </div>
        <div className="absolute top-0 right-0 p-8 opacity-10">
            <ClipboardList size={80} />
        </div>
      </div>
      <div className="grid gap-4">
        {tools.length > 0 ? ( tools.map(tool => ( <ToolCard key={tool.id} tool={tool} onClick={() => setSelectedTool(tool)} /> )) ) : (
          <div className="text-center py-16 px-6">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Package className="text-slate-300" size={32} />
            </div>
            <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">No equipment currently booked</p>
          </div>
        )}
      </div>
      {selectedTool && ( <ToolModal tool={selectedTool} onClose={() => setSelectedTool(null)} currentUser={currentUser} onUpdate={(t) => { onUpdateTool(t); setSelectedTool(null); }} /> )}
    </div>
  );
};

// --- Admin Dashboard ---

const AdminDashboard: React.FC<{ 
  tools: Tool[]; allUsers: User[]; currentUser: User; onUpdateUser: (u: User) => void; onAddUser: (u: User) => void; onBulkImport: (ts: Tool[]) => void;
}> = ({ tools, allUsers, currentUser, onUpdateUser, onAddUser, onBulkImport }) => {
  const [activeTab, setActiveTab] = useState<'EQUIPMENT' | 'USERS'>('EQUIPMENT');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showAddUser, setShowAddUser] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => ({
    total: tools.length, available: tools.filter(t => t.status === ToolStatus.AVAILABLE).length,
    booked: tools.filter(t => t.status === ToolStatus.BOOKED_OUT).length,
    defective: tools.filter(t => t.status === ToolStatus.DEFECTIVE || t.status === ToolStatus.UNDER_REPAIR).length,
  }), [tools]);

  const handleExportCSV = () => {
    const headers = ['Name', 'Asset ID', 'Category', 'Serial', 'Status', 'Current Site', 'Assignee'];
    const rows = tools.map(t => [
      t.name,
      t.id,
      t.category,
      t.serialNumber,
      t.status.replace('_', ' '),
      t.currentSite || 'Warehouse',
      t.currentHolderName || 'N/A'
    ]);
    const csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n" 
      + rows.map(e => e.join(",")).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `ToolLog_Export_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleBulkImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const imported = JSON.parse(event.target?.result as string);
          if (Array.isArray(imported)) {
            // Validation step: basic check for name and id
            const validTools = imported.filter(t => t.name && t.id);
            onBulkImport(validTools);
            alert(`Successfully imported ${validTools.length} tools.`);
          }
        } catch (err) {
          alert('Failed to parse file. Please provide a valid JSON list of tools.');
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total Stock" value={stats.total} color="bg-neda-navy" text="text-white" />
        <StatCard label="Available" value={stats.available} color="bg-green-600" text="text-white" />
        <StatCard label="Deploys" value={stats.booked} color="bg-neda-orange" text="text-white" />
        <StatCard label="Service" value={stats.defective} color="bg-red-600" text="text-white" />
      </div>

      <div className="flex bg-slate-100 p-1.5 rounded-2xl">
        <button onClick={() => setActiveTab('EQUIPMENT')} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === 'EQUIPMENT' ? 'bg-white shadow-md text-neda-orange' : 'text-chrisonic-dark/40'}`}>
          Asset Manager
        </button>
        <button onClick={() => setActiveTab('USERS')} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === 'USERS' ? 'bg-white shadow-md text-neda-orange' : 'text-chrisonic-dark/40'}`}>
          Personnel Hub
        </button>
      </div>

      {activeTab === 'EQUIPMENT' ? (
        <div className="space-y-4">
          <div className="flex justify-between gap-2 px-1">
             <button onClick={handleExportCSV} className="flex-1 py-3 bg-white border border-slate-100 rounded-xl text-[9px] font-black uppercase tracking-widest text-neda-navy flex items-center justify-center gap-2 shadow-sm hover:bg-slate-50 transition-all">
               <Download size={14} /> Export CSV
             </button>
             <button onClick={() => fileInputRef.current?.click()} className="flex-1 py-3 bg-white border border-slate-100 rounded-xl text-[9px] font-black uppercase tracking-widest text-neda-navy flex items-center justify-center gap-2 shadow-sm hover:bg-slate-50 transition-all">
               <Upload size={14} /> Bulk Import
             </button>
             <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleBulkImport} />
          </div>

          <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm overflow-x-auto">
            <table className="w-full text-[10px] text-left">
              <thead className="bg-slate-50 border-b border-slate-100 uppercase text-neda-navy font-black tracking-wider">
                <tr> <th className="px-4 py-4">Tool</th> <th className="px-4 py-4">Status</th> <th className="px-4 py-4">Site</th> </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {tools.map(tool => (
                  <tr key={tool.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-4"> <div className="font-black text-neda-navy uppercase">{tool.name}</div> <div className="text-slate-400 font-bold">{tool.id}</div> </td>
                    <td className="px-4 py-4"><StatusBadge status={tool.status} /></td>
                    <td className="px-4 py-4">
                      <div className="text-slate-500 font-bold uppercase">{tool.currentSite || 'Warehouse'}</div>
                      {tool.currentHolderName && <div className="text-[8px] text-neda-orange font-black uppercase">{tool.currentHolderName}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-between items-center px-1">
            <h3 className="font-black text-neda-navy uppercase tracking-widest text-xs">Personnel Records</h3>
            {currentUser.role === UserRole.ADMIN && (
              <button onClick={() => setShowAddUser(true)} className="text-[10px] font-black text-neda-orange uppercase tracking-wider flex items-center gap-1.5 hover:bg-neda-lightOrange px-3 py-1.5 rounded-full transition-colors">
                <UserPlus size={14} /> Add Staff
              </button>
            )}
          </div>
          <div className="grid gap-3">
            {allUsers.map(user => (
              <div key={user.id} className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between group hover:border-neda-orange/20 transition-all">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-sm shadow-inner ${user.isEnabled ? 'bg-neda-lightNavy text-neda-navy' : 'bg-slate-100 text-slate-300'}`}>
                    {user.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`font-black uppercase text-xs tracking-tight ${user.isEnabled ? 'text-neda-navy' : 'text-slate-300 line-through'}`}>{user.name}</span>
                      <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${user.role === UserRole.ADMIN ? 'bg-purple-100 text-purple-700' : 'bg-slate-50 text-slate-500'}`}>
                        {userRoleToLabel(user.role)}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-bold lowercase mt-0.5">{user.email}</div>
                  </div>
                </div>
                {currentUser.role === UserRole.ADMIN && ( <button onClick={() => setEditingUser(user)} className="p-2.5 bg-slate-50 text-slate-400 hover:text-neda-orange hover:bg-neda-lightOrange rounded-xl transition-all"> <Edit size={16} /> </button> )}
              </div>
            ))}
          </div>
        </div>
      )}

      {editingUser && ( <UserEditorModal user={editingUser} onClose={() => setEditingUser(null)} onUpdate={(u) => { onUpdateUser(u); setEditingUser(null); }} /> )}
      {showAddUser && ( <UserEditorModal onClose={() => setShowAddUser(false)} onUpdate={(u) => { onAddUser(u); setShowAddUser(false); }} /> )}
    </div>
  );
};

const userRoleToLabel = (role: UserRole) => {
  switch (role) {
    case UserRole.ADMIN: return 'Superuser';
    case UserRole.MANAGER: return 'Site Manager';
    case UserRole.USER: return 'Site Staff';
    default: return role;
  }
};

// --- AI Assistant ---

const AIAssistant: React.FC<{ tools: Tool[] }> = ({ tools }) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault(); if (!query.trim()) return;
    setLoading(true); setResponse(null);
    const result = await analyzeTools(tools, query);
    setResponse(result); setLoading(false); setQuery('');
  };
  return (
    <div className="space-y-6 flex flex-col h-[70vh]">
      <div className="flex-1 overflow-y-auto space-y-5 pr-2 hide-scrollbar">
        {response ? (
          <div className="bg-neda-lightNavy border border-slate-200 p-6 rounded-[2rem] text-neda-navy text-sm leading-relaxed shadow-sm animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center gap-3 mb-4 text-neda-orange font-black uppercase text-[10px] tracking-[0.2em]"> <Sparkles size={16} /> <span>Pulse Analysis</span> </div>
            <p className="whitespace-pre-wrap font-medium">{response}</p>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center px-10">
            <div className="relative mb-6">
                <div className="w-24 h-24 bg-white rounded-[1.5rem] flex items-center justify-center shadow-lg rotate-3 z-10 relative border border-slate-100 p-2">
                    <NedaLogo size={60} />
                </div>
                <div className="absolute inset-0 bg-neda-orange/20 blur-[30px] rounded-full scale-150 animate-pulse"></div>
            </div>
            <h3 className="font-black text-neda-navy uppercase tracking-widest text-lg">Pulse Intelligence</h3>
            <p className="text-[10px] font-bold text-slate-400 mt-3 uppercase tracking-widest leading-relaxed">Ask about asset health, site deployment, or long-term kit requirements.</p>
          </div>
        )}
      </div>
      <form onSubmit={handleAsk} className="relative mt-auto">
        <input type="text" className="w-full pl-6 pr-14 py-5 rounded-[1.5rem] bg-white border border-slate-100 shadow-xl focus:ring-2 focus:ring-neda-orange outline-none text-sm font-bold text-neda-navy" placeholder="Query Pulse network..." value={query} onChange={e => setQuery(e.target.value)} disabled={loading} />
        <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 p-3 bg-neda-navy text-neda-orange rounded-2xl disabled:bg-slate-200 transition-all shadow-lg" disabled={loading || !query.trim()} >
          {loading ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
        </button>
      </form>
    </div>
  );
};

// --- Helper Components ---

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

const ToolCard: React.FC<{ tool: Tool; onClick: () => void }> = ({ tool, onClick }) => (
  <button onClick={onClick} className="w-full text-left bg-white p-5 rounded-[1.5rem] border border-slate-100 shadow-sm hover:shadow-xl hover:border-neda-orange/30 transition-all active:scale-[0.98] group">
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

const StatCard: React.FC<{ label: string; value: number; color: string; text: string }> = ({ label, value, color, text }) => (
  <div className={`${color} p-5 rounded-[1.5rem] shadow-lg shadow-neda-navy/5`}>
    <div className={`text-2xl font-black ${text}`}>{value}</div>
    <div className={`text-[9px] uppercase font-black tracking-[0.2em] ${text} opacity-60 mt-1`}>{label}</div>
  </div>
);

// --- Modal Components ---

const ToolModal: React.FC<{ tool: Tool; onClose: () => void; currentUser: User; onUpdate: (t: Tool) => void; }> = ({ tool, onClose, currentUser, onUpdate }) => {
  const [action, setAction] = useState<'IDLE' | 'BOOKING' | 'RETURNING'>('IDLE');
  const [site, setSite] = useState('');
  const [comment, setComment] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [isDefective, setIsDefective] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  const returnPhotoRef = useRef<HTMLInputElement>(null);
  const searchTimeout = useRef<number | null>(null);
  
  const handleBooking = () => { if (!site.trim()) return; onUpdate({ ...tool, status: ToolStatus.BOOKED_OUT, currentHolderId: currentUser.id, currentHolderName: currentUser.name, currentSite: site, bookedAt: Date.now(), logs: [...tool.logs, { id: Math.random().toString(36).substr(2, 9), userId: currentUser.id, userName: currentUser.name, action: 'BOOK_OUT', timestamp: Date.now(), site }] }); };
  const handleReturn = () => { onUpdate({ ...tool, status: isDefective ? ToolStatus.DEFECTIVE : ToolStatus.AVAILABLE, currentHolderId: undefined, currentHolderName: undefined, currentSite: undefined, bookedAt: undefined, lastReturnedAt: Date.now(), logs: [...tool.logs, { id: Math.random().toString(36).substr(2, 9), userId: currentUser.id, userName: currentUser.name, action: 'RETURN', timestamp: Date.now(), comment, photo: photo || undefined }] }); };
  
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setPhoto(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

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

  const selectSuggestion = (s: string) => {
    setSite(s);
    setShowSuggestions(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-neda-navy/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] p-8 shadow-2xl animate-in slide-in-from-bottom duration-500 overflow-hidden relative max-h-[90vh] overflow-y-auto hide-scrollbar">
        <div className="absolute top-0 left-0 w-full h-1 bg-neda-orange"></div>
        <div className="flex justify-between items-start mb-8"> 
          <div> 
            <h2 className="text-2xl font-black text-neda-navy uppercase tracking-tighter leading-none">{tool.name}</h2> 
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mt-2">NB-Asset: {tool.id} • S/N: {tool.serialNumber}</p> 
          </div> 
          <button onClick={onClose} className="p-2.5 bg-slate-50 hover:bg-slate-100 rounded-2xl text-slate-400 transition-colors"><X size={20} /></button> 
        </div>

        {tool.mainPhoto && action === 'IDLE' && (
           <img src={tool.mainPhoto} alt="Original" className="w-full h-48 object-cover rounded-3xl mb-6 shadow-inner border border-slate-50" />
        )}
        
        {action === 'IDLE' && (
          <div className="space-y-8">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 rounded-2xl"> <span className="text-[9px] uppercase font-black text-slate-400 block mb-2 tracking-widest">Global State</span> <StatusBadge status={tool.status} /> </div>
              <div className="p-4 bg-slate-50 rounded-2xl"> <span className="text-[9px] uppercase font-black text-slate-400 block mb-2 tracking-widest">Type</span> <span className="text-xs font-black text-neda-navy uppercase">{tool.category}</span> </div>
            </div>
            
            {tool.status === ToolStatus.AVAILABLE && (
              <button onClick={() => setAction('BOOKING')} className="w-full py-5 bg-neda-navy text-white rounded-[1.25rem] font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl shadow-neda-navy/20 hover:brightness-110 transition-all group">
                <ClipboardList size={22} className="group-hover:text-neda-orange transition-colors" /> Deploy to Site
              </button>
            )}
            {tool.status === ToolStatus.BOOKED_OUT && tool.currentHolderId === currentUser.id && (
              <button onClick={() => setAction('RETURNING')} className="w-full py-5 bg-green-600 text-white rounded-[1.25rem] font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl shadow-green-600/30 hover:bg-green-700 transition-all">
                <CheckCircle2 size={22} /> Safe Return
              </button>
            )}
            
            {tool.status === ToolStatus.BOOKED_OUT && tool.currentHolderId !== currentUser.id && (
                <div className="p-5 bg-neda-lightOrange rounded-[1.5rem] border border-neda-orange/10 flex items-start gap-4">
                    <div className="p-2.5 bg-neda-orange rounded-xl text-white"> <AlertTriangle size={20} /> </div>
                    <div>
                        <p className="text-[10px] font-black text-neda-orange uppercase tracking-[0.2em] mb-1">Active Site Deployment</p>
                        <p className="text-sm font-bold text-neda-navy leading-tight uppercase">Held by <span className="text-neda-orange">{tool.currentHolderName}</span> at {tool.currentSite}</p>
                    </div>
                </div>
            )}

            <div className="space-y-4">
                <h4 className="text-[10px] font-black text-neda-navy/40 uppercase tracking-[0.3em] flex items-center gap-2"> <History size={14} /> Audit Trail </h4>
                <div className="space-y-3">
                    {tool.logs.length > 0 ? [...tool.logs].reverse().map(log => (
                        <div key={log.id} className="text-[10px] p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                  <div className="font-black text-neda-navy uppercase tracking-wider mb-1">{log.action.replace('_', ' ')}</div>
                                  <div className="text-slate-400 font-bold uppercase">Personnel: {log.userName}</div>
                                  {log.site && <div className="text-neda-orange font-bold uppercase mt-1">Loc: {log.site}</div>}
                                  {log.comment && <div className="text-slate-500 font-medium italic mt-1">"{log.comment}"</div>}
                              </div>
                              <span className="text-slate-400 font-bold whitespace-nowrap">{new Date(log.timestamp).toLocaleDateString()}</span>
                            </div>
                            {log.photo && (
                              <img src={log.photo} alt="Return Condition" className="w-full h-32 object-cover rounded-xl border border-slate-200" />
                            )}
                        </div>
                    )) : <p className="text-xs text-slate-300 font-bold italic uppercase tracking-widest">No data available</p>}
                </div>
            </div>
          </div>
        )}

        {action === 'BOOKING' && (
          <div className="space-y-8 animate-in slide-in-from-right-8 duration-300">
             <h3 className="font-black text-neda-navy uppercase tracking-widest text-lg">Site Assignment</h3>
             <div className="space-y-6">
                <div className="space-y-2 relative">
                    <label className="text-[10px] font-black text-neda-navy/40 uppercase tracking-[0.3em] ml-1">Reference Location</label>
                    <div className="relative group">
                        <div className={`w-full flex items-center px-4 py-5 bg-white border-2 rounded-[2rem] transition-all overflow-hidden ${site ? 'border-neda-orange shadow-lg shadow-neda-orange/5' : 'border-slate-100'}`}>
                            <MapPin className="text-slate-300 flex-shrink-0" size={24} />
                            <input 
                                type="text" 
                                placeholder="Start typing site address..." 
                                className="w-full pl-4 pr-10 bg-transparent text-lg font-bold text-neda-navy placeholder:text-slate-300 outline-none" 
                                value={site} 
                                onChange={handleSiteChange} 
                                onFocus={() => setShowSuggestions(true)}
                                autoFocus
                            />
                            <div className="absolute right-6 flex items-center gap-2">
                                {isSearching ? (
                                    <Loader2 className="animate-spin text-neda-orange" size={18} />
                                ) : (
                                    <ChevronDown className={`transition-transform duration-300 text-neda-navy ${showSuggestions ? 'rotate-180' : ''}`} size={18} />
                                )}
                            </div>
                        </div>

                        {/* Dropdown Suggestions */}
                        {showSuggestions && (site.length >= 3 || suggestions.length > 0) && (
                            <div className="absolute top-full left-0 right-0 mt-3 bg-white border border-slate-100 rounded-[1.5rem] shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                                {isSearching && suggestions.length === 0 ? (
                                    <div className="px-6 py-8 flex flex-col items-center justify-center text-center">
                                        <Loader2 className="animate-spin text-neda-orange mb-3" size={32} />
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Connecting to Pulse Network...</p>
                                    </div>
                                ) : suggestions.length > 0 ? (
                                    <div className="max-h-64 overflow-y-auto">
                                        {suggestions.map((s, idx) => (
                                            <button 
                                                key={idx}
                                                onClick={() => selectSuggestion(s)}
                                                className="w-full px-6 py-4 flex items-start gap-3 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-none text-left"
                                            >
                                                <MapPin size={16} className="text-neda-orange mt-0.5 flex-shrink-0" />
                                                <span className="text-sm font-bold text-neda-navy leading-tight">{s}</span>
                                            </button>
                                        ))}
                                    </div>
                                ) : !isSearching && site.length >= 3 ? (
                                    <div className="px-6 py-8 text-center">
                                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">No verified matches. Use manual entry.</p>
                                    </div>
                                ) : null}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex flex-col gap-3">
                    <button onClick={handleBooking} disabled={!site.trim()} className="w-full py-5 bg-neda-navy text-white rounded-[1.25rem] font-black uppercase tracking-widest shadow-xl shadow-neda-navy/20 disabled:opacity-30 transition-all flex items-center justify-center gap-2">Deploy Kit <Infinity size={18} className="text-neda-orange" /> </button>
                    <button onClick={() => setAction('IDLE')} className="py-2 text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] hover:text-neda-navy transition-colors">Abort Assignment</button>
                </div>
             </div>
          </div>
        )}

        {action === 'RETURNING' && (
          <div className="space-y-8 animate-in slide-in-from-right-8 duration-300">
             <h3 className="font-black text-neda-navy uppercase tracking-widest text-lg">De-assignment</h3>
             <div className="space-y-6">
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-neda-navy/40 uppercase tracking-[0.2em] ml-1">Status Report</label>
                    <textarea placeholder="Condition notes..." className="w-full p-4 bg-slate-50 rounded-2xl text-sm font-bold text-neda-navy min-h-[100px] outline-none focus:ring-2 focus:ring-green-600" value={comment} onChange={e => setComment(e.target.value)} />
                </div>
                
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-neda-navy/40 uppercase tracking-[0.2em] ml-1">Return Photo (Optional)</label>
                    <div 
                      onClick={() => returnPhotoRef.current?.click()}
                      className="w-full aspect-video bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-slate-100 transition-all relative overflow-hidden"
                    >
                        {photo ? (
                          <img src={photo} alt="Captured" className="w-full h-full object-cover" />
                        ) : (
                          <>
                            <Camera className="text-slate-300" size={32} />
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Click to Capture</span>
                          </>
                        )}
                        <input type="file" ref={returnPhotoRef} accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload} />
                    </div>
                </div>

                <div className="flex items-center gap-4 p-5 bg-red-50 rounded-2xl border border-red-100">
                    <input type="checkbox" id="modal-defective" className="w-6 h-6 rounded border-red-200 text-red-600 focus:ring-red-500" checked={isDefective} onChange={e => setIsDefective(e.target.checked)} />
                    <label htmlFor="modal-defective" className="text-xs font-black text-red-700 uppercase tracking-widest flex items-center gap-2"> <AlertTriangle size={18} /> Request Service </label>
                </div>
                <div className="flex flex-col gap-3">
                    <button onClick={handleReturn} className="w-full py-5 bg-green-600 text-white rounded-[1.25rem] font-black uppercase tracking-widest shadow-xl shadow-green-600/20 hover:bg-green-700 transition-all">Submit De-assignment</button>
                    <button onClick={() => setAction('IDLE')} className="py-2 text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Cancel</button>
                </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

const AddToolModal: React.FC<{ onClose: () => void; onAdd: (t: Tool) => void; currentUser: User }> = ({ onClose, onAdd, currentUser }) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [sn, setSn] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [id, setId] = useState('NB-' + Math.floor(Math.random() * 9000 + 1000));
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setPhoto(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault(); if (!name || !category || !sn) return;
    onAdd({ 
      id, name, category, serialNumber: sn, 
      status: ToolStatus.AVAILABLE, 
      mainPhoto: photo || undefined,
      logs: [{ id: Math.random().toString(36).substr(2, 9), userId: currentUser.id, userName: currentUser.name, action: 'CREATE', timestamp: Date.now() }] 
    });
  };
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-neda-navy/70 backdrop-blur-sm">
      <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in-95 duration-300 relative border-t-4 border-neda-orange max-h-[90vh] overflow-y-auto hide-scrollbar">
        <div className="flex justify-between items-center mb-8"> <h2 className="text-xl font-black text-neda-navy uppercase tracking-widest">Asset Creation</h2> <button onClick={onClose} className="p-2.5 bg-slate-50 rounded-2xl text-slate-400 hover:text-neda-navy"><X size={20} /></button> </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5"> 
            <label className="text-[10px] font-black text-neda-navy/40 uppercase tracking-widest ml-1">Asset Master Photo</label> 
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="w-full aspect-video bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center overflow-hidden cursor-pointer"
            >
               {photo ? <img src={photo} alt="Preview" className="w-full h-full object-cover" /> : <ImageIcon size={32} className="text-slate-200" />}
            </div>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handlePhotoUpload} />
          </div>
          <div className="space-y-1.5"> <label className="text-[10px] font-black text-neda-navy/40 uppercase tracking-widest ml-1">Asset ID (System Gen)</label> <input type="text" value={id} onChange={e => setId(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-neda-navy" required /> </div>
          <div className="space-y-1.5"> <label className="text-[10px] font-black text-neda-navy/40 uppercase tracking-widest ml-1">Model Name</label> <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Hilti TE-70" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-neda-navy" required /> </div>
          <div className="space-y-1.5"> <label className="text-[10px] font-black text-neda-navy/40 uppercase tracking-widest ml-1">Kit Category</label> <input type="text" value={category} onChange={e => setCategory(e.target.value)} placeholder="Heavy Plant" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-neda-navy" required /> </div>
          <div className="space-y-1.5"> <label className="text-[10px] font-black text-neda-navy/40 uppercase tracking-widest ml-1">Serial S/N</label> <input type="text" value={sn} onChange={e => setSn(e.target.value)} placeholder="MFR-X110" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-neda-navy" required /> </div>
          <button type="submit" className="w-full py-5 bg-neda-navy text-white rounded-[1.25rem] font-black uppercase tracking-widest shadow-xl shadow-neda-navy/20 mt-4 flex items-center justify-center gap-2 hover:brightness-110 transition-all">Grant Pulse ID <Infinity size={18} className="text-neda-orange" /> </button>
        </form>
      </div>
    </div>
  );
};

const UserEditorModal: React.FC<{ user?: User; onClose: () => void; onUpdate: (u: User) => void }> = ({ user, onClose, onUpdate }) => {
  const [formData, setFormData] = useState({ name: user?.name || '', email: user?.email || '', password: user?.password || 'password123', role: user?.role || UserRole.USER, isEnabled: user?.isEnabled ?? true });
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onUpdate({ ...formData, id: user?.id || 'U' + Math.floor(Math.random() * 1000) }); };
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-neda-navy/70 backdrop-blur-sm">
      <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in-95 duration-300 border-t-4 border-neda-navy">
        <div className="flex justify-between items-center mb-8"> <h2 className="text-xl font-black text-neda-navy uppercase tracking-widest">{user ? 'Edit Profile' : 'New Pulse Node'}</h2> <button onClick={onClose} className="p-2.5 bg-slate-50 rounded-2xl text-slate-400"><X size={20} /></button> </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5"> <label className="text-[10px] font-black text-neda-navy/40 uppercase tracking-widest ml-1">Full Name</label> <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-4 bg-slate-50 border-none rounded-2xl text-sm font-bold text-neda-navy" required /> </div>
          <div className="space-y-1.5"> <label className="text-[10px] font-black text-neda-navy/40 uppercase tracking-widest ml-1">Work Email</label> <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full p-4 bg-slate-50 border-none rounded-2xl text-sm font-bold text-neda-navy" required /> </div>
          <div className="space-y-1.5"> <label className="text-[10px] font-black text-neda-navy/40 uppercase tracking-widest ml-1">System Privilege</label> <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as UserRole})} className="w-full p-4 bg-slate-50 border-none rounded-2xl text-sm font-bold text-neda-navy outline-none appearance-none"> <option value={UserRole.USER}>Site Staff</option> <option value={UserRole.MANAGER}>Site Manager</option> <option value={UserRole.ADMIN}>Superuser</option> </select> </div>
          <div className="space-y-1.5"> <label className="text-[10px] font-black text-neda-navy/40 uppercase tracking-widest ml-1">Node Password</label> <input type="text" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full p-4 bg-slate-50 border-none rounded-2xl text-sm font-mono font-bold text-neda-navy" required /> </div>
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
            <span className="text-xs font-black text-neda-navy uppercase tracking-widest flex items-center gap-3"> <Power size={18} className={formData.isEnabled ? 'text-green-500' : 'text-slate-300'} /> State: {formData.isEnabled ? 'Active' : 'Dormant'} </span>
            <button type="button" onClick={() => setFormData({...formData, isEnabled: !formData.isEnabled})} className={`w-14 h-7 rounded-full transition-all relative ${formData.isEnabled ? 'bg-neda-orange shadow-lg shadow-neda-orange/20' : 'bg-slate-300'}`}> <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all shadow-md ${formData.isEnabled ? 'right-1' : 'left-1'}`} /> </button>
          </div>
          <button type="submit" className="w-full py-5 bg-neda-navy text-white rounded-[1.25rem] font-black uppercase tracking-widest shadow-xl shadow-neda-navy/20 mt-4 hover:brightness-110 transition-all"> {user ? 'Update Hub' : 'Create Node'} </button>
        </form>
      </div>
    </div>
  );
};

export default App;

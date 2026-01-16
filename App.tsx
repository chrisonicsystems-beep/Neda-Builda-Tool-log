
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
  Fingerprint,
  Wifi,
  WifiOff
} from 'lucide-react';
import { analyzeTools, searchAddresses } from './services/geminiService';
import { fetchTools, fetchUsers, syncTools, syncUsers, supabase } from './services/supabaseService';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [tools, setTools] = useState<Tool[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [view, setView] = useState<View>('INVENTORY');
  const [showBiometricPrompt, setShowBiometricPrompt] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<ToolStatus | 'ALL'>('ALL');
  const [userFilter, setUserFilter] = useState<string | 'ALL'>('ALL');
  const [showFilters, setShowFilters] = useState(false);
  
  useEffect(() => {
    const initData = async () => {
      const remoteTools = await fetchTools();
      const remoteUsers = await fetchUsers();

      if (remoteTools && remoteUsers) {
        if (remoteTools.length === 0 && remoteUsers.length === 0) {
          setTools(INITIAL_TOOLS);
          setAllUsers(INITIAL_USERS);
          await syncTools(INITIAL_TOOLS);
          await syncUsers(INITIAL_USERS);
        } else {
          setTools(remoteTools);
          setAllUsers(remoteUsers);
        }
      } else {
        const savedTools = localStorage.getItem('et_tools');
        setTools(savedTools ? JSON.parse(savedTools) : INITIAL_TOOLS);
        const savedUsers = localStorage.getItem('et_all_users');
        setAllUsers(savedUsers ? JSON.parse(savedUsers) : INITIAL_USERS);
      }

      const savedUser = localStorage.getItem('et_user');
      if (savedUser) setCurrentUser(JSON.parse(savedUser));
      setIsInitializing(false);
    };
    initData();
  }, []);

  // Periodic background sync
  useEffect(() => {
    if (!isInitializing && tools.length > 0) {
      localStorage.setItem('et_tools', JSON.stringify(tools));
      syncTools(tools).catch(e => setSyncError("Background sync failed"));
    }
  }, [tools, isInitializing]);

  useEffect(() => {
    if (!isInitializing && allUsers.length > 0) {
      localStorage.setItem('et_all_users', JSON.stringify(allUsers));
      syncUsers(allUsers).catch(e => setSyncError("Background sync failed"));
    }
  }, [allUsers, isInitializing]);

  const handleLogin = (user: User, remember: boolean) => {
    setCurrentUser(user);
    if (remember) localStorage.setItem('et_user', JSON.stringify(user));
    if (!localStorage.getItem(`bio_${user.id}`) && window.PublicKeyCredential) setShowBiometricPrompt(true);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('et_user');
  };

  const enableBiometrics = () => {
    if (!currentUser) return;
    localStorage.setItem(`bio_${currentUser.id}`, 'enabled');
    setShowBiometricPrompt(false);
  };

  const updateTool = async (updatedTool: Tool) => {
    const newTools = tools.map(t => t.id === updatedTool.id ? updatedTool : t);
    setTools(newTools);
    setIsSyncing(true);
    try {
      await syncTools(newTools);
      setSyncError(null);
    } catch (e) {
      setSyncError("Failed to save tool update");
    } finally {
      setIsSyncing(false);
    }
  };

  const addTool = async (newTool: Tool) => {
    const newTools = [...tools, newTool];
    setTools(newTools);
    setIsSyncing(true);
    try {
      await syncTools(newTools);
      setSyncError(null);
    } catch (e) {
      setSyncError("Failed to save new tool");
    } finally {
      setIsSyncing(false);
    }
  };

  const bulkAddTools = async (newToolsList: Tool[]) => {
    const updatedTools = [...tools, ...newToolsList];
    setTools(updatedTools);
    setIsSyncing(true);
    try {
      await syncTools(updatedTools);
      setSyncError(null);
    } catch (e) {
      setSyncError("Bulk import failed to save");
    } finally {
      setIsSyncing(false);
    }
  };
  
  const updateUser = async (updatedUser: User) => {
    const newUsers = allUsers.map(u => u.id === updatedUser.id ? updatedUser : u);
    setAllUsers(newUsers);
    if (currentUser?.id === updatedUser.id) setCurrentUser(updatedUser);
    setIsSyncing(true);
    try {
      await syncUsers(newUsers);
      setSyncError(null);
    } catch (e) {
      setSyncError("Failed to save user update");
    } finally {
      setIsSyncing(false);
    }
  };

  const addUser = async (newUser: User) => {
    const newUsers = [...allUsers, newUser];
    setAllUsers(newUsers);
    setIsSyncing(true);
    try {
      await syncUsers(newUsers);
      setSyncError(null);
      console.log("User successfully added to Supabase");
    } catch (e: any) {
      setSyncError(`Database Error: ${e.message || "Unknown error"}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const filteredTools = useMemo(() => {
    return tools.filter(t => {
      const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.serialNumber.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
      const matchesUser = userFilter === 'ALL' || t.currentHolderId === userFilter;
      return matchesSearch && matchesStatus && matchesUser;
    });
  }, [tools, searchTerm, statusFilter, userFilter]);

  if (isInitializing) return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
      <NedaLogo size={80} className="animate-pulse mb-6" />
      <div className="flex items-center gap-2 text-neda-navy font-black uppercase text-[10px] tracking-widest">
         <Loader2 className="animate-spin" size={16} />
         <span>Connecting to Chrisonic Network...</span>
      </div>
    </div>
  );

  if (!currentUser) return <LoginScreen onLogin={handleLogin} users={allUsers} />;

  return (
    <Layout activeView={view} setView={setView} userRole={currentUser.role} onLogout={handleLogout}>
      {/* Global Sync Indicator */}
      <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[100] pointer-events-none">
        {isSyncing && (
          <div className="bg-neda-navy text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 animate-in slide-in-from-top-4">
            <Loader2 className="animate-spin" size={12} />
            <span className="text-[8px] font-black uppercase tracking-widest">Syncing to Cloud...</span>
          </div>
        )}
        {syncError && (
          <div className="bg-red-500 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 animate-in slide-in-from-top-4">
            <AlertTriangle size={12} />
            <span className="text-[8px] font-black uppercase tracking-widest">{syncError}</span>
            <button onClick={() => setSyncError(null)} className="pointer-events-auto ml-1 bg-white/20 p-1 rounded-full"><X size={8} /></button>
          </div>
        )}
      </div>

      {view === 'INVENTORY' && (
        <InventoryView 
          tools={filteredTools} allTools={tools} searchTerm={searchTerm} setSearchTerm={setSearchTerm}
          statusFilter={statusFilter} setStatusFilter={setStatusFilter} userFilter={userFilter} setUserFilter={setUserFilter}
          showFilters={showFilters} setShowFilters={setShowFilters} currentUser={currentUser}
          onUpdateTool={updateTool} onAddTool={addTool}
        />
      )}
      {view === 'MY_TOOLS' && (
        <MyToolsView tools={tools.filter(t => t.currentHolderId === currentUser.id)} currentUser={currentUser} onUpdateTool={updateTool} />
      )}
      {view === 'ADMIN_DASHBOARD' && (
        <AdminDashboard tools={tools} allUsers={allUsers} currentUser={currentUser} onUpdateUser={updateUser} onAddUser={addUser} onBulkImport={bulkAddTools} />
      )}
      {view === 'AI_ASSISTANT' && ( <AIAssistant tools={tools} /> )}

      {showBiometricPrompt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-neda-navy/80 backdrop-blur-md">
          <div className="bg-white w-full max-w-xs rounded-[2.5rem] p-8 text-center space-y-6 shadow-2xl animate-in zoom-in-95">
             <Fingerprint size={40} className="text-neda-orange mx-auto" />
             <h3 className="text-lg font-black text-neda-navy uppercase">Enable FaceID?</h3>
             <button onClick={enableBiometrics} className="w-full py-4 bg-neda-orange text-white rounded-2xl font-black uppercase">Yes, Enable</button>
             <button onClick={() => setShowBiometricPrompt(false)} className="w-full py-2 text-[10px] font-black text-slate-300 uppercase">Maybe Later</button>
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
  const [error, setError] = useState('');
  const handleLoginAttempt = (e: React.FormEvent) => {
    e.preventDefault();
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
    if (user && user.isEnabled) onLogin(user, true);
    else setError('Invalid credentials or account disabled.');
  };
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white rounded-[2.5rem] p-8 space-y-8 shadow-2xl border border-slate-100">
        <div className="text-center">
          <NedaLogo size={80} className="mx-auto mb-4" />
          <h1 className="text-neda-navy font-black text-3xl">Neda Builda</h1>
          <p className="text-[12px] font-extrabold text-neda-navy opacity-40 uppercase tracking-widest">Asset Log</p>
        </div>
        <form onSubmit={handleLoginAttempt} className="space-y-5">
          <input type="email" placeholder="Email" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-neda-orange transition-all" value={email} onChange={e => setEmail(e.target.value)} required />
          <input type="password" placeholder="Password" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-neda-orange transition-all" value={password} onChange={e => setPassword(e.target.value)} required />
          {error && <p className="text-red-500 text-[10px] font-black">{error}</p>}
          <button type="submit" className="w-full py-5 bg-neda-navy text-white rounded-2xl font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all">Sign In</button>
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
  currentUser: User; onUpdateTool: (t: Tool) => Promise<void>; onAddTool: (t: Tool) => Promise<void>;
}> = ({ tools, allTools, searchTerm, setSearchTerm, statusFilter, setStatusFilter, userFilter, setUserFilter, showFilters, setShowFilters, currentUser, onUpdateTool, onAddTool }) => {
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-neda-navy/30" size={18} />
          <input type="text" placeholder="Find equipment..." className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-white border border-slate-100 shadow-sm outline-none focus:ring-2 focus:ring-neda-orange" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <button onClick={() => setShowFilters(!showFilters)} className={`p-3.5 rounded-2xl transition-colors ${showFilters ? 'bg-neda-orange text-white' : 'bg-white text-neda-navy/50 border border-slate-100'}`}><Filter size={20} /></button>
      </div>
      {showFilters && (
        <div className="bg-white border border-slate-100 p-5 rounded-3xl shadow-lg space-y-4 animate-in slide-in-from-top-2">
          <label className="text-[10px] font-black text-neda-navy/40 uppercase tracking-widest block mb-1">Status Filter</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-black uppercase outline-none">
            <option value="ALL">All Statuses</option>
            {Object.values(ToolStatus).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      )}
      {currentUser.role === UserRole.ADMIN && (
        <button onClick={() => setShowAddModal(true)} className="w-full py-4 border-2 border-dashed border-neda-orange/30 text-neda-orange rounded-2xl flex items-center justify-center gap-3 font-black text-xs uppercase hover:bg-neda-orange/5 transition-colors"><Plus size={20} /> Register New Equipment</button>
      )}
      <div className="grid gap-4">
        {tools.length === 0 ? (
          <div className="text-center py-10 opacity-40 font-black text-xs uppercase tracking-widest">No matching assets found</div>
        ) : (
          tools.map(tool => ( <ToolCard key={tool.id} tool={tool} onClick={() => setSelectedTool(tool)} /> ))
        )}
      </div>
      {selectedTool && <ToolModal tool={selectedTool} onClose={() => setSelectedTool(null)} currentUser={currentUser} onUpdate={async (t) => { await onUpdateTool(t); setSelectedTool(null); }} />}
      {showAddModal && <AddToolModal onClose={() => setShowAddModal(false)} onAdd={async (t) => { await onAddTool(t); setShowAddModal(false); }} currentUser={currentUser} />}
    </div>
  );
};

// --- My Tools View ---
const MyToolsView: React.FC<{ tools: Tool[]; currentUser: User; onUpdateTool: (t: Tool) => Promise<void> }> = ({ tools, currentUser, onUpdateTool }) => {
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  return (
    <div className="space-y-6">
      <div className="bg-neda-navy text-white p-8 rounded-[2.5rem] shadow-xl relative overflow-hidden">
        <h2 className="text-3xl font-black uppercase leading-none mb-2 relative z-10">My Field Kit</h2>
        <p className="text-[10px] font-bold text-neda-lightOrange uppercase tracking-widest relative z-10">{tools.length} Assets in your care</p>
        <div className="absolute top-0 right-0 w-32 h-32 bg-neda-orange opacity-20 rounded-full -mr-16 -mt-16 blur-2xl"></div>
      </div>
      <div className="grid gap-4">
        {tools.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-200">
            <Package size={32} className="mx-auto text-slate-200 mb-3" />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No tools booked out</p>
          </div>
        ) : (
          tools.map(tool => ( <ToolCard key={tool.id} tool={tool} onClick={() => setSelectedTool(tool)} /> ))
        )}
      </div>
      {selectedTool && <ToolModal tool={selectedTool} onClose={() => setSelectedTool(null)} currentUser={currentUser} onUpdate={async (t) => { await onUpdateTool(t); setSelectedTool(null); }} />}
    </div>
  );
};

// --- Admin Dashboard ---
const AdminDashboard: React.FC<{ 
  tools: Tool[]; allUsers: User[]; currentUser: User; 
  onUpdateUser: (u: User) => Promise<void>; onAddUser: (u: User) => Promise<void>; 
  onBulkImport: (t: Tool[]) => Promise<void>;
}> = ({ tools, allUsers, currentUser, onUpdateUser, onAddUser, onBulkImport }) => {
  const [activeTab, setActiveTab] = useState<'REPORTS' | 'USERS'>('REPORTS');
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const togglePasswordVisibility = (userId: string) => {
    setShowPasswords(prev => ({ ...prev, [userId]: !prev[userId] }));
  };

  const exportCSV = () => {
    const headers = ['Asset ID', 'Name', 'Category', 'Serial', 'Status', 'Current Holder', 'Current Site'];
    const rows = tools.map(t => [
      t.id, t.name, t.category, t.serialNumber, t.status, 
      t.currentHolderName || 'Warehouse', t.currentSite || 'Warehouse'
    ]);
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `neda_stocktake_${new Date().toISOString().split('T')[0]}.csv`);
    link.click();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split("\n").slice(1);
      const newTools: Tool[] = lines.filter(line => line.trim()).map(line => {
        const parts = line.split(",");
        return {
          id: parts[0]?.trim() || 'T' + Math.random().toString(36).substr(2, 5).toUpperCase(),
          name: parts[1]?.trim() || 'Unknown Asset',
          category: parts[2]?.trim() || 'General',
          serialNumber: parts[3]?.trim() || 'S/N',
          status: ToolStatus.AVAILABLE,
          logs: []
        };
      });
      onBulkImport(newTools);
      alert(`${newTools.length} assets merged into inventory.`);
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-2 bg-slate-100 p-1 rounded-2xl">
        <button onClick={() => setActiveTab('REPORTS')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${activeTab === 'REPORTS' ? 'bg-white text-neda-navy shadow-sm' : 'text-slate-400'}`}>Stocktake</button>
        <button onClick={() => setActiveTab('USERS')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${activeTab === 'USERS' ? 'bg-white text-neda-navy shadow-sm' : 'text-slate-400'}`}>Personnel</button>
      </div>

      {activeTab === 'REPORTS' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Total Assets" value={tools.length} color="bg-neda-navy" />
            <StatCard label="In Field" value={tools.filter(t => t.status === ToolStatus.BOOKED_OUT).length} color="bg-neda-orange" />
          </div>
          
          <div className="bg-white border border-slate-100 p-6 rounded-[2rem] space-y-4 shadow-sm">
             <div className="flex items-center gap-2 mb-2">
                <FileText size={16} className="text-neda-orange" />
                <h3 className="text-[10px] font-black text-neda-navy uppercase tracking-widest">Master Sheet Controls</h3>
             </div>
             <div className="grid grid-cols-1 gap-3">
                <button onClick={exportCSV} className="w-full py-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between px-6 hover:border-neda-orange transition-all group">
                   <div className="flex items-center gap-3">
                      <Download size={18} className="text-neda-navy group-hover:text-neda-orange" />
                      <span className="text-xs font-black text-neda-navy uppercase">Export Stocktake (CSV)</span>
                   </div>
                   <ArrowUpRight size={16} className="text-slate-300" />
                </button>
                <button onClick={() => fileInputRef.current?.click()} className="w-full py-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between px-6 hover:border-neda-orange transition-all group">
                   <div className="flex items-center gap-3">
                      <Upload size={18} className="text-neda-navy group-hover:text-neda-orange" />
                      <span className="text-xs font-black text-neda-navy uppercase">Bulk Upload Assets</span>
                   </div>
                   <ArrowUpRight size={16} className="text-slate-300" />
                </button>
                <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleImport} />
             </div>
          </div>
        </div>
      )}

      {activeTab === 'USERS' && (
        <div className="space-y-4 animate-in fade-in duration-300">
           <button onClick={() => setShowUserModal(true)} className="w-full py-4 bg-white border-2 border-dashed border-neda-navy/20 text-neda-navy rounded-2xl flex items-center justify-center gap-3 font-black text-xs uppercase hover:bg-slate-50 transition-colors">
              <UserPlus size={18} /> Register Personnel
           </button>
           <div className="grid gap-3">
             {allUsers.map(user => (
               <div key={user.id} className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm relative overflow-hidden group">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                       <div className="w-10 h-10 bg-neda-lightNavy rounded-full flex items-center justify-center font-black text-neda-navy text-sm uppercase">{user.name.charAt(0)}</div>
                       <div>
                          <p className="text-sm font-black text-neda-navy uppercase tracking-tight">{user.name}</p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{user.role} • {user.email}</p>
                       </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditingUser(user)} className="p-2 text-slate-300 hover:text-neda-navy transition-colors">
                        <Edit size={16} />
                      </button>
                      <button onClick={() => onUpdateUser({...user, isEnabled: !user.isEnabled})} className={`p-2 transition-colors ${user.isEnabled ? 'text-green-500 hover:bg-green-50 rounded-xl' : 'text-slate-200 hover:bg-slate-50 rounded-xl'}`}>
                        {user.isEnabled ? <CheckCircle2 size={18} /> : <Trash2 size={18} />}
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                       <Lock size={12} className="text-slate-300" />
                       {/* FIXED: Removed 'uppercase' and 'tracking-widest' to preserve true password casing */}
                       <span className="text-[10px] font-mono font-bold text-neda-navy/40">
                         {showPasswords[user.id] ? user.password : '••••••••'}
                       </span>
                    </div>
                    <button onClick={() => togglePasswordVisibility(user.id)} className="text-[9px] font-black text-neda-orange uppercase tracking-widest">
                      {showPasswords[user.id] ? 'Hide' : 'Reveal'}
                    </button>
                  </div>
               </div>
             ))}
           </div>
        </div>
      )}

      {showUserModal && <AddUserModal onClose={() => setShowUserModal(false)} onAdd={async (u) => { await onAddUser(u); setShowUserModal(false); }} />}
      {editingUser && <EditUserModal user={editingUser} onClose={() => setEditingUser(null)} onUpdate={async (u) => { await onUpdateUser(u); setEditingUser(null); }} />}
    </div>
  );
};

// --- Modals ---

const AddUserModal: React.FC<{ onClose: () => void; onAdd: (u: User) => Promise<void> }> = ({ onClose, onAdd }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('Builda123'); // Default initial password
  const [role, setRole] = useState(UserRole.USER);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await onAdd({ id: 'U' + Math.random().toString(36).substr(2, 5).toUpperCase(), name, email, role, password, isEnabled: true });
    setLoading(false);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neda-navy/60 backdrop-blur-sm p-4 animate-in fade-in">
      <form onSubmit={handleSubmit} className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 space-y-5 shadow-2xl scale-in-95 animate-in">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-xl font-black text-neda-navy uppercase tracking-tight">New Personnel</h2>
          <button type="button" onClick={onClose} className="p-2 bg-slate-50 rounded-xl"><X size={18} /></button>
        </div>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-[9px] font-black text-neda-navy/40 uppercase tracking-widest ml-1">Full Name</label>
            <input type="text" placeholder="John Smith" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-neda-orange text-sm font-bold" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-neda-navy/40 uppercase tracking-widest ml-1">Email</label>
            <input type="email" placeholder="john@nedabuilda.com" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-neda-orange text-sm font-bold" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-neda-navy/40 uppercase tracking-widest ml-1">Initial Password</label>
            <input type="text" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-neda-orange text-sm font-mono font-bold" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-neda-navy/40 uppercase tracking-widest ml-1">System Role</label>
            <select className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-black uppercase outline-none" value={role} onChange={e => setRole(e.target.value as any)}>
               <option value={UserRole.USER}>Field Worker</option>
               <option value={UserRole.MANAGER}>Manager</option>
               <option value={UserRole.ADMIN}>Administrator</option>
            </select>
          </div>
        </div>
        <button type="submit" disabled={loading} className="w-full py-5 bg-neda-navy text-white rounded-2xl font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2">
          {loading ? <Loader2 className="animate-spin" size={18} /> : "Create Account"}
        </button>
      </form>
    </div>
  );
};

const EditUserModal: React.FC<{ user: User; onClose: () => void; onUpdate: (u: User) => Promise<void> }> = ({ user, onClose, onUpdate }) => {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState(user.password || '');
  const [role, setRole] = useState(user.role);
  const [loading, setLoading] = useState(false);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await onUpdate({ ...user, name, email, password, role });
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neda-navy/60 backdrop-blur-sm p-4 animate-in fade-in">
      <form onSubmit={handleSubmit} className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 space-y-5 shadow-2xl">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-xl font-black text-neda-navy uppercase tracking-tight">Edit Personnel</h2>
          <button type="button" onClick={onClose} className="p-2 bg-slate-50 rounded-xl"><X size={18} /></button>
        </div>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-[9px] font-black text-neda-navy/40 uppercase tracking-widest ml-1">Name</label>
            <input type="text" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-neda-navy/40 uppercase tracking-widest ml-1">Email</label>
            <input type="email" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-neda-navy/40 uppercase tracking-widest ml-1">Modify Password</label>
            <div className="relative">
              <input type="text" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-mono font-bold" value={password} onChange={e => setPassword(e.target.value)} required />
              <Lock className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-200" size={14} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-neda-navy/40 uppercase tracking-widest ml-1">Role</label>
            <select className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-black uppercase" value={role} onChange={e => setRole(e.target.value as any)}>
               <option value={UserRole.USER}>Field Worker</option>
               <option value={UserRole.MANAGER}>Manager</option>
               <option value={UserRole.ADMIN}>Administrator</option>
            </select>
          </div>
        </div>
        <button type="submit" disabled={loading} className="w-full py-5 bg-neda-navy text-white rounded-2xl font-black uppercase tracking-widest shadow-lg flex items-center justify-center gap-2">
           {loading ? <Loader2 className="animate-spin" size={18} /> : "Save Changes"}
        </button>
      </form>
    </div>
  );
};

// --- Components ---
const StatCard: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
  <div className={`${color} p-6 rounded-[2rem] text-white relative overflow-hidden shadow-md`}>
    <p className="text-[9px] font-black uppercase tracking-widest opacity-60 leading-none">{label}</p>
    <h3 className="text-3xl font-black mt-1 leading-none">{value}</h3>
    <div className="absolute -bottom-4 -right-4 w-16 h-16 bg-white opacity-10 rounded-full blur-xl"></div>
  </div>
);

const ToolCard: React.FC<{ tool: Tool; onClick: () => void }> = ({ tool, onClick }) => (
  <button onClick={onClick} className="w-full text-left bg-white p-5 rounded-[1.5rem] border border-slate-100 shadow-sm hover:shadow-md transition-all active:scale-[0.98] group">
    <div className="flex justify-between items-start mb-3">
      <div className="flex gap-4">
        <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center group-hover:bg-neda-lightOrange transition-colors"><Package size={20} className="text-neda-navy/20 group-hover:text-neda-orange transition-colors" /></div>
        <div>
          <h4 className="font-black text-neda-navy uppercase text-sm tracking-tight">{tool.name}</h4>
          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">SN: {tool.serialNumber}</p>
        </div>
      </div>
      <StatusBadge status={tool.status} />
    </div>
    {tool.status === ToolStatus.BOOKED_OUT && (
      <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between text-[10px] font-bold uppercase text-neda-navy/60">
        <div className="flex items-center gap-2"><UserIcon size={14} className="text-neda-orange" /> {tool.currentHolderName}</div>
        <div className="flex items-center gap-2"><MapPin size={14} className="text-slate-300" /> {tool.currentSite}</div>
      </div>
    )}
  </button>
);

const ToolModal: React.FC<{ tool: Tool; onClose: () => void; currentUser: User; onUpdate: (t: Tool) => Promise<void>; }> = ({ tool, onClose, currentUser, onUpdate }) => {
  const [action, setAction] = useState<'IDLE' | 'BOOKING' | 'RETURNING'>('IDLE');
  const [site, setSite] = useState('');
  const [loading, setLoading] = useState(false);
  
  const handleBooking = async () => {
    setLoading(true);
    await onUpdate({ ...tool, status: ToolStatus.BOOKED_OUT, currentHolderId: currentUser.id, currentHolderName: currentUser.name, currentSite: site, bookedAt: Date.now(), logs: [...tool.logs, { id: Math.random().toString(36).substr(2, 9), userId: currentUser.id, userName: currentUser.name, action: 'BOOK_OUT', timestamp: Date.now(), site }] });
    setLoading(false);
  };
  const handleReturn = async () => {
    setLoading(true);
    await onUpdate({ ...tool, status: ToolStatus.AVAILABLE, currentHolderId: undefined, currentHolderName: undefined, currentSite: undefined, bookedAt: undefined, lastReturnedAt: Date.now(), logs: [...tool.logs, { id: Math.random().toString(36).substr(2, 9), userId: currentUser.id, userName: currentUser.name, action: 'RETURN', timestamp: Date.now() }] });
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-neda-navy/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-white w-full max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom-10 sm:slide-in-from-bottom-0">
        <div className="flex justify-between items-center mb-6">
           <div>
            <h2 className="text-xl font-black text-neda-navy uppercase tracking-tighter">{tool.name}</h2>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Asset ID: {tool.id}</p>
           </div>
           <button onClick={onClose} className="p-2 bg-slate-50 rounded-xl"><X size={20} /></button>
        </div>
        {action === 'IDLE' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <StatusBadge status={tool.status} />
              <span className="text-[10px] font-black text-slate-300 uppercase">{tool.category}</span>
            </div>
            {tool.status === ToolStatus.AVAILABLE && <button onClick={() => setAction('BOOKING')} className="w-full py-5 bg-neda-navy text-white rounded-2xl font-black uppercase tracking-widest active:scale-95 transition-all">Assign to Site</button>}
            {tool.status === ToolStatus.BOOKED_OUT && tool.currentHolderId === currentUser.id && <button onClick={() => setAction('RETURNING')} className="w-full py-5 bg-green-600 text-white rounded-2xl font-black uppercase tracking-widest active:scale-95 transition-all">Confirm Return</button>}
          </div>
        )}
        {action === 'BOOKING' && (
          <div className="space-y-4 animate-in slide-in-from-right-4">
             <div className="space-y-1">
                <label className="text-[9px] font-black text-neda-navy/40 uppercase tracking-widest ml-1">Site Location</label>
                <input type="text" placeholder="e.g. Waterfront Project" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none" value={site} onChange={e => setSite(e.target.value)} />
             </div>
             <button onClick={handleBooking} disabled={!site || loading} className="w-full py-5 bg-neda-navy text-white rounded-2xl font-black uppercase tracking-widest disabled:opacity-50 active:scale-95 transition-all flex items-center justify-center gap-2">
                {loading && <Loader2 className="animate-spin" size={18} />} Assign Deployment
             </button>
          </div>
        )}
        {action === 'RETURNING' && (
          <div className="space-y-4 animate-in slide-in-from-right-4">
             <p className="text-xs font-bold text-neda-navy/60 text-center px-4">Confirming the return of this asset to the Neda Builda Warehouse.</p>
             <button onClick={handleReturn} disabled={loading} className="w-full py-5 bg-green-600 text-white rounded-2xl font-black uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2">
                {loading && <Loader2 className="animate-spin" size={18} />} Process Return
             </button>
          </div>
        )}
      </div>
    </div>
  );
};

const AddToolModal: React.FC<{ onClose: () => void; onAdd: (t: Tool) => Promise<void>; currentUser: User }> = ({ onClose, onAdd, currentUser }) => {
  const [name, setName] = useState('');
  const [serial, setSerial] = useState('');
  const [category, setCategory] = useState('Power Tools');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await onAdd({ 
      id: 'T' + Math.random().toString(36).substr(2, 5).toUpperCase(), 
      name, 
      category, 
      serialNumber: serial, 
      status: ToolStatus.AVAILABLE, 
      logs: [{ id: 'L1', userId: currentUser.id, userName: currentUser.name, action: 'CREATE', timestamp: Date.now() }] 
    });
    setLoading(false);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neda-navy/60 backdrop-blur-sm p-4 animate-in fade-in">
      <form onSubmit={handleSubmit} className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 space-y-5 shadow-2xl scale-in-95 animate-in">
        <h2 className="text-xl font-black text-neda-navy uppercase tracking-tight">Register Asset</h2>
        <div className="space-y-4">
          <input type="text" placeholder="Asset Name" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold outline-none" value={name} onChange={e => setName(e.target.value)} required />
          <input type="text" placeholder="Serial Number" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold outline-none" value={serial} onChange={e => setSerial(e.target.value)} required />
          <select className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-black uppercase" value={category} onChange={e => setCategory(e.target.value)}>
             <option>Power Tools</option>
             <option>Heavy Machinery</option>
             <option>Precision Gear</option>
             <option>Safety Kit</option>
          </select>
        </div>
        <button type="submit" disabled={loading} className="w-full py-5 bg-neda-orange text-white rounded-2xl font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2">
           {loading ? <Loader2 className="animate-spin" size={18} /> : "Add to System"}
        </button>
        <button onClick={onClose} type="button" className="w-full text-slate-400 font-bold uppercase text-[10px]">Cancel</button>
      </form>
    </div>
  );
};

const AIAssistant: React.FC<{ tools: Tool[] }> = ({ tools }) => {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const handleSend = async () => {
    if (!query.trim()) return;
    const msg = query; setQuery(''); setMessages(p => [...p, { role: 'user', content: msg }]);
    setLoading(true);
    const reply = await analyzeTools(tools, msg);
    setMessages(p => [...p, { role: 'assistant', content: reply }]);
    setLoading(false);
  };
  return (
    <div className="flex flex-col h-[70vh] bg-slate-50 rounded-[2.5rem] overflow-hidden border border-slate-100 shadow-inner">
       <div className="bg-neda-navy p-4 flex items-center gap-3 text-white">
          <Sparkles className="text-neda-orange" size={20} />
          <span className="font-black text-xs uppercase">Pulse Assistant</span>
       </div>
       <div className="flex-1 overflow-y-auto p-4 space-y-4 hide-scrollbar">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`text-[11px] font-bold p-4 rounded-2xl max-w-[85%] ${
                m.role === 'user' ? 'bg-neda-orange text-white rounded-tr-none' : 'bg-white text-neda-navy border border-slate-100 rounded-tl-none'
              }`}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && <div className="flex justify-start px-2"><Loader2 className="animate-spin text-neda-navy opacity-20" size={16} /></div>}
       </div>
       <div className="p-4 bg-white border-t border-slate-100 flex gap-2">
          <input type="text" placeholder="Ask Pulse..." className="flex-1 p-4 bg-slate-50 rounded-2xl text-xs font-bold outline-none" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} />
          <button onClick={handleSend} className="p-4 bg-neda-navy text-white rounded-2xl"><Send size={18} /></button>
       </div>
    </div>
  );
};

const StatusBadge: React.FC<{ status: ToolStatus }> = ({ status }) => {
  const configs = {
    [ToolStatus.AVAILABLE]: { label: 'Warehouse', color: 'bg-green-100 text-green-700' },
    [ToolStatus.BOOKED_OUT]: { label: 'Site Active', color: 'bg-neda-lightOrange text-neda-orange' },
    [ToolStatus.UNDER_REPAIR]: { label: 'In Repair', color: 'bg-neda-lightNavy text-neda-navy' },
    [ToolStatus.DEFECTIVE]: { label: 'Faulty', color: 'bg-red-100 text-red-600' }
  };
  const config = configs[status];
  return <span className={`text-[8px] font-black px-2.5 py-1 rounded-lg uppercase tracking-widest ${config.color}`}>{config.label}</span>;
};

export default App;

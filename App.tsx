
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Tool, ToolStatus, User, UserRole, View, ToolLog } from './types';
import { INITIAL_USERS, INITIAL_TOOLS } from './mockData';
import Layout, { NedaLogo, LOGO_URL } from './components/Layout';
import { 
  Search, 
  MapPin, 
  X, 
  Loader2, 
  Package, 
  Sparkles, 
  Filter, 
  Plus, 
  ChevronDown,
  Edit,
  Trash2,
  Download,
  Upload,
  FileText,
  User as UserIcon,
  Fingerprint,
  WifiOff,
  AlertTriangle,
  CheckCircle2,
  Lock,
  UserPlus,
  ArrowUpRight,
  Send,
  AlertCircle,
  Scan,
  CheckCircle,
  FileSpreadsheet,
  History,
  ShieldAlert,
  Save,
  Mail,
  Info
} from 'lucide-react';
import { analyzeTools, searchAddresses } from './services/geminiService';
import { fetchTools, fetchUsers, syncTools, syncUsers, upsertSingleTool, upsertSingleUser, supabase } from './services/supabaseService';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [tools, setTools] = useState<Tool[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [view, setView] = useState<View>('INVENTORY');
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<ToolStatus | 'ALL'>('ALL');
  const [showFilters, setShowFilters] = useState(false);
  
  // Biometric state
  const [showBiometricEnrollment, setShowBiometricEnrollment] = useState(false);
  const [isBiometricSupported, setIsBiometricSupported] = useState(false);

  useEffect(() => {
    const initData = async () => {
      try {
        const remoteUsers = await fetchUsers();
        const remoteTools = await fetchTools();

        let finalUsers = remoteUsers && remoteUsers.length > 0 ? remoteUsers : INITIAL_USERS;
        let finalTools = remoteTools && remoteTools.length > 0 ? remoteTools : INITIAL_TOOLS;

        setAllUsers(finalUsers);
        setTools(finalTools);

        if (!remoteTools || remoteTools.length === 0) {
          await syncTools(finalTools);
          if (!remoteUsers || remoteUsers.length === 0) await syncUsers(finalUsers);
        }

        const savedUserStr = localStorage.getItem('et_user');
        if (savedUserStr) {
          const savedUser = JSON.parse(savedUserStr);
          // Re-verify the user against the latest remote list to ensure IDs match
          const freshUser = finalUsers.find(u => u.email.toLowerCase() === savedUser.email.toLowerCase());
          if (freshUser) {
            setCurrentUser(freshUser);
            localStorage.setItem('et_user', JSON.stringify(freshUser));
          } else {
            setCurrentUser(savedUser);
          }
        }

        if (window.PublicKeyCredential) {
          const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
          setIsBiometricSupported(available);
        }
      } catch (err) {
        console.error("Initialization failed:", err);
      } finally {
        setIsInitializing(false);
      }
    };
    initData();
  }, []);

  const handleLogin = (user: User, remember: boolean) => {
    setCurrentUser(user);
    if (remember) localStorage.setItem('et_user', JSON.stringify(user));
    
    const enrollmentKey = `biometric_enrolled_${user.email}`;
    const isEnrolled = localStorage.getItem(enrollmentKey);
    if (isBiometricSupported && !isEnrolled) {
      setTimeout(() => setShowBiometricEnrollment(true), 1000);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('et_user');
    setView('INVENTORY');
  };

  const handleEnrollBiometrics = async () => {
    if (!currentUser) return;
    try {
      const enrollmentKey = `biometric_enrolled_${currentUser.email}`;
      localStorage.setItem(enrollmentKey, 'true');
      setShowBiometricEnrollment(false);
    } catch (err) {
      console.error("Enrollment failed", err);
    }
  };

  const updateTool = async (updatedTool: Tool) => {
    const oldTools = [...tools];
    setTools(prev => prev.map(t => t.id === updatedTool.id ? updatedTool : t));
    setIsSyncing(true);
    try {
      await upsertSingleTool(updatedTool);
      setSyncError(null);
    } catch (e: any) {
      setSyncError(e.message || "Update Failed");
      setTools(oldTools);
    } finally {
      setIsSyncing(false);
    }
  };

  const bulkAddTools = async (newToolsList: Tool[]) => {
    setIsSyncing(true);
    try {
      await syncTools(newToolsList);
      const freshTools = await fetchTools();
      if (freshTools) setTools(freshTools);
      setSyncSuccess(`Successfully imported ${newToolsList.length} assets.`);
      setSyncError(null);
      setTimeout(() => setSyncSuccess(null), 5000);
    } catch (e: any) {
      setSyncError(`Bulk Sync Error: ${e.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const addUser = async (newUser: User) => {
    setIsSyncing(true);
    try {
      await upsertSingleUser(newUser);
      const updatedUsers = [...allUsers, newUser];
      setAllUsers(updatedUsers);
      setSyncSuccess(`User ${newUser.name} registered.`);
      setTimeout(() => setSyncSuccess(null), 3000);
      setSyncError(null);
    } catch (e: any) {
      setSyncError(e.message || "Registration Failed");
      throw e;
    } finally {
      setIsSyncing(false);
    }
  };

  const filteredTools = useMemo(() => {
    return tools.filter(t => {
      const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (t.currentHolderName || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [tools, searchTerm, statusFilter]);

  // Robust filtering for "My Tools" that handles both ID and Name matching (case-insensitive)
  const myAssignedTools = useMemo(() => {
    if (!currentUser) return [];
    return tools.filter(t => {
      const matchesId = t.currentHolderId === currentUser.id;
      const matchesName = t.currentHolderName && t.currentHolderName.toLowerCase() === currentUser.name.toLowerCase();
      return matchesId || matchesName;
    });
  }, [tools, currentUser]);

  if (isInitializing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-neda-navy mb-4" />
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Loading Neda Pulse...</p>
      </div>
    );
  }

  if (!currentUser) return (
    <LoginScreen 
      onLogin={handleLogin} 
      users={allUsers} 
      isBiometricSupported={isBiometricSupported} 
    />
  );

  return (
    <Layout activeView={view} setView={setView} userRole={currentUser.role} onLogout={handleLogout}>
      <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] w-full max-w-xs px-4 pointer-events-none">
        {isSyncing && (
          <div className="bg-neda-navy text-white px-4 py-3 rounded-2xl shadow-lg flex items-center justify-center gap-3 animate-in slide-in-from-top-4">
            <Loader2 className="animate-spin" size={16} />
            <span className="text-[10px] font-black uppercase tracking-widest">Processing Assets...</span>
          </div>
        )}
        {syncSuccess && (
          <div className="bg-green-500 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in slide-in-from-top-4 pointer-events-auto">
            <CheckCircle2 size={18} className="shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-widest flex-1">{syncSuccess}</span>
            <button onClick={() => setSyncSuccess(null)} className="p-1 bg-white/20 rounded-lg"><X size={10} /></button>
          </div>
        )}
        {syncError && (
          <div className="bg-red-500 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in slide-in-from-top-4 pointer-events-auto">
            <AlertTriangle size={18} className="shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-widest flex-1">{syncError}</span>
            <button onClick={() => setSyncError(null)} className="p-1 bg-white/20 rounded-lg"><X size={10} /></button>
          </div>
        )}
      </div>

      {view === 'INVENTORY' && (
        <InventoryView 
          tools={filteredTools} 
          searchTerm={searchTerm} 
          setSearchTerm={setSearchTerm}
          statusFilter={statusFilter} 
          setStatusFilter={setStatusFilter}
          showFilters={showFilters}
          setShowFilters={setShowFilters}
          currentUser={currentUser}
          onUpdateTool={updateTool}
        />
      )}

      {view === 'MY_TOOLS' && (
        <MyToolsView tools={myAssignedTools} currentUser={currentUser} onUpdateTool={updateTool} />
      )}

      {view === 'ADMIN_DASHBOARD' && (
        <AdminDashboard 
          tools={tools} 
          allUsers={allUsers} 
          onAddUser={addUser} 
          onBulkImport={bulkAddTools} 
          userRole={currentUser.role}
        />
      )}

      {view === 'AI_ASSISTANT' && <AIAssistant tools={tools} />}

      {/* Biometric Enrollment Modal */}
      {showBiometricEnrollment && (
        <div className="fixed inset-0 z-[200] bg-neda-navy/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-t-[2.5rem] sm:rounded-[2.5rem] p-8 pb-10 shadow-2xl animate-in slide-in-from-bottom-10 text-center">
            <div className="mx-auto w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-6">
              <Fingerprint size={32} className="text-neda-navy" />
            </div>
            <h2 className="text-xl font-black text-neda-navy uppercase mb-2">Enable Face ID?</h2>
            <p className="text-xs font-bold text-slate-400 uppercase leading-relaxed mb-8">
              Use your device biometrics for faster and more secure logins next time.
            </p>
            <div className="space-y-3">
              <button 
                onClick={handleEnrollBiometrics}
                className="w-full py-5 bg-neda-navy text-white rounded-2xl font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all"
              >
                Enable Access
              </button>
              <button 
                onClick={() => setShowBiometricEnrollment(false)}
                className="w-full py-4 text-slate-400 font-black uppercase text-[10px] tracking-[0.2em]"
              >
                Maybe Later
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

const LoginScreen: React.FC<{ 
  onLogin: (u: User, rem: boolean) => void; 
  users: User[];
  isBiometricSupported: boolean;
}> = ({ onLogin, users, isBiometricSupported }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [isBiometricEnrolled, setIsBiometricEnrolled] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);

  useEffect(() => {
    const lastUserStr = localStorage.getItem('et_user');
    if (lastUserStr) {
      const lastUser = JSON.parse(lastUserStr);
      setEmail(lastUser.email);
      const enrollmentKey = `biometric_enrolled_${lastUser.email}`;
      setIsBiometricEnrolled(localStorage.getItem(enrollmentKey) === 'true');
    }
  }, []);

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (user) {
      onLogin(user, rememberMe);
    } else {
      setError('Account not found. Please check your email.');
    }
  };

  const handleBiometricAuth = async () => {
    try {
      const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
      if (user) {
        onLogin(user, true);
      } else {
        setError('Please sign in with password first to enable Face ID.');
      }
    } catch (err) {
      setError('Biometric authentication failed.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-full max-w-[420px] bg-white rounded-[3rem] p-10 pt-12 pb-14 shadow-2xl flex flex-col items-center">
        <div className="mb-8">
          <img src={LOGO_URL} alt="Neda Builda Logo" className="h-16 mx-auto object-contain" />
        </div>
        <div className="w-full mb-8">
          <span className="text-slate-300 text-[10px] font-black tracking-[0.3em] uppercase">Neda Tool Access</span>
        </div>
        <form onSubmit={handleSignIn} className="w-full space-y-4">
          <input 
            type="email" 
            placeholder="Work Email" 
            required
            className="w-full bg-[#f8faff] border border-slate-100 rounded-2xl py-5 px-6 text-slate-600 font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-neda-navy/5 transition-all text-center"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              const enrollmentKey = `biometric_enrolled_${e.target.value}`;
              setIsBiometricEnrolled(localStorage.getItem(enrollmentKey) === 'true');
            }}
          />
          <input 
            type="password" 
            placeholder="Password" 
            required={!isBiometricEnrolled}
            className="w-full bg-[#f8faff] border border-slate-100 rounded-2xl py-5 px-6 text-slate-600 font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-neda-navy/5 transition-all text-center"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-red-500 text-[10px] font-bold uppercase">{error}</p>}
          <div className="flex justify-between items-center px-1 py-2 mb-4">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input 
                type="checkbox" 
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-neda-navy focus:ring-neda-navy cursor-pointer"
              />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-slate-600 transition-colors">Remember Me</span>
            </label>
            <button 
              type="button" 
              onClick={() => setShowForgotModal(true)}
              className="text-neda-orange text-[10px] font-black uppercase tracking-widest hover:opacity-80 transition-opacity"
            >
              Forgot?
            </button>
          </div>
          <div className="flex flex-col gap-3">
            <button 
              type="submit" 
              className="w-full bg-[#142948] text-white py-6 rounded-2xl font-black text-lg tracking-widest shadow-lg active:scale-[0.98] transition-all uppercase"
            >
              Sign In
            </button>
            {(isBiometricSupported && isBiometricEnrolled) && (
              <button 
                type="button"
                onClick={handleBiometricAuth}
                className="w-full border-2 border-slate-100 bg-white text-neda-navy py-5 rounded-2xl flex items-center justify-center gap-3 active:scale-95 transition-all"
              >
                <Fingerprint size={24} className="text-neda-orange" />
                <span className="font-black text-sm uppercase tracking-widest">Face ID</span>
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-[200] bg-neda-navy/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-t-[2.5rem] sm:rounded-[2.5rem] p-10 pb-12 shadow-2xl animate-in slide-in-from-bottom-10 text-center">
            <div className="mx-auto w-16 h-16 bg-neda-lightOrange rounded-2xl flex items-center justify-center mb-6">
              <Mail size={32} className="text-neda-orange" />
            </div>
            <h2 className="text-xl font-black text-neda-navy uppercase mb-4">Reset Password</h2>
            <p className="text-xs font-bold text-slate-500 uppercase leading-relaxed mb-8">
              Please contact your system administrator to reset your login credentials.
            </p>
            
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 mb-8 flex flex-col items-center">
               <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Administrator Contact</span>
               <p className="text-sm font-black text-neda-navy uppercase tracking-tight">Karin Admin</p>
               <a href="mailto:karin@nedabuilda.com" className="text-[10px] font-bold text-neda-orange mt-1">karin@nedabuilda.com</a>
            </div>

            <button 
              onClick={() => setShowForgotModal(false)}
              className="w-full py-5 bg-neda-navy text-white rounded-2xl font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all"
            >
              Got it, thanks
            </button>
          </div>
        </div>
      )}

      <div className="mt-8 opacity-30">
        <p className="text-[8px] font-black uppercase tracking-[0.4em] text-neda-navy">Powered by Chrisonic</p>
      </div>
    </div>
  );
};

const InventoryView: React.FC<any> = ({ tools, searchTerm, setSearchTerm, statusFilter, setStatusFilter, showFilters, setShowFilters, currentUser, onUpdateTool }) => {
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
          <input 
            type="text" 
            placeholder="Search items..." 
            className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-white border border-slate-100 shadow-sm outline-none font-bold"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button onClick={() => setShowFilters(!showFilters)} className={`p-3.5 rounded-2xl transition-all ${showFilters ? 'bg-neda-orange text-white' : 'bg-white border border-slate-100'}`}>
          <Filter size={20} />
        </button>
      </div>

      <div className="grid gap-3">
        {tools.map((tool: Tool) => (
          <button 
            key={tool.id} 
            onClick={() => setSelectedTool(tool)}
            className="bg-white p-5 rounded-[1.5rem] border border-slate-100 shadow-sm text-left group active:scale-[0.98] transition-all"
          >
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0 pr-2">
                <h3 className="font-black text-neda-navy uppercase text-sm truncate">{tool.name}</h3>
                <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">{tool.category}</p>
              </div>
              <StatusBadge status={tool.status} />
            </div>
            {tool.currentHolderName && (
              <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserIcon size={12} className="text-neda-orange" />
                  <span className="text-[9px] font-black text-neda-navy uppercase truncate max-w-[80px]">{tool.currentHolderName}</span>
                </div>
                {tool.currentSite && (
                  <div className="flex items-center gap-1 max-w-[120px]">
                    <MapPin size={10} className="text-slate-300 shrink-0" />
                    <span className="text-[9px] font-bold text-slate-400 truncate">{tool.currentSite}</span>
                  </div>
                )}
              </div>
            )}
          </button>
        ))}
      </div>

      {selectedTool && (
        <ToolModal tool={selectedTool} onClose={() => setSelectedTool(null)} currentUser={currentUser} onUpdate={onUpdateTool} />
      )}
    </div>
  );
};

const MyToolsView: React.FC<any> = ({ tools, currentUser, onUpdateTool }) => {
  return (
    <div className="space-y-6">
      <div className="bg-neda-navy p-8 rounded-[2.5rem] text-white shadow-xl">
        <div className="flex justify-between items-start">
           <div>
              <h2 className="text-3xl font-black uppercase">Field Kit</h2>
              <p className="text-[9px] font-black text-neda-orange uppercase mt-1 tracking-widest">{currentUser.name}</p>
           </div>
           <div className="bg-white/10 p-3 rounded-2xl border border-white/5">
              <Package size={24} className="text-white" />
           </div>
        </div>
        <div className="mt-6 pt-4 border-t border-white/10">
           <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest">{tools.length} Assets Logged</p>
        </div>
      </div>
      <div className="grid gap-3">
        {tools.length === 0 && (
          <div className="py-20 text-center">
             <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-slate-100">
               <Package className="text-slate-200" size={32} />
             </div>
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No tools assigned to your profile</p>
             <p className="text-[8px] font-bold text-slate-300 uppercase mt-2 tracking-widest">Check "Inventory" to book out gear</p>
          </div>
        )}
        {tools.map((tool: Tool) => (
          <div key={tool.id} className="bg-white p-6 rounded-[1.5rem] border border-blue-100 shadow-md animate-in fade-in slide-in-from-bottom-2">
            <div className="flex justify-between items-start mb-4">
               <div>
                  <h3 className="font-black text-neda-navy uppercase text-sm">{tool.name}</h3>
                  <p className="text-[8px] font-bold text-slate-300 uppercase mt-1">{tool.id}</p>
               </div>
               <div className="p-2 bg-slate-50 rounded-lg">
                  <MapPin size={12} className="text-neda-orange" />
               </div>
            </div>
            <div className="flex items-center gap-2 mb-6">
              <span className="text-[9px] font-bold text-slate-400 uppercase">Site:</span>
              <p className="text-[10px] font-black text-neda-navy uppercase truncate">{tool.currentSite || 'Warehouse'}</p>
            </div>
            <button 
              onClick={() => onUpdateTool({ ...tool, status: ToolStatus.AVAILABLE, currentHolderId: undefined, currentHolderName: undefined, currentSite: undefined, lastReturnedAt: Date.now() })}
              className="w-full py-4 bg-white text-neda-navy border border-slate-100 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-red-50 hover:text-red-500 hover:border-red-100 transition-all shadow-sm"
            >
              Log Return to Warehouse
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

const AdminDashboard: React.FC<any> = ({ tools, allUsers, onAddUser, onBulkImport, userRole }) => {
  const [activeTab, setActiveTab] = useState<'STOCK' | 'USERS'>('STOCK');
  const [showAddUser, setShowAddUser] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadCSVTemplate = () => {
    const headers = "id,equipment_tool,equipment_type,date_of_purchase,number_of_items,main_photo,current_holder_id,current_holder_name,current_site,status,notes,booked_at,last_returned_at,logs,serial_number";
    const example = "T999,Hilti Hammer,Power Tools,2024-01-10,1,https://example.com/photo.jpg,U2,Gavin Builder,Auckland Site,BOOKED_OUT,Handle with care,1710000000000,,[],SN-12345";
    const blob = new Blob([`${headers}\n${example}`], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'neda_tool_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const downloadInventoryCSV = () => {
    const headers = "id,equipment_tool,equipment_type,date_of_purchase,number_of_items,main_photo,current_holder_id,current_holder_name,current_site,status,notes,booked_at,last_returned_at,logs,serial_number";
    const csvRows = tools.map((t: Tool) => [
      t.id,
      `"${t.name.replace(/"/g, '""')}"`,
      `"${t.category.replace(/"/g, '""')}"`,
      t.dateOfPurchase || '',
      t.numberOfItems || 1,
      t.mainPhoto || '',
      t.currentHolderId || '',
      `"${(t.currentHolderName || '').replace(/"/g, '""')}"`,
      `"${(t.currentSite || '').replace(/"/g, '""')}"`,
      t.status,
      `"${(t.notes || '').replace(/"/g, '""')}"`,
      t.bookedAt || '',
      t.lastReturnedAt || '',
      `"${JSON.stringify(t.logs).replace(/"/g, '""')}"`,
      t.serialNumber || ''
    ].join(','));
    const csvContent = [headers, ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `neda_inventory_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImport = (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      const dataLines = lines.slice(1);
      const imported: Tool[] = dataLines.map(line => {
        const regex = /(?:,|\n|^)(?:"([^"]*(?:""[^"]*)*)"|([^,\n]*))/g;
        const parts: string[] = [];
        let match;
        while ((match = regex.exec(line)) !== null) {
          parts.push(match[1] ? match[1].replace(/""/g, '"') : match[2]);
        }
        const clean = (p: string) => p?.trim() || '';
        const logsRaw = clean(parts[13]);
        let parsedLogs: ToolLog[] = [];
        try { if (logsRaw && logsRaw !== '[]' && logsRaw !== '') parsedLogs = JSON.parse(logsRaw); } catch (e) {}
        return {
          id: clean(parts[0]) || 'T' + Math.random().toString(36).substr(2, 5).toUpperCase(),
          name: clean(parts[1]) || 'Unnamed',
          category: clean(parts[2]) || 'General',
          dateOfPurchase: clean(parts[3]),
          numberOfItems: parseInt(clean(parts[4])) || 1,
          mainPhoto: clean(parts[5]),
          currentHolderId: clean(parts[6]) || undefined, 
          currentHolderName: clean(parts[7]) || undefined, 
          currentSite: clean(parts[8]) || undefined,
          status: (clean(parts[9]) as ToolStatus) || ToolStatus.AVAILABLE,
          notes: clean(parts[10]) || '',
          bookedAt: parseInt(clean(parts[11])) || undefined,
          lastReturnedAt: parseInt(clean(parts[12])) || undefined,
          logs: parsedLogs,
          serialNumber: clean(parts[14]) || ''
        };
      });
      onBulkImport(imported);
    };
    reader.readAsText(file);
    if (e.target) e.target.value = null;
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex gap-2 bg-slate-100 p-1.5 rounded-2xl">
        <button onClick={() => setActiveTab('STOCK')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'STOCK' ? 'bg-white shadow-sm' : 'text-slate-400'}`}>Stocktake</button>
        <button onClick={() => setActiveTab('USERS')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'USERS' ? 'bg-white shadow-sm' : 'text-slate-400'}`}>Personnel</button>
      </div>

      {activeTab === 'STOCK' ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Assets" value={tools.length} color="bg-neda-navy" />
            <StatCard label="In Field" value={tools.filter((t: Tool) => t.status === ToolStatus.BOOKED_OUT).length} color="bg-neda-orange" />
          </div>
          
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-[12px] font-black uppercase tracking-widest text-neda-navy flex items-center gap-2">
                <FileSpreadsheet size={16} className="text-neda-orange" /> Bulk Operations
              </h3>
              <button onClick={downloadCSVTemplate} className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 hover:text-neda-navy transition-colors">
                <Download size={12} /> Template
              </button>
            </div>

            <div className="space-y-3">
              <button onClick={() => fileInputRef.current?.click()} className="w-full py-6 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between px-6 group hover:border-neda-orange transition-all">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white rounded-xl border border-slate-100 group-hover:bg-neda-lightOrange transition-colors">
                    <Upload size={18} className="text-neda-navy group-hover:text-neda-orange" />
                  </div>
                  <div className="text-left">
                    <span className="block text-[11px] font-black uppercase tracking-tight">Sync CSV Manifest</span>
                    <span className="block text-[8px] font-bold text-slate-400 uppercase mt-0.5">Automated asset registration</span>
                  </div>
                </div>
                <ArrowUpRight size={16} className="text-slate-300 group-hover:text-neda-orange transition-colors" />
              </button>
              <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleImport} />

              <button onClick={downloadInventoryCSV} className="w-full py-6 bg-neda-navy text-white rounded-2xl flex items-center justify-between px-6 shadow-lg active:scale-[0.98] transition-all">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/10 rounded-xl">
                    <Download size={18} className="text-white" />
                  </div>
                  <div className="text-left">
                    <span className="block text-[11px] font-black uppercase tracking-tight">Export Inventory</span>
                    <span className="block text-[8px] font-bold text-white/50 uppercase mt-0.5">Download current manifest</span>
                  </div>
                </div>
                <FileText size={16} className="text-white/30" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {allUsers.map((u: User) => (
            <div key={u.id} className="bg-white p-5 rounded-[1.5rem] border border-slate-100 flex justify-between items-center shadow-sm">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center border border-slate-100">
                  <UserIcon size={20} className="text-slate-300" />
                </div>
                <div>
                  <p className="font-black text-neda-navy uppercase text-xs">{u.name}</p>
                  <p className="text-[9px] font-bold text-slate-300 uppercase">ID: {u.id}</p>
                  <p className="text-[7px] font-bold text-slate-400 uppercase">{u.email}</p>
                </div>
              </div>
              <span className={`text-[8px] font-black uppercase px-2.5 py-1 rounded-lg ${u.role !== UserRole.USER ? 'bg-neda-navy text-white' : 'bg-slate-50 text-slate-400'}`}>
                {u.role}
              </span>
            </div>
          ))}
          <button 
            onClick={() => setShowAddUser(true)}
            className="w-full py-5 border-2 border-dashed border-slate-200 rounded-[1.5rem] text-[10px] font-black uppercase text-slate-300 flex items-center justify-center gap-2 mt-4 hover:border-neda-orange hover:text-neda-orange transition-all"
          >
            <UserPlus size={16} /> Register New Person
          </button>
          
          {showAddUser && <AddUserModal onClose={() => setShowAddUser(false)} onAdd={onAddUser} />}
        </div>
      )}
    </div>
  );
};

const AddUserModal: React.FC<{ onClose: () => void; onAdd: (u: User) => void }> = ({ onClose, onAdd }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>(UserRole.USER);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd({
      id: 'U' + Math.random().toString(36).substr(2, 6).toUpperCase(),
      name,
      email,
      role,
      isEnabled: true,
      password: 'password123'
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] bg-neda-navy/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
      <div className="bg-white w-full max-w-sm rounded-t-[2.5rem] sm:rounded-[2.5rem] p-8 pb-10 shadow-2xl animate-in slide-in-from-bottom-10">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-black text-neda-navy uppercase">Register User</h2>
          <button onClick={onClose} className="p-2 bg-slate-50 rounded-xl"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input placeholder="Full Name (e.g. Callum Law)" required className="w-full p-4 bg-slate-50 rounded-2xl font-bold text-sm border border-slate-100" value={name} onChange={e => setName(e.target.value)} />
          <input type="email" placeholder="Email Address" required className="w-full p-4 bg-slate-50 rounded-2xl font-bold text-sm border border-slate-100" value={email} onChange={e => setEmail(e.target.value)} />
          <div className="flex gap-2">
             <button type="button" onClick={() => setRole(UserRole.USER)} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase border transition-all ${role === UserRole.USER ? 'bg-neda-navy text-white border-neda-navy' : 'bg-white border-slate-100 text-slate-400'}`}>Staff</button>
             <button type="button" onClick={() => setRole(UserRole.MANAGER)} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase border transition-all ${role === UserRole.MANAGER ? 'bg-neda-navy text-white border-neda-navy' : 'bg-white border-slate-100 text-slate-400'}`}>Manager</button>
          </div>
          <button type="submit" className="w-full py-5 bg-neda-navy text-white rounded-2xl font-black uppercase tracking-widest shadow-lg mt-4 flex items-center justify-center gap-2">
             <Save size={18} /> Register Personnel
          </button>
        </form>
      </div>
    </div>
  );
};

const ToolModal: React.FC<any> = ({ tool, onClose, currentUser, onUpdate }) => {
  const [site, setSite] = useState(tool.currentSite || '');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

  const isManagement = currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.MANAGER;
  const isAvailable = tool.status === ToolStatus.AVAILABLE;
  const isHeldByMe = tool.currentHolderId === currentUser.id || (tool.currentHolderName && tool.currentHolderName.toLowerCase() === currentUser.name.toLowerCase());
  
  // Logic: Management can always reassign. Site Staff can ONLY book out from 'AVAILABLE'.
  const canBook = isManagement ? true : isAvailable;

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (site.trim().length >= 3) {
        setIsLoadingSuggestions(true);
        try {
          const results = await searchAddresses(site);
          setSuggestions(results);
        } catch (error) {
          console.error("Address fetch error:", error);
        } finally {
          setIsLoadingSuggestions(false);
        }
      } else {
        setSuggestions([]);
      }
    }, 450);
    return () => clearTimeout(delayDebounceFn);
  }, [site]);

  const handleAssign = async () => {
    await onUpdate({ 
      ...tool, 
      status: ToolStatus.BOOKED_OUT, 
      currentHolderId: currentUser.id, 
      currentHolderName: currentUser.name, 
      currentSite: site, 
      bookedAt: Date.now() 
    });
    onClose();
  };

  const handleReturn = async () => {
    await onUpdate({
      ...tool,
      status: ToolStatus.AVAILABLE,
      currentHolderId: undefined,
      currentHolderName: undefined,
      currentSite: undefined,
      lastReturnedAt: Date.now()
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[150] bg-neda-navy/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
      <div className="bg-white w-full max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] p-8 shadow-2xl animate-in slide-in-from-bottom-10 overflow-visible">
        <div className="flex justify-between items-start mb-6">
          <div className="min-w-0 pr-4">
            <h2 className="text-xl font-black text-neda-navy uppercase truncate">{tool.name}</h2>
            <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest mt-0.5 truncate">{tool.id} • {tool.category}</p>
          </div>
          <button onClick={onClose} className="p-2 bg-slate-50 rounded-xl transition-colors hover:bg-slate-100"><X size={20} /></button>
        </div>
        
        <div className="space-y-4 relative">
          {!isAvailable && (
            <div className="p-5 bg-neda-lightOrange rounded-2xl border border-neda-orange/20">
               <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center border border-neda-orange/10">
                     <UserIcon size={18} className="text-neda-orange" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[8px] font-black text-neda-orange uppercase tracking-[0.2em]">Current Holder</p>
                    <p className="text-xs font-black text-neda-navy uppercase mt-0.5 truncate">{tool.currentHolderName}</p>
                    {tool.currentSite && (
                      <p className="text-[8px] font-bold text-slate-400 mt-1 uppercase truncate">Site: {tool.currentSite}</p>
                    )}
                  </div>
                  {isHeldByMe && <CheckCircle size={16} className="text-green-500 shrink-0" />}
               </div>
            </div>
          )}

          {canBook ? (
            <>
              <div className="relative">
                <div className="flex items-center bg-slate-50 border border-slate-100 rounded-2xl px-4 focus-within:ring-2 focus-within:ring-neda-navy/10 transition-all">
                  <MapPin size={18} className="text-slate-300" />
                  <input 
                    placeholder="Assign to Site Address..." 
                    className="flex-1 p-4 bg-transparent font-bold outline-none text-sm"
                    value={site}
                    onChange={(e) => setSite(e.target.value)}
                  />
                  {isLoadingSuggestions && <Loader2 size={16} className="animate-spin text-neda-orange" />}
                </div>

                {suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-2xl z-[160] overflow-hidden animate-in slide-in-from-top-2">
                    {suggestions.map((addr, idx) => (
                      <button 
                        key={idx}
                        onClick={() => { setSite(addr); setSuggestions([]); }}
                        className="w-full text-left px-5 py-4 hover:bg-slate-50 text-[10px] font-black uppercase tracking-wider text-neda-navy border-b border-slate-50 last:border-0 transition-colors"
                      >
                        {addr}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button 
                  onClick={handleAssign} 
                  disabled={!site.trim()}
                  className="flex-1 py-5 bg-neda-navy text-white rounded-2xl font-black uppercase tracking-widest shadow-lg active:scale-[0.98] transition-all disabled:opacity-30 disabled:bg-slate-200"
                >
                  {isAvailable ? 'Book Out' : 'Override / Reassign'}
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              {isHeldByMe ? (
                <button 
                  onClick={handleReturn}
                  className="w-full py-5 bg-white border-2 border-neda-navy text-neda-navy rounded-2xl font-black uppercase tracking-widest shadow-sm active:scale-95 transition-all"
                >
                  Return to Warehouse
                </button>
              ) : (
                <div className="p-6 bg-slate-50 rounded-2xl flex flex-col items-center justify-center gap-2 border border-slate-100 text-center">
                  <div className="p-3 bg-white rounded-full border border-slate-100 mb-1">
                    <Lock size={20} className="text-neda-orange" />
                  </div>
                  <span className="text-[10px] font-black uppercase text-neda-navy tracking-widest">Locked Asset</span>
                  <p className="text-[8px] font-bold text-slate-400 uppercase leading-relaxed max-w-[180px]">
                    This item is assigned to another person. It must be returned to the warehouse before it can be redeployed.
                  </p>
                </div>
              )}
            </div>
          )}

          {isManagement && !isAvailable && (
            <button 
              onClick={handleReturn}
              className="w-full py-3 text-[9px] font-black text-slate-300 uppercase tracking-widest flex items-center justify-center gap-2 hover:text-red-500 transition-colors"
            >
              <ShieldAlert size={12} /> Admin Force Return
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<any> = ({ label, value, color }) => (
  <div className={`${color} p-6 rounded-[2rem] text-white shadow-md relative overflow-hidden`}>
    <p className="text-[9px] font-black uppercase opacity-60 tracking-[0.2em]">{label}</p>
    <p className="text-3xl font-black mt-1">{value}</p>
    <div className="absolute -bottom-4 -right-4 w-16 h-16 bg-white opacity-10 rounded-full blur-xl"></div>
  </div>
);

const StatusBadge: React.FC<any> = ({ status }) => {
  const isAvailable = status === ToolStatus.AVAILABLE;
  return (
    <span className={`text-[8px] font-black uppercase px-2 py-1 rounded-lg shrink-0 ${isAvailable ? 'bg-green-100 text-green-700' : 'bg-neda-lightOrange text-neda-orange'}`}>
      {isAvailable ? 'Warehouse' : 'On Site'}
    </span>
  );
};

const AIAssistant: React.FC<any> = ({ tools }) => {
  const [query, setQuery] = useState('');
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAsk = async () => {
    if (!query.trim()) return;
    setLoading(true);
    const res = await analyzeTools(tools, query);
    setReply(res);
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100">
        <h2 className="text-xl font-black text-neda-navy uppercase flex items-center gap-2">
          <Sparkles className="text-neda-orange" /> Pulse AI
        </h2>
        <div className="mt-6 flex gap-2">
          <input 
            placeholder="Search assets, sites, or status..." 
            className="flex-1 p-4 bg-slate-50 rounded-2xl font-bold text-xs outline-none focus:ring-2 focus:ring-neda-orange/10 transition-all"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAsk()}
          />
          <button onClick={handleAsk} disabled={loading} className="p-4 bg-neda-navy text-white rounded-2xl active:scale-95 transition-all disabled:opacity-50">
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
        {reply && (
          <div className="mt-4 p-5 bg-slate-50 rounded-2xl text-[11px] font-bold text-slate-700 leading-relaxed border border-blue-50 animate-in fade-in slide-in-from-top-2">
            {reply}
          </div>
        )}
      </div>
    </div>
  );
};

export default App;

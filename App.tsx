
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
  Scan
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

        const savedUser = localStorage.getItem('et_user');
        if (savedUser) setCurrentUser(JSON.parse(savedUser));

        // Check for biometric support
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
    
    // Check if biometric enrollment is needed
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
      // In a real WebAuthn flow, we would get a challenge from the server.
      // Here we simulate the enrollment success.
      const enrollmentKey = `biometric_enrolled_${currentUser.email}`;
      localStorage.setItem(enrollmentKey, 'true');
      setShowBiometricEnrollment(false);
      // Optional: Store a success notification
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
    const updatedToolsList = [...tools, ...newToolsList];
    setIsSyncing(true);
    try {
      await syncTools(updatedToolsList);
      setTools(updatedToolsList);
      setSyncError(null);
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
      <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[100] w-full max-w-xs px-4 pointer-events-none">
        {isSyncing && (
          <div className="bg-neda-navy text-white px-4 py-2 rounded-2xl shadow-lg flex items-center justify-center gap-2 animate-in slide-in-from-top-4">
            <Loader2 className="animate-spin" size={12} />
            <span className="text-[8px] font-black uppercase tracking-widest">Syncing Cloud...</span>
          </div>
        )}
        {syncError && (
          <div className="bg-red-500 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in slide-in-from-top-4 pointer-events-auto">
            <AlertTriangle size={16} className="shrink-0" />
            <span className="text-[9px] font-black uppercase tracking-widest flex-1">{syncError}</span>
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
        <MyToolsView tools={tools.filter(t => t.currentHolderId === currentUser.id)} currentUser={currentUser} onUpdateTool={updateTool} />
      )}

      {view === 'ADMIN_DASHBOARD' && (
        <AdminDashboard 
          tools={tools} 
          allUsers={allUsers} 
          onAddUser={addUser} 
          onBulkImport={bulkAddTools} 
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

  useEffect(() => {
    // Check if the last known user had biometrics enrolled
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
      // Simulate WebAuthn trigger
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
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-[420px] bg-white rounded-[3rem] p-10 pt-12 pb-14 shadow-2xl flex flex-col items-center">
        {/* Logo Header */}
        <div className="text-center mb-8">
          <img src={LOGO_URL} alt="Neda Builda Logo" className="h-16 mx-auto object-contain" />
        </div>

        {/* Section Label */}
        <div className="w-full text-center mb-8">
          <span className="text-slate-300 text-[10px] font-black tracking-[0.3em] uppercase">Neda Tool</span>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSignIn} className="w-full space-y-4">
          <input 
            type="email" 
            placeholder="Work Email" 
            required
            className="w-full bg-[#f8faff] border border-slate-100 rounded-2xl py-5 px-6 text-slate-600 font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-neda-navy/5 transition-all"
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
            className="w-full bg-[#f8faff] border border-slate-100 rounded-2xl py-5 px-6 text-slate-600 font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-neda-navy/5 transition-all"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && <p className="text-red-500 text-[10px] font-bold uppercase text-center">{error}</p>}

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
            <button type="button" className="text-neda-orange text-[10px] font-black uppercase tracking-widest hover:opacity-80 transition-opacity">
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
      
      {/* Footer Powered By */}
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
              <div>
                <h3 className="font-black text-neda-navy uppercase text-sm">{tool.name}</h3>
                <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">{tool.category}</p>
              </div>
              <StatusBadge status={tool.status} />
            </div>
            {tool.currentHolderName && (
              <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserIcon size={12} className="text-neda-orange" />
                  <span className="text-[9px] font-black text-neda-navy uppercase">{tool.currentHolderName}</span>
                </div>
                {tool.currentSite && (
                  <div className="flex items-center gap-1">
                    <MapPin size={10} className="text-slate-300" />
                    <span className="text-[9px] font-bold text-slate-400">{tool.currentSite}</span>
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
      <div className="bg-neda-navy p-8 rounded-[2.5rem] text-white">
        <h2 className="text-3xl font-black uppercase">Field Kit</h2>
        <p className="text-[10px] font-bold text-neda-orange uppercase mt-1 tracking-widest">{tools.length} Assets Assigned</p>
      </div>
      <div className="grid gap-3">
        {tools.map((tool: Tool) => (
          <div key={tool.id} className="bg-white p-5 rounded-[1.5rem] border border-blue-100 shadow-md">
            <h3 className="font-black text-neda-navy uppercase">{tool.name}</h3>
            <button 
              onClick={() => onUpdateTool({ ...tool, status: ToolStatus.AVAILABLE, currentHolderId: undefined, currentHolderName: undefined, currentSite: undefined })}
              className="mt-4 w-full py-3 bg-slate-50 text-neda-navy border border-slate-100 rounded-xl font-black uppercase text-[10px] tracking-widest"
            >
              Return to Warehouse
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

const AdminDashboard: React.FC<any> = ({ tools, allUsers, onAddUser, onBulkImport }) => {
  const [activeTab, setActiveTab] = useState<'STOCK' | 'USERS'>('STOCK');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImport = (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      const dataLines = lines.slice(1);
      
      const imported: Tool[] = dataLines.map(line => {
        const parts = line.split(',');
        const clean = (p: string) => p?.trim().replace(/^"|"$/g, '') || '';
        
        const logsRaw = clean(parts[13]);
        let parsedLogs: ToolLog[] = [];
        try {
          if (logsRaw) parsedLogs = JSON.parse(logsRaw);
        } catch (e) {
          console.warn("Could not parse logs for item", clean(parts[0]));
        }

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
    <div className="space-y-6">
      <div className="flex gap-2 bg-slate-100 p-1 rounded-2xl">
        <button onClick={() => setActiveTab('STOCK')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'STOCK' ? 'bg-white shadow-sm' : 'text-slate-400'}`}>Stocktake</button>
        <button onClick={() => setActiveTab('USERS')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'USERS' ? 'bg-white shadow-sm' : 'text-slate-400'}`}>Personnel</button>
      </div>

      {activeTab === 'STOCK' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Assets" value={tools.length} color="bg-neda-navy" />
            <StatCard label="In Field" value={tools.filter((t: Tool) => t.status === ToolStatus.BOOKED_OUT).length} color="bg-neda-orange" />
          </div>
          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Controls</h3>
              <span className="text-[8px] font-bold text-slate-300">Format: 15-Column CSV</span>
            </div>
            <button onClick={() => fileInputRef.current?.click()} className="w-full py-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between px-6 group hover:border-neda-orange transition-all">
              <div className="flex items-center gap-3">
                <Upload size={18} className="text-neda-navy" />
                <span className="text-xs font-black uppercase">Bulk Sync Assets</span>
              </div>
              <ArrowUpRight size={16} className="text-slate-300" />
            </button>
            <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleImport} />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {allUsers.map((u: User) => (
            <div key={u.id} className="bg-white p-4 rounded-2xl border border-slate-100 flex justify-between items-center">
              <div>
                <p className="font-black text-neda-navy uppercase">{u.name}</p>
                <p className="text-[9px] font-bold text-slate-300 uppercase">ID: {u.id}</p>
              </div>
              <span className="text-[9px] font-black uppercase px-2 py-1 bg-slate-50 rounded-lg">{u.role}</span>
            </div>
          ))}
          <button className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-[10px] font-black uppercase text-slate-300">Register New Person</button>
        </div>
      )}
    </div>
  );
};

const ToolModal: React.FC<any> = ({ tool, onClose, currentUser, onUpdate }) => {
  const [site, setSite] = useState(tool.currentSite || '');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

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

  return (
    <div className="fixed inset-0 z-[150] bg-neda-navy/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
      <div className="bg-white w-full max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] p-8 shadow-2xl animate-in slide-in-from-bottom-10 overflow-visible">
        <div className="flex justify-between items-start mb-6">
          <h2 className="text-xl font-black text-neda-navy uppercase">{tool.name}</h2>
          <button onClick={onClose} className="p-2 bg-slate-50 rounded-xl transition-colors hover:bg-slate-100"><X size={20} /></button>
        </div>
        
        <div className="space-y-4 relative">
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
                    onClick={() => {
                      setSite(addr);
                      setSuggestions([]);
                    }}
                    className="w-full text-left px-5 py-4 hover:bg-slate-50 text-[10px] font-black uppercase tracking-wider text-neda-navy border-b border-slate-50 last:border-0 transition-colors"
                  >
                    {addr}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
             <div className="flex items-center gap-3">
                <UserIcon size={16} className="text-neda-orange" />
                <div>
                  <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Logging to Holder</p>
                  <p className="text-xs font-black text-neda-navy uppercase">{currentUser.name}</p>
                </div>
             </div>
          </div>

          <button 
            onClick={handleAssign} 
            disabled={!site.trim()}
            className="w-full py-5 bg-neda-navy text-white rounded-2xl font-black uppercase tracking-widest shadow-lg active:scale-[0.98] transition-all disabled:opacity-30"
          >
            Confirm Deployment
          </button>
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<any> = ({ label, value, color }) => (
  <div className={`${color} p-6 rounded-[2rem] text-white shadow-md relative overflow-hidden`}>
    <p className="text-[9px] font-black uppercase opacity-60">{label}</p>
    <p className="text-3xl font-black mt-1">{value}</p>
    <div className="absolute -bottom-4 -right-4 w-16 h-16 bg-white opacity-10 rounded-full blur-xl"></div>
  </div>
);

const StatusBadge: React.FC<any> = ({ status }) => {
  const isAvailable = status === ToolStatus.AVAILABLE;
  return (
    <span className={`text-[8px] font-black uppercase px-2 py-1 rounded-lg ${isAvailable ? 'bg-green-100 text-green-700' : 'bg-neda-lightOrange text-neda-orange'}`}>
      {isAvailable ? 'Warehouse' : 'On Site'}
    </span>
  );
};

const AIAssistant: React.FC<any> = ({ tools }) => {
  const [query, setQuery] = useState('');
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAsk = async () => {
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
            placeholder="Ask anything..." 
            className="flex-1 p-4 bg-slate-50 rounded-2xl font-bold text-xs outline-none"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button onClick={handleAsk} className="p-4 bg-neda-navy text-white rounded-2xl">
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
        {reply && (
          <div className="mt-4 p-5 bg-slate-50 rounded-2xl text-[11px] font-bold text-slate-700 leading-relaxed border border-blue-50">
            {reply}
          </div>
        )}
      </div>
    </div>
  );
};

export default App;

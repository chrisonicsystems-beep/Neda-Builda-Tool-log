
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
  Info,
  Key,
  Eye,
  EyeOff,
  Copy
} from 'lucide-react';
import { analyzeTools, searchAddresses } from './services/geminiService';
import { fetchTools, fetchUsers, syncTools, syncUsers, upsertSingleTool, upsertSingleUser, supabase } from './services/supabaseService';

const TEMP_PASSWORD_PREFIX = "NEDA-RESET-";

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
          await syncTools(finalTools).catch(e => console.warn("Supabase Tool Sync Skipped", e));
          if (!remoteUsers || remoteUsers.length === 0) {
             await syncUsers(finalUsers).catch(e => console.warn("Supabase User Sync Skipped", e));
          }
        }

        const savedUserStr = localStorage.getItem('et_user');
        if (savedUserStr) {
          const savedUser = JSON.parse(savedUserStr);
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
    if (isBiometricSupported && !isEnrolled && !user.mustChangePassword) {
      setTimeout(() => setShowBiometricEnrollment(true), 1000);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('et_user');
    setView('INVENTORY');
  };

  const updateUser = async (updatedUser: User) => {
    setIsSyncing(true);
    try {
      await upsertSingleUser(updatedUser);
      setAllUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
      if (currentUser && currentUser.id === updatedUser.id) {
        setCurrentUser(updatedUser);
        localStorage.setItem('et_user', JSON.stringify(updatedUser));
      }
      setSyncSuccess(`Account for ${updatedUser.name} updated.`);
      setTimeout(() => setSyncSuccess(null), 3000);
      setSyncError(null);
    } catch (e: any) {
      setSyncError(e.message || "Database update failed. Local change saved.");
      // Fallback for demo: Update local state even if DB fails
      setAllUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
      if (currentUser && currentUser.id === updatedUser.id) {
        setCurrentUser(updatedUser);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const updateTool = async (updatedTool: Tool) => {
    setIsSyncing(true);
    try {
      await upsertSingleTool(updatedTool);
      setTools(prev => prev.map(t => t.id === updatedTool.id ? updatedTool : t));
      setSyncSuccess(`${updatedTool.name} updated.`);
      setTimeout(() => setSyncSuccess(null), 3000);
      setSyncError(null);
    } catch (e: any) {
      setSyncError(e.message || "Update Failed");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleForgotPassword = async (email: string): Promise<string> => {
    const user = allUsers.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
    
    if (!user) {
      throw new Error(`Email "${email}" not found in system. Please check spelling or contact Admin.`);
    }

    const tempPass = TEMP_PASSWORD_PREFIX + Math.floor(1000 + Math.random() * 9000);
    const updatedUser = {
      ...user,
      password: tempPass,
      mustChangePassword: true
    };

    setIsSyncing(true);
    try {
      await upsertSingleUser(updatedUser);
      setAllUsers(prev => prev.map(u => u.id === user.id ? updatedUser : u));
      return tempPass;
    } catch (e: any) {
      console.warn("DB reset sync failed, proceeding with local reset for testing:", e);
      // Fallback: update local state so the user can actually test the flow
      setAllUsers(prev => prev.map(u => u.id === user.id ? updatedUser : u));
      return tempPass;
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
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Syncing Neda Pulse...</p>
      </div>
    );
  }

  if (!currentUser) return (
    <LoginScreen 
      onLogin={handleLogin} 
      onForgotPassword={handleForgotPassword}
      users={allUsers} 
      isBiometricSupported={isBiometricSupported} 
    />
  );

  return (
    <Layout activeView={view} setView={setView} userRole={currentUser.role} onLogout={handleLogout}>
      {currentUser.mustChangePassword && (
        <MandatoryPasswordChange 
          user={currentUser} 
          onUpdate={updateUser} 
        />
      )}

      <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] w-full max-w-xs px-4 pointer-events-none">
        {isSyncing && (
          <div className="bg-neda-navy text-white px-4 py-3 rounded-2xl shadow-lg flex items-center justify-center gap-3 animate-in slide-in-from-top-4">
            <Loader2 className="animate-spin" size={16} />
            <span className="text-[10px] font-black uppercase tracking-widest">Processing Data...</span>
          </div>
        )}
        {syncSuccess && (
          <div className="bg-green-500 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in slide-in-from-top-4 pointer-events-auto">
            <CheckCircle2 size={18} className="shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-widest flex-1">{syncSuccess}</span>
          </div>
        )}
        {syncError && (
          <div className="bg-red-500 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in slide-in-from-top-4 pointer-events-auto">
            <AlertTriangle size={18} className="shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-widest flex-1">{syncError}</span>
            <button onClick={() => setSyncError(null)} className="p-1"><X size={12}/></button>
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

      {view === 'ADMIN_DASHBOARD' && (
        <AdminDashboard 
          tools={tools} 
          allUsers={allUsers} 
          onUpdateUser={updateUser} 
          userRole={currentUser.role}
        />
      )}

      {view === 'AI_ASSISTANT' && <AIAssistant tools={tools} />}
      
      {view === 'MY_TOOLS' && (
        <MyToolsView 
          tools={tools.filter(t => t.currentHolderId === currentUser.id)} 
          currentUser={currentUser} 
          onUpdateTool={updateTool} 
        />
      )}
    </Layout>
  );
};

const MandatoryPasswordChange: React.FC<{ user: User; onUpdate: (u: User) => void }> = ({ user, onUpdate }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isDone, setIsDone] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setIsDone(true);
    setTimeout(() => {
      onUpdate({
        ...user,
        password: newPassword,
        mustChangePassword: false
      });
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-[500] bg-neda-navy flex items-center justify-center p-6 animate-in fade-in">
      <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden">
        {isDone ? (
          <div className="py-8 text-center animate-in zoom-in-95">
             <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 size={32} className="text-green-500" />
             </div>
             <h2 className="text-xl font-black text-neda-navy uppercase mb-2">Password Updated</h2>
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Updating Secure Credentials...</p>
          </div>
        ) : (
          <>
            <div className="w-16 h-16 bg-neda-lightOrange rounded-2xl flex items-center justify-center mb-6 mx-auto">
              <ShieldAlert size={32} className="text-neda-orange" />
            </div>
            <h2 className="text-xl font-black text-neda-navy uppercase mb-2 text-center">Secure Your Account</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase leading-relaxed mb-8 text-center">
              A password reset was used. You must set a permanent password to continue.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest pl-1">New Password</span>
                <input 
                  type="password" 
                  placeholder="Min 6 characters" 
                  required 
                  className="w-full p-4 bg-slate-50 rounded-2xl font-bold text-sm border border-slate-100" 
                  value={newPassword} 
                  onChange={e => setNewPassword(e.target.value)} 
                />
              </div>
              <div className="space-y-1">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest pl-1">Confirm New Password</span>
                <input 
                  type="password" 
                  placeholder="Repeat password" 
                  required 
                  className="w-full p-4 bg-slate-50 rounded-2xl font-bold text-sm border border-slate-100" 
                  value={confirmPassword} 
                  onChange={e => setConfirmPassword(e.target.value)} 
                />
              </div>
              {error && <p className="text-red-500 text-[9px] font-black uppercase text-center">{error}</p>}
              <button type="submit" className="w-full py-5 bg-neda-navy text-white rounded-2xl font-black uppercase tracking-widest shadow-lg mt-4 active:scale-95 transition-all">
                 Finalize Setup
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

const LoginScreen: React.FC<any> = ({ onLogin, onForgotPassword, users, isBiometricSupported }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [tempPassResult, setTempPassResult] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    const user = users.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
    if (user && user.password === password) {
      onLogin(user, rememberMe);
    } else {
      setError('Incorrect email or password.');
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsResetting(true);
    setError('');
    try {
      const temp = await onForgotPassword(forgotEmail);
      setTempPassResult(temp);
    } catch (err: any) {
      setError(err.message || "Reset failed. Check connection.");
    } finally {
      setIsResetting(false);
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
            className="w-full bg-[#f8faff] border border-slate-100 rounded-2xl py-5 px-6 text-slate-600 font-medium text-center focus:ring-2 focus:ring-neda-navy/5 outline-none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input 
            type="password" 
            placeholder="Password" 
            required 
            className="w-full bg-[#f8faff] border border-slate-100 rounded-2xl py-5 px-6 text-slate-600 font-medium text-center focus:ring-2 focus:ring-neda-navy/5 outline-none"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-red-500 text-[10px] font-bold uppercase">{error}</p>}
          <div className="flex justify-between items-center px-1 mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} className="w-4 h-4 rounded text-neda-navy" />
              <span className="text-[10px] font-black text-slate-400 uppercase">Remember</span>
            </label>
            <button 
              type="button" 
              onClick={() => { setShowForgotModal(true); setTempPassResult(null); setError(''); }}
              className="text-neda-orange text-[10px] font-black uppercase tracking-widest hover:opacity-70 transition-opacity"
            >
              Forgot Key?
            </button>
          </div>
          <button type="submit" className="w-full bg-neda-navy text-white py-6 rounded-2xl font-black text-lg uppercase shadow-lg active:scale-95 transition-all">
            Sign In
          </button>
        </form>
      </div>

      {showForgotModal && (
        <div className="fixed inset-0 z-[600] bg-neda-navy/90 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-t-[2.5rem] sm:rounded-[2.5rem] p-10 pb-12 shadow-2xl text-center animate-in slide-in-from-bottom-10">
            <div className="mx-auto w-16 h-16 bg-neda-lightOrange rounded-2xl flex items-center justify-center mb-6">
              <Key size={32} className="text-neda-orange" />
            </div>
            
            {tempPassResult ? (
              <div className="animate-in zoom-in-95">
                <h2 className="text-xl font-black text-neda-navy uppercase mb-4">Reset Successful</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase leading-relaxed mb-6">Your temporary login key is ready:</p>
                <div className="bg-slate-50 p-6 rounded-2xl border border-dashed border-neda-orange/30 mb-8 group relative cursor-pointer active:scale-95 transition-all" onClick={() => navigator.clipboard.writeText(tempPassResult)}>
                  <p className="text-xl font-mono font-black text-neda-orange tracking-wider select-all">{tempPassResult}</p>
                  <Copy size={12} className="absolute right-4 top-4 text-slate-300 group-hover:text-neda-orange" />
                </div>
                <button onClick={() => setShowForgotModal(false)} className="w-full py-5 bg-neda-navy text-white rounded-2xl font-black uppercase tracking-widest shadow-lg">
                  Return to Login
                </button>
              </div>
            ) : (
              <div>
                <h2 className="text-xl font-black text-neda-navy uppercase mb-2">Request Reset</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-8">Enter your work email for a temporary key.</p>
                <form onSubmit={handleResetSubmit} className="space-y-4">
                  <input type="email" placeholder="Work Email" required className="w-full p-4 bg-slate-50 rounded-2xl font-bold text-center border border-slate-100" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} />
                  {error && <p className="text-red-500 text-[9px] font-black uppercase">{error}</p>}
                  <button type="submit" disabled={isResetting} className="w-full py-5 bg-neda-navy text-white rounded-2xl font-black uppercase shadow-lg disabled:opacity-50">
                    {isResetting ? <Loader2 className="animate-spin mx-auto" size={18} /> : "Generate New Key"}
                  </button>
                  <button type="button" onClick={() => setShowForgotModal(false)} className="w-full py-3 text-slate-400 text-[10px] font-black uppercase tracking-widest">Nevermind</button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-8 opacity-30">
        <p className="text-[8px] font-black uppercase tracking-[0.4em] text-neda-navy">Powered by Chrisonic</p>
      </div>
    </div>
  );
};

// Sub-components
const InventoryView: React.FC<any> = ({ 
  tools, searchTerm, setSearchTerm, statusFilter, setStatusFilter, 
  showFilters, setShowFilters, currentUser, onUpdateTool 
}) => {
  const handleAction = (tool: Tool) => {
    if (tool.status === ToolStatus.AVAILABLE) {
      onUpdateTool({
        ...tool,
        status: ToolStatus.BOOKED_OUT,
        currentHolderId: currentUser.id,
        currentHolderName: currentUser.name,
        bookedAt: Date.now(),
        logs: [...(tool.logs || []), {
          id: Math.random().toString(36).substr(2, 9),
          userId: currentUser.id,
          userName: currentUser.name,
          action: 'BOOK_OUT',
          timestamp: Date.now()
        }]
      });
    } else if (tool.status === ToolStatus.BOOKED_OUT && tool.currentHolderId === currentUser.id) {
      onUpdateTool({
        ...tool,
        status: ToolStatus.AVAILABLE,
        currentHolderId: undefined,
        currentHolderName: undefined,
        bookedAt: undefined,
        logs: [...(tool.logs || []), {
          id: Math.random().toString(36).substr(2, 9),
          userId: currentUser.id,
          userName: currentUser.name,
          action: 'RETURN',
          timestamp: Date.now()
        }]
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input 
          type="text" 
          placeholder="Search equipment..." 
          className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-medium focus:ring-2 focus:ring-neda-navy/5 outline-none transition-all"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <button 
          onClick={() => setShowFilters(!showFilters)}
          className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-colors ${showFilters ? 'bg-neda-navy text-white' : 'text-slate-400'}`}
        >
          <Filter size={18} />
        </button>
      </div>

      <div className="grid gap-4">
        {tools.map((tool: Tool) => (
          <div key={tool.id} className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm group">
            <div className="flex justify-between items-start mb-4">
              <div>
                <span className="text-[8px] font-black uppercase tracking-[0.2em] text-neda-orange mb-1 block">{tool.category}</span>
                <h3 className="font-extrabold text-neda-navy text-lg">{tool.name}</h3>
              </div>
              <div className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-wider ${
                tool.status === ToolStatus.AVAILABLE ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-600'
              }`}>
                {tool.status.replace('_', ' ')}
              </div>
            </div>
            <div className="flex items-center justify-between pt-4 border-t border-slate-50">
               <span className="text-xs font-bold text-slate-600">{tool.currentHolderName || 'Warehouse'}</span>
               {(tool.status === ToolStatus.AVAILABLE || (tool.status === ToolStatus.BOOKED_OUT && tool.currentHolderId === currentUser.id)) && (
                <button onClick={() => handleAction(tool)} className="px-5 py-2.5 bg-neda-navy text-white rounded-xl font-black text-[10px] uppercase">
                  {tool.status === ToolStatus.AVAILABLE ? 'Book Out' : 'Return'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const AdminDashboard: React.FC<any> = ({ tools, allUsers, onUpdateUser, userRole }) => {
  const [activeTab, setActiveTab] = useState<'USERS' | 'REPORTS'>('USERS');

  return (
    <div className="space-y-6">
      <div className="flex gap-4 border-b border-slate-100 pb-2">
        <button onClick={() => setActiveTab('USERS')} className={`pb-2 text-[10px] font-black uppercase ${activeTab === 'USERS' ? 'text-neda-orange border-b-2 border-neda-orange' : 'text-slate-400'}`}>Staff</button>
        <button onClick={() => setActiveTab('REPORTS')} className={`pb-2 text-[10px] font-black uppercase ${activeTab === 'REPORTS' ? 'text-neda-orange border-b-2 border-neda-orange' : 'text-slate-400'}`}>Reports</button>
      </div>
      {activeTab === 'USERS' && (
        <div className="space-y-4">
          {allUsers.map((user: User) => (
            <div key={user.id} className="bg-white p-4 rounded-3xl border border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center"><UserIcon className="text-slate-400" size={20} /></div>
                <div>
                  <h4 className="font-bold text-neda-navy text-sm">{user.name}</h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">{user.role}</p>
                </div>
              </div>
              {user.mustChangePassword && <span className="bg-orange-100 text-orange-600 px-2 py-1 rounded-lg text-[8px] font-black uppercase">Pending Reset</span>}
            </div>
          ))}
        </div>
      )}
    </div>
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
    <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100">
      <h2 className="text-xl font-black text-neda-navy uppercase flex items-center gap-2 mb-6"><Sparkles className="text-neda-orange" /> Pulse AI</h2>
      <div className="flex gap-2">
        <input placeholder="Ask anything..." className="flex-1 p-4 bg-slate-50 rounded-2xl font-bold text-xs" value={query} onChange={e => setQuery(e.target.value)} />
        <button onClick={handleAsk} className="p-4 bg-neda-navy text-white rounded-2xl">{loading ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}</button>
      </div>
      {reply && <div className="mt-4 p-5 bg-slate-50 rounded-2xl text-[11px] font-bold text-slate-700 leading-relaxed border border-blue-50 animate-in fade-in">{reply}</div>}
    </div>
  );
};

const MyToolsView: React.FC<any> = ({ tools, currentUser, onUpdateTool }) => (
  <div className="space-y-6">
    <div className="bg-neda-navy p-8 rounded-[2.5rem] text-white shadow-xl">
       <h2 className="text-3xl font-black uppercase">My Kit</h2>
       <p className="text-[10px] font-black text-neda-orange uppercase mt-1 tracking-widest">{currentUser.name}</p>
    </div>
    <div className="grid gap-3">
      {tools.length === 0 ? <p className="text-center py-10 text-slate-300 font-bold uppercase text-[10px]">No assets currently assigned</p> : 
        tools.map((tool: Tool) => (
          <div key={tool.id} className="bg-white p-6 rounded-[1.5rem] border border-slate-100 flex justify-between items-center">
            <h3 className="font-black text-neda-navy uppercase text-sm">{tool.name}</h3>
            <button onClick={() => onUpdateTool({...tool, status: ToolStatus.AVAILABLE, currentHolderId: undefined, currentHolderName: undefined})} className="text-neda-orange font-black text-[10px] uppercase">Return</button>
          </div>
        ))
      }
    </div>
  </div>
);

export default App;


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
const BIOMETRIC_ENROLLED_KEY = "neda_biometric_v1_";

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
    
    // Show biometric enrollment only if not already enrolled on this device
    const enrollmentData = localStorage.getItem(BIOMETRIC_ENROLLED_KEY + user.email);
    if (isBiometricSupported && !enrollmentData && !user.mustChangePassword) {
      setTimeout(() => setShowBiometricEnrollment(true), 1500);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('et_user');
    setView('INVENTORY');
  };

  const updateUser = async (updatedUser: User) => {
    setIsSyncing(true);
    
    // Immediate local update
    setAllUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
    if (currentUser && currentUser.id === updatedUser.id) {
      setCurrentUser(updatedUser);
      localStorage.setItem('et_user', JSON.stringify(updatedUser));
    }

    try {
      await upsertSingleUser(updatedUser);
      setSyncSuccess(`Profile for ${updatedUser.name} updated.`);
      setTimeout(() => setSyncSuccess(null), 3000);
      setSyncError(null);
    } catch (e: any) {
      console.warn("DB update sync warning:", e);
      // We don't show an error here because local update already happened
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
      throw new Error(`Email "${email}" not found.`);
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
      setAllUsers(prev => prev.map(u => u.id === user.id ? updatedUser : u));
      return tempPass;
    } finally {
      setIsSyncing(false);
    }
  };

  const handleEnrollBiometric = () => {
    if (!currentUser) return;
    localStorage.setItem(BIOMETRIC_ENROLLED_KEY + currentUser.email, "true");
    setShowBiometricEnrollment(false);
    setSyncSuccess("Face ID / Touch ID Enabled");
    setTimeout(() => setSyncSuccess(null), 3000);
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

      {showBiometricEnrollment && (
        <div className="fixed inset-0 z-[600] bg-neda-navy/95 backdrop-blur-lg flex items-center justify-center p-6 animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-10 shadow-2xl text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-neda-orange to-neda-navy"></div>
            <div className="mx-auto w-20 h-20 bg-neda-lightOrange rounded-full flex items-center justify-center mb-8 animate-pulse">
              <Fingerprint size={48} className="text-neda-orange" />
            </div>
            <h2 className="text-2xl font-black text-neda-navy uppercase mb-4 tracking-tight">Enable Biometrics?</h2>
            <p className="text-[11px] font-bold text-slate-400 uppercase leading-relaxed mb-10 tracking-wider">
              Secure your access with Face ID or Touch ID for instant entry next time.
            </p>
            <div className="space-y-4">
              <button 
                onClick={handleEnrollBiometric}
                className="w-full py-5 bg-neda-navy text-white rounded-2xl font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all"
              >
                Secure Account
              </button>
              <button 
                onClick={() => setShowBiometricEnrollment(false)}
                className="w-full py-3 text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]"
              >
                Maybe Later
              </button>
            </div>
          </div>
        </div>
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
    onUpdate({
      ...user,
      password: newPassword,
      mustChangePassword: false
    });
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
            <h2 className="text-xl font-black text-neda-navy uppercase mb-2 text-center tracking-tight">Set Secure Key</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase leading-relaxed mb-8 text-center tracking-wider">
              A temporary key was used. Please set a permanent password.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest pl-1">New Password</span>
                <input 
                  type="password" 
                  placeholder="Min 6 characters" 
                  required 
                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm focus:ring-2 focus:ring-neda-navy/5 outline-none transition-all" 
                  value={newPassword} 
                  onChange={e => setNewPassword(e.target.value)} 
                />
              </div>
              <div className="space-y-1">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest pl-1">Confirm Key</span>
                <input 
                  type="password" 
                  placeholder="Repeat key" 
                  required 
                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm focus:ring-2 focus:ring-neda-navy/5 outline-none transition-all" 
                  value={confirmPassword} 
                  onChange={e => setConfirmPassword(e.target.value)} 
                />
              </div>
              {error && <p className="text-red-500 text-[9px] font-black uppercase text-center">{error}</p>}
              <button type="submit" className="w-full py-5 bg-neda-navy text-white rounded-2xl font-black uppercase tracking-widest shadow-lg mt-4 active:scale-95 transition-all">
                 Activate Key
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
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);

  useEffect(() => {
    // Check if any user is enrolled on this device
    const checkEnrolled = () => {
      const keys = Object.keys(localStorage);
      const isEnrolled = keys.some(k => k.startsWith(BIOMETRIC_ENROLLED_KEY));
      setIsBiometricAvailable(isBiometricSupported && isEnrolled);
    };
    checkEnrolled();
  }, [isBiometricSupported]);

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    const user = users.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
    if (user && user.password === password) {
      onLogin(user, rememberMe);
    } else {
      setError('Invalid credentials.');
    }
  };

  const handleBiometricLogin = async () => {
    try {
      // Simulate/Trigger biometric challenge
      // In a real environment with WebAuthn, this would involve navigator.credentials.get
      // For this implementation, we check the last remembered user if enrolled
      const savedUserStr = localStorage.getItem('et_user');
      if (savedUserStr) {
        const savedUser = JSON.parse(savedUserStr);
        const enrollmentKey = BIOMETRIC_ENROLLED_KEY + savedUser.email;
        if (localStorage.getItem(enrollmentKey)) {
          // Success simulated - in production, the device OS would handle this
          onLogin(savedUser, true);
          return;
        }
      }
      
      // If no saved user, ask for email first or show info
      setError("Please sign in with password first to enable device biometrics.");
      setTimeout(() => setError(""), 3000);
    } catch (err) {
      console.error("Biometric failure:", err);
      setError("Biometric sign in failed. Use password.");
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
      setError(err.message || "Reset failed.");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-full max-w-[420px] bg-white rounded-[3.5rem] p-10 pt-12 pb-14 shadow-2xl flex flex-col items-center">
        <div className="mb-10">
          <img src={LOGO_URL} alt="Neda Builda" className="h-20 mx-auto object-contain" />
        </div>
        
        <form onSubmit={handleSignIn} className="w-full space-y-4">
          <div className="space-y-1">
            <input 
              type="email" 
              placeholder="Email Address" 
              required 
              className="w-full bg-[#f8faff] border border-slate-100 rounded-2xl py-5 px-6 text-slate-700 font-bold text-center focus:ring-4 focus:ring-neda-navy/5 outline-none transition-all"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <input 
              type="password" 
              placeholder="Password" 
              required 
              className="w-full bg-[#f8faff] border border-slate-100 rounded-2xl py-5 px-6 text-slate-700 font-bold text-center focus:ring-4 focus:ring-neda-navy/5 outline-none transition-all"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <p className="text-red-500 text-[10px] font-black uppercase tracking-widest animate-pulse">{error}</p>}
          
          <div className="flex justify-between items-center px-2 mb-4">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} className="w-4 h-4 rounded border-slate-200 text-neda-navy focus:ring-0" />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-slate-600 transition-colors">Keep Signed In</span>
            </label>
            <button 
              type="button" 
              onClick={() => { setShowForgotModal(true); setTempPassResult(null); setError(''); }}
              className="text-neda-orange text-[10px] font-black uppercase tracking-widest hover:opacity-70 transition-opacity"
            >
              Forgot Key?
            </button>
          </div>

          <div className="flex flex-col gap-3">
            <button type="submit" className="w-full bg-neda-navy text-white py-6 rounded-2xl font-black text-xl uppercase shadow-xl hover:shadow-neda-navy/20 active:scale-95 transition-all">
              Sign In
            </button>

            {isBiometricAvailable && (
              <button 
                type="button" 
                onClick={handleBiometricLogin}
                className="w-full bg-slate-50 text-neda-navy border border-slate-200 py-5 rounded-2xl font-black text-xs uppercase flex items-center justify-center gap-3 hover:bg-slate-100 transition-colors"
              >
                <Fingerprint size={18} className="text-neda-orange" />
                Biometric Login
              </button>
            )}
          </div>
        </form>
      </div>

      {showForgotModal && (
        <div className="fixed inset-0 z-[600] bg-neda-navy/90 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-t-[3rem] sm:rounded-[3rem] p-10 pb-12 shadow-2xl text-center animate-in slide-in-from-bottom-10">
            <div className="mx-auto w-16 h-16 bg-neda-lightOrange rounded-2xl flex items-center justify-center mb-6">
              <Key size={32} className="text-neda-orange" />
            </div>
            
            {tempPassResult ? (
              <div className="animate-in zoom-in-95">
                <h2 className="text-xl font-black text-neda-navy uppercase mb-4 tracking-tight">Key Generated</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase leading-relaxed mb-6 tracking-widest">Copy your temporary access key:</p>
                <div className="bg-slate-50 p-6 rounded-2xl border border-dashed border-neda-orange/30 mb-8 group relative cursor-pointer active:scale-95 transition-all" onClick={() => {
                  navigator.clipboard.writeText(tempPassResult);
                }}>
                  <p className="text-xl font-mono font-black text-neda-orange tracking-[0.2em]">{tempPassResult}</p>
                  <Copy size={12} className="absolute right-4 top-4 text-slate-300 group-hover:text-neda-orange" />
                </div>
                <button onClick={() => setShowForgotModal(false)} className="w-full py-5 bg-neda-navy text-white rounded-2xl font-black uppercase tracking-widest shadow-lg">
                  Proceed to Login
                </button>
              </div>
            ) : (
              <div>
                <h2 className="text-xl font-black text-neda-navy uppercase mb-2 tracking-tight">Reset Request</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-8 tracking-widest">Enter your email to receive a temporary key.</p>
                <form onSubmit={handleResetSubmit} className="space-y-4">
                  <input type="email" placeholder="Work Email" required className="w-full p-5 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-center focus:ring-4 focus:ring-neda-navy/5 outline-none" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} />
                  {error && <p className="text-red-500 text-[9px] font-black uppercase tracking-widest">{error}</p>}
                  <button type="submit" disabled={isResetting} className="w-full py-5 bg-neda-navy text-white rounded-2xl font-black uppercase tracking-widest shadow-lg disabled:opacity-50">
                    {isResetting ? <Loader2 className="animate-spin mx-auto" size={20} /> : "Generate Key"}
                  </button>
                  <button type="button" onClick={() => setShowForgotModal(false)} className="w-full py-3 text-slate-400 text-[10px] font-black uppercase tracking-[0.3em]">Cancel</button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-10 opacity-30">
        <p className="text-[8px] font-black uppercase tracking-[0.5em] text-neda-navy">Pulse Core | Powered by Chrisonic</p>
      </div>
    </div>
  );
};

// ... Remaining Sub-components (InventoryView, AdminDashboard, etc) unchanged but kept for completeness ...
const InventoryView: React.FC<any> = ({ tools, searchTerm, setSearchTerm, statusFilter, setStatusFilter, showFilters, setShowFilters, currentUser, onUpdateTool }) => {
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
        <input type="text" placeholder="Search equipment..." className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-xs outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        <button onClick={() => setShowFilters(!showFilters)} className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-colors ${showFilters ? 'bg-neda-navy text-white' : 'text-slate-400'}`}><Filter size={18} /></button>
      </div>
      <div className="grid gap-4">
        {tools.map((tool: Tool) => (
          <div key={tool.id} className="bg-white border border-slate-100 rounded-[2rem] p-6 shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <div>
                <span className="text-[8px] font-black uppercase tracking-[0.2em] text-neda-orange mb-1 block">{tool.category}</span>
                <h3 className="font-extrabold text-neda-navy text-lg tracking-tight">{tool.name}</h3>
              </div>
              <div className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-wider ${tool.status === ToolStatus.AVAILABLE ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-600'}`}>{tool.status.replace('_', ' ')}</div>
            </div>
            <div className="flex items-center justify-between pt-5 border-t border-slate-50">
               <div className="flex flex-col">
                  <span className="text-[8px] font-bold text-slate-300 uppercase tracking-widest mb-0.5">Current Holder</span>
                  <span className="text-xs font-black text-slate-600 uppercase">{tool.currentHolderName || 'Warehouse'}</span>
               </div>
               {(tool.status === ToolStatus.AVAILABLE || (tool.status === ToolStatus.BOOKED_OUT && tool.currentHolderId === currentUser.id)) && (
                <button onClick={() => handleAction(tool)} className="px-6 py-3 bg-neda-navy text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-neda-navy/10 active:scale-95 transition-all">{tool.status === ToolStatus.AVAILABLE ? 'Book Out' : 'Return'}</button>
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
      <div className="flex gap-6 border-b border-slate-100 pb-2">
        <button onClick={() => setActiveTab('USERS')} className={`pb-2 text-[10px] font-black uppercase tracking-widest ${activeTab === 'USERS' ? 'text-neda-orange border-b-2 border-neda-orange' : 'text-slate-400'}`}>Staff List</button>
        <button onClick={() => setActiveTab('REPORTS')} className={`pb-2 text-[10px] font-black uppercase tracking-widest ${activeTab === 'REPORTS' ? 'text-neda-orange border-b-2 border-neda-orange' : 'text-slate-400'}`}>Analytics</button>
      </div>
      {activeTab === 'USERS' && (
        <div className="grid gap-3">
          {allUsers.map((user: User) => (
            <div key={user.id} className="bg-white p-5 rounded-[2rem] border border-slate-100 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center border border-slate-100"><UserIcon className="text-slate-400" size={20} /></div>
                <div className="flex flex-col">
                  <h4 className="font-black text-neda-navy text-sm tracking-tight">{user.name}</h4>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{user.role}</p>
                </div>
              </div>
              {user.mustChangePassword && <span className="bg-orange-50 text-neda-orange px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-wider border border-neda-orange/10">Key Pending</span>}
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
    const response = await analyzeTools(tools, query);
    setReply(response);
    setLoading(false);
  };
  return (
    <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100">
      <h2 className="text-2xl font-black text-neda-navy uppercase flex items-center gap-3 mb-8 tracking-tight"><Sparkles className="text-neda-orange" /> Pulse AI</h2>
      <div className="relative mb-6">
        <input 
          placeholder="How many drills are out?" 
          className="w-full p-5 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-xs focus:ring-4 focus:ring-neda-navy/5 outline-none transition-all" 
          value={query} 
          onChange={e => setQuery(e.target.value)} 
          onKeyPress={(e) => e.key === 'Enter' && handleAsk()}
        />
        <button onClick={handleAsk} className="absolute right-2 top-2 p-3 bg-neda-navy text-white rounded-xl shadow-lg active:scale-95 transition-all">
          {loading ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
        </button>
      </div>
      {reply && <div className="p-6 bg-slate-50 rounded-2xl text-[12px] font-bold text-slate-700 leading-relaxed border border-slate-100 animate-in fade-in">{reply}</div>}
    </div>
  );
};

const MyToolsView: React.FC<any> = ({ tools, currentUser, onUpdateTool }) => (
  <div className="space-y-6">
    <div className="bg-neda-navy p-10 rounded-[3rem] text-white shadow-2xl relative overflow-hidden">
       <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16"></div>
       <h2 className="text-4xl font-black uppercase tracking-tight">Personal Kit</h2>
       <p className="text-[11px] font-black text-neda-orange uppercase mt-2 tracking-[0.3em]">{currentUser.name}</p>
    </div>
    <div className="grid gap-3">
      {tools.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-[2rem] border border-dashed border-slate-200">
          <p className="text-slate-300 font-black uppercase text-[10px] tracking-widest">No assets assigned</p>
        </div>
      ) : (
        tools.map((tool: Tool) => (
          <div key={tool.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 flex justify-between items-center shadow-sm">
            <div className="flex flex-col">
              <span className="text-[8px] font-bold text-slate-300 uppercase mb-0.5 tracking-widest">{tool.category}</span>
              <h3 className="font-black text-neda-navy uppercase text-sm tracking-tight">{tool.name}</h3>
            </div>
            <button 
              onClick={() => onUpdateTool({...tool, status: ToolStatus.AVAILABLE, currentHolderId: undefined, currentHolderName: undefined})} 
              className="px-5 py-2.5 bg-slate-50 text-neda-orange rounded-xl font-black text-[10px] uppercase tracking-wider border border-neda-orange/10 hover:bg-neda-lightOrange transition-colors"
            >
              Return
            </button>
          </div>
        ))
      )}
    </div>
  </div>
);

export default App;

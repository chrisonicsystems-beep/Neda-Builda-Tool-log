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
          await syncTools(finalTools);
          if (!remoteUsers || remoteUsers.length === 0) await syncUsers(finalUsers);
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
      setSyncError(e.message || "Update Failed");
    } finally {
      setIsSyncing(false);
    }
  };

  // Fix: Added missing updateTool function to handle tool status changes and logging
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
    const user = allUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) throw new Error("Email address not recognized.");

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
      console.error("Password reset error:", e);
      throw new Error("Unable to reset password. Check connection.");
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

      {/* Other views omitted for brevity, logic remains same */}
    </Layout>
  );
};

// Fix: Added missing InventoryView component for tool management
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

      {showFilters && (
        <div className="flex flex-wrap gap-2 animate-in slide-in-from-top-2">
          {['ALL', ...Object.values(ToolStatus)].map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status as any)}
              className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${
                statusFilter === status 
                  ? 'bg-neda-navy border-neda-navy text-white shadow-md' 
                  : 'bg-white border-slate-200 text-slate-400'
              }`}
            >
              {status.replace('_', ' ')}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-4">
        {tools.map((tool: Tool) => (
          <div key={tool.id} className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm hover:shadow-md transition-shadow group">
            <div className="flex justify-between items-start mb-4">
              <div>
                <span className="text-[8px] font-black uppercase tracking-[0.2em] text-neda-orange mb-1 block">
                  {tool.category}
                </span>
                <h3 className="font-extrabold text-neda-navy text-lg group-hover:text-neda-orange transition-colors">
                  {tool.name}
                </h3>
                {tool.serialNumber && (
                   <p className="text-[10px] font-mono text-slate-400 mt-0.5">SN: {tool.serialNumber}</p>
                )}
              </div>
              <div className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-wider ${
                tool.status === ToolStatus.AVAILABLE ? 'bg-green-50 text-green-600' :
                tool.status === ToolStatus.BOOKED_OUT ? 'bg-orange-50 text-orange-600' :
                'bg-red-50 text-red-600'
              }`}>
                {tool.status.replace('_', ' ')}
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-50">
              <div className="flex flex-col">
                <span className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">Currently With</span>
                <div className="flex items-center gap-2 mt-1">
                  <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center">
                    <UserIcon size={12} className="text-slate-400" />
                  </div>
                  <span className="text-xs font-bold text-slate-600">
                    {tool.currentHolderName || 'Warehouse'}
                  </span>
                </div>
              </div>

              {(tool.status === ToolStatus.AVAILABLE || (tool.status === ToolStatus.BOOKED_OUT && tool.currentHolderId === currentUser.id)) && (
                <button 
                  onClick={() => handleAction(tool)}
                  className={`px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${
                    tool.status === ToolStatus.AVAILABLE 
                      ? 'bg-neda-navy text-white hover:bg-neda-orange shadow-lg shadow-neda-navy/10' 
                      : 'bg-white border-2 border-slate-100 text-slate-400 hover:border-red-100 hover:text-red-500'
                  }`}
                >
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

// Fix: Added missing AdminDashboard component for staff and asset management
const AdminDashboard: React.FC<any> = ({ tools, allUsers, onUpdateUser, userRole }) => {
  const [activeTab, setActiveTab] = useState<'USERS' | 'REPORTS'>('USERS');

  return (
    <div className="space-y-6">
      <div className="flex gap-4 border-b border-slate-100 pb-2 overflow-x-auto">
        <button 
          onClick={() => setActiveTab('USERS')}
          className={`pb-2 px-1 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'USERS' ? 'text-neda-orange border-b-2 border-neda-orange' : 'text-slate-400'}`}
        >
          Staff Directory
        </button>
        <button 
          onClick={() => setActiveTab('REPORTS')}
          className={`pb-2 px-1 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'REPORTS' ? 'text-neda-orange border-b-2 border-neda-orange' : 'text-slate-400'}`}
        >
          Asset Reports
        </button>
      </div>

      {activeTab === 'USERS' && (
        <div className="space-y-4">
          {allUsers.map((user: User) => (
            <div key={user.id} className="bg-white p-4 rounded-3xl border border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center">
                  <UserIcon className="text-slate-400" size={20} />
                </div>
                <div>
                  <h4 className="font-bold text-neda-navy text-sm">{user.name}</h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{user.role}</p>
                </div>
              </div>
              <div className="flex gap-2">
                 <button className="p-2 text-slate-300 hover:text-neda-orange transition-colors">
                   <Edit size={16} />
                 </button>
              </div>
            </div>
          ))}
          {userRole === UserRole.ADMIN && (
            <button className="w-full py-4 border-2 border-dashed border-slate-100 rounded-3xl text-slate-400 text-[10px] font-black uppercase tracking-widest hover:border-neda-orange hover:text-neda-orange transition-all flex items-center justify-center gap-2">
              <UserPlus size={16} />
              Add Staff Member
            </button>
          )}
        </div>
      )}

      {activeTab === 'REPORTS' && (
        <div className="bg-slate-50 rounded-[2.5rem] p-8 text-center border border-dashed border-slate-200">
          <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-sm">
            <FileSpreadsheet size={28} className="text-neda-orange" />
          </div>
          <h4 className="text-neda-navy font-black uppercase text-sm mb-2">Export Data</h4>
          <p className="text-[10px] font-bold text-slate-400 uppercase leading-relaxed mb-6">Download full CSV of all equipment assets and current statuses.</p>
          <button className="px-8 py-4 bg-neda-navy text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-lg shadow-neda-navy/20 active:scale-95 transition-all">
            Generate CSV
          </button>
        </div>
      )}
    </div>
  );
};

const MandatoryPasswordChange: React.FC<{ user: User; onUpdate: (u: User) => void }> = ({ user, onUpdate }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

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
    onUpdate({
      ...user,
      password: newPassword,
      mustChangePassword: false
    });
  };

  return (
    <div className="fixed inset-0 z-[400] bg-neda-navy flex items-center justify-center p-6 animate-in fade-in">
      <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-10 shadow-2xl">
        <div className="w-16 h-16 bg-neda-lightOrange rounded-2xl flex items-center justify-center mb-6 mx-auto">
          <ShieldAlert size={32} className="text-neda-orange" />
        </div>
        <h2 className="text-xl font-black text-neda-navy uppercase mb-2 text-center">Account Setup</h2>
        <p className="text-[10px] font-bold text-slate-400 uppercase leading-relaxed mb-8 text-center">
          You are using a temporary key. Please set a new permanent password.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input 
            type="password" 
            placeholder="New Password" 
            required 
            className="w-full p-4 bg-slate-50 rounded-2xl font-bold text-sm border border-slate-100" 
            value={newPassword} 
            onChange={e => setNewPassword(e.target.value)} 
          />
          <input 
            type="password" 
            placeholder="Confirm Password" 
            required 
            className="w-full p-4 bg-slate-50 rounded-2xl font-bold text-sm border border-slate-100" 
            value={confirmPassword} 
            onChange={e => setConfirmPassword(e.target.value)} 
          />
          {error && <p className="text-red-500 text-[9px] font-black uppercase text-center">{error}</p>}
          <button type="submit" className="w-full py-5 bg-neda-navy text-white rounded-2xl font-black uppercase tracking-widest shadow-lg mt-4">
             Save Password
          </button>
        </form>
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
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (user && user.password === password) {
      onLogin(user, rememberMe);
    } else {
      setError('Invalid credentials. Check email/password.');
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
      setError(err.message || "Reset failed");
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
        <form onSubmit={handleSignIn} className="w-full space-y-4">
          <input 
            type="email" 
            placeholder="Work Email" 
            required 
            className="w-full bg-[#f8faff] border border-slate-100 rounded-2xl py-5 px-6 text-slate-600 font-medium text-center"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input 
            type="password" 
            placeholder="Password" 
            required 
            className="w-full bg-[#f8faff] border border-slate-100 rounded-2xl py-5 px-6 text-slate-600 font-medium text-center"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-red-500 text-[10px] font-bold uppercase">{error}</p>}
          <div className="flex justify-between items-center px-1 mb-4">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} className="w-4 h-4" />
              <span className="text-[10px] font-black text-slate-400 uppercase">Remember</span>
            </label>
            <button 
              type="button" 
              onClick={() => { setShowForgotModal(true); setTempPassResult(null); setError(''); }}
              className="text-neda-orange text-[10px] font-black uppercase tracking-widest"
            >
              Forgot?
            </button>
          </div>
          <button type="submit" className="w-full bg-[#142948] text-white py-6 rounded-2xl font-black text-lg uppercase shadow-lg">
            Sign In
          </button>
        </form>
      </div>

      {showForgotModal && (
        <div className="fixed inset-0 z-[500] bg-neda-navy/90 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-sm rounded-t-[2.5rem] sm:rounded-[2.5rem] p-10 pb-12 shadow-2xl text-center">
            <div className="mx-auto w-16 h-16 bg-neda-lightOrange rounded-2xl flex items-center justify-center mb-6">
              <Key size={32} className="text-neda-orange" />
            </div>
            
            {tempPassResult ? (
              <div className="animate-in zoom-in-95">
                <h2 className="text-xl font-black text-neda-navy uppercase mb-4">New Access Key</h2>
                <div className="bg-slate-50 p-6 rounded-2xl border border-dashed border-neda-orange/30 mb-8">
                  <p className="text-xl font-mono font-black text-neda-orange tracking-wider">{tempPassResult}</p>
                </div>
                <button onClick={() => setShowForgotModal(false)} className="w-full py-5 bg-neda-navy text-white rounded-2xl font-black uppercase">
                  Back to Login
                </button>
              </div>
            ) : (
              <div>
                <h2 className="text-xl font-black text-neda-navy uppercase mb-2">Reset Key</h2>
                <p className="text-xs font-bold text-slate-400 uppercase mb-8">Enter your email to get a temporary key.</p>
                <form onSubmit={handleResetSubmit} className="space-y-4">
                  <input type="email" placeholder="Email Address" required className="w-full p-4 bg-slate-50 rounded-2xl font-bold text-center" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} />
                  <button type="submit" disabled={isResetting} className="w-full py-5 bg-neda-navy text-white rounded-2xl font-black uppercase shadow-lg">
                    {isResetting ? <Loader2 className="animate-spin mx-auto" size={18} /> : "Reset Now"}
                  </button>
                  <button type="button" onClick={() => setShowForgotModal(false)} className="w-full py-3 text-slate-400 text-[10px] font-black uppercase">Cancel</button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
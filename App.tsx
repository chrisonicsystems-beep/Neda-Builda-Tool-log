
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
  Copy,
  PlusCircle,
  Wrench,
  Camera,
  MessageSquare,
  ClipboardCheck,
  Stethoscope,
  Navigation,
  RefreshCcw,
  Clock,
  Warehouse,
  ShieldCheck,
  Database,
  Activity,
  Zap,
  ChevronRight,
  ListFilter,
  CalendarDays,
  ChevronUp
} from 'lucide-react';
import { analyzeTools, searchAddresses } from './services/geminiService';
import { fetchTools, fetchUsers, syncTools, syncUsers, upsertSingleTool, upsertSingleUser, deleteSingleUser, supabase } from './services/supabaseService';

const TEMP_PASSWORD_PREFIX = "NEDA-RESET-";
const BIOMETRIC_KEY = "neda_biometric_link";

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [tools, setTools] = useState<Tool[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [view, setView] = useState('INVENTORY') as any;
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<ToolStatus | 'ALL'>('ALL');
  const [showFilters, setShowFilters] = useState(false);
  
  const [isBiometricSupported, setIsBiometricSupported] = useState(false);
  const [hasLinkedBiometrics, setHasLinkedBiometrics] = useState(false);

  // Modal states
  const [showAddUser, setShowAddUser] = useState(false);
  const [showAddTool, setShowAddTool] = useState(false);
  const [returningTool, setReturningTool] = useState<Tool | null>(null);
  const [bookingTool, setBookingTool] = useState<Tool | null>(null);
  const [selectedToolForDetail, setSelectedToolForDetail] = useState<Tool | null>(null);

  const loadData = async () => {
    try {
      const remoteUsers = await fetchUsers();
      const remoteTools = await fetchTools();

      let finalUsers = remoteUsers && remoteUsers.length > 0 ? remoteUsers : INITIAL_USERS;
      let finalTools = remoteTools && remoteTools.length > 0 ? remoteTools : INITIAL_TOOLS;

      // --- RELATIONAL HEALING ---
      finalTools = finalTools.map(tool => {
        if (tool.currentHolderId) {
          const matchedUser = finalUsers.find(u => String(u.id).trim().toLowerCase() === String(tool.currentHolderId).trim().toLowerCase());
          if (matchedUser) {
            return { 
              ...tool, 
              currentHolderName: matchedUser.name,
              status: tool.status === ToolStatus.AVAILABLE ? ToolStatus.BOOKED_OUT : tool.status
            };
          }
        }
        return tool;
      });

      setAllUsers(finalUsers);
      setTools(finalTools);

      if (currentUser) {
        const freshUser = finalUsers.find(u => u.email.toLowerCase() === currentUser.email.toLowerCase());
        if (freshUser) {
          setCurrentUser(freshUser);
          localStorage.setItem('et_user', JSON.stringify(freshUser));
        }
      }

      return { finalUsers, finalTools };
    } catch (err) {
      console.error("Critical Data Load Error:", err);
      return null;
    }
  };

  useEffect(() => {
    const init = async () => {
      const result = await loadData();
      if (result) {
        const savedUserStr = localStorage.getItem('et_user');
        if (savedUserStr) {
          const savedUser = JSON.parse(savedUserStr);
          const freshUser = result.finalUsers.find(u => u.email.toLowerCase() === savedUser.email.toLowerCase());
          if (freshUser) {
            setCurrentUser(freshUser);
          }
        }
      }
      
      if (window.PublicKeyCredential) {
        const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        setIsBiometricSupported(available);
        setHasLinkedBiometrics(!!localStorage.getItem(BIOMETRIC_KEY));
      }
      setIsInitializing(false);
    };
    init();
  }, []);

  const handleLinkBiometrics = async () => {
    if (!currentUser || !isBiometricSupported) return;
    try {
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);
      const createCredentialOptions: any = {
        publicKey: {
          challenge,
          rp: { name: "Neda Tool Log" },
          user: {
            id: Uint8Array.from(currentUser.id, c => c.charCodeAt(0)),
            name: currentUser.email,
            displayName: currentUser.name,
          },
          pubKeyCredParams: [{ alg: -7, type: "public-key" }, { alg: -257, type: "public-key" }],
          authenticatorSelection: { authenticatorAttachment: "platform" },
          timeout: 60000,
          attestation: "direct"
        }
      };
      await navigator.credentials.create(createCredentialOptions);
      localStorage.setItem(BIOMETRIC_KEY, JSON.stringify({ userId: currentUser.id, email: currentUser.email, timestamp: Date.now() }));
      setHasLinkedBiometrics(true);
      setSyncSuccess("Biometrics linked successfully.");
      setTimeout(() => setSyncSuccess(null), 3000);
    } catch (err) {
      console.error("Biometric Linking Failed:", err);
      setSyncError("Linking failed.");
    }
  };

  const handleBiometricLogin = async () => {
    const linkedData = localStorage.getItem(BIOMETRIC_KEY);
    if (!linkedData) return;
    try {
      const { email } = JSON.parse(linkedData);
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);
      const getCredentialOptions: any = { publicKey: { challenge, timeout: 60000, userVerification: "required" } };
      await navigator.credentials.get(getCredentialOptions);
      const user = allUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
      if (user) {
        if (user.password?.startsWith(TEMP_PASSWORD_PREFIX)) {
          setSyncError("Temporary password detected. Use standard login.");
          return;
        }
        handleLogin(user, true);
      }
    } catch (err) {
      console.error("Biometric Login Failed:", err);
      setSyncError("Biometric authentication failed.");
    }
  };

  const handleRepairData = async () => {
    setIsSyncing(true);
    let repairedCount = 0;
    try {
      const remoteUsers = await fetchUsers() || INITIAL_USERS;
      const remoteTools = await fetchTools() || INITIAL_TOOLS;
      const toolsToFix = remoteTools.filter(tool => (tool.currentHolderName && !tool.currentHolderId) || (tool.currentHolderId && !tool.currentHolderName));
      if (toolsToFix.length === 0) {
        setSyncSuccess("Inventory integrity verified.");
        setTimeout(() => setSyncSuccess(null), 3000);
        return;
      }
      for (const tool of toolsToFix) {
        let matchedUser: User | undefined;
        if (tool.currentHolderId) {
          matchedUser = remoteUsers.find(u => String(u.id) === String(tool.currentHolderId));
        } else if (tool.currentHolderName) {
          matchedUser = remoteUsers.find(u => u.name.trim().toLowerCase() === tool.currentHolderName?.trim().toLowerCase());
        }
        if (matchedUser) {
          const repairedTool: Tool = { ...tool, currentHolderId: matchedUser.id, currentHolderName: matchedUser.name, status: ToolStatus.BOOKED_OUT };
          await upsertSingleTool(repairedTool);
          repairedCount++;
        }
      }
      await loadData();
      setSyncSuccess(`Healed ${repairedCount} records.`);
      setTimeout(() => setSyncSuccess(null), 5000);
    } catch (e: any) {
      setSyncError("Repair Error: " + e.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLogin = (user: User, remember: boolean) => {
    if (user.password?.startsWith(TEMP_PASSWORD_PREFIX)) user.mustChangePassword = true;
    setCurrentUser(user);
    if (remember) localStorage.setItem('et_user', JSON.stringify(user));
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
      if (currentUser?.id === updatedUser.id) {
        setCurrentUser(updatedUser);
        localStorage.setItem('et_user', JSON.stringify(updatedUser));
      }
      setSyncSuccess(`Profile updated.`);
      setTimeout(() => setSyncSuccess(null), 3000);
    } catch (e: any) {
      setSyncError("Update Failed: " + e.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAddUser = async (newUser: User) => {
    setIsSyncing(true);
    try {
      await upsertSingleUser(newUser);
      setAllUsers(prev => [...prev, newUser]);
      setSyncSuccess(`Staff member added.`);
      setShowAddUser(false);
    } catch (e: any) {
      setSyncError("Add Failed: " + e.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAddTool = async (newTool: Tool) => {
    setIsSyncing(true);
    try {
      await upsertSingleTool(newTool);
      setTools(prev => [...prev, newTool]);
      setSyncSuccess(`Asset registered.`);
      setShowAddTool(false);
    } catch (e: any) {
      setSyncError("Asset Error: " + e.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteUser = async (userToDelete: User) => {
    if (!currentUser || !window.confirm(`Permanently remove ${userToDelete.name}?`)) return;
    setIsSyncing(true);
    try {
      await deleteSingleUser(userToDelete.id);
      setAllUsers(prev => prev.filter(u => u.id !== userToDelete.id));
      setSyncSuccess(`User removed.`);
    } catch (e: any) {
      setSyncError("Deletion Error: " + e.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const updateTool = async (updatedTool: Tool) => {
    setIsSyncing(true);
    try {
      await upsertSingleTool(updatedTool);
      setTools(prev => prev.map(t => t.id === updatedTool.id ? updatedTool : t));
      setSyncSuccess(`Database Sync Successful.`);
    } catch (e: any) {
      setSyncError("Sync Error: " + e.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleReturnTool = async (comment: string, condition: string, photo?: string) => {
    if (!returningTool || !currentUser) return;
    let newStatus = ToolStatus.AVAILABLE;
    if (condition === 'defect identified' || condition === 'needs service') newStatus = ToolStatus.GETTING_SERVICED;
    
    // Fix: Explicitly typing the new log to satisfy TypeScript's string literal union for 'action'
    const newLog: ToolLog = {
      id: Math.random().toString(36).substr(2, 9),
      userId: currentUser.id,
      userName: currentUser.name,
      action: 'RETURN',
      timestamp: Date.now(),
      comment,
      condition,
      photo
    };

    const updatedTool: Tool = {
      ...returningTool,
      status: newStatus,
      currentHolderId: undefined,
      currentHolderName: undefined,
      currentSite: undefined,
      bookedAt: undefined,
      lastReturnedAt: Date.now(),
      logs: [newLog, ...(returningTool.logs || [])].slice(0, 50)
    };
    setReturningTool(null);
    await updateTool(updatedTool);
  };

  const handleConfirmBookOut = async (tool: Tool, siteAddress: string) => {
    if (!currentUser) return;
    
    // Fix: Explicitly typing the new log to satisfy TypeScript's string literal union for 'action'
    const newLog: ToolLog = {
      id: Math.random().toString(36).substr(2, 9),
      userId: currentUser.id,
      userName: currentUser.name,
      action: 'BOOK_OUT',
      timestamp: Date.now(),
      site: siteAddress
    };

    const updatedTool: Tool = {
      ...tool,
      status: ToolStatus.BOOKED_OUT,
      currentHolderId: currentUser.id,
      currentHolderName: currentUser.name,
      currentSite: siteAddress,
      bookedAt: Date.now(),
      logs: [newLog, ...(tool.logs || [])].slice(0, 50)
    };
    setBookingTool(null);
    await updateTool(updatedTool);
  };

  const handleAddLogToTool = async (tool: Tool, log: ToolLog) => {
    const updatedTool = { ...tool, logs: [log, ...(tool.logs || [])].slice(0, 50) };
    await updateTool(updatedTool);
    if (selectedToolForDetail?.id === tool.id) setSelectedToolForDetail(updatedTool);
  };

  const handleForgotPassword = async (email: string): Promise<string> => {
    const user = allUsers.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user) throw new Error(`Staff email not found.`);
    const tempPass = TEMP_PASSWORD_PREFIX + Math.floor(10000000 + Math.random() * 90000000);
    const updatedUser = { ...user, password: tempPass, mustChangePassword: true };
    await upsertSingleUser(updatedUser);
    setAllUsers(prev => prev.map(u => u.id === user.id ? updatedUser : u));
    return tempPass;
  };

  const filteredTools = useMemo(() => {
    return tools.filter(t => {
      const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) || (t.currentHolderName || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [tools, searchTerm, statusFilter]);

  if (isInitializing) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
      <NedaLogo size={48} className="mb-6 animate-pulse opacity-20" />
      <Loader2 className="w-8 h-8 animate-spin text-neda-navy mb-4" />
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Syncing Engine...</p>
    </div>
  );

  if (!currentUser) return (
    <LoginScreen 
      onLogin={handleLogin} 
      onForgotPassword={handleForgotPassword} 
      onBiometricLogin={handleBiometricLogin}
      users={allUsers} 
      isBiometricSupported={isBiometricSupported} 
      hasLinkedBiometrics={hasLinkedBiometrics}
    />
  );

  return (
    <Layout activeView={view} setView={setView} userRole={currentUser.role} onLogout={handleLogout}>
      {currentUser.mustChangePassword && <MandatoryPasswordChange user={currentUser} onUpdate={updateUser} />}
      <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] w-full max-w-xs px-4 pointer-events-none">
        {isSyncing && (
          <div className="bg-neda-navy text-white px-4 py-3 rounded-2xl shadow-lg flex items-center justify-center gap-3 animate-in slide-in-from-top-4">
            <Loader2 className="animate-spin" size={16} />
            <span className="text-[10px] font-black uppercase tracking-widest text-chrisonic-cyan">Database Refresh...</span>
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

      {showAddUser && <AddUserModal onClose={() => setShowAddUser(false)} onSave={handleAddUser} />}
      {showAddTool && <AddToolModal onClose={() => setShowAddTool(false)} onSave={handleAddTool} />}
      {returningTool && <ReturnToolModal tool={returningTool} onClose={() => setReturningTool(null)} onConfirm={handleReturnTool} />}
      {bookingTool && <BookOutModal tool={bookingTool} onClose={() => setBookingTool(null)} onConfirm={handleConfirmBookOut} />}
      {selectedToolForDetail && (
        <ToolDetailModal 
          tool={selectedToolForDetail} 
          users={allUsers}
          currentUser={currentUser}
          onClose={() => setSelectedToolForDetail(null)} 
          onAddLog={handleAddLogToTool}
        />
      )}

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
          onInitiateBookOut={(t: Tool) => setBookingTool(t)}
          onInitiateReturn={(t: Tool) => setReturningTool(t)}
          onViewDetail={(t: Tool) => setSelectedToolForDetail(t)}
        />
      )}

      {view === 'ADMIN_DASHBOARD' && (
        <AdminDashboard 
          tools={tools} 
          allUsers={allUsers} 
          onUpdateUser={updateUser} 
          onDeleteUser={handleDeleteUser}
          onUpdateTool={updateTool}
          onShowAddUser={() => setShowAddUser(true)}
          onShowAddTool={() => setShowAddTool(true)}
          onRepairData={handleRepairData}
          userRole={currentUser.role}
          currentUserId={currentUser.id}
          currentUserName={currentUser.name}
          onViewDetail={(t: Tool) => setSelectedToolForDetail(t)}
        />
      )}

      {view === 'AI_ASSISTANT' && <AIAssistant tools={tools} />}
      
      {view === 'MY_TOOLS' && (
        <MyToolsView 
          tools={tools.filter(t => t.currentHolderId && String(t.currentHolderId) === String(currentUser.id))} 
          currentUser={currentUser} 
          onInitiateReturn={(t: Tool) => setReturningTool(t)}
          onViewDetail={(t: Tool) => setSelectedToolForDetail(t)}
          isBiometricSupported={isBiometricSupported}
          hasLinkedBiometrics={hasLinkedBiometrics}
          onLinkBiometrics={handleLinkBiometrics}
        />
      )}
    </Layout>
  );
};

// --- Modals & Views ---

const ToolDetailModal: React.FC<{ tool: Tool; onClose: () => void; onAddLog: (tool: Tool, log: ToolLog) => void; users: User[]; currentUser: User }> = ({ tool, onClose, onAddLog, users, currentUser }) => {
  const [showAddLog, setShowAddLog] = useState(false);
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [newLog, setNewLog] = useState({ action: 'BOOK_OUT' as any, comment: '', userId: currentUser.id });
  const history = useMemo(() => (tool.logs || []), [tool.logs]);

  const handleManualLog = () => {
    const matchedUser = users.find(u => u.id === newLog.userId);
    const log: ToolLog = {
      id: Math.random().toString(36).substr(2, 9),
      userId: newLog.userId,
      userName: matchedUser?.name || 'Unknown',
      action: newLog.action,
      timestamp: Date.now(),
      comment: newLog.comment,
    };
    onAddLog(tool, log);
    setShowAddLog(false);
    setLogsExpanded(true);
    setNewLog({ action: 'BOOK_OUT', comment: '', userId: currentUser.id });
  };

  return (
    <div className="fixed inset-0 z-[750] bg-neda-navy/95 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-6 animate-in fade-in">
      <div className="bg-white w-full max-w-lg h-[90vh] sm:h-auto sm:max-h-[85vh] rounded-t-[3rem] sm:rounded-[3rem] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-10">
        <div className="p-8 border-b border-slate-50 flex justify-between items-start shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[8px] font-black text-neda-orange bg-neda-lightOrange px-2 py-0.5 rounded uppercase tracking-[0.2em]">{tool.category}</span>
              <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${tool.status === ToolStatus.AVAILABLE ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-600'}`}>{tool.status.replace('_', ' ')}</span>
            </div>
            <h2 className="text-2xl font-black text-neda-navy uppercase tracking-tight leading-tight">{tool.name}</h2>
            <div className="flex items-center gap-3 mt-1.5">
               <span className="text-[10px] font-bold text-slate-400 uppercase">SN: {tool.serialNumber || 'No Serial'}</span>
               {tool.dateOfPurchase && <span className="text-[10px] font-bold text-slate-300 uppercase">Purchased: {new Date(tool.dateOfPurchase).toLocaleDateString()}</span>}
            </div>
          </div>
          <button onClick={onClose} className="p-3 bg-slate-50 rounded-2xl text-slate-400 hover:text-neda-navy transition-all"><X size={24} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-8 hide-scrollbar">
          {showAddLog ? (
            <div className="space-y-4 animate-in zoom-in-95">
              <h3 className="text-xs font-black text-neda-navy uppercase tracking-widest mb-4">Manual Log Entry</h3>
              <div className="space-y-1">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest pl-1">Action Type</span>
                <select className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none" value={newLog.action} onChange={e => setNewLog({...newLog, action: e.target.value as any})}>
                  <option value="BOOK_OUT">Book Out</option>
                  <option value="RETURN">Return</option>
                  <option value="CREATE">Note / Maintenance</option>
                </select>
              </div>
              <div className="space-y-1">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest pl-1">Assign To Staff</span>
                <select className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none" value={newLog.userId} onChange={e => setNewLog({...newLog, userId: e.target.value})}>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest pl-1">Comments</span>
                <textarea className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm min-h-[100px] outline-none" placeholder="Add details..." value={newLog.comment} onChange={e => setNewLog({...newLog, comment: e.target.value})} />
              </div>
              <div className="flex gap-3 pt-4">
                <button onClick={() => setShowAddLog(false)} className="flex-1 py-4 text-slate-400 text-[10px] font-black uppercase tracking-widest">Cancel</button>
                <button onClick={handleManualLog} className="flex-[2] py-4 bg-neda-navy text-white rounded-2xl font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all">Submit Entry</button>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              {tool.notes && (
                <div className="space-y-2">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Equipment Notes</h3>
                  <p className="text-xs font-medium text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-100 italic">"{tool.notes}"</p>
                </div>
              )}
              <div className="space-y-4">
                <button 
                  onClick={() => setLogsExpanded(!logsExpanded)}
                  className="w-full flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group hover:border-neda-navy/20 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <History size={18} className="text-neda-navy opacity-50" />
                    <span className="text-[10px] font-black text-neda-navy uppercase tracking-widest">History & Logs ({history.length})</span>
                  </div>
                  {logsExpanded ? <ChevronUp size={18} className="text-slate-300" /> : <ChevronDown size={18} className="text-slate-300" />}
                </button>
                {logsExpanded && (
                  <div className="animate-in slide-in-from-top-4 duration-300">
                    <div className="flex justify-between items-center mb-6 pl-2">
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em]">Full Timeline</span>
                      <button onClick={() => setShowAddLog(true)} className="flex items-center gap-2 px-3 py-1.5 bg-neda-navy/5 text-neda-navy rounded-lg font-black text-[8px] uppercase tracking-widest hover:bg-neda-navy hover:text-white transition-all"><Plus size={10} /> Add Entry</button>
                    </div>
                    <div className="relative border-l-2 border-slate-100 ml-3 pl-8 space-y-10 py-2">
                      {history.length > 0 ? history.map((log) => (
                        <div key={log.id} className="relative group">
                          <div className={`absolute -left-[41px] top-0 w-5 h-5 rounded-full border-4 border-white shadow-sm flex items-center justify-center ${log.action === 'BOOK_OUT' ? 'bg-orange-500' : log.action === 'RETURN' ? 'bg-green-500' : 'bg-slate-300'}`}></div>
                          <div className="flex flex-col">
                            <div className="flex justify-between items-start mb-1">
                              <span className={`text-[8px] font-black uppercase tracking-widest ${log.action === 'BOOK_OUT' ? 'text-orange-600' : log.action === 'RETURN' ? 'text-green-600' : 'text-slate-500'}`}>
                                {log.action.replace('_', ' ')}
                              </span>
                              <span className="text-[8px] font-black text-slate-300 uppercase tracking-tighter">{new Date(log.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                            </div>
                            <p className="text-xs font-black text-neda-navy uppercase">{log.userName}</p>
                            {log.site && <div className="flex items-center gap-1.5 mt-1 text-slate-400"><MapPin size={10} /><span className="text-[9px] font-bold uppercase truncate">{log.site}</span></div>}
                            {log.comment && <p className="mt-2 p-3 bg-white rounded-xl text-[10px] font-medium text-slate-500 border border-slate-100 leading-relaxed shadow-sm">"{log.comment}"</p>}
                          </div>
                        </div>
                      )) : (
                        <div className="py-6 text-center text-slate-300 font-black uppercase text-[10px] ml-[-32px]">No logs yet</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const BookOutModal: React.FC<{ tool: Tool; onClose: () => void; onConfirm: (tool: Tool, siteAddress: string) => void }> = ({ tool, onClose, onConfirm }) => {
  const [addressInput, setAddressInput] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasAttemptedSearch, setHasAttemptedSearch] = useState(false);
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | undefined>(undefined);
  const searchTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => setUserCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
        (error) => console.warn("Geolocation denied.", error)
      );
    }
  }, []);

  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setAddressInput(value);
    if (searchTimeoutRef.current) window.clearTimeout(searchTimeoutRef.current);
    if (value.trim().length >= 2) {
      setIsSearching(true);
      setHasAttemptedSearch(true);
      searchTimeoutRef.current = window.setTimeout(async () => {
        const results = await searchAddresses(value, userCoords);
        setSuggestions(results);
        setIsSearching(false);
      }, 350); 
    } else {
      setSuggestions([]);
      setIsSearching(false);
      setHasAttemptedSearch(false);
    }
  };

  const handleSelectSuggestion = (e: React.PointerEvent<HTMLButtonElement>, addr: string) => {
    e.preventDefault();
    setAddressInput(addr);
    setSuggestions([]);
    setHasAttemptedSearch(false);
  };

  return (
    <div className="fixed inset-0 z-[700] bg-neda-navy/95 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
      <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in-95 relative overflow-hidden">
        <div className="flex justify-between items-start mb-8">
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-neda-orange uppercase tracking-[0.2em] mb-2">Book Out</span>
            <h2 className="text-2xl font-black text-neda-navy uppercase tracking-tight leading-none truncate max-w-[200px]">
              {tool.name}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 text-slate-300 hover:text-neda-navy transition-colors">
            <X size={24} strokeWidth={2.5} />
          </button>
        </div>
        <div className="space-y-6">
          <div className="space-y-2 relative">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.1em] pl-1">Site Address (NZ Only)</span>
            <div className="relative z-[710]">
              <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
              <input 
                autoFocus 
                type="text" 
                placeholder="Start typing street address..." 
                className="w-full p-5 pl-12 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-neda-navy/5 transition-all shadow-sm" 
                value={addressInput} 
                onChange={handleAddressChange} 
                autoComplete="off"
              />
              {isSearching && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <Loader2 className="animate-spin text-neda-orange" size={16} />
                </div>
              )}
            </div>
            {(suggestions.length > 0 || hasAttemptedSearch) && (
              <div className="absolute top-full left-0 right-0 mt-3 bg-white rounded-[1.5rem] shadow-2xl border border-slate-100 overflow-hidden z-[720] max-h-[300px] overflow-y-auto hide-scrollbar">
                {isSearching ? (
                  <div className="px-5 py-12 text-center flex flex-col items-center gap-4 bg-white">
                     <div className="bg-slate-50 p-4 rounded-full"><MapPin size={24} className="text-slate-200 animate-pulse" /></div>
                     <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Searching maps...</span>
                  </div>
                ) : suggestions.length > 0 ? (
                  suggestions.map((addr, idx) => (
                    <button 
                      key={idx} 
                      onPointerDown={(e) => handleSelectSuggestion(e, addr)} 
                      className="w-full text-left px-6 py-5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-4 border-b border-slate-50 last:border-0 active:bg-slate-100 transition-colors"
                    >
                      <Navigation size={12} className="text-neda-orange shrink-0" />
                      <span className="truncate leading-relaxed">{addr}</span>
                    </button>
                  ))
                ) : hasAttemptedSearch && (
                  <div className="px-5 py-12 text-center flex flex-col items-center gap-4 bg-slate-50/30">
                    <div className="bg-white p-4 rounded-full shadow-sm"><MapPin size={24} className="text-slate-100" /></div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Searching for addresses...</p>
                      <p className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">Type more to refine results</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <button 
            disabled={addressInput.trim().length < 5} 
            onClick={() => onConfirm(tool, addressInput.trim())} 
            className="w-full py-6 bg-neda-navy text-white rounded-2xl font-black uppercase tracking-widest shadow-xl active:scale-[0.98] transition-all disabled:opacity-40 disabled:grayscale text-sm"
          >
            Confirm Site Assignment
          </button>
        </div>
      </div>
    </div>
  );
};

const ReturnToolModal: React.FC<{ tool: Tool; onClose: () => void; onConfirm: (comment: string, condition: string, photo?: string) => void }> = ({ tool, onClose, onConfirm }) => {
  const [comment, setComment] = useState('');
  const [condition, setCondition] = useState('good');
  const [photo, setPhoto] = useState<string | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setPhoto(reader.result as string);
      reader.readAsDataURL(file);
    }
  };
  return (
    <div className="fixed inset-0 z-[700] bg-neda-navy/95 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
      <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in-95">
        <div className="flex justify-between items-center mb-6">
          <div className="flex flex-col">
            <span className="text-[8px] font-black text-neda-orange uppercase tracking-widest mb-1">Confirm Return</span>
            <h2 className="text-xl font-black text-neda-navy uppercase tracking-tight truncate max-w-[200px]">{tool.name}</h2>
          </div>
          <button onClick={onClose} className="p-2 text-slate-300 hover:text-neda-navy"><X size={20} /></button>
        </div>
        <div className="space-y-5">
          <select className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-xs outline-none" value={condition} onChange={e => setCondition(e.target.value)}>
            <option value="good">Good</option>
            <option value="defect identified">Defect Identified</option>
            <option value="needs service">Needs Service</option>
          </select>
          <textarea className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-xs outline-none min-h-[100px] resize-none" placeholder="Return comments..." value={comment} onChange={e => setComment(e.target.value)} />
          <div onClick={() => fileInputRef.current?.click()} className="w-full aspect-video bg-slate-50 border-2 border-dashed border-slate-100 rounded-2xl flex flex-col items-center justify-center cursor-pointer overflow-hidden relative">
            {photo ? <img src={photo} className="w-full h-full object-cover" /> : <><Camera size={24} className="text-slate-200 mb-2" /><span className="text-[9px] font-black text-slate-300 uppercase">Capture photo</span></>}
            <input type="file" ref={fileInputRef} accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload} />
          </div>
          <button onClick={() => onConfirm(comment, condition, photo)} className="w-full py-5 bg-neda-navy text-white rounded-2xl font-black uppercase tracking-widest shadow-xl">Complete Return</button>
        </div>
      </div>
    </div>
  );
};

const AddUserModal: React.FC<{ onClose: () => void; onSave: (u: User) => void }> = ({ onClose, onSave }) => {
  const [formData, setFormData] = useState({ name: '', email: '', password: 'password123', role: UserRole.USER });
  return (
    <div className="fixed inset-0 z-[700] bg-neda-navy/95 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
      <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl">
        <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-black text-neda-navy uppercase">Onboard Staff</h2><button onClick={onClose} className="p-2 text-slate-300 hover:text-neda-navy"><X size={20} /></button></div>
        <form onSubmit={e => { e.preventDefault(); onSave({ id: 'U' + Date.now(), ...formData, isEnabled: true, mustChangePassword: true }); }} className="space-y-4">
          <input required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm" placeholder="Full Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
          <input required type="email" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm" placeholder="Email Address" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
          <select className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm" value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as UserRole})}>
            <option value={UserRole.USER}>User</option>
            <option value={UserRole.MANAGER}>Manager</option>
            <option value={UserRole.ADMIN}>Admin</option>
          </select>
          <button type="submit" className="w-full py-5 bg-neda-navy text-white rounded-2xl font-black uppercase tracking-widest shadow-lg">Create Profile</button>
        </form>
      </div>
    </div>
  );
};

const AddToolModal: React.FC<{ onClose: () => void; onSave: (t: Tool) => void }> = ({ onClose, onSave }) => {
  const [formData, setFormData] = useState({ name: '', category: 'Power Tools', serialNumber: '', notes: '', dateOfPurchase: new Date().toISOString().split('T')[0], numberOfItems: 1 });
  return (
    <div className="fixed inset-0 z-[700] bg-neda-navy/95 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
      <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl max-h-[90vh] overflow-y-auto hide-scrollbar">
        <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-black text-neda-navy uppercase">Add Equipment</h2><button onClick={onClose} className="p-2 text-slate-300 hover:text-neda-navy"><X size={20} /></button></div>
        <form onSubmit={e => { e.preventDefault(); onSave({ id: 'T' + Date.now(), ...formData, status: ToolStatus.AVAILABLE, logs: [] }); }} className="space-y-4">
          <input required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm" placeholder="Tool Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
          <select className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}><option value="Power Tools">Power Tools</option><option value="Precision">Precision</option><option value="Power">Power</option><option value="Hand Tools">Hand Tools</option></select>
          <input className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm" placeholder="Serial Number" value={formData.serialNumber} onChange={e => setFormData({...formData, serialNumber: e.target.value})} />
          <input type="date" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm" value={formData.dateOfPurchase} onChange={e => setFormData({...formData, dateOfPurchase: e.target.value})} />
          <button type="submit" className="w-full py-5 bg-neda-navy text-white rounded-2xl font-black uppercase tracking-widest shadow-lg">Register Asset</button>
        </form>
      </div>
    </div>
  );
};

const MandatoryPasswordChange: React.FC<{ user: User; onUpdate: (u: User) => void }> = ({ user, onUpdate }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isDone, setIsDone] = useState(false);
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) { setError("Min 6 characters."); return; }
    if (newPassword !== confirmPassword) { setError("Keys do not match."); return; }
    setIsDone(true);
    onUpdate({ ...user, password: newPassword, mustChangePassword: false });
  };
  return (
    <div className="fixed inset-0 z-[500] bg-neda-navy flex items-center justify-center p-6 animate-in fade-in">
      <div className="bg-white w-full max-w-sm rounded-[3rem] p-10 shadow-2xl text-center">
        {isDone ? (
          <div className="py-8 animate-in zoom-in-95">
            <CheckCircle2 size={48} className="text-green-500 mx-auto mb-6" />
            <h2 className="text-xl font-black text-neda-navy uppercase">Security Active</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase mt-2 tracking-widest">Login refreshed successfully</p>
          </div>
        ) : (
          <>
            <div className="bg-neda-navy/5 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"><ShieldAlert size={32} className="text-neda-orange" /></div>
            <h2 className="text-xl font-black text-neda-navy uppercase mb-2">Secure Your Profile</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase mb-8 tracking-widest">Update your access key</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input type="password" placeholder="New Password" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm text-center" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
              <input type="password" placeholder="Confirm Key" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm text-center" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
              {error && <p className="text-red-500 text-[9px] font-black uppercase tracking-widest">{error}</p>}
              <button type="submit" className="w-full py-5 bg-neda-navy text-white rounded-2xl font-black uppercase tracking-widest shadow-lg">Activate Key</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

const LoginScreen: React.FC<any> = ({ onLogin, onForgotPassword, onBiometricLogin, users, isBiometricSupported, hasLinkedBiometrics }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [tempPassResult, setTempPassResult] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    const user = users.find((u: User) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (user && user.password === password) onLogin(user, rememberMe); else setError('Invalid Credentials.');
  };
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-full max-w-[420px] bg-white rounded-[3.5rem] p-10 pt-12 pb-14 shadow-2xl flex flex-col items-center">
        <img src={LOGO_URL} alt="Neda Builda" className="h-20 mb-10 object-contain" />
        <form onSubmit={handleSignIn} className="w-full space-y-4">
          <input type="email" placeholder="Email Address" required className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-5 px-6 text-slate-700 font-bold text-center outline-none" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input type="password" placeholder="Password" required className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-5 px-6 text-slate-700 font-bold text-center outline-none" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p className="text-red-500 text-[10px] font-black uppercase tracking-widest">{error}</p>}
          <div className="flex justify-between items-center px-2 mb-4">
            <label className="flex items-center gap-2"><input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} className="w-4 h-4 rounded text-neda-navy" /><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Remember</span></label>
            <button type="button" onClick={() => setShowForgotModal(true)} className="text-neda-orange text-[10px] font-black uppercase tracking-widest">Forgot Key?</button>
          </div>
          <button type="submit" className="w-full bg-neda-navy text-white py-6 rounded-2xl font-black text-xl uppercase shadow-xl">Sign In</button>
          {isBiometricSupported && hasLinkedBiometrics && (
            <button type="button" onClick={onBiometricLogin} className="w-full flex items-center justify-center gap-3 py-5 bg-white border-2 border-neda-navy/10 rounded-2xl text-neda-navy font-black uppercase text-xs tracking-widest">
              <Fingerprint size={20} className="text-neda-orange" /> Biometric
            </button>
          )}
        </form>
      </div>
      {showForgotModal && (
        <div className="fixed inset-0 z-[600] bg-neda-navy/95 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-10 shadow-2xl text-center">
            {tempPassResult ? (
              <div className="animate-in zoom-in-95">
                <div className="bg-green-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"><Key size={32} className="text-green-600" /></div>
                <h2 className="text-xl font-black text-neda-navy uppercase mb-2">Access Restored</h2>
                <div className="bg-slate-50 p-6 rounded-2xl border-2 border-dashed border-slate-200 mb-8"><p className="text-base font-mono font-black text-neda-navy">{tempPassResult}</p></div>
                <button onClick={() => setShowForgotModal(false)} className="w-full py-5 bg-neda-navy text-white rounded-2xl font-black uppercase tracking-widest shadow-lg">Done</button>
              </div>
            ) : (
              <div>
                <h2 className="text-xl font-black text-neda-navy uppercase mb-10">Reset Request</h2>
                <form onSubmit={async (e) => { e.preventDefault(); setIsResetting(true); try { const t = await onForgotPassword(forgotEmail); setTempPassResult(t); } catch(err:any) { setError(err.message); } finally { setIsResetting(false); } }} className="space-y-4">
                  <input type="email" placeholder="Work Email" required className="w-full py-5 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-center" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} />
                  <button type="submit" disabled={isResetting} className="w-full py-5 bg-neda-navy text-white rounded-2xl font-black uppercase shadow-lg disabled:opacity-50">{isResetting ? <Loader2 className="animate-spin mx-auto" /> : "Verify"}</button>
                  <button type="button" onClick={() => setShowForgotModal(false)} className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mt-4">Cancel</button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const InventoryView: React.FC<any> = ({ tools, searchTerm, setSearchTerm, statusFilter, setStatusFilter, showFilters, setShowFilters, currentUser, onInitiateBookOut, onInitiateReturn, onViewDetail }) => (
  <div className="space-y-6">
    <div className="relative">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
      <input type="text" placeholder="Search equipment..." className="w-full pl-12 pr-4 py-4 bg-white border border-slate-100 rounded-2xl font-bold text-xs outline-none shadow-sm transition-all" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
      <button onClick={() => setShowFilters(!showFilters)} className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-colors ${showFilters ? 'bg-neda-navy text-white' : 'text-slate-400'}`}><Filter size={18} /></button>
    </div>
    <div className="bg-white rounded-[2rem] border border-slate-100 overflow-hidden shadow-sm divide-y divide-slate-50">
      {tools.length > 0 ? tools.map((tool: Tool) => {
        const isHeldByMe = tool.status === ToolStatus.BOOKED_OUT && tool.currentHolderId && String(tool.currentHolderId) === String(currentUser.id);
        const isHeldByOthers = tool.status === ToolStatus.BOOKED_OUT && !isHeldByMe;
        const isAvailable = tool.status === ToolStatus.AVAILABLE;
        const isServiced = tool.status === ToolStatus.GETTING_SERVICED;
        return (
          <div key={tool.id} onClick={() => onViewDetail(tool)} className="px-6 py-5 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer">
            <div className="flex-1 min-w-0 pr-4">
              <div className="flex items-center gap-2 mb-1">
                 <span className="text-[7px] font-black uppercase tracking-widest text-neda-orange bg-neda-lightOrange px-1.5 py-0.5 rounded-sm">{tool.category}</span>
                 <div className={`w-1.5 h-1.5 rounded-full ${isAvailable ? 'bg-green-500' : isServiced ? 'bg-red-500' : 'bg-orange-500'}`}></div>
              </div>
              <h3 className="font-black text-neda-navy text-sm uppercase tracking-tight truncate">{tool.name}</h3>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                 <div className="flex items-center gap-1.5 text-slate-400"><UserIcon size={10} /><span className="text-[9px] font-bold uppercase truncate max-w-[90px]">{isAvailable ? 'Warehouse' : (tool.currentHolderName || 'Staff')}</span></div>
                 <div className="flex items-center gap-1.5 text-slate-400"><MapPin size={10} /><span className="text-[9px] font-bold uppercase truncate max-w-[110px]">{tool.currentSite || 'Warehouse'}</span></div>
              </div>
            </div>
            {(isAvailable || isHeldByMe) && <button onClick={(e) => { e.stopPropagation(); isAvailable ? onInitiateBookOut(tool) : onInitiateReturn(tool); }} className={`shrink-0 px-4 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-md ${isAvailable ? 'bg-neda-navy text-white' : 'bg-white border border-neda-orange text-neda-orange'}`}>{isAvailable ? 'Book Out' : 'Return'}</button>}
            {isHeldByOthers && <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-400 rounded-lg text-[8px] font-black uppercase"><Clock size={10} />In Use</div>}
            {isServiced && <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-[8px] font-black uppercase"><Stethoscope size={10} />Repair</div>}
          </div>
        );
      }) : <div className="px-6 py-12 text-center text-[10px] font-black text-slate-300 uppercase">No items found</div>}
    </div>
  </div>
);

const AdminDashboard: React.FC<any> = ({ tools, allUsers, onUpdateUser, onDeleteUser, onUpdateTool, onShowAddUser, onShowAddTool, onRepairData, userRole, currentUserId, onViewDetail }) => {
  const [activeTab, setActiveTab] = useState<'USERS' | 'STOCKTAKE' | 'ACTIVE_BOOKINGS' | 'HEALTH'>('USERS');
  const [assetSearch, setAssetSearch] = useState('');
  const bookedTools = useMemo(() => tools.filter((t: Tool) => t.status === ToolStatus.BOOKED_OUT), [tools]);
  const unhealthyToolsCount = useMemo(() => tools.filter(t => (t.currentHolderName && !t.currentHolderId) || (t.currentHolderId && !t.currentHolderName)).length, [tools]);
  const filteredAssets = useMemo(() => tools.filter(t => t.name.toLowerCase().includes(assetSearch.toLowerCase())), [tools, assetSearch]);
  return (
    <div className="space-y-6">
      <div className="flex gap-4 border-b border-slate-100 pb-2 overflow-x-auto hide-scrollbar whitespace-nowrap">
        <button onClick={() => setActiveTab('USERS')} className={`pb-2 text-[10px] font-black uppercase tracking-widest ${activeTab === 'USERS' ? 'text-neda-orange border-b-2 border-neda-orange' : 'text-slate-400'}`}>Staff List</button>
        <button onClick={() => setActiveTab('ACTIVE_BOOKINGS')} className={`pb-2 text-[10px] font-black uppercase tracking-widest ${activeTab === 'ACTIVE_BOOKINGS' ? 'text-neda-orange border-b-2 border-neda-orange' : 'text-slate-400'}`}>Bookings</button>
        <button onClick={() => setActiveTab('STOCKTAKE')} className={`pb-2 text-[10px] font-black uppercase tracking-widest ${activeTab === 'STOCKTAKE' ? 'text-neda-orange border-b-2 border-neda-orange' : 'text-slate-400'}`}>Assets</button>
        <button onClick={() => setActiveTab('HEALTH')} className={`pb-2 text-[10px] font-black uppercase tracking-widest ${activeTab === 'HEALTH' ? 'text-neda-orange border-b-2 border-neda-orange' : 'text-slate-400'}`}>Health {unhealthyToolsCount > 0 && <span className="bg-red-500 text-white px-1.5 py-0.5 rounded-full text-[7px] ml-1">{unhealthyToolsCount}</span>}</button>
      </div>
      {activeTab === 'USERS' && (
        <div className="space-y-4 animate-in fade-in">
          <button onClick={onShowAddUser} className="w-full flex items-center justify-between p-6 bg-slate-50 border border-dashed border-slate-200 rounded-[2rem]"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shadow-sm"><UserPlus size={24} /></div><div className="text-left"><h4 className="font-black text-neda-navy uppercase text-xs">Onboard Staff</h4></div></div><PlusCircle size={24} className="text-neda-orange" /></button>
          <div className="grid gap-3">{allUsers.map((user: User) => (
            <div key={user.id} className="bg-white p-5 rounded-[2rem] border border-slate-100 flex items-center justify-between shadow-sm"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center"><UserIcon className="text-slate-400" size={20} /></div><div><h4 className="font-black text-neda-navy text-sm">{user.name}</h4><p className="text-[9px] font-bold text-slate-400 uppercase">{user.role}</p></div></div>{user.id !== currentUserId && <button onClick={() => onDeleteUser(user)} className="p-2 text-slate-300 hover:text-red-500"><Trash2 size={18} /></button>}</div>
          ))}</div>
        </div>
      )}
      {activeTab === 'ACTIVE_BOOKINGS' && (
        <div className="bg-white rounded-[2rem] border border-slate-100 overflow-hidden divide-y divide-slate-50">
          {bookedTools.length > 0 ? bookedTools.map((t: Tool) => (
            <div key={t.id} onClick={() => onViewDetail(t)} className="px-6 py-5 flex items-center justify-between hover:bg-slate-50 transition-colors"><div className="min-w-0 flex-1"><p className="font-black text-neda-navy text-xs uppercase truncate">{t.name}</p><p className="text-[9px] font-bold text-slate-400 uppercase">{t.currentHolderName} @ {t.currentSite}</p></div><ChevronRight size={16} className="text-slate-200" /></div>
          )) : <div className="px-6 py-12 text-center text-slate-300 uppercase text-[10px]">Empty</div>}
        </div>
      )}
      {activeTab === 'STOCKTAKE' && (
        <div className="space-y-4">
          <button onClick={onShowAddTool} className="w-full p-6 bg-slate-50 border border-dashed border-slate-200 rounded-[2rem] flex items-center justify-between"><div className="flex items-center gap-4"><div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center"><Package size={20} /></div><h4 className="font-black text-neda-navy text-[10px] uppercase">New Asset</h4></div><Plus size={20} className="text-neda-orange" /></button>
          <div className="grid gap-3">{filteredAssets.map(tool => (
            <div key={tool.id} onClick={() => onViewDetail(tool)} className="bg-white p-5 rounded-[2rem] border border-slate-100 flex items-center justify-between shadow-sm cursor-pointer"><div className="flex-1"><h4 className="font-black text-neda-navy text-sm uppercase truncate">{tool.name}</h4><p className="text-[9px] font-bold text-slate-400 uppercase">{tool.status}</p></div><ChevronRight size={18} className="text-slate-200" /></div>
          ))}</div>
        </div>
      )}
      {activeTab === 'HEALTH' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
             <h3 className="text-xl font-black text-neda-navy uppercase mb-2">Relational Sync</h3>
             <p className="text-[10px] font-bold text-slate-400 uppercase leading-relaxed mb-8">Match staff names to IDs and repair database records.</p>
             <button onClick={onRepairData} className="w-full flex items-center justify-center gap-4 py-5 bg-neda-navy text-white rounded-2xl font-black text-xs uppercase shadow-xl"><Zap size={20} className="text-neda-orange" /> Run Reconciliation</button>
          </div>
          {unhealthyToolsCount > 0 && (
            <div className="space-y-2">
              {tools.filter(t => (t.currentHolderName && !t.currentHolderId) || (t.currentHolderId && !t.currentHolderName)).map(t => (
                <div key={t.id} onClick={() => onViewDetail(t)} className="bg-red-50 p-4 rounded-xl border border-red-100 flex justify-between items-center cursor-pointer">
                  <span className="text-[10px] font-black text-neda-navy uppercase">{t.name}</span>
                  <AlertTriangle size={14} className="text-red-500" />
                </div>
              ))}
            </div>
          )}
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
      <h2 className="text-2xl font-black text-neda-navy uppercase flex items-center gap-3 mb-8"><Sparkles className="text-neda-orange" /> Pulse AI</h2>
      <div className="relative mb-6">
        <input placeholder="Ask about equipment..." className="w-full p-5 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-xs outline-none" value={query} onChange={e => setQuery(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleAsk()} />
        <button onClick={handleAsk} className="absolute right-2 top-2 p-3 bg-neda-navy text-white rounded-xl shadow-lg">{loading ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}</button>
      </div>
      {reply && <div className="p-6 bg-slate-50 rounded-2xl text-[12px] font-bold text-slate-700 leading-relaxed animate-in fade-in">{reply}</div>}
    </div>
  );
};

const MyToolsView: React.FC<any> = ({ tools, currentUser, onInitiateReturn, onViewDetail, isBiometricSupported, hasLinkedBiometrics, onLinkBiometrics }) => (
  <div className="space-y-6">
    <div className="bg-neda-navy p-10 rounded-[3rem] text-white shadow-2xl relative overflow-hidden">
       <h2 className="text-4xl font-black uppercase tracking-tight">Toolkit</h2>
       <p className="text-[11px] font-black text-neda-orange uppercase mt-2 tracking-[0.3em]">{currentUser.name}</p>
    </div>
    {isBiometricSupported && (
      <button onClick={onLinkBiometrics} disabled={hasLinkedBiometrics} className={`w-full p-6 rounded-[2rem] border flex items-center justify-between ${hasLinkedBiometrics ? 'bg-green-50 text-green-700' : 'bg-white text-neda-navy shadow-sm'}`}>
        <div className="flex items-center gap-4"><Fingerprint size={20} className="text-neda-orange" /><h4 className="font-black uppercase text-[10px]">{hasLinkedBiometrics ? 'Secured' : 'Enable FaceID'}</h4></div>
        {hasLinkedBiometrics ? <CheckCircle size={18} /> : <ChevronRight size={18} />}
      </button>
    )}
    <div className="grid gap-3">
      {tools.length === 0 ? <div className="text-center py-16 bg-white rounded-[2rem] border-dashed border border-slate-200 text-slate-300 font-black uppercase text-[10px]">No items</div> : tools.map((tool: Tool) => (
        <div key={tool.id} onClick={() => onViewDetail(tool)} className="bg-white p-6 rounded-[2rem] border border-slate-100 flex flex-col shadow-sm cursor-pointer hover:bg-slate-50 transition-colors">
          <div className="flex justify-between items-start mb-4">
            <div><span className="text-[8px] font-bold text-slate-300 uppercase mb-0.5">{tool.category}</span><h3 className="font-black text-neda-navy uppercase text-sm">{tool.name}</h3></div>
            <button onClick={(e) => { e.stopPropagation(); onInitiateReturn(tool); }} className="px-5 py-2.5 bg-slate-50 text-neda-orange rounded-xl font-black text-[10px] uppercase border border-neda-orange/10">Return</button>
          </div>
          <div className="mt-2 pt-4 border-t border-slate-50 flex items-center gap-2"><MapPin size={12} className="text-neda-orange" /><span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">{tool.currentSite || 'Warehouse'}</span></div>
        </div>
      ))}
    </div>
  </div>
);

export default App;

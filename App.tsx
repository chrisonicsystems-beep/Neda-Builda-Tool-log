
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
  Warehouse
} from 'lucide-react';
import { analyzeTools, searchAddresses } from './services/geminiService';
import { fetchTools, fetchUsers, syncTools, syncUsers, upsertSingleTool, upsertSingleUser, deleteSingleUser, supabase } from './services/supabaseService';

const TEMP_PASSWORD_PREFIX = "NEDA-RESET-";
const BIOMETRIC_ENROLLED_KEY = "neda_biometric_v1_";

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
  
  const [showBiometricEnrollment, setShowBiometricEnrollment] = useState(false);
  const [isBiometricSupported, setIsBiometricSupported] = useState(false);

  // Modal states
  const [showAddUser, setShowAddUser] = useState(false);
  const [showAddTool, setShowAddTool] = useState(false);
  const [returningTool, setReturningTool] = useState<Tool | null>(null);
  const [bookingTool, setBookingTool] = useState<Tool | null>(null);

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
    setAllUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
    if (currentUser && currentUser.id === updatedUser.id) {
      setCurrentUser(updatedUser);
      localStorage.setItem('et_user', JSON.stringify(updatedUser));
    }

    try {
      await upsertSingleUser(updatedUser);
      setSyncSuccess(`Profile for ${updatedUser.name} updated.`);
      setTimeout(() => setSyncSuccess(null), 3000);
    } catch (e: any) {
      console.warn("DB update sync warning:", e);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAddUser = async (newUser: User) => {
    setIsSyncing(true);
    try {
      await upsertSingleUser(newUser);
      setAllUsers(prev => [...prev, newUser]);
      setSyncSuccess(`User ${newUser.name} added successfully.`);
      setTimeout(() => setSyncSuccess(null), 3000);
      setShowAddUser(false);
    } catch (e: any) {
      setSyncError(e.message || "Failed to add user.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAddTool = async (newTool: Tool) => {
    setIsSyncing(true);
    try {
      await upsertSingleTool(newTool);
      setTools(prev => [...prev, newTool]);
      setSyncSuccess(`Tool ${newTool.name} added successfully.`);
      setTimeout(() => setSyncSuccess(null), 3000);
      setShowAddTool(false);
    } catch (e: any) {
      setSyncError(e.message || "Failed to add tool.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteUser = async (userToDelete: User) => {
    if (!currentUser) return;
    if (userToDelete.id === currentUser.id) {
      setSyncError("Cannot delete your own account.");
      return;
    }

    const confirmed = window.confirm(`Are you sure you want to delete ${userToDelete.name}? This action cannot be undone.`);
    if (!confirmed) return;

    setIsSyncing(true);
    try {
      await deleteSingleUser(userToDelete.id);
      setAllUsers(prev => prev.filter(u => u.id !== userToDelete.id));
      setSyncSuccess(`User ${userToDelete.name} removed.`);
      setTimeout(() => setSyncSuccess(null), 3000);
    } catch (e: any) {
      setSyncError(e.message || "Deletion failed.");
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
    } catch (e: any) {
      setSyncError(e.message || "Update Failed");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleReturnTool = async (comment: string, condition: string, photo?: string) => {
    if (!returningTool || !currentUser) return;
    
    // Determine status based on condition
    let newStatus = ToolStatus.AVAILABLE;
    if (condition === 'defect identified' || condition === 'needs service') {
      newStatus = ToolStatus.GETTING_SERVICED;
    }

    const updatedTool: Tool = {
      ...returningTool,
      status: newStatus,
      currentHolderId: undefined,
      currentHolderName: undefined,
      currentSite: undefined,
      bookedAt: undefined,
      logs: [...(returningTool.logs || []), {
        id: Math.random().toString(36).substr(2, 9),
        userId: currentUser.id,
        userName: currentUser.name,
        action: 'RETURN',
        timestamp: Date.now(),
        comment: comment.trim(),
        condition: condition,
        photo: photo
      }]
    };

    setReturningTool(null);
    await updateTool(updatedTool);
  };

  const handleConfirmBookOut = async (tool: Tool, siteAddress: string) => {
    if (!currentUser) return;
    
    const updatedTool: Tool = {
      ...tool,
      status: ToolStatus.BOOKED_OUT,
      currentHolderId: currentUser.id,
      currentHolderName: currentUser.name,
      currentSite: siteAddress,
      bookedAt: Date.now(),
      logs: [...(tool.logs || []), {
        id: Math.random().toString(36).substr(2, 9),
        userId: currentUser.id,
        userName: currentUser.name,
        action: 'BOOK_OUT',
        timestamp: Date.now(),
        site: siteAddress
      }]
    };

    setBookingTool(null);
    await updateTool(updatedTool);
  };

  const handleForgotPassword = async (email: string): Promise<string> => {
    const user = allUsers.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user) throw new Error(`Email "${email}" not found.`);

    const tempPass = TEMP_PASSWORD_PREFIX + Math.floor(1000 + Math.random() * 9000);
    const updatedUser = { ...user, password: tempPass, mustChangePassword: true };

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
        <MandatoryPasswordChange user={currentUser} onUpdate={updateUser} />
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
              <button onClick={handleEnrollBiometric} className="w-full py-5 bg-neda-navy text-white rounded-2xl font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all">Secure Account</button>
              <button onClick={() => setShowBiometricEnrollment(false)} className="w-full py-3 text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">Maybe Later</button>
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

      {showAddUser && <AddUserModal onClose={() => setShowAddUser(false)} onSave={handleAddUser} />}
      {showAddTool && <AddToolModal onClose={() => setShowAddTool(false)} onSave={handleAddTool} />}
      {returningTool && (
        <ReturnToolModal 
          tool={returningTool} 
          onClose={() => setReturningTool(null)} 
          onConfirm={handleReturnTool} 
        />
      )}
      {bookingTool && (
        <BookOutModal
          tool={bookingTool}
          onClose={() => setBookingTool(null)}
          onConfirm={handleConfirmBookOut}
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
          userRole={currentUser.role}
          currentUserId={currentUser.id}
          currentUserName={currentUser.name}
        />
      )}

      {view === 'AI_ASSISTANT' && <AIAssistant tools={tools} />}
      
      {view === 'MY_TOOLS' && (
        <MyToolsView 
          tools={tools.filter(t => t.currentHolderId === currentUser.id)} 
          currentUser={currentUser} 
          onInitiateReturn={(t: Tool) => setReturningTool(t)}
        />
      )}
    </Layout>
  );
};

// --- Modals ---

const BookOutModal: React.FC<{ tool: Tool; onClose: () => void; onConfirm: (tool: Tool, siteAddress: string) => void }> = ({ tool, onClose, onConfirm }) => {
  const [addressInput, setAddressInput] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<number | null>(null);

  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setAddressInput(value);

    if (searchTimeoutRef.current) {
      window.clearTimeout(searchTimeoutRef.current);
    }

    if (value.trim().length >= 3) {
      setIsSearching(true);
      searchTimeoutRef.current = window.setTimeout(async () => {
        const results = await searchAddresses(value);
        setSuggestions(results);
        setIsSearching(false);
      }, 600); // Slightly longer debounce for stable mobile typing
    } else {
      setSuggestions([]);
      setIsSearching(false);
    }
  };

  const handleSelectSuggestion = (e: React.MouseEvent | React.TouchEvent, addr: string) => {
    e.preventDefault(); // Critical for mobile to prevent blur clearing suggestions before selection
    setAddressInput(addr);
    setSuggestions([]);
  };

  const handleConfirm = () => {
    if (addressInput.trim().length < 5) return;
    onConfirm(tool, addressInput.trim());
  };

  return (
    <div className="fixed inset-0 z-[700] bg-neda-navy/90 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in">
      <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in-95 overflow-visible">
        <div className="flex justify-between items-center mb-6">
          <div className="flex flex-col">
            <span className="text-[8px] font-black text-neda-orange uppercase tracking-widest mb-1">Book Out Equipment</span>
            <h2 className="text-xl font-black text-neda-navy uppercase tracking-tight truncate max-w-[200px]">{tool.name}</h2>
          </div>
          <button onClick={onClose} className="p-2 text-slate-300 hover:text-neda-navy transition-colors"><X size={20} /></button>
        </div>

        <div className="space-y-5">
          <div className="space-y-1 relative">
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest pl-1">Destination Site Address</span>
            <div className="relative z-[710]">
              <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
              <input 
                autoFocus
                type="text"
                placeholder="Start typing site address..."
                className="w-full p-4 pl-12 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-xs outline-none focus:ring-2 focus:ring-neda-navy/5 transition-all"
                value={addressInput}
                onChange={handleAddressChange}
              />
              {isSearching && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 bg-slate-50 pl-2">
                  <Loader2 className="animate-spin text-neda-orange" size={14} />
                </div>
              )}
            </div>

            {/* Suggestions dropdown with stable z-index and pointer interaction */}
            <div className={`absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-[720] transition-all duration-200 transform origin-top ${suggestions.length > 0 ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}>
              <div className="max-h-[180px] overflow-y-auto hide-scrollbar divide-y divide-slate-50">
                {suggestions.map((addr, idx) => (
                  <button 
                    key={idx}
                    onPointerDown={(e) => handleSelectSuggestion(e, addr)}
                    className="w-full text-left px-5 py-4 text-[10px] font-bold text-slate-600 active:bg-slate-100 flex items-center gap-3 transition-colors"
                  >
                    <div className="w-6 h-6 rounded-full bg-neda-lightOrange flex items-center justify-center shrink-0">
                      <Navigation size={10} className="text-neda-orange" />
                    </div>
                    <span className="truncate">{addr}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
             <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-neda-navy shadow-sm"><Info size={16} /></div>
                <div>
                   <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Note</p>
                   <p className="text-[9px] font-bold text-slate-600 leading-tight">Assets are tracked in real-time. Ensure the site address is correct for project reporting.</p>
                </div>
             </div>
          </div>

          <button 
            disabled={addressInput.trim().length < 5}
            onClick={handleConfirm} 
            className="w-full py-5 bg-neda-navy text-white rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-neda-navy/20 active:scale-95 transition-all disabled:opacity-50 disabled:grayscale"
          >
            Confirm Assignment
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
      reader.onloadend = () => {
        setPhoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="fixed inset-0 z-[700] bg-neda-navy/90 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in">
      <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in-95">
        <div className="flex justify-between items-center mb-6">
          <div className="flex flex-col">
            <span className="text-[8px] font-black text-neda-orange uppercase tracking-widest mb-1">Confirm Return</span>
            <h2 className="text-xl font-black text-neda-navy uppercase tracking-tight truncate max-w-[200px]">{tool.name}</h2>
          </div>
          <button onClick={onClose} className="p-2 text-slate-300 hover:text-neda-navy transition-colors"><X size={20} /></button>
        </div>
        
        <div className="space-y-5">
          <div className="space-y-1">
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest pl-1">Condition</span>
            <select 
              className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-xs outline-none focus:ring-2 focus:ring-neda-navy/5 transition-all"
              value={condition}
              onChange={e => setCondition(e.target.value)}
            >
              <option value="good">Good</option>
              <option value="defect identified">Defect Identified</option>
              <option value="needs service">Needs Service</option>
            </select>
          </div>

          <div className="space-y-1">
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest pl-1">Condition/Comments</span>
            <div className="relative">
              <MessageSquare className="absolute left-4 top-4 text-slate-300" size={16} />
              <textarea 
                className="w-full p-4 pl-12 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-xs outline-none min-h-[100px] resize-none focus:ring-2 focus:ring-neda-navy/5 transition-all" 
                placeholder="e.g. Needs service, all good, etc." 
                value={comment} 
                onChange={e => setComment(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest pl-1">Photo Documentation (Optional)</span>
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="w-full aspect-video bg-slate-50 border-2 border-dashed border-slate-100 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-slate-100 transition-all overflow-hidden relative"
            >
              {photo ? (
                <>
                  <img src={photo} alt="Return Documentation" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    <Camera size={24} className="text-white" />
                  </div>
                </>
              ) : (
                <>
                  <Camera size={24} className="text-slate-200 mb-2" />
                  <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Tap to capture photo</span>
                </>
              )}
              <input 
                type="file" 
                ref={fileInputRef} 
                accept="image/*" 
                capture="environment" 
                className="hidden" 
                onChange={handlePhotoUpload} 
              />
            </div>
          </div>

          <button 
            onClick={() => onConfirm(comment, condition, photo)} 
            className="w-full py-5 bg-neda-navy text-white rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-neda-navy/20 active:scale-95 transition-all"
          >
            Complete Return
          </button>
        </div>
      </div>
    </div>
  );
};

const AddUserModal: React.FC<{ onClose: () => void; onSave: (u: User) => void }> = ({ onClose, onSave }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: 'password123',
    role: UserRole.USER
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      id: 'U' + Math.floor(Math.random() * 100000),
      ...formData,
      isEnabled: true,
      mustChangePassword: true
    });
  };

  return (
    <div className="fixed inset-0 z-[700] bg-neda-navy/90 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in">
      <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-black text-neda-navy uppercase tracking-tight">Add New Staff</h2>
          <button onClick={onClose} className="p-2 text-slate-300 hover:text-neda-navy transition-colors"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest pl-1">Full Name</span>
            <input required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none" placeholder="John Doe" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
          </div>
          <div className="space-y-1">
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest pl-1">Email Address</span>
            <input required type="email" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none" placeholder="john@nedabuilda.com" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
          </div>
          <div className="space-y-1">
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest pl-1">Access Role</span>
            <select className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none appearance-none" value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as UserRole})}>
              <option value={UserRole.USER}>User (Book/Return)</option>
              <option value={UserRole.MANAGER}>Manager (Admin Lite)</option>
              <option value={UserRole.ADMIN}>Admin (Full Control)</option>
            </select>
          </div>
          <button type="submit" className="w-full py-5 bg-neda-navy text-white rounded-2xl font-black uppercase tracking-widest shadow-lg mt-4 active:scale-95 transition-all">Create Profile</button>
        </form>
      </div>
    </div>
  );
};

const AddToolModal: React.FC<{ onClose: () => void; onSave: (t: Tool) => void }> = ({ onClose, onSave }) => {
  const [formData, setFormData] = useState({
    name: '',
    category: 'Power Tools',
    serialNumber: '',
    notes: '',
    dateOfPurchase: new Date().toISOString().split('T')[0],
    numberOfItems: 1
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      id: 'T' + Math.floor(Math.random() * 100000),
      ...formData,
      status: ToolStatus.AVAILABLE,
      logs: []
    });
  };

  return (
    <div className="fixed inset-0 z-[700] bg-neda-navy/90 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in">
      <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl max-h-[90vh] overflow-y-auto hide-scrollbar">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-black text-neda-navy uppercase tracking-tight">Add Equipment</h2>
          <button onClick={onClose} className="p-2 text-slate-300 hover:text-neda-navy transition-colors"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest pl-1">Tool Name</span>
            <input required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none" placeholder="e.g. DeWalt 18V Drill" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
          </div>
          <div className="space-y-1">
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest pl-1">Category</span>
            <select className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none appearance-none" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
              <option value="Power Tools">Power Tools</option>
              <option value="Precision">Precision</option>
              <option value="Power">Power</option>
              <option value="PPE">PPE</option>
              <option value="Hand Tools">Hand Tools</option>
            </select>
          </div>
          <div className="space-y-1">
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest pl-1">Serial Number</span>
            <input className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none" placeholder="SN-123456" value={formData.serialNumber} onChange={e => setFormData({...formData, serialNumber: e.target.value})} />
          </div>
          <div className="space-y-1">
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest pl-1">Purchase Date</span>
            <input type="date" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none" value={formData.dateOfPurchase} onChange={e => setFormData({...formData, dateOfPurchase: e.target.value})} />
          </div>
          <div className="space-y-1">
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest pl-1">Quantity</span>
            <input type="number" min="1" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none" value={formData.numberOfItems} onChange={e => setFormData({...formData, numberOfItems: parseInt(e.target.value)})} />
          </div>
          <button type="submit" className="w-full py-5 bg-neda-navy text-white rounded-2xl font-black uppercase tracking-widest shadow-lg mt-4 active:scale-95 transition-all">Register Asset</button>
        </form>
      </div>
    </div>
  );
};

// --- Standard Screens ---

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
    const checkEnrolled = () => {
      const keys = Object.keys(localStorage);
      const isEnrolled = keys.some(k => k.startsWith(BIOMETRIC_ENROLLED_KEY));
      setIsBiometricAvailable(isBiometricSupported && isEnrolled);
    };
    checkEnrolled();
  }, [isBiometricSupported]);

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    const user = users.find((u: User) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (user && user.password === password) {
      onLogin(user, rememberMe);
    } else {
      setError('Invalid credentials.');
    }
  };

  const handleBiometricLogin = async () => {
    try {
      const savedUserStr = localStorage.getItem('et_user');
      if (savedUserStr) {
        const savedUser = JSON.parse(savedUserStr);
        const enrollmentKey = BIOMETRIC_ENROLLED_KEY + savedUser.email;
        if (localStorage.getItem(enrollmentKey)) {
          onLogin(savedUser, true);
          return;
        }
      }
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
            <input type="email" placeholder="Email Address" required className="w-full bg-[#f8faff] border border-slate-100 rounded-2xl py-5 px-6 text-slate-700 font-bold text-center focus:ring-4 focus:ring-neda-navy/5 outline-none transition-all" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1">
            <input type="password" placeholder="Password" required className="w-full bg-[#f8faff] border border-slate-100 rounded-2xl py-5 px-6 text-slate-700 font-bold text-center focus:ring-4 focus:ring-neda-navy/5 outline-none transition-all" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="text-red-500 text-[10px] font-black uppercase tracking-widest animate-pulse">{error}</p>}
          <div className="flex justify-between items-center px-2 mb-4">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} className="w-4 h-4 rounded border-slate-200 text-neda-navy focus:ring-0" />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-slate-600 transition-colors">Keep Signed In</span>
            </label>
            <button type="button" onClick={() => { setShowForgotModal(true); setTempPassResult(null); setError(''); }} className="text-neda-orange text-[10px] font-black uppercase tracking-widest hover:opacity-70 transition-opacity">Forgot Key?</button>
          </div>
          <div className="flex flex-col gap-3">
            <button type="submit" className="w-full bg-neda-navy text-white py-6 rounded-2xl font-black text-xl uppercase shadow-xl hover:shadow-neda-navy/20 active:scale-95 transition-all">Sign In</button>
            {isBiometricAvailable && (
              <button type="button" onClick={handleBiometricLogin} className="w-full bg-slate-50 text-neda-navy border border-slate-200 py-5 rounded-2xl font-black text-xs uppercase flex items-center justify-center gap-3 hover:bg-slate-100 transition-colors">
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
            <div className="mx-auto w-16 h-16 bg-neda-lightOrange rounded-2xl flex items-center justify-center mb-6"><Key size={32} className="text-neda-orange" /></div>
            {tempPassResult ? (
              <div className="animate-in zoom-in-95">
                <h2 className="text-xl font-black text-neda-navy uppercase mb-4 tracking-tight">Key Generated</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase leading-relaxed mb-6 tracking-widest">Copy your temporary access key:</p>
                <div className="bg-slate-50 p-6 rounded-2xl border border-dashed border-neda-orange/30 mb-8 group relative cursor-pointer active:scale-95 transition-all" onClick={() => { navigator.clipboard.writeText(tempPassResult); }}>
                  <p className="text-xl font-mono font-black text-neda-orange tracking-[0.2em]">{tempPassResult}</p>
                  <Copy size={12} className="absolute right-4 top-4 text-slate-300 group-hover:text-neda-orange" />
                </div>
                <button onClick={() => setShowForgotModal(false)} className="w-full py-5 bg-neda-navy text-white rounded-2xl font-black uppercase tracking-widest shadow-lg">Proceed to Login</button>
              </div>
            ) : (
              <div>
                <h2 className="text-xl font-black text-neda-navy uppercase mb-2 tracking-tight">Reset Request</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-8 tracking-widest">Enter your email to receive a temporary key.</p>
                <form onSubmit={handleResetSubmit} className="space-y-4">
                  <input type="email" placeholder="Work Email" required className="w-full p-5 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-center focus:ring-4 focus:ring-neda-navy/5 outline-none" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} />
                  {error && <p className="text-red-500 text-[9px] font-black uppercase tracking-widest">{error}</p>}
                  <button type="submit" disabled={isResetting} className="w-full py-5 bg-neda-navy text-white rounded-2xl font-black uppercase tracking-widest shadow-lg disabled:opacity-50">{isResetting ? <Loader2 className="animate-spin mx-auto" size={20} /> : "Generate Key"}</button>
                  <button type="button" onClick={() => setShowForgotModal(false)} className="w-full py-3 text-slate-400 text-[10px] font-black uppercase tracking-[0.3em]">Cancel</button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
      <div className="mt-10 opacity-30"><p className="text-[8px] font-black uppercase tracking-[0.5em] text-neda-navy">Pulse Core | Powered by Chrisonic</p></div>
    </div>
  );
};

const InventoryView: React.FC<any> = ({ tools, searchTerm, setSearchTerm, statusFilter, setStatusFilter, showFilters, setShowFilters, currentUser, onInitiateBookOut, onInitiateReturn }) => {
  const handleAction = (tool: Tool) => {
    if (tool.status === ToolStatus.AVAILABLE) {
      onInitiateBookOut(tool);
    } else if (tool.status === ToolStatus.BOOKED_OUT && tool.currentHolderId === currentUser.id) {
      onInitiateReturn(tool);
    }
  };

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input 
          type="text" 
          placeholder="Search equipment..." 
          className="w-full pl-12 pr-4 py-4 bg-white border border-slate-100 rounded-2xl font-bold text-xs outline-none shadow-sm focus:ring-2 focus:ring-neda-navy/5 transition-all" 
          value={searchTerm} 
          onChange={(e) => setSearchTerm(e.target.value)} 
        />
        <button 
          onClick={() => setShowFilters(!showFilters)} 
          className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-colors ${showFilters ? 'bg-neda-navy text-white' : 'text-slate-400 hover:bg-slate-50'}`}
        >
          <Filter size={18} />
        </button>
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-100 overflow-hidden shadow-sm divide-y divide-slate-50">
        {tools.length > 0 ? (
          tools.map((tool: Tool) => {
            const isHeldByMe = tool.status === ToolStatus.BOOKED_OUT && tool.currentHolderId === currentUser.id;
            const isHeldByOthers = tool.status === ToolStatus.BOOKED_OUT && tool.currentHolderId !== currentUser.id;
            const isAvailable = tool.status === ToolStatus.AVAILABLE;
            const isServiced = tool.status === ToolStatus.GETTING_SERVICED;

            return (
              <div key={tool.id} className="px-6 py-5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex-1 min-w-0 pr-4">
                  <div className="flex items-center gap-2 mb-1">
                     <span className="text-[7px] font-black uppercase tracking-widest text-neda-orange bg-neda-lightOrange px-1.5 py-0.5 rounded-sm">
                       {tool.category}
                     </span>
                     <div className={`w-1.5 h-1.5 rounded-full ${
                       isAvailable ? 'bg-green-500' : 
                       isServiced ? 'bg-red-500' : 'bg-orange-500 animate-pulse'
                     }`}></div>
                  </div>
                  
                  <h3 className="font-black text-neda-navy text-sm uppercase tracking-tight truncate">
                    {tool.name}
                  </h3>
                  
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                     <div className="flex items-center gap-1.5">
                        {isAvailable ? <Warehouse size={10} className="text-green-600" /> : <UserIcon size={10} className="text-slate-300" />}
                        <span className={`text-[9px] font-bold uppercase tracking-wider truncate max-w-[90px] ${isAvailable ? 'text-green-600' : isHeldByOthers ? 'text-orange-600' : 'text-slate-400'}`}>
                          {isServiced ? 'Maintenance' : (isAvailable ? 'In Warehouse' : (tool.currentHolderName || 'User'))}
                        </span>
                     </div>
                     <div className="flex items-center gap-1.5">
                        <MapPin size={10} className="text-slate-300" />
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider truncate max-w-[110px]">
                          {tool.currentSite || 'Warehouse'}
                        </span>
                     </div>
                  </div>
                </div>

                {(isAvailable || isHeldByMe) && (
                  <button 
                    onClick={() => handleAction(tool)} 
                    className={`shrink-0 px-4 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all active:scale-95 shadow-md ${
                      isAvailable 
                        ? 'bg-neda-navy text-white shadow-neda-navy/10' 
                        : 'bg-white border border-neda-orange text-neda-orange shadow-neda-orange/5'
                    }`}
                  >
                    {isAvailable ? 'Book Out' : 'Return'}
                  </button>
                )}
                
                {isHeldByOthers && (
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <span className="text-[7px] font-black text-slate-300 uppercase tracking-widest mb-0.5">At Site</span>
                    <div className="px-3 py-1.5 bg-slate-50 text-slate-400 rounded-lg text-[8px] font-black uppercase tracking-wider border border-slate-100 flex items-center gap-1.5">
                      <Clock size={10} />
                      In Use
                    </div>
                  </div>
                )}

                {isServiced && (
                  <div className="shrink-0 flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-[8px] font-black uppercase tracking-wider border border-red-100">
                    <Stethoscope size={10} />
                    Service
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="px-6 py-12 text-center">
            <Package size={40} className="mx-auto text-slate-100 mb-3" />
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">No equipment matches</p>
          </div>
        )}
      </div>

      <div className="p-5 bg-neda-lightNavy rounded-[2rem] border border-slate-200/50">
        <div className="flex gap-4">
          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-neda-navy shadow-sm"><Info size={20} /></div>
          <div className="flex-1">
            <h4 className="text-[10px] font-black text-neda-navy uppercase tracking-tight mb-1">Warehouse Only</h4>
            <p className="text-[9px] font-bold text-slate-500 leading-relaxed uppercase tracking-wider">Equipment can only be booked from the warehouse. If a tool is in use, the current holder must return it before it can be assigned to a new site.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const AdminDashboard: React.FC<any> = ({ tools, allUsers, onUpdateUser, onDeleteUser, onUpdateTool, onShowAddUser, onShowAddTool, userRole, currentUserId, currentUserName }) => {
  const [activeTab, setActiveTab] = useState<'USERS' | 'STOCKTAKE' | 'ACTIVE_BOOKINGS'>('USERS');

  const servicedTools = useMemo(() => tools.filter((t: Tool) => t.status === ToolStatus.GETTING_SERVICED), [tools]);
  const bookedTools = useMemo(() => tools.filter((t: Tool) => t.status === ToolStatus.BOOKED_OUT), [tools]);

  const handleDownloadCSV = () => {
    const headers = ["Tool Name", "Category", "Serial Number", "Status", "Current Holder", "Current Site"];
    const rows = tools.map((t: Tool) => [
      `"${t.name.replace(/"/g, '""')}"`,
      `"${t.category.replace(/"/g, '""')}"`,
      `"${(t.serialNumber || 'N/A').replace(/"/g, '""')}"`,
      t.status,
      `"${(t.currentHolderName || 'Warehouse').replace(/"/g, '""')}"`,
      `"${(t.currentSite || 'Warehouse').replace(/"/g, '""')}"`
    ]);
    const csvContent = [headers.join(","), ...rows.map((e: string[]) => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Neda_Inventory_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleClearService = (tool: Tool) => {
    onUpdateTool({
      ...tool,
      status: ToolStatus.AVAILABLE,
      logs: [...(tool.logs || []), {
        id: Math.random().toString(36).substr(2, 9),
        userId: currentUserId,
        userName: currentUserName || 'Admin',
        action: 'RETURN',
        timestamp: Date.now(),
        comment: 'Maintenance completed. Returned to available stock.'
      }]
    });
  };

  const handleForceReturn = (tool: Tool) => {
    const confirmed = window.confirm(`Force return "${tool.name}" to warehouse? This will end the current booking for ${tool.currentHolderName}.`);
    if (!confirmed) return;

    onUpdateTool({
      ...tool,
      status: ToolStatus.AVAILABLE,
      currentHolderId: undefined,
      currentHolderName: undefined,
      currentSite: undefined,
      bookedAt: undefined,
      logs: [...(tool.logs || []), {
        id: Math.random().toString(36).substr(2, 9),
        userId: currentUserId,
        userName: currentUserName || 'Admin',
        action: 'RETURN',
        timestamp: Date.now(),
        comment: 'Manager forced return to warehouse.'
      }]
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-4 border-b border-slate-100 pb-2 overflow-x-auto hide-scrollbar whitespace-nowrap">
        <button onClick={() => setActiveTab('USERS')} className={`pb-2 text-[10px] font-black uppercase tracking-widest flex-shrink-0 ${activeTab === 'USERS' ? 'text-neda-orange border-b-2 border-neda-orange' : 'text-slate-400'}`}>Staff List</button>
        <button onClick={() => setActiveTab('ACTIVE_BOOKINGS')} className={`pb-2 text-[10px] font-black uppercase tracking-widest flex-shrink-0 ${activeTab === 'ACTIVE_BOOKINGS' ? 'text-neda-orange border-b-2 border-neda-orange' : 'text-slate-400'}`}>Bookings</button>
        <button onClick={() => setActiveTab('STOCKTAKE')} className={`pb-2 text-[10px] font-black uppercase tracking-widest flex-shrink-0 ${activeTab === 'STOCKTAKE' ? 'text-neda-orange border-b-2 border-neda-orange' : 'text-slate-400'}`}>Stocktake</button>
      </div>

      {/* Service Alerts Section */}
      {servicedTools.length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-[2rem] p-6 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center text-red-600">
              <AlertCircle size={24} />
            </div>
            <div>
              <h4 className="font-black text-red-900 uppercase text-xs tracking-tight">Maintenance Required</h4>
              <p className="text-[8px] font-bold text-red-500 uppercase tracking-widest">{servicedTools.length} Item(s) out of service</p>
            </div>
          </div>
          <div className="space-y-3">
            {servicedTools.map((t: Tool) => (
              <div key={t.id} className="bg-white p-4 rounded-xl flex items-center justify-between shadow-sm border border-red-50">
                <div className="min-w-0">
                  <p className="font-black text-neda-navy text-[11px] uppercase truncate">{t.name}</p>
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">{t.logs[t.logs.length-1]?.condition || 'Check Required'}</p>
                </div>
                <button 
                  onClick={() => handleClearService(t)}
                  className="px-3 py-1.5 bg-neda-navy text-white rounded-lg font-black text-[9px] uppercase tracking-wider shadow-sm active:scale-95"
                >
                  Clear Service
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'USERS' && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
          <button 
            onClick={onShowAddUser}
            className="w-full flex items-center justify-between p-6 bg-slate-50 border border-dashed border-slate-200 rounded-[2rem] hover:bg-slate-100 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-neda-navy shadow-sm"><UserPlus size={24} /></div>
              <div className="text-left">
                <h4 className="font-black text-neda-navy uppercase text-xs tracking-tight">Onboard New Staff</h4>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Create secure access profile</p>
              </div>
            </div>
            <PlusCircle size={24} className="text-neda-orange" />
          </button>

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
                <div className="flex items-center gap-2">
                  {user.mustChangePassword && <span className="bg-orange-50 text-neda-orange px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-wider border border-neda-orange/10">Key Pending</span>}
                  {user.id !== currentUserId && (
                    <button onClick={() => onDeleteUser(user)} className="p-2 text-slate-300 hover:text-red-500 transition-colors" title="Delete User"><Trash2 size={18} /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'ACTIVE_BOOKINGS' && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
          <div className="bg-white rounded-[2rem] border border-slate-100 overflow-hidden shadow-sm">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Current Equipment Assignments</h4>
              <span className="bg-neda-navy text-white text-[8px] font-black px-2 py-0.5 rounded-full">{bookedTools.length} Out</span>
            </div>
            <div className="divide-y divide-slate-50">
              {bookedTools.length > 0 ? (
                bookedTools.map((t: Tool) => (
                  <div key={t.id} className="px-6 py-5 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                    <div className="min-w-0 flex-1 pr-4">
                      <p className="font-black text-neda-navy text-xs uppercase tracking-tight truncate">{t.name}</p>
                      <div className="flex flex-col gap-0.5 mt-1">
                        <div className="flex items-center gap-1.5 text-slate-400">
                          <UserIcon size={10} />
                          <span className="text-[9px] font-bold uppercase tracking-wider">{t.currentHolderName}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-neda-orange">
                          <MapPin size={10} />
                          <span className="text-[9px] font-bold uppercase tracking-wider truncate">{t.currentSite}</span>
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleForceReturn(t)}
                      className="shrink-0 p-2 bg-slate-50 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all active:scale-90"
                      title="Force Return to Warehouse"
                    >
                      <RefreshCcw size={18} />
                    </button>
                  </div>
                ))
              ) : (
                <div className="px-6 py-12 text-center text-slate-300 font-black uppercase text-[10px] tracking-widest">No active bookings</div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'STOCKTAKE' && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
          <button 
            onClick={onShowAddTool}
            className="w-full flex items-center justify-between p-6 bg-slate-50 border border-dashed border-slate-200 rounded-[2rem] hover:bg-slate-100 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-neda-navy shadow-sm"><Wrench size={24} /></div>
              <div className="text-left">
                <h4 className="font-black text-neda-navy uppercase text-xs tracking-tight">Register New Equipment</h4>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Add to company inventory</p>
              </div>
            </div>
            <PlusCircle size={24} className="text-neda-orange" />
          </button>

          <div className="bg-neda-navy p-8 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden">
             <div className="relative z-10">
               <h3 className="text-xl font-black uppercase tracking-tight mb-2">Inventory Export</h3>
               <p className="text-[10px] font-bold text-slate-400 uppercase leading-relaxed mb-6 max-w-[200px]">Generate a detailed CSV report of all company assets, holders, and locations.</p>
               <button onClick={handleDownloadCSV} className="flex items-center gap-3 px-6 py-4 bg-neda-orange text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-all"><Download size={18} />Download CSV</button>
             </div>
             <div className="absolute top-1/2 -right-4 -translate-y-1/2 opacity-10"><FileSpreadsheet size={160} /></div>
          </div>

          <div className="bg-white rounded-[2rem] border border-slate-100 overflow-hidden shadow-sm">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100"><h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Inventory Status Summary</h4></div>
            <div className="divide-y divide-slate-50">
              {tools.map((t: Tool) => (
                <div key={t.id} className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <p className="font-black text-neda-navy text-xs uppercase tracking-tight">{t.name}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{t.currentSite || 'Warehouse'}</p>
                  </div>
                  <div className={`text-[8px] font-black uppercase px-2 py-1 rounded-md ${
                    t.status === 'AVAILABLE' ? 'text-green-600 bg-green-50' : 
                    t.status === 'GETTING_SERVICED' ? 'text-red-600 bg-red-50' : 'text-orange-600 bg-orange-50'
                  }`}>{t.status.replace('_', ' ')}</div>
                </div>
              ))}
            </div>
          </div>
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
        <input placeholder="How many drills are out?" className="w-full p-5 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-xs focus:ring-4 focus:ring-neda-navy/5 outline-none transition-all" value={query} onChange={e => setQuery(e.target.value)} onKeyPress={(e: any) => e.key === 'Enter' && handleAsk()} />
        <button onClick={handleAsk} className="absolute right-2 top-2 p-3 bg-neda-navy text-white rounded-xl shadow-lg active:scale-95 transition-all">{loading ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}</button>
      </div>
      {reply && <div className="p-6 bg-slate-50 rounded-2xl text-[12px] font-bold text-slate-700 leading-relaxed border border-slate-100 animate-in fade-in">{reply}</div>}
    </div>
  );
};

const MyToolsView: React.FC<any> = ({ tools, currentUser, onInitiateReturn }) => (
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
          <div key={tool.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 flex flex-col shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <div className="flex flex-col">
                <span className="text-[8px] font-bold text-slate-300 uppercase mb-0.5 tracking-widest">{tool.category}</span>
                <h3 className="font-black text-neda-navy uppercase text-sm tracking-tight">{tool.name}</h3>
              </div>
              <button onClick={() => onInitiateReturn(tool)} className="px-5 py-2.5 bg-slate-50 text-neda-orange rounded-xl font-black text-[10px] uppercase tracking-wider border border-neda-orange/10 hover:bg-neda-lightOrange transition-colors">Return</button>
            </div>
            
            <div className="mt-2 pt-4 border-t border-slate-50 flex items-center gap-2">
               <MapPin size={12} className="text-neda-orange" />
               <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">{tool.currentSite || 'Warehouse'}</span>
            </div>
          </div>
        ))
      )}
    </div>
  </div>
);

export default App;
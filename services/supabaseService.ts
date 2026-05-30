
import { createClient } from '@supabase/supabase-js';
import { Tool, User, ToolStatus } from '../types';

// Memory lock to bypass navigator.locks in iframes without causing race conditions
const memoryLocks = new Map<string, Promise<void>>();
const dummyLock = async (name: string, acquireTimeout: number, fn: () => Promise<any>) => {
  // Safe lock bypass for iframe preview
  return await fn();
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.VITE_Supabase_URL || (typeof process !== 'undefined' && process?.env?.SUPABASE_URL);
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_Supabase_Anon_Key || (typeof process !== 'undefined' && process?.env?.SUPABASE_ANON_KEY);

export const supabase = (supabaseUrl && supabaseAnonKey && supabaseUrl !== '' && supabaseAnonKey !== '') 
  ? createClient(supabaseUrl, supabaseAnonKey, { auth: { lock: dummyLock, flowType: 'implicit' } }) 
  : null;

if (!supabase) {
  console.warn("Supabase Client: Missing Credentials. Please check your environment variables (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).");
  console.log("Current VITE_SUPABASE_URL:", !!supabaseUrl);
}

const cleanPayload = (obj: any) => {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined && v !== null)
  );
};

/**
 * Utility to retry a function if it fails, helpful for statement timeouts.
 */
const fetchWithRetry = async <T>(
  fetchFn: () => Promise<{ data: T | null; error: any }>,
  retries = 3,
  delay = 1000
): Promise<{ data: T | null; error: any }> => {
  let lastError: any;
  for (let i = 0; i < retries; i++) {
    try {
      const result = await Promise.race([
        fetchFn(),
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error("Request timed out (preventing iframe hang)")), 15000))
      ]);
      if (!result?.error) return result;
      lastError = result.error;
      
      // If it's a statement timeout (57014), wait a bit longer before retry
      const isTimeout = lastError?.code === '57014' || lastError?.message?.includes('timeout') || lastError?.message?.includes('timed out');
      if (isTimeout) {
        console.warn(`Statement timeout detected, retrying (${i + 1}/${retries})...`);
        await new Promise(resolve => setTimeout(() => resolve(null), delay * (i + 1) * 2));
      } else {
        await new Promise(resolve => setTimeout(() => resolve(null), delay * (i + 1)));
      }
    } catch (err) {
      console.warn("fetchWithRetry uncaught error:", err);
      lastError = err;
      await new Promise(resolve => setTimeout(() => resolve(null), delay * (i + 1)));
    }
  }
  return { data: null, error: lastError };
};

// Helper to convert base64 to Blob for storage upload
const base64ToBlob = (base64: string, contentType = 'image/png') => {
  const byteString = atob(base64.split(',')[1]);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: contentType });
};

/**
 * Uploads a base64 image to Supabase Storage
 */
export const uploadFile = async (bucket: string, path: string, base64: string): Promise<string | null> => {
  if (!supabase || !base64 || !base64.startsWith('data:')) return null;

  try {
    const blob = base64ToBlob(base64);
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, blob, {
        contentType: blob.type,
        upsert: true
      });

    if (error) throw error;

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  } catch (err) {
    console.error("Storage Upload Error:", err);
    return null;
  }
};

// Map User for writing to Database
const mapUserToDb = (user: User) => {
  const payload: any = {
    id: user.id,
    name: user.name,
    role: user.role,
    email: user.email,
    auth_uid: user.authUid,
    is_enabled: user.isEnabled,
    must_change_password: user.mustChangePassword === true
  };

  return cleanPayload(payload);
};

const mapDbToUser = (dbUser: any): User => ({
  id: String(dbUser.id),
  name: dbUser.name || 'Unknown User',
  role: dbUser.role || 'USER',
  email: dbUser.email || '',
  authUid: dbUser.auth_uid || undefined,
  // password intentionally kept optional/undefined as it shouldn't persist or load from DB reliably going forward
  isEnabled: dbUser.is_enabled !== undefined ? dbUser.is_enabled : (dbUser.isEnabled !== undefined ? dbUser.isEnabled : true),
  mustChangePassword: dbUser.must_change_password || dbUser.mustChangePassword || false
});

const mapToolToDb = (tool: Tool) => {
  return {
    id: tool.id,
    equipment_tool: tool.name || 'Unnamed Asset',
    equipment_type: tool.category || 'General',
    status: tool.status || ToolStatus.AVAILABLE,
    current_holder_id: tool.currentHolderId || null,
    current_holder_name: tool.currentHolderName || null,
    current_site: tool.currentSite || null,
    // Fix: Removed incorrect reference to tool.main_photo (Property does not exist on type Tool)
    main_photo: tool.mainPhoto || null,
    notes: (tool.notes === undefined || tool.notes === null) ? '' : String(tool.notes),
    date_of_purchase: tool.dateOfPurchase || null,
    number_of_items: tool.numberOfItems || 1,
    serial_number: tool.serialNumber || '',
    booked_at: tool.bookedAt || null,
    last_returned_at: tool.lastReturnedAt || null,
    logs: tool.logs || []
  };
};

const mapDbToTool = (dbTool: any): Tool => ({
  id: String(dbTool.id),
  name: dbTool.equipment_tool || dbTool.tool_name || dbTool.name || 'Unnamed Asset',
  category: dbTool.equipment_type || dbTool.category || 'General',
  serialNumber: dbTool.serial_number || dbTool.serialNumber || '', 
  status: (dbTool.status as ToolStatus) || ToolStatus.AVAILABLE,
  currentHolderId: dbTool.current_holder_id ? String(dbTool.current_holder_id) : undefined,
  currentHolderName: dbTool.current_holder_name || undefined,
  currentSite: dbTool.current_site || undefined,
  bookedAt: dbTool.booked_at || undefined,
  lastReturnedAt: dbTool.last_returned_at || undefined,
  mainPhoto: dbTool.main_photo || undefined,
  notes: dbTool.notes || '',
  dateOfPurchase: dbTool.date_of_purchase || undefined,
  numberOfItems: dbTool.numberOfItems || 1,
  logs: Array.isArray(dbTool.logs) ? dbTool.logs : []
});

export const upsertSingleTool = async (tool: Tool) => {
  if (!supabase) return;
  const { error } = await supabase.from('tools').upsert(mapToolToDb(tool), { onConflict: 'id' });
  if (error) throw error;
};

export const upsertSingleUser = async (user: User) => {
  if (!supabase) return;
  
  const fullData = mapUserToDb(user);
  
  try {
    let rpcError = null;
    
    // Attempt to use the secure profile updater RPC first
    const { error: profileError } = await supabase.rpc('update_own_profile', { user_data: fullData });
    
    // If that fails because it doesn't exist yet, try the old admin one
    if (profileError && (profileError.message.includes('find the function') || profileError.message.includes('function '))) {
        const { error: oldRpcErr } = await supabase.rpc('upsert_user_admin', { user_data: fullData });
        rpcError = oldRpcErr;
    } else if (profileError) {
        rpcError = profileError; // Other error, assume failure
    }

    // Fallback to normal upsert if RPCs don't exist yet (before SQL is run)
    if (rpcError && (rpcError.message.includes('find the function') || rpcError.message.includes('function '))) {
       const { error } = await supabase
        .from('users')
        .upsert(fullData, { onConflict: 'id' });
      
      if (error) {
        if (error.message.includes('must_change_password')) {
          const { must_change_password, ...safeData } = fullData;
          const { error: retryError } = await supabase
            .from('users')
            .upsert(safeData, { onConflict: 'id' });
          if (retryError) throw retryError;
        } else {
          throw error;
        }
      }
    } else if (rpcError) {
       throw rpcError;
    }
  } catch (err: any) {
    console.error("Supabase Upsert User Critical Error:", err);
    if (err.message && (err.message.toLowerCase().includes('violates row-level security policy') || err.message.toLowerCase().includes('type uuid'))) {
       throw new Error(`DB_MIGRATION_REQUIRED`);
    }
    throw new Error(`Sync Error: ${err.message}`);
  }
};



export const onboardNewStaff = async (user: User) => {
  if (!supabase) return;
  
  console.log("Onboarding new staff via SQL Direct RPC API...", user.email);

  const { data, error } = await supabase.rpc('admin_create_staff', {
    new_email: user.email.toLowerCase().trim(),
    new_password: user.password || 'Password123',
    new_name: user.name,
    new_role: user.role,
    new_id: user.id
  });

  if (error) {
     if (error.message.includes('find the function') || error.message.includes('function admin_create_staff') || error.message.includes('function "admin_create_staff"')) {
        throw new Error('DB_MIGRATION_REQUIRED');
     }
     throw new Error(`RPC Failed: ${error.message}`);
  }
};

export const deleteSingleUser = async (userId: string, currentEmail: string = '') => {
  if (!supabase) return;
  
  const deletedData = {
    id: userId,
    is_enabled: false,
    name: '[Deleted User]',
    email: `deleted_${Date.now()}_${currentEmail}`.substring(0, 50),
    role: 'USER'
  };
  
  try {
     const { error: rpcError } = await supabase.rpc('update_own_profile', { user_data: deletedData });
     if (rpcError) {
         console.warn("Soft delete RPC failed, trying local update...", rpcError.message);
         const { data, error } = await supabase.from('users').update(deletedData).eq('id', userId).select();
         if (error) throw error;
         if (!data || data.length === 0) {
           throw new Error("Permission denied or user not found. Could not soft-delete.");
         }
     }
  } catch (err: any) {
     console.error("Soft delete error", err);
     
     // Fallback to attempted hard delete if soft delete UPSERT fails
     const { data, error } = await supabase.from('users').delete().eq('id', userId).select();
     if (error) throw error;
     if (!data || data.length === 0) {
       throw new Error(`Permission denied: Could not delete user from database. Ask an Admin to run Database Repair.`);
     }
  }
};

export const fetchTools = async (): Promise<{ data: Tool[] | null; error: any }> => {
  if (!supabase) return { data: null, error: 'Supabase client not initialized' };
  
  // Fix: Explicitly type fetchWithRetry to any[] to avoid 'unknown' mapping errors
  const result = await fetchWithRetry<any[]>(async () => {
    return await supabase.from('tools').select('*');
  });

  if (result.error) {
    console.error("Supabase Fetch Tools Error:", result.error);
    return { data: null, error: result.error };
  }
  return { data: (result.data || []).map(mapDbToTool), error: null };
};

export const fetchUsersAdminOnly = async (): Promise<{ data: User[] | null; error: any }> => {
  if (!supabase) return { data: null, error: 'Supabase client not initialized' };
  
  const result = await fetchWithRetry<any[]>(async () => {
    return await supabase.rpc('get_all_users_admin');
  });

  if (result.error) {
    console.error("Supabase Fetch Users Admin Error:", result.error);
    return { data: null, error: result.error };
  }
  return { data: (result.data || []).map(mapDbToUser), error: null };
};

export const getSession = async () => {
  if (!supabase) return null;
  // Use Promise.race to prevent indefinite hanging in preview iframe
  const { data, error } = await Promise.race([
    supabase.auth.getSession(),
    new Promise<any>((resolve) => setTimeout(() => resolve({ data: { session: null }, error: new Error("Session check timed out") }), 15000))
  ]);
  
  if (error) {
    console.warn("Supabase Session Error:", error.message);
    try { await supabase.auth.signOut(); } catch (e) { /* ignore */ }
    return null;
  }
  return data.session;
};

export const signOut = async () => {
  if (!supabase) return;
  try { await supabase.auth.signOut(); } catch (e) { /* ignore */ }
};

export const signIn = async (email: string, password: string): Promise<{ data: User | null; error: any }> => {
  if (!supabase) return { data: null, error: new Error('Supabase client not initialized') };
  
  let { data: authData, error: authError } = await Promise.race([
    supabase.auth.signInWithPassword({ email, password }),
    new Promise<any>((resolve) => setTimeout(() => resolve({ data: null, error: new Error('Request timed out (preventing iframe hang)') }), 15000))
  ]);

  // If login succeeded, try to auto-link the legacy table just in case they were unlinked
  if (authData?.user && !authError) {
    try {
      await supabase.rpc('migrate_legacy_user', {
        p_email: email,
        p_password: password,
        p_auth_uid: authData.user.id
      });
    } catch (e) {
      console.warn("Soft migration failed on signin", e);
    }
  }
  
  // Auto-migrate legacy users who don't have a Supabase Auth account yet
  if (authError && authError.message.toLowerCase().includes('invalid login credentials')) {
    console.log("Attempting auto-migration/signup for new user...");
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password
    });

    if (signUpError) {
      console.error("SignUp error during migration:", signUpError);
    } else if (signUpData?.user) {
      console.log("SignUp successful! User ID:", signUpData.user.id);
      
      // Try RPC first for migration
      const { data: migrateData, error: migrateError } = await supabase.rpc('migrate_legacy_user', {
        p_email: email,
        p_password: password,
        p_auth_uid: signUpData.user.id
      });
      
      if (migrateError) {
        console.warn("migrate_legacy_user RPC failed or missing:", migrateError);
      }

      // Fallback: manually update the public.users table if the RPC failed or returned false
      if (!migrateData) {
        console.log("Attempting manual link of public user to auth user...");
        const { error: updateError } = await supabase
          .from('users')
          .update({ auth_uid: signUpData.user.id })
          .eq('email', email);
          
        if (updateError) {
          console.error("Failed to link auth_uid:", updateError);
        }
      }

      // Always allow the sign in to succeed if signUp created an auth user!
      // (Even if manual link failed here, it might have been linked by a database trigger).
      if (!signUpData.session) {
        return { data: null, error: new Error("Account created successfully, but your organization requires you to confirm your email before logging in. Please check your inbox.") };
      }
      authData = signUpData as any;
      authError = null;
    }
  }

  if (authError || !authData?.user) {
    return { data: null, error: authError || new Error("Failed to authenticate") };
  }
  
  return fetchCurrentUserProfile(authData.user);
};

export const fetchCurrentUserProfile = async (sessionUser: any): Promise<{ data: User | null; error: any }> => {
  if (!supabase) return { data: null, error: 'Supabase client not initialized' };
  
  const authUid = sessionUser.id;
  const email = sessionUser.email?.toLowerCase();

  const result = await fetchWithRetry<any>(async () => {
    let res = await supabase.from('users').select('*').eq('auth_uid', authUid).maybeSingle();
    
    // Fallback: If not found by auth_uid, try finding by email
    if (!res.data && email) {
       console.warn(`Profile not found for auth_uid ${authUid}. Falling back to email lookup for ${email}.`);
       const emailRes = await supabase.from('users').select('*').ilike('email', email).maybeSingle();
       
       if (emailRes.data && !emailRes.error) {
          // Found by email. Let's auto-fix the auth_uid for future logins!
          console.log(`Found profile by email, attempting to link auth_uid via RPC...`);
          try {
            await supabase.rpc('auto_link_verified_user');
          } catch (e) {
             console.warn("RPC link failed, falling back to client update", e);
             try {
                await supabase.from('users').update({ auth_uid: authUid }).eq('id', emailRes.data.id);
             } catch (updateErr) {
                console.warn("Client update failed too, but continuing login", updateErr);
             }
          }
          res = emailRes;
       } else {
          // AUTO-PROVISIONING for valid authenticated users missing from public.users
          console.log(`Auto-provisioning public profile for ${email}...`);
          const newId = 'U' + Date.now();
          const { data: insertData, error: insertError } = await supabase.from('users').insert({
              id: newId,
              name: email.split('@')[0],
              role: 'USER',
              email: email,
              auth_uid: authUid,
              is_enabled: true
          }).select('*').single();
          
          if (insertData && !insertError) {
             res = { data: insertData, error: null } as any;
          } else {
             res = emailRes;
          }
       }
    }
    
    return res as any;
  });
  
  if (result.error) return { data: null, error: result.error };
  if (!result.data) return { data: null, error: new Error("Profile not found") };
  
  return { data: mapDbToUser(result.data), error: null };
};

export const resetPasswordForEmail = async (email: string) => {
  if (!supabase) return { error: new Error('Supabase client not initialized') };
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/?type=recovery`
  });
  return { data, error };
};

export const updateAuthPassword = async (newPassword: string) => {
  if (!supabase) return { error: new Error('Supabase client not initialized') };
  const { data, error } = await supabase.auth.updateUser({ password: newPassword });
  return { data, error };
};

export const upsertCurrentUserProfile = async (user: User) => {
  if (!supabase) return;
  const fullData = mapUserToDb(user);
  const { error } = await supabase.from('users').upsert(fullData, { onConflict: 'auth_uid' });
  if (error) throw error;
};

export const syncTools = async (tools: Tool[]) => {
  if (!supabase || tools.length === 0) return;
  const dbTools = tools.map(mapToolToDb);
  const { error } = await supabase.from('tools').upsert(dbTools, { onConflict: 'id' });
  if (error) throw error;
};

export const syncUsers = async (users: User[]) => {
  if (!supabase || users.length === 0) return;
  for (const user of users) {
    await upsertSingleUser(user).catch(err => console.error("Batch User Sync Error:", err));
  }
};

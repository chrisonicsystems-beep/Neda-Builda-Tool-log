
import { createClient } from '@supabase/supabase-js';
import { Tool, User, ToolStatus } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.VITE_Supabase_URL || (typeof process !== 'undefined' && process?.env?.SUPABASE_URL);
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_Supabase_Anon_Key || (typeof process !== 'undefined' && process?.env?.SUPABASE_ANON_KEY);

export const supabase = (supabaseUrl && supabaseAnonKey && supabaseUrl !== '' && supabaseAnonKey !== '') 
  ? createClient(supabaseUrl, supabaseAnonKey) 
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
      const result = await fetchFn();
      if (!result.error) return result;
      lastError = result.error;
      
      // If it's a statement timeout (57014), wait a bit longer before retry
      const isTimeout = lastError?.code === '57014' || lastError?.message?.includes('timeout');
      if (isTimeout) {
        console.warn(`Statement timeout detected, retrying (${i + 1}/${retries})...`);
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1) * 2));
      } else {
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
      }
    } catch (err) {
      lastError = err;
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
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
    is_enabled: user.isEnabled
  };

  if (user.mustChangePassword) {
    payload.must_change_password = true;
  }

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
  } catch (err: any) {
    console.error("Supabase Upsert User Critical Error:", err);
    throw new Error(`Sync Error: ${err.message}`);
  }
};

export const deleteSingleUser = async (userId: string) => {
  if (!supabase) return;
  const { error } = await supabase.from('users').delete().eq('id', userId);
  if (error) throw error;
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
  const { data, error } = await supabase.auth.getSession();
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
  
  let { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  
  // Auto-migrate legacy users who don't have a Supabase Auth account yet
  if (authError && authError.message.toLowerCase().includes('invalid login credentials')) {
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password
    });

    if (signUpData?.user && !signUpError) {
      // We successfully created a new Supabase Auth user. Now link it!
      const { data: migrateData } = await supabase.rpc('migrate_legacy_user', {
        p_email: email,
        p_password: password,
        p_auth_uid: signUpData.user.id
      });

      if (migrateData) {
        if (!signUpData.session) {
          return { data: null, error: new Error("Account migrated successfully, but you must confirm your email before logging in. Please check your inbox.") };
        }
        authData = signUpData as any;
        authError = null;
      }
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
          console.log(`Found profile by email, fixing auth_uid in database to ${authUid}...`);
          await supabase.from('users').update({ auth_uid: authUid }).eq('id', emailRes.data.id);
          res = emailRes;
       } else {
          res = emailRes;
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
  const { data, error } = await supabase.auth.resetPasswordForEmail(email);
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


import { createClient } from '@supabase/supabase-js';
import { Tool, User, ToolStatus } from '../types';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

export const supabase = (supabaseUrl && supabaseAnonKey && supabaseUrl !== '' && supabaseAnonKey !== '') 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

if (!supabase) {
  console.warn("Supabase Client: Missing Credentials.");
}

const cleanPayload = (obj: any) => {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined && v !== null)
  );
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
 * @param bucket Name of the bucket (e.g., 'tool-photos')
 * @param path File path in bucket (e.g., 'tools/T123.png')
 * @param base64 Full data URL or base64 string
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
    password: user.password,
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
  password: dbUser.password || 'password123',
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
  const { data, error } = await supabase.from('tools').select('*');
  if (error) {
    console.error("Supabase Fetch Tools Error:", error);
    return { data: null, error };
  }
  return { data: data.map(mapDbToTool), error: null };
};

export const fetchUsers = async (): Promise<{ data: User[] | null; error: any }> => {
  if (!supabase) return { data: null, error: 'Supabase client not initialized' };
  const { data, error } = await supabase.from('users').select('*');
  if (error) {
    console.error("Supabase Fetch Users Error:", error);
    return { data: null, error };
  }
  return { data: data.map(dbUser => mapDbToUser(dbUser)), error: null };
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

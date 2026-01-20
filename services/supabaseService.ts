
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

// Core columns guaranteed to exist in a standard setup
const mapUserToCoreDb = (user: User) => cleanPayload({
  id: user.id,
  name: user.name,
  role: user.role,
  email: user.email,
  password: user.password
});

// Optional columns that might be missing in custom schemas
const mapUserToMetadataDb = (user: User) => cleanPayload({
  id: user.id,
  is_enabled: user.isEnabled,
  must_change_password: user.mustChangePassword
});

const mapDbToUser = (dbUser: any): User => ({
  id: dbUser.id,
  name: dbUser.name,
  role: dbUser.role,
  email: dbUser.email,
  password: dbUser.password,
  isEnabled: dbUser.is_enabled !== undefined ? dbUser.is_enabled : true,
  mustChangePassword: dbUser.must_change_password || false
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
    last_returned_at: tool.lastReturnedAt || null
  };
};

const mapDbToTool = (dbTool: any): Tool => ({
  id: dbTool.id,
  name: dbTool.equipment_tool || dbTool.tool_name || dbTool.name || 'Unnamed Asset',
  category: dbTool.equipment_type || dbTool.category || 'General',
  serialNumber: dbTool.serial_number || '', 
  status: (dbTool.status as ToolStatus) || ToolStatus.AVAILABLE,
  currentHolderId: dbTool.current_holder_id,
  currentHolderName: dbTool.current_holder_name,
  currentSite: dbTool.current_site,
  bookedAt: dbTool.booked_at,
  lastReturnedAt: dbTool.last_returned_at,
  mainPhoto: dbTool.main_photo,
  notes: dbTool.notes || '',
  dateOfPurchase: dbTool.date_of_purchase,
  numberOfItems: dbTool.number_of_items,
  logs: dbTool.logs || []
});

export const upsertSingleTool = async (tool: Tool) => {
  if (!supabase) return;
  const { error } = await supabase.from('tools').upsert(mapToolToDb(tool), { onConflict: 'id' });
  if (error) throw error;
};

/**
 * Upserts a user using a 'Core-First' strategy.
 * 1. Saves mandatory core data (ID, Name, Email, Role, Password).
 * 2. Attempts to save metadata (isEnabled, mustChangePassword) as a secondary step.
 */
export const upsertSingleUser = async (user: User) => {
  if (!supabase) return;
  
  // Step 1: Save Core Data (Mandatory)
  const { error: coreError } = await supabase
    .from('users')
    .upsert(mapUserToCoreDb(user), { onConflict: 'id' });
  
  if (coreError) {
    console.error("Core User Sync Failed:", coreError.message);
    throw new Error(`Database Error: ${coreError.message}`);
  }

  // Step 2: Try Metadata (Optional - will not throw if columns are missing)
  try {
    const { error: metaError } = await supabase
      .from('users')
      .upsert(mapUserToMetadataDb(user), { onConflict: 'id' });
    
    if (metaError) {
      console.warn("Metadata sync skipped:", metaError.message);
    }
  } catch (err) {
    console.warn("Silent failure updating user metadata:", err);
  }
};

export const deleteSingleUser = async (userId: string) => {
  if (!supabase) return;
  const { error } = await supabase.from('users').delete().eq('id', userId);
  if (error) throw error;
};

export const syncTools = async (tools: Tool[]) => {
  if (!supabase || tools.length === 0) return;
  const dbTools = tools.map(mapToolToDb);
  const { error } = await supabase.from('tools').upsert(dbTools, { onConflict: 'id' });
  if (error) throw error;
};

export const fetchTools = async (): Promise<Tool[] | null> => {
  if (!supabase) return null;
  const { data, error } = await supabase.from('tools').select('*');
  if (error) return null;
  return data.map(mapDbToTool);
};

export const syncUsers = async (users: User[]) => {
  if (!supabase) return;
  // Use core mapping for initial sync to be safe
  const { error } = await supabase.from('users').upsert(users.map(mapUserToCoreDb), { onConflict: 'id' });
  if (error) throw error;
};

export const fetchUsers = async (): Promise<User[] | null> => {
  if (!supabase) return null;
  const { data, error } = await supabase.from('users').select('*');
  if (error) return null;
  return data.map(dbUser => mapDbToUser(dbUser));
};

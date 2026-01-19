
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

const mapUserToDb = (user: User) => cleanPayload({
  id: user.id,
  name: user.name,
  role: user.role,
  email: user.email,
  password: user.password,
  is_enabled: user.isEnabled,
  must_change_password: user.mustChangePassword
});

const mapDbToUser = (dbUser: any): User => ({
  id: dbUser.id,
  name: dbUser.name,
  role: dbUser.role,
  email: dbUser.email,
  password: dbUser.password,
  isEnabled: dbUser.is_enabled,
  mustChangePassword: dbUser.must_change_password
});

/**
 * mapToolToDb: Converts frontend Tool object to Database format.
 * Includes absolute safety defaults for NOT NULL columns.
 */
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

export const upsertSingleUser = async (user: User) => {
  if (!supabase) return;
  const { error } = await supabase.from('users').upsert(mapUserToDb(user), { onConflict: 'id' });
  if (error) throw error;
};

export const syncTools = async (tools: Tool[]) => {
  if (!supabase || tools.length === 0) return;
  const dbTools = tools.map(mapToolToDb);
  const { error } = await supabase.from('tools').upsert(dbTools, { onConflict: 'id' });
  if (error) {
    console.error("Supabase Bulk Sync Error:", error);
    throw error;
  }
};

export const fetchTools = async (): Promise<Tool[] | null> => {
  if (!supabase) return null;
  const { data, error } = await supabase.from('tools').select('*');
  if (error) return null;
  return data.map(mapDbToTool);
};

export const syncUsers = async (users: User[]) => {
  if (!supabase) return;
  const { error } = await supabase.from('users').upsert(users.map(mapUserToDb), { onConflict: 'id' });
  if (error) throw error;
};

export const fetchUsers = async (): Promise<User[] | null> => {
  if (!supabase) return null;
  const { data, error } = await supabase.from('users').select('*');
  if (error) return null;
  return data.map(dbUser => mapDbToUser(dbUser));
};

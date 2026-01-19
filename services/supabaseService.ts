
import { createClient } from '@supabase/supabase-js';
import { Tool, User } from '../types';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

export const supabase = (supabaseUrl && supabaseAnonKey && supabaseUrl !== '' && supabaseAnonKey !== '') 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

if (!supabase) {
  console.warn("Supabase Client: Missing Credentials. Please check Vercel environment variables.");
}

const mapUserToDb = (user: User) => ({
  id: user.id,
  name: user.name,
  role: user.role,
  email: user.email,
  password: user.password,
  is_enabled: user.isEnabled
});

const mapDbToUser = (dbUser: any): User => ({
  id: dbUser.id,
  name: dbUser.name,
  role: dbUser.role,
  email: dbUser.email,
  password: dbUser.password,
  isEnabled: dbUser.is_enabled
});

const mapToolToDb = (tool: Tool) => ({
  id: tool.id,
  // Changed from 'name' to 'tool_name' to resolve schema mismatch error seen in logs
  tool_name: tool.name, 
  serial_number: tool.serialNumber,
  status: tool.status,
  current_holder_id: tool.currentHolderId,
  current_holder_name: tool.currentHolderName,
  current_site: tool.currentSite,
  booked_at: tool.bookedAt,
  last_returned_at: tool.lastReturnedAt,
  main_photo: tool.mainPhoto,
  logs: tool.logs || []
});

const mapDbToTool = (dbTool: any): Tool => ({
  id: dbTool.id,
  // Support both 'tool_name' and fallback 'name' if schema differs
  name: dbTool.tool_name || dbTool.name || 'Unnamed Asset',
  category: dbTool.category || 'General',
  serialNumber: dbTool.serial_number,
  status: dbTool.status as any,
  currentHolderId: dbTool.current_holder_id,
  currentHolderName: dbTool.current_holder_name,
  currentSite: dbTool.current_site,
  bookedAt: dbTool.booked_at,
  lastReturnedAt: dbTool.last_returned_at,
  mainPhoto: dbTool.main_photo,
  logs: dbTool.logs || []
});

export const upsertSingleTool = async (tool: Tool) => {
  if (!supabase) return;
  const { error } = await supabase.from('tools').upsert(mapToolToDb(tool), { onConflict: 'id' });
  if (error) {
    console.error("Supabase Error (upsertSingleTool):", error);
    if (error.code === '23505') throw new Error(`Asset with this ID or Serial already exists.`);
    throw error;
  }
};

export const upsertSingleUser = async (user: User) => {
  if (!supabase) return;
  const { error } = await supabase.from('users').upsert(mapUserToDb(user), { onConflict: 'id' });
  if (error) {
    console.error("Supabase Error (upsertSingleUser):", error);
    if (error.code === '23505') throw new Error(`Personnel with this Email already exists.`);
    throw error;
  }
};

export const syncTools = async (tools: Tool[]) => {
  if (!supabase) return;
  const dbTools = tools.map(mapToolToDb);
  const { error } = await supabase.from('tools').upsert(dbTools, { onConflict: 'id' });
  if (error) {
    console.error("Supabase Sync Error:", error);
    throw error;
  }
};

export const fetchTools = async (): Promise<Tool[] | null> => {
  if (!supabase) return null;
  const { data, error } = await supabase.from('tools').select('*');
  if (error) {
    console.error('Error fetching tools:', error);
    return null;
  }
  return data.map(mapDbToTool);
};

export const syncUsers = async (users: User[]) => {
  if (!supabase) return;
  const dbUsers = users.map(mapUserToDb);
  const { error } = await supabase.from('users').upsert(dbUsers, { onConflict: 'id' });
  if (error) throw error;
};

export const fetchUsers = async (): Promise<User[] | null> => {
  if (!supabase) return null;
  const { data, error } = await supabase.from('users').select('*');
  if (error) {
    console.error('Error fetching users:', error);
    return null;
  }
  return data.map(mapDbToUser);
};

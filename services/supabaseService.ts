
import { createClient } from '@supabase/supabase-js';
import { Tool, User, ToolStatus } from '../types';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

export const supabase = (supabaseUrl && supabaseAnonKey && supabaseUrl !== '' && supabaseAnonKey !== '') 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

if (!supabase) {
  console.warn("Supabase Client: Missing Credentials. Please check environment variables.");
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

const mapToolToDb = (tool: Tool) => {
  // Defensive mapping: Only include columns we are sure exist in the 'tools' table.
  // Based on user feedback, 'serial_number' and 'name' are causing PostgREST schema cache errors.
  return {
    id: tool.id,
    tool_name: tool.name, // Mapping 'name' to 'tool_name' as suggested by previous errors
    status: tool.status,
    current_holder_id: tool.currentHolderId,
    current_holder_name: tool.currentHolderName,
    current_site: tool.currentSite,
    booked_at: tool.bookedAt,
    last_returned_at: tool.lastReturnedAt,
    main_photo: tool.mainPhoto,
    logs: tool.logs || []
    // Note: 'serial_number' and 'category' are omitted as they are not in the schema cache.
  };
};

const mapDbToTool = (dbTool: any): Tool => ({
  id: dbTool.id,
  name: dbTool.tool_name || dbTool.name || 'Unnamed Asset',
  category: dbTool.category || 'General',
  serialNumber: dbTool.serial_number || '', 
  status: (dbTool.status as ToolStatus) || ToolStatus.AVAILABLE,
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
  const payload = mapToolToDb(tool);
  const { error } = await supabase.from('tools').upsert(payload, { onConflict: 'id' });
  if (error) {
    console.error("Supabase Error (upsertSingleTool):", error);
    throw error;
  }
};

export const upsertSingleUser = async (user: User) => {
  if (!supabase) return;
  const { error } = await supabase.from('users').upsert(mapUserToDb(user), { onConflict: 'id' });
  if (error) {
    console.error("Supabase Error (upsertSingleUser):", error);
    throw error;
  }
};

export const syncTools = async (tools: Tool[]) => {
  if (!supabase) return;
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

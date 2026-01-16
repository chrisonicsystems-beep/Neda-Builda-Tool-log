
import { createClient } from '@supabase/supabase-js';
import { Tool, User } from '../types';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

export const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

// Helper to map JS User to DB User (handling case differences)
const mapUserToDb = (user: User) => ({
  id: user.id,
  name: user.name,
  role: user.role,
  email: user.email,
  password: user.password,
  is_enabled: user.isEnabled // Mapping camelCase to snake_case
});

const mapDbToUser = (dbUser: any): User => ({
  id: dbUser.id,
  name: dbUser.name,
  role: dbUser.role,
  email: dbUser.email,
  password: dbUser.password,
  isEnabled: dbUser.is_enabled // Mapping snake_case back to camelCase
});

// Helper to map JS Tool to DB Tool
const mapToolToDb = (tool: Tool) => ({
  id: tool.id,
  name: tool.name,
  category: tool.category,
  serial_number: tool.serialNumber,
  status: tool.status,
  current_holder_id: tool.currentHolderId,
  current_holder_name: tool.currentHolderName,
  current_site: tool.currentSite,
  booked_at: tool.bookedAt,
  last_returned_at: tool.lastReturnedAt,
  main_photo: tool.mainPhoto,
  logs: tool.logs
});

const mapDbToTool = (dbTool: any): Tool => ({
  id: dbTool.id,
  name: dbTool.name,
  category: dbTool.category,
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

export const syncTools = async (tools: Tool[]) => {
  if (!supabase) return;
  const dbTools = tools.map(mapToolToDb);
  const { error } = await supabase.from('tools').upsert(dbTools);
  if (error) {
    console.error('Error syncing tools:', error);
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
  const { error } = await supabase.from('users').upsert(dbUsers);
  if (error) {
    console.error('Error syncing users:', error);
    throw error;
  }
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

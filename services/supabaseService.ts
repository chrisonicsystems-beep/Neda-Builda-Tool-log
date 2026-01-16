
import { createClient } from '@supabase/supabase-js';
import { Tool, User } from '../types';

// Broaden detection for standard and Vite-specific environment variables
const getEnv = (key: string): string => {
  // Check process.env (Vercel/Node)
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key] as string;
  }
  // Check Vite's import.meta.env
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[`VITE_${key}`]) {
    // @ts-ignore
    return import.meta.env[`VITE_${key}`] as string;
  }
  // Check window/global process (Vite define fallback)
  const globalProcess = (window as any).process;
  if (globalProcess?.env?.[key]) {
    return globalProcess.env[key];
  }
  if (globalProcess?.env?.[`VITE_${key}`]) {
    return globalProcess.env[`VITE_${key}`];
  }
  
  return '';
};

const supabaseUrl = getEnv('SUPABASE_URL');
const supabaseAnonKey = getEnv('SUPABASE_ANON_KEY');

export const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

if (!supabase) {
  console.warn("Supabase client failed to initialize. Ensure SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_ equivalents) are set in your environment.");
}

// Helper to map JS User to DB User (handling camelCase -> snake_case)
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
  if (!supabase) throw new Error("Supabase client not initialized");
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
  if (!supabase) throw new Error("Supabase client not initialized");
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

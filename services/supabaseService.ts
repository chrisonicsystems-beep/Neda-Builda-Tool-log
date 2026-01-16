
import { createClient } from '@supabase/supabase-js';
import { Tool, User } from '../types';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

export const supabase = supabaseUrl ? createClient(supabaseUrl, supabaseAnonKey) : null;

export const syncTools = async (tools: Tool[]) => {
  if (!supabase) return;
  const { error } = await supabase.from('tools').upsert(tools);
  if (error) console.error('Error syncing tools:', error);
};

export const fetchTools = async (): Promise<Tool[] | null> => {
  if (!supabase) return null;
  const { data, error } = await supabase.from('tools').select('*');
  if (error) {
    console.error('Error fetching tools:', error);
    return null;
  }
  return data;
};

export const syncUsers = async (users: User[]) => {
  if (!supabase) return;
  const { error } = await supabase.from('users').upsert(users);
  if (error) console.error('Error syncing users:', error);
};

export const fetchUsers = async (): Promise<User[] | null> => {
  if (!supabase) return null;
  const { data, error } = await supabase.from('users').select('*');
  if (error) {
    console.error('Error fetching users:', error);
    return null;
  }
  return data;
};


export enum ToolStatus {
  AVAILABLE = 'AVAILABLE',
  BOOKED_OUT = 'BOOKED_OUT',
  UNDER_REPAIR = 'UNDER_REPAIR',
  DEFECTIVE = 'DEFECTIVE'
}

export enum UserRole {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  USER = 'USER'
}

export interface User {
  id: string;
  name: string;
  role: UserRole;
  email: string;
  password?: string; // For mock login demonstration
  isEnabled: boolean;
}

export interface ToolLog {
  id: string;
  userId: string;
  userName: string;
  action: 'BOOK_OUT' | 'RETURN' | 'CREATE';
  timestamp: number;
  site?: string;
  comment?: string;
  photo?: string; // Captures condition at time of action
}

export interface Tool {
  id: string;
  name: string;
  category?: string;
  serialNumber?: string; // Made optional as requested and per DB schema
  status: ToolStatus;
  currentHolderId?: string;
  currentHolderName?: string;
  currentSite?: string;
  bookedAt?: number;
  lastReturnedAt?: number;
  mainPhoto?: string; // Original photo of the asset
  notes?: string;
  logs: ToolLog[];
}

export type View = 'INVENTORY' | 'MY_TOOLS' | 'ADMIN_DASHBOARD' | 'AI_ASSISTANT';

export const PERMISSIONS = {
  [UserRole.USER]: ['book', 'return', 'view_inventory', 'ai_assistant'],
  [UserRole.MANAGER]: ['book', 'return', 'view_inventory', 'ai_assistant', 'view_reports', 'view_all_bookings', 'manage_inventory', 'manage_users'],
  [UserRole.ADMIN]: ['book', 'return', 'view_inventory', 'ai_assistant', 'view_reports', 'view_all_bookings', 'manage_inventory', 'manage_users']
};

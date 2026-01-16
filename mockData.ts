
import { Tool, ToolStatus, User, UserRole } from './types';

export const INITIAL_USERS: User[] = [
  { 
    id: 'U1', 
    name: 'Karin Admin', 
    role: UserRole.ADMIN, 
    email: 'karin@nedabuilda.com', 
    password: 'password123',
    isEnabled: true 
  },
  { 
    id: 'U2', 
    name: 'Gavin Builder', 
    role: UserRole.USER, 
    email: 'gavin@nedabuilda.com', 
    password: 'password123',
    isEnabled: true 
  },
  { 
    id: 'U3', 
    name: 'Bob Manager', 
    role: UserRole.MANAGER, 
    email: 'bob@nedabuilda.com', 
    password: 'password123',
    isEnabled: true 
  },
  { 
    id: 'U4', 
    name: 'Sarah Site', 
    role: UserRole.USER, 
    email: 'sarah@nedabuilda.com', 
    password: 'password123',
    isEnabled: true 
  },
];

export const INITIAL_TOOLS: Tool[] = [
  {
    id: 'T1',
    name: 'DeWalt Hammer Drill',
    category: 'Power Tools',
    serialNumber: 'DW-99122',
    status: ToolStatus.AVAILABLE,
    logs: []
  },
  {
    id: 'T2',
    name: 'Makita Mitre Saw',
    category: 'Power Tools',
    serialNumber: 'MK-55231',
    status: ToolStatus.BOOKED_OUT,
    currentHolderId: 'U2',
    currentHolderName: 'Gavin Builder',
    currentSite: 'Main St Apartments',
    bookedAt: Date.now() - 86400000 * 2,
    logs: []
  },
  {
    id: 'T3',
    name: 'Fiber Optic Splicer',
    category: 'Precision',
    serialNumber: 'FS-778',
    status: ToolStatus.AVAILABLE,
    logs: []
  },
  {
    id: 'T4',
    name: 'Honda Generator 2kVA',
    category: 'Power',
    serialNumber: 'HG-2000',
    status: ToolStatus.UNDER_REPAIR,
    logs: []
  }
];

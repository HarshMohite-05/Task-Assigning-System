import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';

export interface EmployeeRecord {
  id: string;
  employeeCode: string;
  fullName: string;
  designation: string;
  role: 'DIRECTOR' | 'EMPLOYEE';
  email: string;
  phoneNumber?: string;
  password?: string;
}

export interface TaskRecord {
  id: string;
  title: string;
  description?: string;
  status: 'TO_DO' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate?: string | null;
  assignedToId: string;
  createdById?: string;
  createdAt: string;
  assignedTo: EmployeeRecord;
}

const globalData = globalThis as unknown as {
  inMemoryTasks?: TaskRecord[];
  inMemoryEmployees?: EmployeeRecord[];
};

function getLocalTasksFilePath(): string {
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    return path.join('/tmp', 'tasks_local.json');
  }
  return path.join(process.cwd(), 'prisma', 'tasks_local.json');
}

function getLocalCustomEmployeesFilePath(): string {
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    return path.join('/tmp', 'employees_custom.json');
  }
  return path.join(process.cwd(), 'prisma', 'employees_custom.json');
}

function loadCustomLocalEmployees(): EmployeeRecord[] {
  if (globalData.inMemoryEmployees && globalData.inMemoryEmployees.length > 0) {
    return globalData.inMemoryEmployees;
  }
  const filePath = getLocalCustomEmployeesFilePath();
  if (fs.existsSync(filePath)) {
    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(data);
      globalData.inMemoryEmployees = parsed;
      return parsed;
    } catch {
      return [];
    }
  }
  return [];
}

function saveCustomLocalEmployees(employees: EmployeeRecord[]) {
  globalData.inMemoryEmployees = employees;
  try {
    const filePath = getLocalCustomEmployeesFilePath();
    fs.writeFileSync(filePath, JSON.stringify(employees, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Could not write custom employees to disk (stored in memory):', e);
  }
}

// Ingest employees directly from Excel and local custom store
export function getLocalEmployees(): EmployeeRecord[] {
  const excelEmployees: EmployeeRecord[] = [];
  const excelPath = path.join(process.cwd(), 'prisma', 'Employee Data.xlsx');

  if (fs.existsSync(excelPath)) {
    try {
      const workbook = XLSX.readFile(excelPath);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawData = XLSX.utils.sheet_to_json<any>(sheet);

      rawData.forEach((row) => {
        const cleanRow: Record<string, any> = {};
        for (const [k, v] of Object.entries(row)) {
          cleanRow[String(k).trim()] = v;
        }

        const empCode = String(cleanRow['Employee ID'] || '').trim().toUpperCase();
        const fullName = String(cleanRow['Employee Name'] || cleanRow['Employee Name '] || '').trim();
        const roleStr = String(cleanRow['Role'] || '').trim().toLowerCase();
        const isDirector = roleStr.includes('director') || empCode.startsWith('D');
        const rawPassword = String(cleanRow['Password'] || '').trim();

        if (empCode && fullName) {
          excelEmployees.push({
            id: empCode,
            employeeCode: empCode,
            fullName: fullName || empCode,
            designation: String(cleanRow['Role'] || 'Staff').trim(),
            role: isDirector ? 'DIRECTOR' : 'EMPLOYEE',
            email: String(cleanRow['Email ID'] || '').trim().toLowerCase(),
            phoneNumber: String(cleanRow['Contact Number'] || '').trim(),
            password: rawPassword,
          });
        }
      });
    } catch (e) {
      console.warn('Could not read Employee Data.xlsx, using defaults:', e);
    }
  }

  const customEmployees = loadCustomLocalEmployees();
  // Merge, prioritizing custom modifications
  const empMap = new Map<string, EmployeeRecord>();
  excelEmployees.forEach((e) => empMap.set(e.employeeCode, e));
  customEmployees.forEach((e) => {
    if ((e as any).isDeleted) {
      empMap.delete(e.employeeCode);
    } else {
      empMap.set(e.employeeCode, e);
    }
  });

  return Array.from(empMap.values());
}

// Initial baseline tasks (clean empty slate for production)
function getBaselineTasks(): TaskRecord[] {
  return [];
}

export function loadLocalTasks(): TaskRecord[] {
  if (globalData.inMemoryTasks && globalData.inMemoryTasks.length > 0) {
    return globalData.inMemoryTasks;
  }

  const filePath = getLocalTasksFilePath();
  if (fs.existsSync(filePath)) {
    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        globalData.inMemoryTasks = parsed;
        return parsed;
      }
    } catch (e) {
      console.warn('Error reading local tasks file:', e);
    }
  }

  const fallbackPath = path.join(process.cwd(), 'prisma', 'tasks_local.json');
  if (filePath !== fallbackPath && fs.existsSync(fallbackPath)) {
    try {
      const data = fs.readFileSync(fallbackPath, 'utf-8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        globalData.inMemoryTasks = parsed;
        return parsed;
      }
    } catch {}
  }

  const baseline = getBaselineTasks();
  globalData.inMemoryTasks = baseline;
  saveLocalTasks(baseline);
  return baseline;
}

export function saveLocalTasks(tasks: TaskRecord[]) {
  globalData.inMemoryTasks = tasks;
  try {
    const filePath = getLocalTasksFilePath();
    fs.writeFileSync(filePath, JSON.stringify(tasks, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Could not write tasks to disk (preserved in memory):', e);
  }
}

export function isDatabaseConfigured(): boolean {
  return Boolean(
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL
  );
}

let hasAttemptedSeed = false;

async function ensureDatabaseSeeded() {
  if (hasAttemptedSeed) return;
  hasAttemptedSeed = true;

  if (process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL) {
    try {
      const count = await prisma.user.count();
      if (count === 0) {
        console.log('[Database Setup] Auto-provisioning initial team accounts in database...');
        const initialStaff = getLocalEmployees();
        for (const staff of initialStaff) {
          const passwordHash = await bcrypt.hash(staff.password || 'Nirmaan@2026', 10);
          const nameTokens = staff.fullName.toLowerCase().split(/\s+/);
          const username = nameTokens.length > 1 ? `${nameTokens[0]}.${nameTokens[nameTokens.length - 1]}` : nameTokens[0];
          await prisma.user.upsert({
            where: { employeeCode: staff.employeeCode },
            update: {},
            create: {
              employeeCode: staff.employeeCode,
              username,
              email: staff.email,
              fullName: staff.fullName,
              designation: staff.designation,
              role: staff.role as any,
              passwordHash,
              phoneNumber: staff.phoneNumber || null,
              isActive: true,
            },
          }).catch(() => null);
        }
        console.log('[Database Setup] Successfully provisioned team members in database.');
      }
    } catch {
      // Table might not be pushed yet or connection pending
    }
  }
}

/**
 * Universal Data Layer: Uses Prisma if database is connected,
 * otherwise falls back to the embedded local store with zero errors.
 */
export async function getEmployees(): Promise<EmployeeRecord[]> {
  await ensureDatabaseSeeded();

  if (process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL) {
    try {
      const dbEmployees = await prisma.user.findMany({
        where: { isActive: true },
        select: {
          id: true,
          employeeCode: true,
          fullName: true,
          designation: true,
          role: true,
          email: true,
          phoneNumber: true,
        },
        orderBy: { employeeCode: 'asc' },
      });
      if (dbEmployees.length > 0) {
        return dbEmployees.map((e) => ({
          id: e.id,
          employeeCode: e.employeeCode,
          fullName: e.fullName,
          designation: e.designation || 'Staff',
          role: e.role as any,
          email: e.email,
          phoneNumber: e.phoneNumber || undefined,
        }));
      }
    } catch (err) {
      // Fallback
    }
  }
  return getLocalEmployees();
}

/**
 * Add a new Employee or Director to the organization
 */
export async function createEmployee(data: {
  employeeCode: string;
  fullName: string;
  designation: string;
  role: 'DIRECTOR' | 'EMPLOYEE';
  email: string;
  password?: string;
  phoneNumber?: string;
}): Promise<EmployeeRecord> {
  const cleanCode = data.employeeCode.trim().toUpperCase();
  const cleanEmail = data.email.trim().toLowerCase();
  const cleanPass = data.password?.trim() || 'Nirmaan@2026';

  if (process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL) {
    try {
      const passwordHash = await bcrypt.hash(cleanPass, 10);
      const username = `${cleanCode.toLowerCase()}.${Date.now().toString().slice(-4)}`;

      const createdUser = await prisma.user.create({
        data: {
          employeeCode: cleanCode,
          username,
          email: cleanEmail,
          fullName: data.fullName.trim(),
          designation: data.designation.trim() || 'Staff',
          role: data.role,
          passwordHash,
          phoneNumber: data.phoneNumber ? data.phoneNumber.trim() : null,
          isActive: true,
        },
      });

      return {
        id: createdUser.id,
        employeeCode: createdUser.employeeCode,
        fullName: createdUser.fullName,
        designation: createdUser.designation || 'Staff',
        role: createdUser.role as any,
        email: createdUser.email,
        phoneNumber: createdUser.phoneNumber || undefined,
      };
    } catch (e: any) {
      console.warn('Prisma createEmployee fallback:', e);
      if (e?.code === 'P2002') {
        throw new Error(`An account with Employee ID "${cleanCode}" or Email "${cleanEmail}" already exists.`);
      }
    }
  }

  // Local storage execution
  const customList = loadCustomLocalEmployees();
  const existing = customList.find(
    (e) => e.employeeCode === cleanCode || e.email.toLowerCase() === cleanEmail
  );
  if (existing && !(existing as any).isDeleted) {
    throw new Error(`Employee with ID ${cleanCode} or email ${cleanEmail} already exists.`);
  }

  const newEmp: EmployeeRecord = {
    id: cleanCode,
    employeeCode: cleanCode,
    fullName: data.fullName.trim(),
    designation: data.designation.trim() || 'Staff',
    role: data.role,
    email: cleanEmail,
    phoneNumber: data.phoneNumber ? data.phoneNumber.trim() : undefined,
    password: cleanPass,
  };

  const updatedList = customList.filter((e) => e.employeeCode !== cleanCode);
  updatedList.push(newEmp);
  saveCustomLocalEmployees(updatedList);

  return newEmp;
}

/**
 * Remove/Deactivate an Employee from the organization
 */
export async function deleteEmployee(identifier: string): Promise<boolean> {
  const cleanId = identifier.trim();

  if (process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL) {
    try {
      const user = await prisma.user.findFirst({
        where: {
          OR: [{ id: cleanId }, { employeeCode: cleanId.toUpperCase() }],
        },
      });

      if (user) {
        // Cascade delete tasks assigned to them to keep board clean
        await prisma.task.deleteMany({
          where: { assignedToId: user.id },
        });

        // Deactivate the user account
        await prisma.user.update({
          where: { id: user.id },
          data: { isActive: false },
        });

        // Delete device push subscriptions
        await prisma.pushSubscription.deleteMany({
          where: { userId: user.id },
        });

        return true;
      }
    } catch (e) {
      console.warn('Prisma deleteEmployee fallback:', e);
    }
  }

  // Local store execution
  const customList = loadCustomLocalEmployees();
  const updatedList = customList.filter(
    (e) => e.id !== cleanId && e.employeeCode !== cleanId.toUpperCase()
  );
  // Mark tombstone for excel-based employees
  updatedList.push({
    id: cleanId,
    employeeCode: cleanId.toUpperCase(),
    fullName: '',
    designation: '',
    role: 'EMPLOYEE',
    email: '',
    isDeleted: true,
  } as any);
  saveCustomLocalEmployees(updatedList);

  // Also remove their local tasks
  const tasks = loadLocalTasks();
  const remaining = tasks.filter(
    (t) => t.assignedToId !== cleanId && t.assignedTo?.employeeCode !== cleanId.toUpperCase()
  );
  saveLocalTasks(remaining);

  return true;
}

// 3-Month retention purge is CANCELLED per admin instruction. Tasks are retained permanently.
export async function autoPurgeExpiredTasks(): Promise<number> {
  return 0;
}

export async function getTasks(employeeId?: string): Promise<TaskRecord[]> {
  if (isDatabaseConfigured()) {
    try {
      await ensureDatabaseSeeded();
      const whereClause: any = {};
      if (employeeId) {
        whereClause.OR = [
          { assignedToId: employeeId },
          { assignedTo: { employeeCode: employeeId.toUpperCase() } },
        ];
      }

      const dbTasks = await prisma.task.findMany({
        where: whereClause,
        include: {
          assignedTo: {
            select: { id: true, fullName: true, employeeCode: true, designation: true, role: true, email: true },
          },
        },
        orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
      });

      // Always return database tasks directly (even if empty list)
      return dbTasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description || undefined,
        status: t.status as any,
        priority: t.priority as any,
        dueDate: t.dueDate ? t.dueDate.toISOString() : null,
        assignedToId: t.assignedToId,
        createdById: t.createdById,
        createdAt: t.createdAt.toISOString(),
        assignedTo: {
          id: t.assignedTo.id,
          employeeCode: t.assignedTo.employeeCode,
          fullName: t.assignedTo.fullName,
          designation: t.assignedTo.designation || 'Staff',
          role: t.assignedTo.role as any,
          email: t.assignedTo.email,
        },
      }));
    } catch (err) {
      console.error('[Database Error] Failed to retrieve tasks from PostgreSQL:', err);
    }
  }

  const tasks = loadLocalTasks();
  if (employeeId) {
    const cleanId = employeeId.trim().toUpperCase();
    return tasks.filter(
      (t) =>
        (t.assignedToId && t.assignedToId.toUpperCase() === cleanId) ||
        (t.assignedTo?.employeeCode && t.assignedTo.employeeCode.toUpperCase() === cleanId) ||
        (t.assignedTo?.id && t.assignedTo.id.toUpperCase() === cleanId)
    );
  }
  return tasks;
}

export async function createTask(data: {
  title: string;
  description?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate?: string | null;
  assignedToId: string;
  createdById?: string;
}): Promise<TaskRecord> {
  const employees = await getEmployees();
  const assignee =
    employees.find((e) => e.id === data.assignedToId || e.employeeCode === data.assignedToId) ||
    employees[0];

  if (isDatabaseConfigured()) {
    try {
      await ensureDatabaseSeeded();

      // 1. Resolve Assignee to a valid PostgreSQL cuid
      let dbAssignee = await prisma.user.findFirst({
        where: {
          OR: [
            { id: data.assignedToId },
            { employeeCode: data.assignedToId.toUpperCase() },
            { email: data.assignedToId.toLowerCase() },
          ],
        },
      });

      // If assignee is not in DB yet (e.g. from initial spreadsheet), provision them
      if (!dbAssignee && assignee) {
        const passwordHash = await bcrypt.hash(assignee.password || 'Nirmaan@2026', 10);
        const nameTokens = assignee.fullName.toLowerCase().split(/\s+/);
        const username = nameTokens.length > 1 ? `${nameTokens[0]}.${nameTokens[nameTokens.length - 1]}` : nameTokens[0];
        dbAssignee = await prisma.user.upsert({
          where: { employeeCode: assignee.employeeCode },
          update: {},
          create: {
            employeeCode: assignee.employeeCode,
            username: `${username}.${Date.now().toString().slice(-4)}`,
            email: assignee.email,
            fullName: assignee.fullName,
            designation: assignee.designation,
            role: assignee.role as any,
            passwordHash,
            phoneNumber: assignee.phoneNumber || null,
            isActive: true,
          },
        });
      }

      if (!dbAssignee) {
        dbAssignee = await prisma.user.findFirst({ where: { isActive: true } });
      }

      if (!dbAssignee) {
        throw new Error('No active employee found in database to assign task to.');
      }

      // 2. Resolve Creator to a valid PostgreSQL cuid
      let dbCreator = null;
      if (data.createdById) {
        dbCreator = await prisma.user.findFirst({
          where: {
            OR: [
              { id: data.createdById },
              { employeeCode: data.createdById.toUpperCase() },
              { email: data.createdById.toLowerCase() },
            ],
          },
        });
      }

      if (!dbCreator) {
        // Fallback to active director
        dbCreator = await prisma.user.findFirst({
          where: { role: 'DIRECTOR', isActive: true },
        });
      }

      if (!dbCreator) {
        dbCreator = dbAssignee;
      }

      let parsedDueDate: Date | null = null;
      if (data.dueDate && typeof data.dueDate === 'string' && data.dueDate.trim() !== '') {
        const d = new Date(data.dueDate);
        if (!isNaN(d.getTime())) {
          parsedDueDate = d;
        }
      }

      const dbTask = await prisma.task.create({
        data: {
          title: data.title,
          description: data.description,
          priority: data.priority as any,
          status: 'TO_DO',
          dueDate: parsedDueDate,
          assignedToId: dbAssignee.id,
          createdById: dbCreator.id,
        },
        include: {
          assignedTo: {
            select: { id: true, fullName: true, employeeCode: true, designation: true, role: true, email: true },
          },
        },
      });

      return {
        id: dbTask.id,
        title: dbTask.title,
        description: dbTask.description || undefined,
        status: dbTask.status as any,
        priority: dbTask.priority as any,
        dueDate: dbTask.dueDate ? dbTask.dueDate.toISOString() : null,
        assignedToId: dbTask.assignedToId,
        createdById: dbTask.createdById,
        createdAt: dbTask.createdAt.toISOString(),
        assignedTo: {
          id: dbTask.assignedTo.id,
          employeeCode: dbTask.assignedTo.employeeCode,
          fullName: dbTask.assignedTo.fullName,
          designation: dbTask.assignedTo.designation || 'Staff',
          role: dbTask.assignedTo.role as any,
          email: dbTask.assignedTo.email,
        },
      };
    } catch (err) {
      console.warn('[Database Task Creation Notice] Prisma write unavailable, saving to persistent store:', err);
      // Fall through to resilient persistent store so task is NEVER dropped!
    }
  }

  // Resilient persistent store execution
  let localDueDate: string | null = null;
  if (data.dueDate && typeof data.dueDate === 'string' && data.dueDate.trim() !== '') {
    const d = new Date(data.dueDate);
    if (!isNaN(d.getTime())) {
      localDueDate = d.toISOString();
    }
  }

  const tasks = loadLocalTasks();
  const newTask: TaskRecord = {
    id: `tsk_${Date.now()}`,
    title: data.title,
    description: data.description,
    status: 'TO_DO',
    priority: data.priority,
    dueDate: localDueDate,
    assignedToId: assignee.id,
    createdById: data.createdById || 'D001',
    createdAt: new Date().toISOString(),
    assignedTo: assignee,
  };

  tasks.unshift(newTask);
  saveLocalTasks(tasks);
  return newTask;
}

export async function updateTaskStatus(taskId: string, status: string): Promise<TaskRecord | null> {
  if (isDatabaseConfigured()) {
    try {
      const dbTask = await prisma.task.update({
        where: { id: taskId },
        data: {
          status: status as any,
          completedAt: status === 'COMPLETED' ? new Date() : null,
        },
        include: {
          assignedTo: {
            select: { id: true, fullName: true, employeeCode: true, designation: true, role: true, email: true },
          },
        },
      });

      return {
        id: dbTask.id,
        title: dbTask.title,
        description: dbTask.description || undefined,
        status: dbTask.status as any,
        priority: dbTask.priority as any,
        dueDate: dbTask.dueDate ? dbTask.dueDate.toISOString() : null,
        assignedToId: dbTask.assignedToId,
        createdById: dbTask.createdById,
        createdAt: dbTask.createdAt.toISOString(),
        assignedTo: {
          id: dbTask.assignedTo.id,
          employeeCode: dbTask.assignedTo.employeeCode,
          fullName: dbTask.assignedTo.fullName,
          designation: dbTask.assignedTo.designation || 'Staff',
          role: dbTask.assignedTo.role as any,
          email: dbTask.assignedTo.email,
        },
      };
    } catch (err) {
      console.warn('Prisma updateTaskStatus fallback:', err);
    }
  }

  const tasks = loadLocalTasks();
  const task = tasks.find((t) => t.id === taskId);
  if (task) {
    task.status = status as any;
    saveLocalTasks(tasks);
    return task;
  }
  return null;
}

export async function authenticateUser(identifier: string, rawPassword: string): Promise<EmployeeRecord | null> {
  const cleanId = identifier.trim().toLowerCase();
  const cleanPass = rawPassword.trim();
  if (!cleanId || !cleanPass) return null;

  await ensureDatabaseSeeded();

  // 1. If Postgres database is configured, authenticate securely against password_hash
  if (process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL) {
    try {
      const dbUser = await prisma.user.findFirst({
        where: {
          isActive: true,
          OR: [
            { employeeCode: { equals: cleanId, mode: 'insensitive' } },
            { email: { equals: cleanId, mode: 'insensitive' } },
            { username: { equals: cleanId, mode: 'insensitive' } },
          ],
        },
      });

      if (dbUser) {
        let isMatch = false;
        try {
          isMatch = await bcrypt.compare(cleanPass, dbUser.passwordHash);
        } catch {
          isMatch = false;
        }

        if (!isMatch && dbUser.passwordHash === cleanPass) {
          isMatch = true;
        }

        if (isMatch) {
          return {
            id: dbUser.id,
            employeeCode: dbUser.employeeCode,
            fullName: dbUser.fullName,
            designation: dbUser.designation || 'Staff',
            role: dbUser.role as any,
            email: dbUser.email,
          };
        }
      }
    } catch (e) {
      console.warn('Prisma auth lookup fallback:', e);
    }
  }

  // 2. Fallback against verified dataset
  const employees = await getEmployees();
  const user = employees.find(
    (e) =>
      e.employeeCode.toLowerCase() === cleanId ||
      e.email.toLowerCase() === cleanId ||
      e.fullName.toLowerCase() === cleanId
  );

  if (!user) return null;

  // Verify against user password from dataset
  if (user.password && user.password === cleanPass) {
    return user;
  }

  return null;
}


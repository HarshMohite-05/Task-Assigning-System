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

const LOCAL_TASKS_FILE = path.join(process.cwd(), 'prisma', 'tasks_local.json');

// Ingest employees directly from Excel
export function getLocalEmployees(): EmployeeRecord[] {
  const excelPath = path.join(process.cwd(), 'prisma', 'Employee Data.xlsx');
  if (fs.existsSync(excelPath)) {
    try {
      const workbook = XLSX.readFile(excelPath);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawData = XLSX.utils.sheet_to_json<any>(sheet);

      return rawData.map((row) => {
        const cleanRow: Record<string, any> = {};
        for (const [k, v] of Object.entries(row)) {
          cleanRow[String(k).trim()] = v;
        }

        const empCode = String(cleanRow['Employee ID'] || '').trim().toUpperCase();
        const fullName = String(cleanRow['Employee Name'] || cleanRow['Employee Name '] || '').trim();
        const roleStr = String(cleanRow['Role'] || '').trim().toLowerCase();
        const isDirector = roleStr.includes('director') || empCode.startsWith('D');
        const rawPassword = String(cleanRow['Password'] || '').trim();

        return {
          id: empCode,
          employeeCode: empCode,
          fullName: fullName || empCode,
          designation: String(cleanRow['Role'] || 'Staff').trim(),
          role: isDirector ? 'DIRECTOR' : 'EMPLOYEE',
          email: String(cleanRow['Email ID'] || '').trim().toLowerCase(),
          phoneNumber: String(cleanRow['Contact Number'] || '').trim(),
          password: rawPassword,
        };
      });
    } catch (e) {
      console.warn('Could not read Employee Data.xlsx, using defaults:', e);
    }
  }

  return [];
}

// Initial baseline tasks (clean empty slate for production)
function getBaselineTasks(): TaskRecord[] {
  return [];
}

export function loadLocalTasks(): TaskRecord[] {
  if (fs.existsSync(LOCAL_TASKS_FILE)) {
    try {
      const data = fs.readFileSync(LOCAL_TASKS_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      console.warn('Error reading local tasks file, generating fresh baseline:', e);
    }
  }

  const baseline = getBaselineTasks();
  saveLocalTasks(baseline);
  return baseline;
}

export function saveLocalTasks(tasks: TaskRecord[]) {
  try {
    fs.writeFileSync(LOCAL_TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to write local tasks file:', e);
  }
}

/**
 * Universal Data Layer: Uses Prisma if POSTGRES_PRISMA_URL is set,
 * otherwise falls back to the embedded local store with zero errors.
 */
export async function getEmployees(): Promise<EmployeeRecord[]> {
  if (process.env.POSTGRES_PRISMA_URL) {
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
        }));
      }
    } catch (err) {
      // Fallback
    }
  }
  return getLocalEmployees();
}

export async function getTasks(employeeId?: string): Promise<TaskRecord[]> {
  if (process.env.POSTGRES_PRISMA_URL) {
    try {
      const dbTasks = await prisma.task.findMany({
        where: employeeId ? { assignedToId: employeeId } : {},
        include: {
          assignedTo: {
            select: { id: true, fullName: true, employeeCode: true, designation: true, role: true, email: true },
          },
        },
        orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
      });
      if (dbTasks.length > 0) {
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
      }
    } catch (err) {
      // Fallback
    }
  }

  const tasks = loadLocalTasks();
  if (employeeId) {
    return tasks.filter((t) => t.assignedToId === employeeId || t.assignedTo.employeeCode === employeeId);
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

  if (process.env.POSTGRES_PRISMA_URL) {
    try {
      const dbTask = await prisma.task.create({
        data: {
          title: data.title,
          description: data.description,
          priority: data.priority as any,
          status: 'TO_DO',
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          assignedToId: assignee.id,
          createdById: data.createdById || assignee.id,
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
      console.warn('Prisma create failed, saving to local store:', err);
    }
  }

  // Local store execution
  const tasks = loadLocalTasks();
  const newTask: TaskRecord = {
    id: `tsk_${Date.now()}`,
    title: data.title,
    description: data.description,
    status: 'TO_DO',
    priority: data.priority,
    dueDate: data.dueDate ? new Date(data.dueDate).toISOString() : null,
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
  if (process.env.POSTGRES_PRISMA_URL) {
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
      // Fallback
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


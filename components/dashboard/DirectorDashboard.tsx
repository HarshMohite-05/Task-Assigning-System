'use client';

import React, { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import {
  Plus,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Users,
  Search,
  Send,
  Sparkles,
  Kanban,
  List,
  Calendar,
  X,
  Play,
  AlertCircle,
  TrendingUp,
  UserPlus,
  Trash2,
  Shield,
  RotateCcw,
  RefreshCw,
  Bell,
  Paperclip,
  Mic,
  Repeat,
  MessageSquare,
  UserCheck,
  Sun,
} from 'lucide-react';
import { formatDate, formatRelativeDueDate, formatReminderInterval, formatFileSize } from '@/lib/format-utils';
import VoiceRecorder from '@/components/dashboard/VoiceRecorder';
import TaskAttachments, { type TaskAttachment } from '@/components/tasks/TaskAttachments';
import TaskUpdates, { type TaskUpdate } from '@/components/tasks/TaskUpdates';
import { sortTasksForDisplay } from '@/lib/task-sort';
import MorningSummaryModal from '@/components/summary/MorningSummaryModal';

export interface Employee {
  id: string;
  employeeCode: string;
  fullName: string;
  designation: string;
}

export interface TaskItem {
  id: string;
  title: string;
  description?: string;
  status: 'TO_DO' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate?: string | null;
  completedAt?: string | null;
  createdAt?: string;
  assignedToId?: string;
  createdById?: string;
  createdByName?: string;
  reminderIntervalMinutes?: number | null;
  attachments?: TaskAttachment[];
  updates?: TaskUpdate[];
  assignedTo: Employee;
}

interface DashboardProps {
  initialTasks: TaskItem[];
  employees: Employee[];
  directorId?: string;
}

const STATUS_CONFIG = {
  TO_DO: { label: 'To-Do', color: 'bg-slate-100 text-slate-700 border-slate-300', chartColor: '#94a3b8' },
  IN_PROGRESS: { label: 'In Progress', color: 'bg-blue-50 text-blue-700 border-blue-300', chartColor: '#0284c7' },
  BLOCKED: { label: 'Blocked', color: 'bg-rose-50 text-rose-700 border-rose-300', chartColor: '#e11d48' },
  COMPLETED: { label: 'Completed', color: 'bg-emerald-50 text-emerald-700 border-emerald-300', chartColor: '#10b981' },
};

const PRIORITY_BADGES = {
  LOW: 'text-gray-500 bg-gray-100 border-gray-200',
  MEDIUM: 'text-blue-600 bg-blue-50 border-blue-200',
  HIGH: 'text-amber-600 bg-amber-50 border-amber-200',
  URGENT: 'text-rose-600 bg-rose-50 border-rose-200 font-bold animate-pulse',
};

// Recurring reminder presets (minutes); 'CUSTOM' lets the director type any hour value
const REMINDER_PRESETS = [
  { value: 30, label: 'Every 30 min' },
  { value: 60, label: 'Every 1 hr' },
  { value: 120, label: 'Every 2 hr' },
  { value: 180, label: 'Every 3 hr' },
  { value: 240, label: 'Every 4 hr' },
  { value: 360, label: 'Every 6 hr' },
  { value: 720, label: 'Every 12 hr' },
  { value: 1440, label: 'Every 24 hr' },
];

// Vercel caps serverless request bodies at 4.5 MB; each file is uploaded separately
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

type AssignerScope = 'SELF' | 'OTHERS' | 'ALL';

const EMPTY_TASK_FORM = {
  title: '',
  description: '',
  priority: 'MEDIUM',
  dueDate: '',
  reminder: '' as string, // '' = off, minutes as string, or 'CUSTOM'
  customReminderHours: '',
  customReminderMinutes: '',
};

export default function DirectorDashboard({ initialTasks, employees, directorId }: DashboardProps) {
  const [employeeList, setEmployeeList] = useState<Employee[]>(employees);
  const [tasks, setTasks] = useState<TaskItem[]>(initialTasks);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedEmployeeFilter, setSelectedEmployeeFilter] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'LIST' | 'KANBAN'>('LIST');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [teamTab, setTeamTab] = useState<'LIST' | 'ADD'>('LIST');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmittingEmployee, setIsSubmittingEmployee] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeChartTab, setActiveChartTab] = useState<'WORKLOAD' | 'STATUS'>('WORKLOAD');
  const [assignerScope, setAssignerScope] = useState<AssignerScope>('SELF');
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);

  // Tapping the daily summary push opens /director?summary=1
  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).get('summary') === '1') setIsSummaryOpen(true);
  }, []);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [voiceNote, setVoiceNote] = useState<Blob | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Multi-Device Sync: Fetch fresh tasks from database
  const fetchLiveTasks = async (silent = false) => {
    if (!silent) setIsRefreshing(true);
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      if (data?.tasks) {
        setTasks(data.tasks);
      }
    } catch (e) {
      if (!silent) console.error('Failed to sync tasks:', e);
    } finally {
      if (!silent) setIsRefreshing(false);
    }
  };

  // Periodic automatic sync every 12 seconds so 2 devices stay updated
  React.useEffect(() => {
    const interval = setInterval(() => {
      fetchLiveTasks(true);
    }, 12000);
    return () => clearInterval(interval);
  }, []);

  // New Employee Form State
  const [employeeFormData, setEmployeeFormData] = useState({
    fullName: '',
    employeeCode: '',
    email: '',
    designation: 'Field Technician',
    role: 'EMPLOYEE' as 'EMPLOYEE' | 'DIRECTOR',
    password: '',
    phoneNumber: '',
  });

  // Form State
  const [formData, setFormData] = useState({
    ...EMPTY_TASK_FORM,
    assignedToId: employees[0]?.id || 'EMP001',
  });

  // "Assigned by" scope: tasks this director delegated vs. other directors
  const isMine = (t: TaskItem) => Boolean(directorId) && t.createdById === directorId;
  const scopeCounts = useMemo(() => {
    const mine = tasks.filter(isMine).length;
    return { SELF: mine, OTHERS: tasks.length - mine, ALL: tasks.length };
  }, [tasks, directorId]);

  const scopedTasks = useMemo(() => {
    if (assignerScope === 'ALL') return tasks;
    return tasks.filter((t) => (assignerScope === 'SELF' ? isMine(t) : !isMine(t)));
  }, [tasks, assignerScope, directorId]);

  // Aggregated Analytics
  const analytics = useMemo(() => {
    const tasks = scopedTasks;
    const total = tasks.length;
    const completed = tasks.filter((t) => t.status === 'COMPLETED').length;
    const blocked = tasks.filter((t) => t.status === 'BLOCKED').length;
    const inProgress = tasks.filter((t) => t.status === 'IN_PROGRESS').length;
    const todo = tasks.filter((t) => t.status === 'TO_DO').length;

    const now = new Date();
    const overdue = tasks.filter(
      (t) => t.dueDate && new Date(t.dueDate) < now && t.status !== 'COMPLETED'
    ).length;

    // Detailed Workload per employee with priority breakdown
    const workloadMap: Record<
      string,
      {
        id: string;
        code: string;
        name: string;
        designation: string;
        activeTasks: number;
        urgent: number;
        high: number;
        medium: number;
        low: number;
      }
    > = {};

    employeeList.forEach((emp) => {
      const code = emp.employeeCode || emp.id;
      workloadMap[code] = {
        id: emp.id,
        code: emp.employeeCode,
        name: (emp.fullName || 'Staff').split(' ')[0],
        designation: emp.designation || 'Staff',
        activeTasks: 0,
        urgent: 0,
        high: 0,
        medium: 0,
        low: 0,
      };
    });

    tasks.forEach((t) => {
      if (t.status !== 'COMPLETED' && t.assignedTo) {
        const key = t.assignedTo.employeeCode || t.assignedTo.id;
        if (workloadMap[key]) {
          workloadMap[key].activeTasks += 1;
          if (t.priority === 'URGENT') workloadMap[key].urgent += 1;
          if (t.priority === 'HIGH') workloadMap[key].high += 1;
          if (t.priority === 'MEDIUM') workloadMap[key].medium += 1;
          if (t.priority === 'LOW') workloadMap[key].low += 1;
        }
      }
    });

    const workloadData = Object.values(workloadMap);

    const statusChartData = [
      { name: 'To-Do', value: todo, color: STATUS_CONFIG.TO_DO.chartColor, percent: total ? Math.round((todo / total) * 100) : 0 },
      { name: 'In Progress', value: inProgress, color: STATUS_CONFIG.IN_PROGRESS.chartColor, percent: total ? Math.round((inProgress / total) * 100) : 0 },
      { name: 'Blocked', value: blocked, color: STATUS_CONFIG.BLOCKED.chartColor, percent: total ? Math.round((blocked / total) * 100) : 0 },
      { name: 'Completed', value: completed, color: STATUS_CONFIG.COMPLETED.chartColor, percent: total ? Math.round((completed / total) * 100) : 0 },
    ];

    return { total, completed, blocked, overdue, inProgress, todo, workloadData, statusChartData };
  }, [scopedTasks, employeeList]);

  // Filtered Task List
  const filteredTasks = useMemo(() => {
    return sortTasksForDisplay(scopedTasks).filter((task) => {
      const matchesSearch =
        (task.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (task.assignedTo?.fullName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (task.assignedTo?.employeeCode || '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = selectedStatus === 'ALL' || task.status === selectedStatus;

      const matchesEmployee =
        !selectedEmployeeFilter ||
        task.assignedTo?.employeeCode === selectedEmployeeFilter ||
        task.assignedTo?.id === selectedEmployeeFilter;

      return matchesSearch && matchesStatus && matchesEmployee;
    });
  }, [scopedTasks, searchTerm, selectedStatus, selectedEmployeeFilter]);

  // Quick Task Status Change
  const handleUpdateStatus = async (taskId: string, newStatus: TaskItem['status']) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    );

    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const resolveReminderMinutes = (): number | null | 'INVALID' => {
    if (!formData.reminder) return null;
    if (formData.reminder !== 'CUSTOM') return Number(formData.reminder);
    const hours = formData.customReminderHours.trim() === '' ? 0 : Number(formData.customReminderHours);
    const mins = formData.customReminderMinutes.trim() === '' ? 0 : Number(formData.customReminderMinutes);
    if (!Number.isInteger(hours) || !Number.isInteger(mins) || hours < 0 || mins < 0 || mins > 59) return 'INVALID';
    const total = hours * 60 + mins;
    if (total < 15 || total > 10080) return 'INVALID';
    return total;
  };

  const handleAddFiles = (files: FileList | null) => {
    if (!files) return;
    const accepted: File[] = [];
    const rejected: string[] = [];
    Array.from(files).forEach((f) => {
      if (f.size > MAX_ATTACHMENT_BYTES) rejected.push(f.name);
      else accepted.push(f);
    });
    if (rejected.length) {
      alert(`⚠️ These files are over 4 MB and were skipped:\n${rejected.join('\n')}`);
    }
    setPendingFiles((prev) => [...prev, ...accepted]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadAttachments = async (taskId: string, files: File[], voice: Blob | null) => {
    const uploads: { body: Blob; name: string; kind: 'FILE' | 'VOICE' }[] = files.map((f) => ({
      body: f,
      name: f.name,
      kind: 'FILE',
    }));
    if (voice) {
      const ext = voice.type.includes('mp4') || voice.type.includes('aac') ? 'm4a' : 'webm';
      uploads.push({ body: voice, name: `voice-note-${Date.now()}.${ext}`, kind: 'VOICE' });
    }

    const saved: TaskAttachment[] = [];
    const failed: string[] = [];
    for (const u of uploads) {
      try {
        const fd = new FormData();
        fd.append('file', u.body, u.name);
        fd.append('kind', u.kind);
        const res = await fetch(`/api/tasks/${taskId}/attachments`, { method: 'POST', body: fd });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.attachment) throw new Error(data?.error || 'Upload failed');
        saved.push(data.attachment);
      } catch {
        failed.push(u.kind === 'VOICE' ? 'Voice note' : u.name);
      }
    }
    return { saved, failed };
  };

  const closeTaskModal = () => {
    setIsModalOpen(false);
    setPendingFiles([]);
    setVoiceNote(null);
  };

  // Optimistic Task Assignment
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    const reminderMinutes = resolveReminderMinutes();
    if (reminderMinutes === 'INVALID') {
      alert('⚠️ Custom reminder must be between 15 min and 168 hr (minutes 0–59).');
      return;
    }

    setIsSubmitting(true);
    const filesToUpload = pendingFiles;
    const voiceToUpload = voiceNote;
    const assignedEmployee = employeeList.find(
      (e) => e.id === formData.assignedToId || e.employeeCode === formData.assignedToId
    ) || {
      id: formData.assignedToId,
      fullName: 'Assigned Staff',
      employeeCode: 'STAFF',
      designation: 'Specialist',
    };

    let formattedDueDate: string | null = null;
    if (formData.dueDate && typeof formData.dueDate === 'string' && formData.dueDate.trim() !== '') {
      const d = new Date(formData.dueDate);
      if (!isNaN(d.getTime())) {
        formattedDueDate = d.toISOString();
      }
    }

    const optimisticTask: TaskItem = {
      id: `temp-${Date.now()}`,
      title: formData.title.trim(),
      description: formData.description?.trim() || undefined,
      priority: formData.priority as any,
      status: 'TO_DO',
      dueDate: formattedDueDate,
      createdById: directorId,
      reminderIntervalMinutes: reminderMinutes,
      attachments: [],
      assignedTo: assignedEmployee,
    };

    setTasks((prev) => [optimisticTask, ...prev]);
    closeTaskModal();

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title.trim(),
          description: formData.description?.trim() || undefined,
          priority: formData.priority,
          dueDate: formattedDueDate,
          assignedToId: formData.assignedToId,
          createdById: directorId,
          reminderIntervalMinutes: reminderMinutes,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.task) {
        throw new Error(data?.error || 'Failed to save task');
      }

      const savedTask: TaskItem = data.task;
      setTasks((prev) => prev.map((t) => (t.id === optimisticTask.id ? savedTask : t)));

      setFormData({
        ...EMPTY_TASK_FORM,
        assignedToId: employeeList[0]?.id || 'EMP001',
      });

      if (filesToUpload.length || voiceToUpload) {
        const { saved, failed } = await uploadAttachments(savedTask.id, filesToUpload, voiceToUpload);
        setTasks((prev) =>
          prev.map((t) =>
            t.id === savedTask.id ? { ...t, attachments: [...(t.attachments || []), ...saved] } : t
          )
        );
        if (failed.length) {
          alert(`⚠️ Task assigned, but these attachments failed to upload:\n${failed.join('\n')}`);
        }
      }
    } catch (err: any) {
      console.error('Task assignment notice:', err);
      setTasks((prev) => prev.filter((t) => t.id !== optimisticTask.id));
      alert(`⚠️ Notice: ${err.message || 'Please check server connection'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Add Employee Handler
  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingEmployee(true);
    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(employeeFormData),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add employee');

      setEmployeeList((prev) => [...prev, data.employee]);
      setEmployeeFormData({
        fullName: '',
        employeeCode: '',
        email: '',
        designation: 'Field Technician',
        role: 'EMPLOYEE',
        password: '',
        phoneNumber: '',
      });
      setTeamTab('LIST');
      alert(`✅ Success: Added ${data.employee.fullName} (${data.employee.employeeCode})`);
    } catch (err: any) {
      alert(`⚠️ ${err.message || 'Error creating employee'}`);
    } finally {
      setIsSubmittingEmployee(false);
    }
  };

  // Send Reminder Handler
  const handleRemindTask = async (taskId: string, assigneeName?: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/remind`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to send reminder');
      }
      alert(`🔔 Reminder sent to ${assigneeName || 'employee'}`);
    } catch (err: any) {
      alert(`⚠️ ${err.message || 'Error sending reminder'}`);
    }
  };

  // Delete Task Handler
  const handleDeleteTask = async (taskId: string, title: string) => {
    if (!confirm(`Delete task "${title}"? This cannot be undone.`)) return;

    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete task');
      }
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (err: any) {
      alert(`⚠️ ${err.message || 'Error deleting task'}`);
    }
  };

  // Delete Employee Handler
  const handleDeleteEmployee = async (empId: string, empName: string) => {
    if (!confirm(`Are you sure you want to remove ${empName}? This will also delete their assigned tasks.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/employees?id=${encodeURIComponent(empId)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove employee');

      setEmployeeList((prev) => prev.filter((e) => e.id !== empId && e.employeeCode !== empId));
      setTasks((prev) => prev.filter((t) => t.assignedTo?.id !== empId && t.assignedTo?.employeeCode !== empId));
    } catch (err: any) {
      alert(`⚠️ ${err.message || 'Error deleting employee'}`);
    }
  };



  // Change or stop the recurring reminder on an existing task
  const handleUpdateReminder = async (taskId: string, minutes: number | null) => {
    const previous = tasks.find((t) => t.id === taskId)?.reminderIntervalMinutes ?? null;
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, reminderIntervalMinutes: minutes } : t)));
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reminderIntervalMinutes: minutes }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update reminder');
      }
    } catch (err: any) {
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, reminderIntervalMinutes: previous } : t)));
      alert(`⚠️ ${err.message || 'Error updating reminder'}`);
    }
  };

  // Custom Interactive Tooltip for Workload Bar Chart
  const CustomWorkloadTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900 text-white p-3.5 rounded-2xl shadow-xl border border-slate-800 text-xs space-y-2 min-w-[200px] animate-in fade-in-50">
          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
            <span className="font-bold text-sm text-blue-400">{data.name}</span>
            <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-300 font-mono">
              {data.code}
            </span>
          </div>
          <div className="text-[11px] text-slate-400">{data.designation}</div>
          <div className="flex items-center justify-between pt-1 font-semibold">
            <span>Active Delegations:</span>
            <span className="text-blue-400 font-bold text-sm">{data.activeTasks}</span>
          </div>
          <div className="grid grid-cols-2 gap-1 text-[10px] pt-1 text-slate-300 border-t border-slate-800">
            <div>Urgent: <span className="text-rose-400 font-bold">{data.urgent}</span></div>
            <div>High: <span className="text-amber-400 font-bold">{data.high}</span></div>
            <div>Medium: <span className="text-blue-400 font-bold">{data.medium}</span></div>
            <div>Low: <span className="text-slate-400 font-bold">{data.low}</span></div>
          </div>
          <div className="text-[10px] text-blue-300 pt-1 italic font-medium">
            👉 Click bar to filter this employee
          </div>
        </div>
      );
    }
    return null;
  };

  // Custom Tooltip for Status Pie Chart
  const CustomStatusTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl border border-slate-800 text-xs space-y-1">
          <div className="font-bold" style={{ color: data.color }}>{data.name}</div>
          <div className="text-slate-300 text-sm font-black">{data.value} tasks ({data.percent}%)</div>
          <div className="text-[10px] text-slate-400">Click slice to filter pipeline</div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-600 uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            Executive Oversight
          </div>
          <h2 className="text-xl font-bold text-slate-800">Operational Workforce Control</h2>
          <div className="flex items-center gap-2 mt-1">
            <button
              onClick={() => fetchLiveTasks(false)}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 text-[11px] font-medium transition cursor-pointer"
              title="Click to sync latest tasks from all devices"
            >
              <RefreshCw className={`w-3 h-3 text-blue-600 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Syncing...' : 'Live Synced (Click to Refresh)'}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setIsSummaryOpen(true)}
            className="flex items-center justify-center gap-2 bg-amber-50 hover:bg-amber-100 text-amber-800 px-4 py-2.5 rounded-xl font-medium border border-amber-200 transition active:scale-95 text-sm"
          >
            <Sun className="w-4 h-4 text-amber-500" />
            <span>Morning Summary</span>
          </button>
          <button
            onClick={() => {
              setTeamTab('LIST');
              setIsTeamModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-medium border border-slate-200 transition active:scale-95 text-sm"
          >
            <Users className="w-4 h-4 text-slate-600" />
            <span>Manage Team ({employeeList.length})</span>
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-medium shadow-sm transition active:scale-95 text-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Delegate New Task</span>
          </button>
        </div>
      </div>

      {/* Assigned-by Scope Filter (applies to KPIs, charts and task list) */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
          <UserCheck className="w-3.5 h-3.5" />
          Assigned by
        </span>
        <div className="flex items-center bg-white border border-slate-200 p-1 rounded-xl shadow-xs w-full sm:w-auto">
          {([
            ['SELF', 'Me'],
            ['OTHERS', 'Other Directors'],
            ['ALL', 'All'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setAssignerScope(key)}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 text-xs px-3.5 py-1.5 rounded-lg font-semibold transition ${
                assignerScope === key
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>{label}</span>
              <span
                className={`text-[10px] px-1.5 rounded-full ${
                  assignerScope === key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {scopeCounts[key]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* KPI Metric Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <button
          onClick={() => setSelectedStatus(selectedStatus === 'IN_PROGRESS' ? 'ALL' : 'IN_PROGRESS')}
          className={`p-4 rounded-2xl border text-left transition ${
            selectedStatus === 'IN_PROGRESS'
              ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-400/20 shadow-sm'
              : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-semibold text-slate-600">In Execution</span>
            <Clock className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-slate-800">{analytics.inProgress}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Click to view active</div>
        </button>

        <button
          onClick={() => setSelectedStatus(selectedStatus === 'BLOCKED' ? 'ALL' : 'BLOCKED')}
          className={`p-4 rounded-2xl border text-left transition ${
            selectedStatus === 'BLOCKED'
              ? 'bg-rose-100/50 border-rose-500 ring-2 ring-rose-400/20 shadow-sm'
              : 'bg-white border-rose-200 bg-rose-50/20 hover:border-rose-300 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between text-rose-500 mb-1">
            <span className="text-xs font-bold text-rose-600">Bottlenecks</span>
            <AlertTriangle className="w-4 h-4 text-rose-500 animate-pulse" />
          </div>
          <div className="text-2xl font-bold text-rose-600">{analytics.blocked}</div>
          <div className="text-[10px] text-rose-500 mt-0.5">Blocked operational tasks</div>
        </button>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-semibold text-slate-600">Overdue SLA</span>
            <AlertCircle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-600">{analytics.overdue}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Requires priority triage</div>
        </div>

        <button
          onClick={() => setSelectedStatus(selectedStatus === 'COMPLETED' ? 'ALL' : 'COMPLETED')}
          className={`p-4 rounded-2xl border text-left transition ${
            selectedStatus === 'COMPLETED'
              ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-400/20 shadow-sm'
              : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-semibold text-slate-600">Resolved / Done</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-emerald-600">{analytics.completed}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Successfully executed</div>
        </button>
      </div>

      {/* Interactive Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Workload Distribution Chart */}
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <span>Employee Active Workload</span>
                <Users className="w-4 h-4 text-blue-500" />
              </h3>
              <p className="text-xs text-slate-400">Click any staff bar to isolate their task assignments</p>
            </div>
            {selectedEmployeeFilter && (
              <button
                onClick={() => setSelectedEmployeeFilter(null)}
                className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg border border-blue-200 hover:bg-blue-100 transition"
              >
                <span>Filter: {selectedEmployeeFilter}</span>
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="h-56 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={analytics.workloadData}
                onClick={(entry: any) => {
                  if (entry && entry.activePayload && entry.activePayload.length) {
                    const code = entry.activePayload[0].payload.code;
                    setSelectedEmployeeFilter(selectedEmployeeFilter === code ? null : code);
                  }
                }}
              >
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<CustomWorkloadTooltip />} cursor={{ fill: 'rgba(2, 132, 199, 0.08)' }} />
                <Bar
                  dataKey="activeTasks"
                  fill="#0284c7"
                  radius={[8, 8, 0, 0]}
                  className="cursor-pointer transition-opacity hover:opacity-85"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pipeline Distribution Donut Chart */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <span>Pipeline Health</span>
                <TrendingUp className="w-4 h-4 text-emerald-500" />
              </h3>
              <p className="text-xs text-slate-400">Interactive lifecycle proportion</p>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 bg-slate-100 rounded text-slate-600">
              {analytics.total} total
            </span>
          </div>

          <div className="h-56 w-full flex items-center justify-center relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={analytics.statusChartData}
                  innerRadius={55}
                  outerRadius={75}
                  paddingAngle={5}
                  dataKey="value"
                  className="cursor-pointer"
                  onClick={(entry) => {
                    const map: Record<string, string> = {
                      'To-Do': 'TO_DO',
                      'In Progress': 'IN_PROGRESS',
                      'Blocked': 'BLOCKED',
                      'Completed': 'COMPLETED',
                    };
                    setSelectedStatus(map[entry.name] || 'ALL');
                  }}
                >
                  {analytics.statusChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomStatusTooltip />} />
                <Legend
                  formatter={(value) => <span className="text-xs text-slate-600 font-medium">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Task Delegation Engine with List / Kanban Toggle */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Controls Toolbar */}
        <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="flex items-center gap-3 w-full md:w-auto">
            {/* Search Input */}
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search task, staff, or code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* View Mode Switcher */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('LIST')}
                className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-semibold transition ${
                  viewMode === 'LIST'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>List</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('KANBAN')}
                className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-semibold transition ${
                  viewMode === 'KANBAN'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Kanban className="w-3.5 h-3.5" />
                <span>Kanban</span>
              </button>
            </div>
          </div>

          {/* Status Filter Badges */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
            {['ALL', 'TO_DO', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED'].map((statusKey) => (
              <button
                key={statusKey}
                onClick={() => setSelectedStatus(statusKey)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition shrink-0 ${
                  selectedStatus === statusKey
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {statusKey === 'ALL' ? 'All Tasks' : STATUS_CONFIG[statusKey as keyof typeof STATUS_CONFIG]?.label}
              </button>
            ))}
          </div>
        </div>

        {/* View Mode 1: Tabular Stream List */}
        {viewMode === 'LIST' && (
          <div className="divide-y divide-slate-100">
            {filteredTasks.length === 0 ? (
              <div className="text-center py-16 text-slate-400 text-sm space-y-2">
                <CheckCircle2 className="w-8 h-8 text-slate-300 mx-auto" />
                <p>No tasks match your selected criteria.</p>
              </div>
            ) : (
              filteredTasks.map((task) => (
                <div
                  key={task.id}
                  className="p-4 hover:bg-slate-50/80 transition flex flex-col md:flex-row md:items-center justify-between gap-3"
                >
                  <div className="space-y-1.5 max-w-xl">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-md border font-medium ${
                          STATUS_CONFIG[task.status]?.color
                        }`}
                      >
                        {STATUS_CONFIG[task.status]?.label}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-md border ${
                          PRIORITY_BADGES[task.priority]
                        }`}
                      >
                        {task.priority}
                      </span>

                      {task.dueDate && (
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span suppressHydrationWarning className="font-medium">
                            Due: {formatDate(task.dueDate)}
                          </span>
                          <span
                            suppressHydrationWarning
                            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              formatRelativeDueDate(task.dueDate).isOverdue
                                ? 'bg-rose-100 text-rose-700 font-bold'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {formatRelativeDueDate(task.dueDate).text}
                          </span>
                        </div>
                      )}
                    </div>

                    <h4 className="text-sm font-bold text-slate-800">{task.title}</h4>
                    {task.description && (
                      <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">
                        {task.description}
                      </p>
                    )}
                    <TaskAttachments taskId={task.id} attachments={task.attachments} />
                    <TaskUpdates taskId={task.id} updates={task.updates} />
                  </div>

                  <div className="flex items-center gap-3 self-end md:self-center shrink-0">
                    {/* Recurring Reminder Control */}
                    {task.status !== 'COMPLETED' && (
                      <label
                        className={`flex items-center gap-1 text-xs py-1 pl-2 pr-1 border rounded-lg ${
                          task.reminderIntervalMinutes
                            ? 'bg-amber-50 border-amber-300 text-amber-700'
                            : 'bg-slate-50 border-slate-200 text-slate-500'
                        }`}
                        title="Recurring reminder to the assignee"
                      >
                        <Repeat className="w-3.5 h-3.5 shrink-0" />
                        <select
                          value={task.reminderIntervalMinutes ? String(task.reminderIntervalMinutes) : ''}
                          onChange={(e) =>
                            handleUpdateReminder(task.id, e.target.value ? Number(e.target.value) : null)
                          }
                          className="bg-transparent font-medium focus:outline-none cursor-pointer"
                        >
                          <option value="">No repeat</option>
                          {task.reminderIntervalMinutes &&
                            !REMINDER_PRESETS.some((p) => p.value === task.reminderIntervalMinutes) && (
                              <option value={String(task.reminderIntervalMinutes)}>
                                {formatReminderInterval(task.reminderIntervalMinutes)}
                              </option>
                            )}
                          {REMINDER_PRESETS.map((p) => (
                            <option key={p.value} value={String(p.value)}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    {/* Quick Move Status Trigger */}
                    <select
                      value={task.status}
                      onChange={(e) => handleUpdateStatus(task.id, e.target.value as any)}
                      className="text-xs py-1 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-medium focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="TO_DO">To-Do</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="BLOCKED">Blocked</option>
                      <option value="COMPLETED">Completed</option>
                    </select>

                    <button
                      onClick={() => handleRemindTask(task.id, task.assignedTo?.fullName)}
                      title="Send reminder"
                      className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                    >
                      <Bell className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => handleDeleteTask(task.id, task.title)}
                      title="Delete task"
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    <div className="text-right">
                      <div className="text-xs font-bold text-slate-800">
                        {task.assignedTo?.fullName || 'Assigned Staff'}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {task.assignedTo?.employeeCode || 'STAFF'} • {task.assignedTo?.designation || 'Staff'}
                      </div>
                      {isMine(task) ? (
                        <div className="text-[10px] font-semibold text-blue-600">Assigned by you</div>
                      ) : task.createdByName ? (
                        <div className="text-[10px] text-slate-500">Assigned by {task.createdByName}</div>
                      ) : null}
                    </div>

                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 font-bold flex items-center justify-center text-xs shrink-0">
                      {(task.assignedTo?.fullName || 'S').charAt(0)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* View Mode 2: Interactive Kanban Board */}
        {viewMode === 'KANBAN' && (
          <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50/50">
            {(['TO_DO', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED'] as const).map((colStatus) => {
              const colTasks = filteredTasks.filter((t) => t.status === colStatus);
              return (
                <div key={colStatus} className="bg-slate-100/70 p-3 rounded-2xl flex flex-col space-y-3">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-200/60">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: STATUS_CONFIG[colStatus].chartColor }}
                      />
                      {STATUS_CONFIG[colStatus].label}
                    </span>
                    <span className="text-[11px] font-bold px-2 py-0.5 bg-white rounded-full text-slate-500 shadow-2xs">
                      {colTasks.length}
                    </span>
                  </div>

                  <div className="space-y-2.5 overflow-y-auto max-h-[500px]">
                    {colTasks.length === 0 ? (
                      <div className="text-center py-8 text-[11px] text-slate-400 border border-dashed border-slate-200 rounded-xl">
                        No tasks
                      </div>
                    ) : (
                      colTasks.map((t) => (
                        <div
                          key={t.id}
                          className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-2 hover:shadow-xs transition"
                        >
                          <div className="flex items-center justify-between">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${PRIORITY_BADGES[t.priority]}`}>
                              {t.priority}
                            </span>
                            {t.dueDate && (
                              <span
                                suppressHydrationWarning
                                className={`text-[10px] font-medium ${
                                  formatRelativeDueDate(t.dueDate).isOverdue
                                    ? 'text-rose-600 font-bold'
                                    : 'text-slate-400'
                                }`}
                              >
                                {formatDate(t.dueDate)}
                              </span>
                            )}
                          </div>

                          <div className="text-xs font-bold text-slate-800 leading-snug">{t.title}</div>

                          {(t.attachments?.length || (t.reminderIntervalMinutes && t.status !== 'COMPLETED')) ? (
                            <div className="flex items-center gap-2 text-[10px] text-slate-500">
                              {t.attachments?.some((a) => a.kind === 'VOICE') && (
                                <span className="flex items-center gap-0.5 text-violet-600" title="Has voice note">
                                  <Mic className="w-3 h-3" />
                                </span>
                              )}
                              {t.attachments?.some((a) => a.kind === 'FILE') && (
                                <span className="flex items-center gap-0.5" title="Attachments">
                                  <Paperclip className="w-3 h-3" />
                                  {t.attachments.filter((a) => a.kind === 'FILE').length}
                                </span>
                              )}
                              {t.reminderIntervalMinutes && t.status !== 'COMPLETED' && (
                                <span className="flex items-center gap-0.5 text-amber-600" title="Recurring reminder">
                                  <Repeat className="w-3 h-3" />
                                  {formatReminderInterval(t.reminderIntervalMinutes)}
                                </span>
                              )}
                            </div>
                          ) : null}

                          {t.updates && t.updates.length > 0 && (
                            <div
                              className="bg-sky-50 border border-sky-200 rounded-lg px-2 py-1 text-[10px] text-slate-700"
                              title={`${t.updates.length} note${t.updates.length > 1 ? 's' : ''} from the assignee`}
                            >
                              <div className="flex items-center gap-1 font-semibold text-sky-700">
                                <MessageSquare className="w-3 h-3" />
                                {t.updates.length} {t.updates.length > 1 ? 'replies' : 'reply'} · {t.updates[t.updates.length - 1].authorName.split(' ')[0]}
                              </div>
                              <p className="line-clamp-2 break-words">{t.updates[t.updates.length - 1].message}</p>
                            </div>
                          )}

                          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-[10px] text-slate-500 font-medium">
                              {t.assignedTo?.fullName?.split(' ')[0]}
                            </span>

                            {/* Quick Mover Dropdown */}
                            <select
                              value={t.status}
                              onChange={(e) => handleUpdateStatus(t.id, e.target.value as any)}
                              className="text-[10px] p-1 bg-slate-50 border border-slate-200 rounded text-slate-600 focus:ring-1 focus:ring-blue-500"
                            >
                              <option value="TO_DO">To-Do</option>
                              <option value="IN_PROGRESS">In Progress</option>
                              <option value="BLOCKED">Blocked</option>
                              <option value="COMPLETED">Completed</option>
                            </select>
                            <button
                              onClick={() => handleRemindTask(t.id, t.assignedTo?.fullName)}
                              title="Send reminder"
                              className="p-1 text-slate-400 hover:text-amber-600 rounded transition"
                            >
                              <Bell className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteTask(t.id, t.title)}
                              title="Delete task"
                              className="p-1 text-slate-400 hover:text-rose-600 rounded transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <MorningSummaryModal
        isOpen={isSummaryOpen}
        onClose={() => setIsSummaryOpen(false)}
        role="DIRECTOR"
        userId={directorId || ''}
        tasks={tasks}
      />

      {/* Delegation Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 space-y-4 max-h-[92vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <span>Delegate Operational Task</span>
                <Sparkles className="w-4 h-4 text-blue-500" />
              </h3>
              <button
                onClick={closeTaskModal}
                className="text-slate-400 hover:text-slate-600 text-lg p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-4 pt-1">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">
                  Task Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. RO Membrane Replacement & Chemical Flushing"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full text-sm p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">
                  Assignee (Staff) *
                </label>
                <select
                  value={formData.assignedToId}
                  onChange={(e) => setFormData({ ...formData, assignedToId: e.target.value })}
                  className="w-full text-sm p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  {employeeList.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.fullName} ({emp.employeeCode} - {emp.designation})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">
                    Priority
                  </label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    className="w-full text-sm p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent (Immediate)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">
                    Target Due Date
                  </label>
                  <input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    className="w-full text-sm p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">
                  SOP Instructions & Checklist
                </label>
                <textarea
                  rows={2}
                  placeholder="Specific parameters, client telemetry readings..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full text-sm p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Recurring Reminder */}
              <div>
                <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5 mb-1">
                  <Repeat className="w-3.5 h-3.5 text-amber-500" />
                  Repeat Reminder to Assignee
                </label>
                <select
                  value={formData.reminder}
                  onChange={(e) => setFormData({ ...formData, reminder: e.target.value })}
                  className="w-full text-sm p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">Off (notify once)</option>
                  {REMINDER_PRESETS.map((p) => (
                    <option key={p.value} value={String(p.value)}>
                      {p.label}
                    </option>
                  ))}
                  <option value="CUSTOM">Custom interval…</option>
                </select>
                {formData.reminder === 'CUSTOM' && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-slate-500">Every</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={168}
                      step={1}
                      placeholder="0"
                      value={formData.customReminderHours}
                      onChange={(e) => setFormData({ ...formData, customReminderHours: e.target.value })}
                      className="w-16 text-sm p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      aria-label="Hours"
                    />
                    <span className="text-xs text-slate-500">hr</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={59}
                      step={1}
                      placeholder="0"
                      value={formData.customReminderMinutes}
                      onChange={(e) => setFormData({ ...formData, customReminderMinutes: e.target.value })}
                      className="w-16 text-sm p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      aria-label="Minutes"
                    />
                    <span className="text-xs text-slate-500">min</span>
                  </div>
                )}
                {formData.reminder && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    {formData.reminder === 'CUSTOM' && 'Minimum 15 min, maximum 7 days. '}
                    A push reminder repeats until the task is marked Done.
                  </p>
                )}
              </div>

              {/* Attachments */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-600 block">
                  Attachments & Voice Note
                </label>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => handleAddFiles(e.target.files)}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 text-sm font-medium py-2.5 rounded-xl border border-dashed border-slate-300 text-slate-600 bg-slate-50 hover:bg-slate-100 transition"
                  >
                    <Paperclip className="w-4 h-4" />
                    <span>Attach Files</span>
                  </button>
                  <div className={voiceNote ? 'sm:col-span-2' : ''}>
                    <VoiceRecorder value={voiceNote} onChange={setVoiceNote} />
                  </div>
                </div>

                {pendingFiles.length > 0 && (
                  <ul className="space-y-1">
                    {pendingFiles.map((f, i) => (
                      <li
                        key={`${f.name}-${i}`}
                        className="flex items-center gap-2 text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5"
                      >
                        <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate flex-1 text-slate-700">{f.name}</span>
                        <span className="text-slate-400 shrink-0">{formatFileSize(f.size)}</span>
                        <button
                          type="button"
                          onClick={() => setPendingFiles((prev) => prev.filter((_, j) => j !== i))}
                          className="p-0.5 text-slate-400 hover:text-rose-600 shrink-0"
                          title="Remove"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[11px] text-slate-400">Photos, PDFs, documents — up to 4 MB each.</p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeTaskModal}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 text-sm font-medium rounded-xl transition shadow-sm disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  {isSubmitting ? 'Assigning...' : 'Assign & Notify Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Team Management Modal (Add / Delete Employees) */}
      {isTeamModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Team & Staff Management</h3>
                <p className="text-xs text-slate-500">Add new employees or remove existing team members</p>
              </div>
              <button
                onClick={() => setIsTeamModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tab navigation */}
            <div className="flex gap-2 border-b border-slate-100 pb-3">
              <button
                onClick={() => setTeamTab('LIST')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                  teamTab === 'LIST'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                Current Staff ({employeeList.length})
              </button>
              <button
                onClick={() => setTeamTab('ADD')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition ${
                  teamTab === 'ADD'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>+ Add New Member</span>
              </button>
            </div>

            {/* Tab 1: Current Staff List */}
            {teamTab === 'LIST' && (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {employeeList.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-xs">No active staff records found.</div>
                ) : (
                  employeeList.map((emp) => (
                    <div
                      key={emp.id || emp.employeeCode}
                      className="flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100/80 rounded-2xl border border-slate-200 transition"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                          (emp as any).role === 'DIRECTOR' || emp.employeeCode?.startsWith('D')
                            ? 'bg-blue-600 text-white'
                            : 'bg-emerald-600 text-white'
                        }`}>
                          {emp.employeeCode?.slice(0, 3)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-slate-800">{emp.fullName}</span>
                            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 bg-white border border-slate-200 rounded-md text-slate-600">
                              {emp.employeeCode}
                            </span>
                            {((emp as any).role === 'DIRECTOR' || emp.employeeCode?.startsWith('D')) && (
                              <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">
                                Director
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500">
                            {emp.designation} • {(emp as any).email || 'No email registered'}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteEmployee(emp.id || emp.employeeCode, emp.fullName)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition"
                        title={`Remove ${emp.fullName}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Tab 2: Add New Member Form */}
            {teamTab === 'ADD' && (
              <form onSubmit={handleCreateEmployee} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Anand Sharma"
                      value={employeeFormData.fullName}
                      onChange={(e) => setEmployeeFormData({ ...employeeFormData, fullName: e.target.value })}
                      className="w-full text-sm p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">
                      Employee Code / ID *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. EMP005 or D003"
                      value={employeeFormData.employeeCode}
                      onChange={(e) => setEmployeeFormData({ ...employeeFormData, employeeCode: e.target.value })}
                      className="w-full text-sm p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none uppercase"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">
                      Official Email *
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="anand@nirmaanwatertech.com"
                      value={employeeFormData.email}
                      onChange={(e) => setEmployeeFormData({ ...employeeFormData, email: e.target.value })}
                      className="w-full text-sm p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">
                      Designation / Title *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Senior RO Technician"
                      value={employeeFormData.designation}
                      onChange={(e) => setEmployeeFormData({ ...employeeFormData, designation: e.target.value })}
                      className="w-full text-sm p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">
                      Role Access
                    </label>
                    <select
                      value={employeeFormData.role}
                      onChange={(e) => setEmployeeFormData({ ...employeeFormData, role: e.target.value as any })}
                      className="w-full text-sm p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    >
                      <option value="EMPLOYEE">Employee (Task Stream)</option>
                      <option value="DIRECTOR">Director (Control Center)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">
                      Contact Number
                    </label>
                    <input
                      type="tel"
                      placeholder="+91 9876543210"
                      value={employeeFormData.phoneNumber}
                      onChange={(e) => setEmployeeFormData({ ...employeeFormData, phoneNumber: e.target.value })}
                      className="w-full text-sm p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">
                      Initial Password
                    </label>
                    <input
                      type="password"
                      placeholder="Default: Nirmaan@2026"
                      value={employeeFormData.password}
                      onChange={(e) => setEmployeeFormData({ ...employeeFormData, password: e.target.value })}
                      className="w-full text-sm p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setTeamTab('LIST')}
                    className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl"
                  >
                    Back to List
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingEmployee}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 text-sm font-semibold rounded-xl transition shadow-sm disabled:opacity-50"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>{isSubmittingEmployee ? 'Adding...' : 'Create & Register Member'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

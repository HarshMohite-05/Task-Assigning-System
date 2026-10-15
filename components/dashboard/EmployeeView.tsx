'use client';

import React, { useState, useEffect } from 'react';
import { Clock, AlertTriangle, CheckCircle2, Play, AlertCircle, Calendar, RefreshCw } from 'lucide-react';
import PushNotificationPrompt from '@/components/push/PushNotificationPrompt';

import { formatDate, formatRelativeDueDate } from '@/lib/format-utils';

interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'TO_DO' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate?: string | null;
}

interface EmployeeViewProps {
  initialTasks: Task[];
  employeeId: string;
  employeeName: string;
  designation: string;
}

const PRIORITY_BADGES = {
  LOW: 'text-gray-500 bg-gray-100',
  MEDIUM: 'text-blue-600 bg-blue-50',
  HIGH: 'text-amber-600 bg-amber-50',
  URGENT: 'text-rose-600 bg-rose-50 font-bold',
};

export default function EmployeeView({
  initialTasks,
  employeeId,
  employeeName,
  designation,
}: EmployeeViewProps) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Live Multi-Device Sync: Fetch freshly assigned tasks
  const fetchLiveTasks = async (silent = false) => {
    if (!silent) setIsRefreshing(true);
    try {
      const res = await fetch(`/api/tasks?employeeId=${encodeURIComponent(employeeId)}`);
      const data = await res.json();
      if (data?.tasks) {
        setTasks(data.tasks);
      }
    } catch (e) {
      if (!silent) console.error('Failed to sync employee tasks:', e);
    } finally {
      if (!silent) setIsRefreshing(false);
    }
  };

  // Automatically poll every 12 seconds so new assignments appear without page reload
  useEffect(() => {
    const interval = setInterval(() => {
      fetchLiveTasks(true);
    }, 12000);
    return () => clearInterval(interval);
  }, [employeeId]);

  const updateStatus = async (taskId: string, newStatus: Task['status']) => {
    setUpdatingTaskId(taskId);
    // Optimistic UI update
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    );

    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) throw new Error('Status update failed');
    } catch (err) {
      console.error(err);
      alert('Failed to update status. Please try again.');
    } finally {
      setUpdatingTaskId(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-12">
      {/* Mobile-Friendly Profile & Notification Bar */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
            {designation}
          </div>
          <h2 className="text-xl font-bold text-slate-800">{employeeName}</h2>
        </div>
        <PushNotificationPrompt userId={employeeId} />
      </div>

      {/* Task Stream Feed */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Your Delegated Tasks ({tasks.length})
          </h3>
          <button
            onClick={() => fetchLiveTasks(false)}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-[11px] font-medium transition cursor-pointer"
            title="Click to check for new tasks"
          >
            <RefreshCw className={`w-3 h-3 text-emerald-600 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Checking...' : 'Live Synced (Click to Refresh)'}
          </button>
        </div>

        {tasks.length === 0 ? (
          <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
            <h4 className="font-semibold text-slate-700">All caught up!</h4>
            <p className="text-xs text-slate-400">No active tasks assigned to you right now.</p>
          </div>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              className={`bg-white p-4 sm:p-5 rounded-2xl border transition shadow-xs ${
                task.status === 'COMPLETED'
                  ? 'border-emerald-200 bg-emerald-50/10 opacity-75'
                  : task.status === 'BLOCKED'
                  ? 'border-rose-300 bg-rose-50/20'
                  : 'border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <span
                  className={`text-xs px-2 py-0.5 rounded-md ${
                    PRIORITY_BADGES[task.priority]
                  }`}
                >
                  {task.priority}
                </span>

                {task.dueDate && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
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

              <h4
                className={`text-base font-semibold ${
                  task.status === 'COMPLETED' ? 'line-through text-slate-500' : 'text-slate-800'
                }`}
              >
                {task.title}
              </h4>

              {task.description && (
                <p className="text-xs text-slate-600 mt-1 mb-4 leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  {task.description}
                </p>
              )}

              {/* Status Action Buttons (One-tap interaction) */}
              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-medium text-slate-400 mr-1">Status:</span>

                <button
                  onClick={() => updateStatus(task.id, 'TO_DO')}
                  disabled={updatingTaskId === task.id || task.status === 'TO_DO'}
                  className={`text-xs px-3 py-1.5 rounded-xl font-medium transition ${
                    task.status === 'TO_DO'
                      ? 'bg-slate-700 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  To-Do
                </button>

                <button
                  onClick={() => updateStatus(task.id, 'IN_PROGRESS')}
                  disabled={updatingTaskId === task.id || task.status === 'IN_PROGRESS'}
                  className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-xl font-medium transition ${
                    task.status === 'IN_PROGRESS'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                  }`}
                >
                  <Play className="w-3 h-3" />
                  In Progress
                </button>

                <button
                  onClick={() => updateStatus(task.id, 'BLOCKED')}
                  disabled={updatingTaskId === task.id || task.status === 'BLOCKED'}
                  className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-xl font-medium transition ${
                    task.status === 'BLOCKED'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                  }`}
                >
                  <AlertCircle className="w-3 h-3" />
                  Blocked
                </button>

                <button
                  onClick={() => updateStatus(task.id, 'COMPLETED')}
                  disabled={updatingTaskId === task.id || task.status === 'COMPLETED'}
                  className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-xl font-medium transition ml-auto ${
                    task.status === 'COMPLETED'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  }`}
                >
                  <CheckCircle2 className="w-3 h-3" />
                  Done
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

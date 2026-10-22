'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Sun, X, AlertTriangle, Calendar, Send, BellRing } from 'lucide-react';
import { formatDate } from '@/lib/format-utils';
import { summarizeTasks, isOverdue, isDueToday, type SummaryTask } from '@/lib/summary-utils';

const STATUS_STYLE: Record<SummaryTask['status'], [string, string]> = {
  TO_DO: ['To-Do', 'bg-slate-100 text-slate-700 border-slate-300'],
  IN_PROGRESS: ['In Progress', 'bg-blue-50 text-blue-700 border-blue-300'],
  BLOCKED: ['Blocked', 'bg-rose-50 text-rose-700 border-rose-300'],
  COMPLETED: ['Completed', 'bg-emerald-50 text-emerald-700 border-emerald-300'],
};

interface MorningSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  role: 'DIRECTOR' | 'EMPLOYEE';
  userId: string;
  tasks: SummaryTask[];
}

function StatTiles({ tasks }: { tasks: SummaryTask[] }) {
  const s = summarizeTasks(tasks);
  const tiles = [
    { label: 'Open', value: s.open, cls: 'text-slate-800' },
    { label: 'To-Do', value: s.todo, cls: 'text-slate-600' },
    { label: 'In Progress', value: s.inProgress, cls: 'text-blue-600' },
    { label: 'Blocked', value: s.blocked, cls: 'text-rose-600' },
    { label: 'Overdue', value: s.overdue, cls: 'text-amber-600' },
    { label: 'Done (24h)', value: s.completedLast24h, cls: 'text-emerald-600' },
  ];
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
      {tiles.map((t) => (
        <div key={t.label} className="bg-slate-50 border border-slate-200 rounded-xl p-2 text-center">
          <div className={`text-lg font-bold ${t.cls}`}>{t.value}</div>
          <div className="text-[10px] text-slate-500 font-medium">{t.label}</div>
        </div>
      ))}
    </div>
  );
}

function TaskLine({ task, showAssigner = false }: { task: SummaryTask; showAssigner?: boolean }) {
  const [label, cls] = STATUS_STYLE[task.status];
  const overdue = isOverdue(task);
  const dueToday = isDueToday(task);
  return (
    <li className="flex items-start gap-2 py-1.5">
      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium shrink-0 ${cls}`}>{label}</span>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-slate-800 truncate">
          <span className="text-[10px] text-slate-400 font-bold mr-1">[{task.priority}]</span>
          {task.title}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 text-[10px] text-slate-500">
          {task.dueDate && (
            <span
              suppressHydrationWarning
              className={`flex items-center gap-0.5 ${overdue ? 'text-rose-600 font-bold' : dueToday ? 'text-amber-600 font-semibold' : ''}`}
            >
              <Calendar className="w-3 h-3" />
              {overdue ? 'Overdue · ' : dueToday ? 'Due today · ' : ''}
              {formatDate(task.dueDate)}
            </span>
          )}
          {showAssigner && task.createdByName && <span>from {task.createdByName}</span>}
        </div>
      </div>
    </li>
  );
}

export default function MorningSummaryModal({ isOpen, onClose, role, userId, tasks }: MorningSummaryModalProps) {
  const [settings, setSettings] = useState({ enabled: true, time: '09:00' });
  const [timeZone, setTimeZone] = useState('Asia/Kolkata');
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setNotice(null);
    fetch('/api/summary/settings')
      .then((r) => r.json())
      .then((data) => {
        if (data?.settings) setSettings({ enabled: data.settings.enabled, time: data.settings.time });
        if (data?.timeZone) setTimeZone(data.timeZone);
      })
      .catch(() => null);
  }, [isOpen]);

  const matchesMe = (id?: string) => Boolean(id) && id!.toUpperCase() === userId.toUpperCase();

  const { assignedByMe, assignedToMe, byAssignee } = useMemo(() => {
    const assignedToMe = tasks.filter((t) => matchesMe(t.assignedToId) || matchesMe(t.assignedTo?.id) || matchesMe(t.assignedTo?.employeeCode));
    const assignedByMe = role === 'DIRECTOR' ? tasks.filter((t) => matchesMe(t.createdById)) : [];

    // Group the director's delegated tasks by assignee, busiest (most open) first
    const groups = new Map<string, { name: string; code: string; tasks: SummaryTask[] }>();
    assignedByMe.forEach((t) => {
      const key = t.assignedTo?.employeeCode || t.assignedToId || 'unknown';
      if (!groups.has(key)) {
        groups.set(key, { name: t.assignedTo?.fullName || 'Staff', code: t.assignedTo?.employeeCode || '', tasks: [] });
      }
      groups.get(key)!.tasks.push(t);
    });
    const byAssignee = Array.from(groups.values())
      .map((g) => ({ ...g, stats: summarizeTasks(g.tasks) }))
      .sort((a, b) => b.stats.open - a.stats.open);

    return { assignedByMe, assignedToMe, byAssignee };
  }, [tasks, role, userId]);

  if (!isOpen) return null;

  const saveSettings = async () => {
    setIsSaving(true);
    setNotice(null);
    try {
      const res = await fetch('/api/summary/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setNotice(settings.enabled ? `✅ Daily summary set for ${settings.time} every day` : '✅ Daily summary turned off');
    } catch (err: any) {
      setNotice(`⚠️ ${err.message || 'Failed to save'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const sendNow = async () => {
    setIsSending(true);
    setNotice(null);
    try {
      const res = await fetch('/api/summary/send', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to send');
      setNotice('🔔 Summary sent to your devices with notifications enabled');
    } catch (err: any) {
      setNotice(`⚠️ ${err.message || 'Failed to send'}`);
    } finally {
      setIsSending(false);
    }
  };

  const today = new Intl.DateTimeFormat('en-IN', { timeZone, weekday: 'long', day: 'numeric', month: 'short' }).format(new Date());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full p-5 sm:p-6 space-y-5 max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between border-b pb-3 border-slate-100">
          <div>
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Sun className="w-5 h-5 text-amber-500" />
              <span>Morning Summary</span>
            </h3>
            <p className="text-xs text-slate-500" suppressHydrationWarning>{today}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {role === 'DIRECTOR' ? (
          <>
            <section className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Tasks you assigned</h4>
              <StatTiles tasks={assignedByMe} />

              {byAssignee.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">You haven&apos;t assigned any tasks yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {byAssignee.map((g) => (
                    <div key={g.code || g.name} className="border border-slate-200 rounded-2xl p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 font-bold flex items-center justify-center text-xs shrink-0">
                            {g.name.charAt(0)}
                          </div>
                          <span className="text-sm font-bold text-slate-800 truncate">{g.name}</span>
                          {g.code && <span className="text-[10px] font-mono text-slate-400">{g.code}</span>}
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold shrink-0">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{g.stats.open} open</span>
                          {g.stats.blocked > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">{g.stats.blocked} blocked</span>
                          )}
                          {g.stats.overdue > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">{g.stats.overdue} overdue</span>
                          )}
                        </div>
                      </div>
                      {g.stats.openTasks.length > 0 ? (
                        <ul className="divide-y divide-slate-100 mt-1">
                          {g.stats.openTasks.map((t) => (
                            <TaskLine key={t.id} task={t} />
                          ))}
                        </ul>
                      ) : (
                        <p className="text-[11px] text-emerald-600 mt-1.5">✅ All tasks completed</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {summarizeTasks(assignedToMe).open > 0 && (
              <section className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Assigned to you</h4>
                <ul className="divide-y divide-slate-100 border border-slate-200 rounded-2xl px-3">
                  {summarizeTasks(assignedToMe).openTasks.map((t) => (
                    <TaskLine key={t.id} task={t} showAssigner />
                  ))}
                </ul>
              </section>
            )}
          </>
        ) : (
          <section className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Your remaining work</h4>
            <StatTiles tasks={assignedToMe} />
            {summarizeTasks(assignedToMe).overdue > 0 && (
              <div className="flex items-center gap-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                <AlertTriangle className="w-4 h-4" />
                {summarizeTasks(assignedToMe).overdue} task(s) are overdue — please prioritise these first.
              </div>
            )}
            {summarizeTasks(assignedToMe).open === 0 ? (
              <p className="text-sm text-emerald-600 text-center py-4 font-semibold">🎉 All caught up — nothing pending!</p>
            ) : (
              <ul className="divide-y divide-slate-100 border border-slate-200 rounded-2xl px-3">
                {summarizeTasks(assignedToMe).openTasks.map((t) => (
                  <TaskLine key={t.id} task={t} showAssigner />
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Daily notification preference */}
        <section className="bg-amber-50/60 border border-amber-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <BellRing className="w-4 h-4 text-amber-600" />
            Daily summary notification
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
                className="w-4 h-4 accent-amber-600"
              />
              Send me this every day at
            </label>
            <input
              type="time"
              value={settings.time}
              disabled={!settings.enabled}
              onChange={(e) => setSettings({ ...settings, time: e.target.value })}
              className="text-sm p-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none disabled:opacity-50"
            />
            <span className="text-[11px] text-slate-500">India time (IST)</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={saveSettings}
              disabled={isSaving || !settings.time}
              className="text-xs font-semibold px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white transition disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Preference'}
            </button>
            <button
              type="button"
              onClick={sendNow}
              disabled={isSending}
              className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              {isSending ? 'Sending...' : 'Send to my phone now'}
            </button>
          </div>
          {notice && <p className="text-xs text-slate-700">{notice}</p>}
        </section>
      </div>
    </div>
  );
}

/**
 * Daily summary helpers shared by the server (push text) and the dashboards (summary panel).
 * Must stay free of server-only imports.
 */

// The team works in India; summary times and "due today" are evaluated in this zone
export const SUMMARY_TIMEZONE = 'Asia/Kolkata';

export interface SummaryTask {
  id: string;
  title: string;
  status: 'TO_DO' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate?: string | null;
  completedAt?: string | null;
  createdById?: string;
  createdByName?: string;
  assignedToId?: string;
  assignedTo?: { id: string; fullName: string; employeeCode: string };
}

export interface SummaryStats<T extends SummaryTask = SummaryTask> {
  open: number;
  todo: number;
  inProgress: number;
  blocked: number;
  overdue: number;
  dueToday: number;
  completedLast24h: number;
  openTasks: T[]; // sorted: overdue, then priority, then due date
}

/** { date: 'YYYY-MM-DD', time: 'HH:MM' } for a moment in the given zone */
export function zonedDateTime(d: Date, timeZone = SUMMARY_TIMEZONE) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

const PRIORITY_RANK = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

export function isOverdue(t: SummaryTask, now = new Date()) {
  return Boolean(t.dueDate) && new Date(t.dueDate!) < now && t.status !== 'COMPLETED';
}

export function isDueToday(t: SummaryTask, now = new Date()) {
  if (!t.dueDate || t.status === 'COMPLETED' || isOverdue(t, now)) return false;
  return zonedDateTime(new Date(t.dueDate)).date === zonedDateTime(now).date;
}

export function summarizeTasks<T extends SummaryTask>(tasks: T[], now = new Date()): SummaryStats<T> {
  const open = tasks.filter((t) => t.status !== 'COMPLETED');
  const dayAgo = now.getTime() - 24 * 3600_000;

  const openTasks = [...open].sort((a, b) => {
    const od = Number(isOverdue(b, now)) - Number(isOverdue(a, now));
    if (od) return od;
    const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (pr) return pr;
    const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    return ad - bd;
  });

  return {
    open: open.length,
    todo: open.filter((t) => t.status === 'TO_DO').length,
    inProgress: open.filter((t) => t.status === 'IN_PROGRESS').length,
    blocked: open.filter((t) => t.status === 'BLOCKED').length,
    overdue: open.filter((t) => isOverdue(t, now)).length,
    dueToday: open.filter((t) => isDueToday(t, now)).length,
    completedLast24h: tasks.filter(
      (t) => t.status === 'COMPLETED' && t.completedAt && new Date(t.completedAt).getTime() >= dayAgo
    ).length,
    openTasks,
  };
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** Push notification text for a director: tasks they delegated (+ anything on their own plate) */
export function directorSummaryPush(assignedByMe: SummaryTask[], assignedToMe: SummaryTask[]) {
  const s = summarizeTasks(assignedByMe);
  const mine = summarizeTasks(assignedToMe);

  const parts: string[] = [];
  if (s.open === 0) {
    parts.push('No open tasks from you right now.');
  } else {
    parts.push(
      `${plural(s.open, 'open task')} you assigned: ${s.todo} To-Do · ${s.inProgress} In Progress · ${s.blocked} Blocked.`
    );
    if (s.overdue) parts.push(`⚠️ ${s.overdue} overdue.`);
  }
  if (s.completedLast24h) parts.push(`✅ ${s.completedLast24h} completed in the last 24h.`);
  if (mine.open) parts.push(`Plus ${plural(mine.open, 'task')} assigned to you.`);

  return { title: '☀️ Morning Summary', body: parts.join(' ') };
}

/** Push notification text for an employee: what is still left to do */
export function employeeSummaryPush(myTasks: SummaryTask[]) {
  const s = summarizeTasks(myTasks);

  if (s.open === 0) {
    return { title: '☀️ Morning Summary', body: 'All caught up — no pending tasks. Have a great day!' };
  }

  const parts = [`${plural(s.open, 'task')} remaining`];
  const flags: string[] = [];
  if (s.overdue) flags.push(`${s.overdue} overdue`);
  if (s.dueToday) flags.push(`${s.dueToday} due today`);
  if (s.blocked) flags.push(`${s.blocked} blocked`);
  const top = s.openTasks[0];

  return {
    title: '☀️ Morning Summary',
    body: `${parts[0]}${flags.length ? ` (${flags.join(', ')})` : ''}. Top: [${top.priority}] ${top.title}`,
  };
}

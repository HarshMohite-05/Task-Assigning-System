import { daysUntilDue, dueDay } from './summary-utils';

/**
 * Deterministic date formatter avoiding React SSR hydration mismatch
 * Formats dates as "16 Oct 2026" identically on both Server (Node) and Client (Browser)
 */
export function formatDate(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '';

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = d.getDate().toString().padStart(2, '0');
  const month = months[d.getMonth()];
  const year = d.getFullYear();

  return `${day} ${month} ${year}`;
}

/** Due date as "16 Nov 2026" — the same calendar day on the server and on every device */
export function formatDueDate(dateInput: string | Date | null | undefined): string {
  const day = dueDay(dateInput);
  if (!day) return '';
  const [y, m, d] = day.split('-').map(Number);
  return formatDate(new Date(y, m - 1, d));
}

/**
 * "Due today" / "Due in 3d" / "2d overdue", counted in calendar days in the team's zone.
 * Pass the task status so completed tasks never show as overdue.
 */
export function formatRelativeDueDate(
  dateInput: string | Date | null | undefined,
  status?: string
): { text: string; isOverdue: boolean } {
  const diffDays = daysUntilDue(dateInput);
  if (diffDays === null) return { text: 'No deadline', isOverdue: false };

  if (status === 'COMPLETED') return { text: 'Done', isOverdue: false };
  if (diffDays < 0) return { text: `${Math.abs(diffDays)}d overdue`, isOverdue: true };
  if (diffDays === 0) return { text: 'Due today', isOverdue: false };
  if (diffDays === 1) return { text: 'Due tomorrow', isOverdue: false };
  return { text: `Due in ${diffDays}d`, isOverdue: false };
}

/** "every 30 min" / "every 2 hr" / "every 1 day" for a reminder interval in minutes */
export function formatReminderInterval(minutes: number | null | undefined): string {
  if (!minutes) return '';
  if (minutes % 1440 === 0) return `every ${minutes / 1440} day${minutes === 1440 ? '' : 's'}`;
  if (minutes % 60 === 0) return `every ${minutes / 60} hr`;
  if (minutes > 60) return `every ${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
  return `every ${minutes} min`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

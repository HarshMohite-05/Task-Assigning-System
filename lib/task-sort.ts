// Display order for task lists: freshly assigned tasks first (newest on top), then the
// remaining open tasks by priority, and completed tasks last (most recently completed first).

const NEW_TASK_WINDOW_MS = 24 * 60 * 60 * 1000;

const PRIORITY_RANK: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

interface SortableTask {
  status: string;
  priority: string;
  createdAt?: string | null;
  dueDate?: string | null;
  completedAt?: string | null;
}

function time(iso: string | null | undefined, fallback: number) {
  const t = iso ? new Date(iso).getTime() : NaN;
  return isNaN(t) ? fallback : t;
}

export function sortTasksForDisplay<T extends SortableTask>(tasks: T[], now = Date.now()): T[] {
  // A task without createdAt is one just added optimistically, so it counts as new
  const created = (t: T) => time(t.createdAt, now);
  const isNew = (t: T) => now - created(t) < NEW_TASK_WINDOW_MS;

  return [...tasks].sort((a, b) => {
    const aDone = a.status === 'COMPLETED';
    const bDone = b.status === 'COMPLETED';
    if (aDone !== bDone) return aDone ? 1 : -1;
    if (aDone) return time(b.completedAt, 0) - time(a.completedAt, 0);

    const aNew = isNew(a);
    const bNew = isNew(b);
    if (aNew !== bNew) return aNew ? -1 : 1;
    if (aNew) return created(b) - created(a);

    const byPriority = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
    if (byPriority !== 0) return byPriority;

    const byDue = time(a.dueDate, Infinity) - time(b.dueDate, Infinity);
    if (byDue !== 0 && !isNaN(byDue)) return byDue;

    return created(b) - created(a);
  });
}

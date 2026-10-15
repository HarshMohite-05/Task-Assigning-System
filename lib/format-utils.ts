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

export function formatRelativeDueDate(dateInput: string | Date | null | undefined): { text: string; isOverdue: boolean } {
  if (!dateInput) return { text: 'No deadline', isOverdue: false };
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return { text: 'No deadline', isOverdue: false };

  const now = new Date();
  const diffTime = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { text: `${Math.abs(diffDays)}d overdue`, isOverdue: true };
  } else if (diffDays === 0) {
    return { text: 'Due today', isOverdue: false };
  } else if (diffDays === 1) {
    return { text: 'Due tomorrow', isOverdue: false };
  } else {
    return { text: `Due in ${diffDays}d`, isOverdue: false };
  }
}

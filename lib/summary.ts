import { claimDueSummaries, getTasks, type SummaryRecipient, type TaskRecord } from './data-store';
import { sendNativePushNotification } from './push-service';
import { directorSummaryPush, employeeSummaryPush, zonedDateTime } from './summary-utils';

function isSameUser(id: string | undefined, code: string | undefined, user: SummaryRecipient) {
  const u = [user.id.toUpperCase(), user.employeeCode.toUpperCase()];
  return Boolean((id && u.includes(id.toUpperCase())) || (code && u.includes(code.toUpperCase())));
}

export function summaryPushFor(user: SummaryRecipient, allTasks: TaskRecord[]) {
  const assignedToMe = allTasks.filter((t) => isSameUser(t.assignedToId, t.assignedTo?.employeeCode, user));
  if (user.role === 'DIRECTOR') {
    const assignedByMe = allTasks.filter((t) => isSameUser(t.createdById, undefined, user));
    return directorSummaryPush(assignedByMe, assignedToMe);
  }
  return employeeSummaryPush(assignedToMe);
}

export async function sendSummaryTo(user: SummaryRecipient, allTasks?: TaskRecord[]) {
  const tasks = allTasks || (await getTasks());
  const { title, body } = summaryPushFor(user, tasks);
  await sendNativePushNotification(user.id, {
    title,
    body,
    url: user.role === 'DIRECTOR' ? '/director?summary=1' : '/employee?summary=1',
    taskId: 'daily-summary',
  });
}

/** Sends today's summary to everyone whose preferred time has passed. Returns how many were sent. */
export async function runDueSummaries(now = new Date()): Promise<number> {
  const { date, time } = zonedDateTime(now);
  const due = await claimDueSummaries(date, time);
  if (due.length === 0) return 0;

  const tasks = await getTasks();
  await Promise.allSettled(due.map((u) => sendSummaryTo(u, tasks)));
  return due.length;
}

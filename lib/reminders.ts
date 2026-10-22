import { claimDueReminders } from './data-store';
import { sendNativePushNotification } from './push-service';
import { formatReminderInterval } from './format-utils';
import { runDueSummaries } from './summary';

/** Sends a push for every recurring reminder that has come due. Returns how many were sent. */
export async function runDueReminders(): Promise<number> {
  const due = await claimDueReminders();

  await Promise.allSettled(
    due.map((task) =>
      sendNativePushNotification(task.assignedToId, {
        title: '⏰ Task Reminder',
        body: `[${task.priority}] ${task.title}${task.createdByName ? ` — assigned by ${task.createdByName}` : ''} (repeats ${formatReminderInterval(task.reminderIntervalMinutes)})`,
        url: `/employee?taskId=${task.id}`,
        taskId: task.id,
      })
    )
  );

  return due.length;
}

const globalRunner = globalThis as unknown as { lastReminderSweep?: number };

/**
 * Opportunistic sweep (task reminders + daily summaries), piggybacked on the dashboards' 12s polling so reminders
 * still go out while anyone has the app open, even without an external cron.
 * Throttled per server instance; the claim in claimDueReminders prevents duplicates.
 */
export async function maybeRunDueReminders(minGapMs = 60_000) {
  const now = Date.now();
  if (globalRunner.lastReminderSweep && now - globalRunner.lastReminderSweep < minGapMs) return;
  globalRunner.lastReminderSweep = now;
  const results = await Promise.allSettled([runDueReminders(), runDueSummaries()]);
  results.forEach((r) => {
    if (r.status === 'rejected') console.warn('[Reminders] Sweep failed:', r.reason);
  });
}

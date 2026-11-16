import { NextRequest, NextResponse } from 'next/server';
import { deleteTask, getTasks, updateTaskReminder, updateTaskStatus } from '@/lib/data-store';
import { isAssignedTo, requireSession } from '@/lib/session';
import { notifyDirectors } from '@/lib/push-service';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { taskId: string } }
) {
  const auth = requireSession();
  if (auth.error) return auth.error;
  try {
    const { taskId } = params;
    const body = await req.json();
    const { status } = body;

    // Employees may only change the status of tasks assigned to them
    if (auth.user.role !== 'DIRECTOR') {
      const task = (await getTasks()).find((t) => t.id === taskId);
      if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      if (!isAssignedTo(task, auth.user)) {
        return NextResponse.json({ error: 'You can only update tasks assigned to you' }, { status: 403 });
      }
    }

    // Reminder-only update: { reminderIntervalMinutes: number | null }
    if (status === undefined && 'reminderIntervalMinutes' in body) {
      if (auth.user.role !== 'DIRECTOR') {
        return NextResponse.json({ error: 'Only directors can change reminders' }, { status: 403 });
      }
      const interval = body.reminderIntervalMinutes;
      if (interval !== null && (!Number.isInteger(interval) || interval < 15 || interval > 10080)) {
        return NextResponse.json({ error: 'Reminder interval must be 15 min to 7 days' }, { status: 400 });
      }
      const task = await updateTaskReminder(taskId, interval);
      if (!task) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, task });
    }

    const validStatuses = ['TO_DO', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED'];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid task status' }, { status: 400 });
    }

    const updatedTask = await updateTaskStatus(taskId, status);
    if (!updatedTask) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Notify directors on every status change (awaited so serverless doesn't drop it)
    const labels: Record<string, [string, string]> = {
      TO_DO: ['↩️', 'moved back to To Do'],
      IN_PROGRESS: ['🚀', 'started'],
      BLOCKED: ['⚠️', 'reported blocked on'],
      COMPLETED: ['✅', 'completed'],
    };
    const [icon, actionText] = labels[status];
    const assigneeName = updatedTask.assignedTo?.fullName || 'An employee';

    await notifyDirectors({
      title: `${icon} Task ${status === 'COMPLETED' ? 'Completed' : status === 'BLOCKED' ? 'Blocked' : 'Updated'}`,
      body: `${assigneeName} ${actionText}: "${updatedTask.title}"`,
      url: `/director?taskId=${updatedTask.id}`,
      taskId: updatedTask.id,
    }, updatedTask.createdById).catch((err) => {
      console.warn('[API] Director notification notice:', err);
    });

    return NextResponse.json({ success: true, task: updatedTask });
  } catch (error: any) {
    console.error('Task status update error:', error);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { taskId: string } }
) {
  const auth = requireSession('DIRECTOR');
  if (auth.error) return auth.error;
  try {
    const deleted = await deleteTask(params.taskId);
    if (!deleted) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Task deletion error:', error);
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
  }
}

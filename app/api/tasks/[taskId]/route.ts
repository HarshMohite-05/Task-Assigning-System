import { NextRequest, NextResponse } from 'next/server';
import { deleteTask, updateTaskStatus } from '@/lib/data-store';
import { notifyDirectors } from '@/lib/push-service';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const { taskId } = params;
    const body = await req.json();
    const { status } = body;

    const validStatuses = ['TO_DO', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED'];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid task status' }, { status: 400 });
    }

    const updatedTask = await updateTaskStatus(taskId, status);
    if (!updatedTask) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Notify directors on critical lifecycle events (COMPLETED or BLOCKED)
    if (status === 'COMPLETED' || status === 'BLOCKED') {
      const isCompleted = status === 'COMPLETED';
      const icon = isCompleted ? '✅' : '⚠️';
      const actionText = isCompleted ? 'completed' : 'reported blocked on';
      const assigneeName = updatedTask.assignedTo?.fullName || 'An employee';

      notifyDirectors({
        title: `${icon} Task ${status === 'COMPLETED' ? 'Completed' : 'Blocked'}`,
        body: `${assigneeName} ${actionText}: "${updatedTask.title}"`,
        url: `/director?taskId=${updatedTask.id}`,
        taskId: updatedTask.id,
      }, updatedTask.createdById).catch((err) => {
        console.warn('[API] Director notification notice:', err);
      });
    }

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

import { NextRequest, NextResponse } from 'next/server';
import { addTaskUpdate, getTasks } from '@/lib/data-store';
import { notifyDirectors } from '@/lib/push-service';
import { getSession, isAssignedTo } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_MESSAGE_LENGTH = 2000;

export async function POST(
  req: NextRequest,
  { params }: { params: { taskId: string } }
) {
  const user = getSession();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const message = String(body?.message || '').trim();
    if (!message) {
      return NextResponse.json({ error: 'Update cannot be empty' }, { status: 400 });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json({ error: `Update must be under ${MAX_MESSAGE_LENGTH} characters` }, { status: 400 });
    }

    // Employees may only post on tasks assigned to them; directors can post on any task
    if (user.role !== 'DIRECTOR') {
      const task = (await getTasks()).find((t) => t.id === params.taskId);
      if (!task || !isAssignedTo(task, user)) {
        return NextResponse.json({ error: 'You can only update tasks assigned to you' }, { status: 403 });
      }
    }

    const result = await addTaskUpdate(
      params.taskId,
      { id: user.id || user.employeeCode, name: user.fullName || user.employeeCode },
      message
    );
    if (!result) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const { task, update } = result;
    if (user.role !== 'DIRECTOR') {
      // Awaited so serverless doesn't drop the push after the response is sent
      await notifyDirectors({
        title: `💬 Update on "${task.title}"`,
        body: `${update.authorName}: ${message.length > 120 ? `${message.slice(0, 117)}...` : message}`,
        url: `/director?taskId=${task.id}`,
        taskId: task.id,
      }, task.createdById).catch((err) => {
        console.warn('[API] Director notification notice:', err);
      });
    }

    return NextResponse.json({ success: true, update }, { status: 201 });
  } catch (error: any) {
    console.error('Task update post error:', error);
    return NextResponse.json({ error: 'Failed to post update' }, { status: 500 });
  }
}

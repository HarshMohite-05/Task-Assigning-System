import { NextRequest, NextResponse } from 'next/server';
import { getTasks } from '@/lib/data-store';
import { sendNativePushNotification } from '@/lib/push-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(
  _req: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const tasks = await getTasks();
    const task = tasks.find((t) => t.id === params.taskId);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Awaited so serverless doesn't drop the push after the response is sent
    await sendNativePushNotification(task.assignedToId, {
      title: '⏰ Task Reminder',
      body: `[${task.priority}] ${task.title}${task.createdByName ? ` — assigned by ${task.createdByName}` : ''}`,
      url: `/employee?taskId=${task.id}`,
      taskId: task.id,
    }).catch(() => null);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Task reminder error:', error);
    return NextResponse.json({ error: 'Failed to send reminder' }, { status: 500 });
  }
}

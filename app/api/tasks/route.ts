import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createTask, getTasks } from '@/lib/data-store';
import { sendNativePushNotification } from '@/lib/push-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const createTaskSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  assignedToId: z.string().min(1, 'Assignee is required'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  dueDate: z.string().optional().nullable(),
  createdById: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = createTaskSchema.parse(body);

    // Save task through universal data store (Prisma Postgres / persistent fallback)
    const newTask = await createTask({
      title: validated.title,
      description: validated.description,
      priority: validated.priority,
      dueDate: validated.dueDate,
      assignedToId: validated.assignedToId,
      createdById: validated.createdById,
    });

    // Native mobile push notification dispatch (asynchronous, non-blocking)
    const pushPayload = {
      title: '🚨 New Task Delegated',
      body: `[${newTask.priority}] ${newTask.title}`,
      url: `/employee?taskId=${newTask.id}`,
      taskId: newTask.id,
    };

    // Must be awaited: serverless runtimes freeze after the response is sent,
    // which silently drops any push still in flight.
    await sendNativePushNotification(newTask.assignedToId, pushPayload).catch(() => null);

    return NextResponse.json({ success: true, task: newTask }, { status: 201 });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('Task creation API error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get('employeeId') || undefined;

    const tasks = await getTasks(employeeId);
    return NextResponse.json({ tasks });
  } catch (error: any) {
    console.error('Task query API error:', error);
    return NextResponse.json({ error: 'Failed to retrieve tasks' }, { status: 500 });
  }
}

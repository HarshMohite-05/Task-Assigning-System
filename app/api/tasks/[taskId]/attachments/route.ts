import { NextRequest, NextResponse } from 'next/server';
import { addTaskAttachment, getTasks } from '@/lib/data-store';
import { isAssignedTo, requireSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Vercel caps serverless request bodies at 4.5 MB, so each file is uploaded on its own
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

export async function POST(
  req: NextRequest,
  { params }: { params: { taskId: string } }
) {
  const auth = requireSession();
  if (auth.error) return auth.error;
  if (auth.user.role !== 'DIRECTOR') {
    const task = (await getTasks()).find((t) => t.id === params.taskId);
    if (!task || !isAssignedTo(task, auth.user)) {
      return NextResponse.json({ error: 'You can only add files to tasks assigned to you' }, { status: 403 });
    }
  }

  try {
    const form = await req.formData();
    const file = form.get('file');
    const kind = form.get('kind') === 'VOICE' ? 'VOICE' : 'FILE';

    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'File is empty' }, { status: 400 });
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      return NextResponse.json({ error: 'File is larger than 4 MB' }, { status: 413 });
    }

    const fileName = ((file as File).name || (kind === 'VOICE' ? 'voice-note' : 'attachment')).slice(0, 200);
    const attachment = await addTaskAttachment(params.taskId, {
      kind,
      fileName,
      mimeType: file.type || 'application/octet-stream',
      data: Buffer.from(await file.arrayBuffer()),
    });

    if (!attachment) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, attachment }, { status: 201 });
  } catch (error: any) {
    console.error('Attachment upload error:', error);
    return NextResponse.json({ error: 'Failed to upload attachment' }, { status: 500 });
  }
}

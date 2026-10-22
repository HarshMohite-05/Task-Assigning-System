import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { addTaskAttachment } from '@/lib/data-store';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Vercel caps serverless request bodies at 4.5 MB, so each file is uploaded on its own
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

export async function POST(
  req: NextRequest,
  { params }: { params: { taskId: string } }
) {
  if (!cookies().get('taskstream_user')?.value) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
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

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getTaskAttachment } from '@/lib/data-store';

export const dynamic = 'force-dynamic';

// Types safe to render inline; everything else is forced to download
const INLINE_TYPES = /^(image\/(png|jpe?g|gif|webp)|audio\/|video\/|application\/pdf$)/;

export async function GET(
  _req: NextRequest,
  { params }: { params: { taskId: string; attachmentId: string } }
) {
  if (!cookies().get('taskstream_user')?.value) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  try {
    const att = await getTaskAttachment(params.taskId, params.attachmentId);
    if (!att) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }

    const disposition = INLINE_TYPES.test(att.mimeType) ? 'inline' : 'attachment';
    return new NextResponse(new Uint8Array(att.data), {
      headers: {
        'Content-Type': att.mimeType,
        'Content-Length': String(att.data.length),
        'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(att.fileName)}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch (error: any) {
    console.error('Attachment download error:', error);
    return NextResponse.json({ error: 'Failed to load attachment' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Serves the VAPID public key at runtime so it doesn't depend on a build-time env inline.
export async function GET() {
  const key = (process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '').trim().replace(/^"|"$/g, '');
  if (!key || key.includes('replace_with') || key.includes('...')) {
    return NextResponse.json({ error: 'VAPID keys not configured on server' }, { status: 503 });
  }
  return NextResponse.json({ key });
}

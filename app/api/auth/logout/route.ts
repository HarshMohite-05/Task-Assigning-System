import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function createLogoutResponse(req: NextRequest) {
  const url = new URL('/', req.url);
  const response = NextResponse.redirect(url, 303);

  // Expire and clear the cookie completely
  response.cookies.set('taskstream_user', '', {
    path: '/',
    expires: new Date(0),
    maxAge: 0,
    sameSite: 'lax',
    secure: false,
    httpOnly: false,
  });

  return response;
}

export async function POST(req: NextRequest) {
  const isJson = req.headers.get('accept')?.includes('application/json');
  if (isJson) {
    const res = NextResponse.json({ success: true });
    res.cookies.set('taskstream_user', '', {
      path: '/',
      expires: new Date(0),
      maxAge: 0,
      sameSite: 'lax',
      secure: false,
      httpOnly: false,
    });
    return res;
  }
  return createLogoutResponse(req);
}

export async function GET(req: NextRequest) {
  return createLogoutResponse(req);
}

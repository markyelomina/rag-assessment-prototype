import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Supabase sets cookies starting with 'sb-' and ending with '-auth-token'
  const authCookie = request.cookies.getAll().find(c => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'));
  
  const { pathname } = request.nextUrl;

  const isProtectedRoute = pathname.startsWith('/learner') || 
                           pathname.startsWith('/faculty') || 
                           pathname.startsWith('/admin');

  if (isProtectedRoute && !authCookie) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/learner/:path*',
    '/faculty/:path*',
    '/admin/:path*'
  ],
};
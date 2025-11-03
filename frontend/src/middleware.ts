import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow all public/static asset files (anything with an extension)
  const isPublicFile = /\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|json|txt|woff2?|ttf|otf|eot|mp3|mp4|webm|pdf)$/i.test(pathname)
  if (isPublicFile) {
    return NextResponse.next()
  }

  // Allow Universal_Login page and Next.js static files
  if (
    pathname === '/Universal_Login' ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next()
  }

  const token = request.cookies.get('sis_access_token')?.value || 
                request.headers.get('authorization')?.replace('Bearer ', '')

  if (!token) {
    const loginUrl = new URL('/Universal_Login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!Universal_Login|_next/static|_next/image|favicon.ico|api|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|json|txt|woff2?|ttf|otf|eot|mp3|mp4|webm|pdf)$).*)',
  ]
}

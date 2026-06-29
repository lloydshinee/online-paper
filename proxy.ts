import { NextResponse, NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const roleRoutes: Record<string, string> = {
  admin: '/dashboard/admin',
  instructor: '/dashboard/instructor',
  student: '/dashboard/student',
}

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isDashboard = path.startsWith('/dashboard')
  const isAuth = path.startsWith('/login') || path.startsWith('/register')

  if (!user && isDashboard) {
    return NextResponse.redirect(new URL('/login', request.nextUrl))
  }

  if (user && isAuth) {
    return NextResponse.redirect(new URL('/dashboard', request.nextUrl))
  }

  if (user && isDashboard) {
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    const role = profile?.role
    if (role) {
      const allowedPrefix = roleRoutes[role]
      if (allowedPrefix && !path.startsWith(allowedPrefix)) {
        return NextResponse.redirect(new URL(allowedPrefix, request.nextUrl))
      }
    }
  }

  return response
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|.*\\.png$).*)'],
}

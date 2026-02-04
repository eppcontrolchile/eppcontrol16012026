// middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  // Response mutable para que Supabase pueda setear cookies y refrescar sesión
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  const isDashboard = pathname.startsWith("/dashboard");
  const isOnboarding = pathname.startsWith("/onboarding");
  const isAuth = pathname.startsWith("/auth");

  // 1) Proteger dashboard/onboarding
  if ((isDashboard || isOnboarding) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // 2) Evitar que usuarios logueados queden pegados en /auth/login o /auth/register
  if (user && isAuth && (pathname === "/auth/login" || pathname === "/auth/register")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/onboarding/:path*", "/auth/:path*"],
};

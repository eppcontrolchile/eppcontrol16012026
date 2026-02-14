// middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
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
  const isBloqueado = pathname.startsWith("/auth/bloqueado");

  async function getInternalUser() {
    if (!user) return null;

    const { data: byAuth, error: byAuthErr } = await supabase
      .from("usuarios")
      .select("id, empresa_id, activo")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    let u: any = byAuth;

    // Fallback por email (invitaciones/recovery)
    if ((!u?.id || byAuthErr) && user.email) {
      const email = user.email.trim().toLowerCase();
      const { data: byEmail } = await supabase
        .from("usuarios")
        .select("id, empresa_id, activo")
        .eq("email", email)
        .maybeSingle();
      u = byEmail;
    }

    return u?.id ? u : null;
  }

  // 0) CORTA USUARIOS BLOQUEADOS (en cualquier ruta protegida o auth)
  if (user && !isBloqueado) {
    const iu = await getInternalUser();
    if (iu && iu.activo === false) {
      const url = request.nextUrl.clone();
      url.pathname = "/auth/bloqueado";
      url.searchParams.delete("next");
      return NextResponse.redirect(url);
    }
  }

  // 1) Proteger dashboard/onboarding
  if ((isDashboard || isOnboarding) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // 2) Evitar que usuarios logueados queden pegados en /auth/login
  //    (pero ojo: ya filtramos bloqueados arriba)
  if (user && isAuth && pathname === "/auth/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // 3) En /auth/register: solo redirigir si el usuario interno ya está completo.
  if (user && isAuth && pathname === "/auth/register") {
    const iu = await getInternalUser();
    const complete = Boolean(iu?.id && iu?.empresa_id && iu?.activo !== false);
    if (complete) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/onboarding/:path*", "/auth/:path*"],
};

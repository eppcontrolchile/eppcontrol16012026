// app/auth/logout/route.ts

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );

  // limpia cookies de sesión
  await supabase.auth.signOut();

  const url = new URL(request.url);
  const reason = url.searchParams.get("reason") ?? "";
  return NextResponse.redirect(new URL(`/auth/login${reason ? `?reason=${encodeURIComponent(reason)}` : ""}`, request.url));
}

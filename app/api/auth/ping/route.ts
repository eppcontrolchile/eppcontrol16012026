// app/api/auth/ping/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    // 1) Validar sesión real (cookies)
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    const { data: au, error: auErr } = await supabase.auth.getUser();
    if (auErr || !au?.user) {
      return NextResponse.json({ ok: false, reason: "not-authenticated" }, { status: 401 });
    }

    const authUserId = au.user.id;
    const authEmail = (au.user.email || "").toLowerCase();

    // 2) Usar service role para actualizar last_login_at sin pelear con RLS
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Preferencia: match por auth_user_id; fallback por email
    let usuarioId: string | null = null;

    const byAuth = await admin
      .from("usuarios")
      .select("id")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (byAuth.data?.id) {
      usuarioId = byAuth.data.id;
    } else if (authEmail) {
      const byEmail = await admin
        .from("usuarios")
        .select("id, auth_user_id")
        .eq("email", authEmail)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (byEmail.data?.id) {
        usuarioId = byEmail.data.id;

        // Linkear auth_user_id si está vacío (muy importante)
        if (!byEmail.data.auth_user_id) {
          await admin
            .from("usuarios")
            .update({ auth_user_id: authUserId })
            .eq("id", usuarioId);
        }
      }
    }

    if (!usuarioId) {
      // No rompemos login por esto: simplemente no hay fila interna
      return NextResponse.json({ ok: true, skipped: true, reason: "no-usuario-interno" });
    }

    const { error: upErr } = await admin
      .from("usuarios")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", usuarioId);

    if (upErr) {
      return NextResponse.json({ ok: false, reason: "update-failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, reason: e?.message ?? "unknown-error" }, { status: 500 });
  }
}

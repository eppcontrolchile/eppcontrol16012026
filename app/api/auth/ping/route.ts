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
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet) => {
            try {
              cookiesToSet.forEach(({ name, value, options }) => {
                cookieStore.set(name, value, options);
              });
            } catch {
              // no-op: in some Next contexts cookies can't be mutated
            }
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

    if (!authEmail) {
      return NextResponse.json({ ok: false, reason: "missing-email" }, { status: 400 });
    }

    // 2) Usar service role para actualizar last_login_at sin pelear con RLS
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Preferencia: match por auth_user_id; fallback por email
    let usuarioId: string | null = null;
    let empresaId: string | null = null;
    let activo: boolean | null = null;

    const byAuth = await admin
      .from("usuarios")
      .select("id, empresa_id, activo")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (byAuth.data?.id) {
      usuarioId = byAuth.data.id;
      empresaId = (byAuth.data as any).empresa_id ?? null;
      activo = (byAuth.data as any).activo ?? null;
    } else if (authEmail) {
      const byEmail = await admin
        .from("usuarios")
        .select("id, auth_user_id, empresa_id, activo")
        .eq("email", authEmail)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (byEmail.data?.id) {
        usuarioId = byEmail.data.id;
        empresaId = (byEmail.data as any).empresa_id ?? null;
        activo = (byEmail.data as any).activo ?? null;

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
      return NextResponse.json({ ok: false, reason: "missing_usuario" }, { status: 400 });
    }

    if (activo === false) {
      return NextResponse.json({ ok: false, reason: "inactive" }, { status: 403 });
    }

    if (!empresaId) {
      return NextResponse.json({ ok: false, reason: "missing_empresa" }, { status: 400 });
    }

    const { error: upErr } = await admin
      .from("usuarios")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", usuarioId);

    if (upErr) {
      return NextResponse.json({ ok: false, reason: "update-failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, usuario_id: usuarioId, empresa_id: empresaId });
  } catch (e: any) {
    return NextResponse.json({ ok: false, reason: e?.message ?? "unknown-error" }, { status: 500 });
  }
}

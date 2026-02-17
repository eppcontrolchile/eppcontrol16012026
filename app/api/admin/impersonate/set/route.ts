//app/api/admin/impersonate/set

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "epp_impersonate";
const MAX_AGE_SECONDS = 60 * 60 * 8; // 8 horas

function isUuid(v: unknown) {
  const s = String(v ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

function encodeCookie(payload: { empresa_id: string; usuario_id: string }) {
  // base64url (simple, suficiente)
  const json = JSON.stringify(payload);
  return Buffer.from(json, "utf8").toString("base64url");
}

async function getServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // ignore
          }
        },
      },
    }
  );
}

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: Request) {
  try {
    // Guards env
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return NextResponse.json({ ok: false, reason: "missing-public-supabase-env" }, { status: 500 });
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ ok: false, reason: "missing-service-role-key" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const empresa_id = String(body?.empresa_id ?? "").trim();
    const usuario_id = String(body?.usuario_id ?? "").trim();

    if (!isUuid(empresa_id) || !isUuid(usuario_id)) {
      return NextResponse.json({ ok: false, reason: "invalid-empresa-or-usuario" }, { status: 400 });
    }

    const supabase = await getServerSupabase();
    const admin = getAdminSupabase();

    // 1) Auth caller
    const { data: au, error: auErr } = await supabase.auth.getUser();
    if (auErr || !au?.user) {
      return NextResponse.json({ ok: false, reason: "not-authenticated" }, { status: 401 });
    }

    // 2) Verify caller is superadmin + activo
    const { data: me, error: meErr } = await admin
      .from("usuarios")
      .select("id, rol, activo, auth_user_id")
      .eq("auth_user_id", au.user.id)
      .maybeSingle();

    if (meErr || !me?.id) {
      return NextResponse.json({ ok: false, reason: "no-usuario-interno" }, { status: 403 });
    }
    if (!me.activo) {
      return NextResponse.json({ ok: false, reason: "usuario-inactivo" }, { status: 403 });
    }
    if (String(me.rol ?? "").toLowerCase() !== "superadmin") {
      return NextResponse.json({ ok: false, reason: "forbidden-not-superadmin" }, { status: 403 });
    }

    // 3) Validate target usuario belongs to empresa and is active
    const { data: target, error: tErr } = await admin
      .from("usuarios")
      .select("id, empresa_id, activo, nombre, email, rol")
      .eq("id", usuario_id)
      .maybeSingle();

    if (tErr) {
      return NextResponse.json({ ok: false, reason: "target-fetch-failed" }, { status: 500 });
    }
    if (!target?.id) {
      return NextResponse.json({ ok: false, reason: "target-not-found" }, { status: 404 });
    }
    if (!target.activo) {
      return NextResponse.json({ ok: false, reason: "target-inactive" }, { status: 400 });
    }
    if (String(target.empresa_id) !== empresa_id) {
      return NextResponse.json({ ok: false, reason: "empresa-mismatch" }, { status: 400 });
    }

    // 4) (Opcional) verificar empresa existe
    const { data: emp, error: eErr } = await admin
      .from("empresas")
      .select("id, nombre, rut")
      .eq("id", empresa_id)
      .maybeSingle();

    if (eErr) {
      return NextResponse.json({ ok: false, reason: "empresa-fetch-failed" }, { status: 500 });
    }
    if (!emp?.id) {
      return NextResponse.json({ ok: false, reason: "empresa-not-found" }, { status: 404 });
    }

    // 5) Set cookie (HttpOnly)
    const res = NextResponse.json(
      {
        ok: true,
        impersonating: {
          empresa_id,
          empresa_nombre: emp.nombre ?? null,
          usuario_id: target.id,
          usuario_nombre: target.nombre ?? null,
          usuario_email: target.email ?? null,
          usuario_rol: target.rol ?? null,
        },
      },
      { status: 200 }
    );

    res.cookies.set({
      name: COOKIE_NAME,
      value: encodeCookie({ empresa_id, usuario_id }),
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: MAX_AGE_SECONDS,
    });

    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (e: any) {
    console.error("IMPERSONATE SET ERROR:", e);
    return NextResponse.json({ ok: false, reason: e?.message ?? "unknown-error" }, { status: 500 });
  }
}

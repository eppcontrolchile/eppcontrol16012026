// app/api/admin/usuarios/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
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
}

function getAdminSupabase() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing server Supabase env vars");
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function requireAdminOrSuperadmin(empresa_id: string) {
  const supabase = await getServerSupabase();

  const { data: au, error: auErr } = await supabase.auth.getUser();
  if (auErr || !au?.user) {
    return { ok: false as const, status: 401, reason: "not-authenticated" };
  }

  // usuario interno del caller
  let { data: me, error: meErr } = await supabase
    .from("usuarios")
    .select("id, empresa_id, rol, activo, email, auth_user_id")
    .eq("auth_user_id", au.user.id)
    .maybeSingle();

  // fallback por email (por si auth_user_id aún no estaba linkeado)
  if (!me?.id) {
    const email = (au.user.email || "").toLowerCase().trim();
    const byEmail = await supabase
      .from("usuarios")
      .select("id, empresa_id, rol, activo, email, auth_user_id")
      .ilike("email", email)
      .maybeSingle();

    if (byEmail.data?.id) {
      await supabase
        .from("usuarios")
        .update({ auth_user_id: au.user.id })
        .eq("id", byEmail.data.id);

      me = byEmail.data as any;
      meErr = byEmail.error as any;
    }
  }

  if (meErr || !me) {
    return { ok: false as const, status: 403, reason: "no-usuario-interno" };
  }
  if (!me.activo) {
    return { ok: false as const, status: 403, reason: "usuario-inactivo" };
  }

  const rol = String(me.rol ?? "").toLowerCase();

  // ✅ Soporte: puede listar usuarios de cualquier empresa
  if (rol === "superadmin") {
    return { ok: true as const, me };
  }

  // ✅ Admin normal: solo dentro de su empresa
  if (me.empresa_id !== empresa_id) {
    return { ok: false as const, status: 403, reason: "empresa-mismatch" };
  }
  if (rol !== "admin") {
    return { ok: false as const, status: 403, reason: "forbidden-not-admin" };
  }

  return { ok: true as const, me };
}

type UsuarioOut = {
  id: string;
  nombre: string;
  email: string;
  activo: boolean;
  rol: string | null;
  auth_user_id: string | null;
  last_sign_in_at: string | null;
};

async function handleList(req: Request, empresa_id: string) {
  if (!empresa_id) {
    return NextResponse.json({ ok: false, reason: "missing-empresa_id" }, { status: 400 });
  }

  const gate = await requireAdminOrSuperadmin(empresa_id);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, reason: gate.reason }, { status: gate.status });
  }

  const admin = getAdminSupabase();

  const { data: usuarios, error: uErr } = await admin
    .from("usuarios")
    .select("id,nombre,email,activo,rol,auth_user_id")
    .eq("empresa_id", empresa_id)
    .order("nombre", { ascending: true });

  if (uErr) {
    return NextResponse.json({ ok: false, reason: "usuarios-fetch-failed" }, { status: 500 });
  }

  const rows = (usuarios || []) as any[];

  const enriched: UsuarioOut[] = await Promise.all(
    rows.map(async (u) => {
      let last_sign_in_at: string | null = null;

      if (u.auth_user_id) {
        try {
          const { data } = await admin.auth.admin.getUserById(u.auth_user_id);
          last_sign_in_at = (data?.user as any)?.last_sign_in_at ?? null;
        } catch {
          last_sign_in_at = null;
        }
      }

      return {
        id: u.id,
        nombre: u.nombre ?? "",
        email: u.email ?? "",
        activo: !!u.activo,
        rol: u.rol ?? null,
        auth_user_id: u.auth_user_id ?? null,
        last_sign_in_at,
      };
    })
  );

  const res = NextResponse.json({ ok: true, usuarios: enriched }, { status: 200 });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const empresa_id = String(searchParams.get("empresa_id") ?? "").trim();
    return await handleList(req, empresa_id);
  } catch (e: any) {
    console.error("ADMIN USUARIOS LIST GET ERROR:", e);
    return NextResponse.json({ ok: false, reason: e?.message ?? "unknown-error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const empresa_id = String((body as any)?.empresa_id ?? "").trim();
    return await handleList(req, empresa_id);
  } catch (e: any) {
    console.error("ADMIN USUARIOS LIST POST ERROR:", e);
    return NextResponse.json({ ok: false, reason: e?.message ?? "unknown-error" }, { status: 500 });
  }
}

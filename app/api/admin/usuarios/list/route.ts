// app/api/admin/usuarios/list/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getServerSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error("Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)");
  }

  const cookieStore = await cookies();

  // Use getAll/setAll so chunked cookies + session refresh work reliably.
  return createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // no-op
        }
      },
    },
  });
}

function getAdminSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  }

  return createClient(supabaseUrl, serviceRoleKey);
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

  // fallback por email
  if (!me?.id) {
    const email = (au.user.email || "").toLowerCase().trim();
    const byEmail = await supabase
      .from("usuarios")
      .select("id, empresa_id, rol, activo, email, auth_user_id")
      .eq("email", email)
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

export async function POST(req: Request) {
  try {
    // Fail fast if server env vars are missing (avoids silent 500s in prod)
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { ok: false, reason: "missing-env" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const empresa_id = String(body?.empresa_id || "").trim();

    if (!empresa_id) {
      return NextResponse.json(
        { ok: false, reason: "missing-empresa_id" },
        { status: 400 }
      );
    }

    const gate = await requireAdminOrSuperadmin(empresa_id);
    if (!gate.ok) {
      return NextResponse.json(
        { ok: false, reason: gate.reason },
        { status: gate.status }
      );
    }

    const admin = getAdminSupabase();

    const { data: usuarios, error: uErr } = await admin
      .from("usuarios")
      .select("id,nombre,email,activo,rol,auth_user_id")
      .eq("empresa_id", empresa_id)
      .order("nombre", { ascending: true });

    if (uErr) {
      return NextResponse.json(
        { ok: false, reason: "usuarios-fetch-failed" },
        { status: 500 }
      );
    }

    // last login via Auth Admin API (solo si hay auth_user_id)
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

    return NextResponse.json({ ok: true, usuarios: enriched });
  } catch (e: any) {
    console.error("ADMIN USUARIOS LIST ERROR:", e);
    return NextResponse.json(
      { ok: false, reason: e?.message ?? "unknown-error" },
      { status: 500 }
    );
  }
}

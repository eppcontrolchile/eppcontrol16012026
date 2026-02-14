// app/api/empresa/config/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Frecuencia = "diaria" | "semanal";

function isValidEmail(v: unknown) {
  const s = String(v ?? "").trim().toLowerCase();
  return !!s && s.includes("@") && s.includes(".");
}

function isValidFrecuencia(v: unknown): v is Frecuencia {
  return v === "diaria" || v === "semanal";
}

export async function GET() {
  const cookieStore = await cookies();

  const supabaseAuth = createServerClient(
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
          } catch {}
        },
      },
    }
  );

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const {
      data: { user },
      error: authErr,
    } = await supabaseAuth.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    // resolver usuario interno + empresa
    const { data: urow, error: uerr } = await supabaseAdmin
      .from("usuarios")
      .select("id, rol, empresa_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (uerr || !urow?.empresa_id) {
      return NextResponse.json({ error: "No se pudo resolver empresa" }, { status: 400 });
    }

    // admin-only
    if (urow.rol !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { data: empresa, error: eerr } = await supabaseAdmin
      .from("empresas")
      .select(
        "id,nombre,rut,plan_tipo,logo_url,email_alertas,alertas_activas,stock_critico_activo,frecuencia_alertas,email_gerencia"
      )
      .eq("id", urow.empresa_id)
      .single();

    if (eerr || !empresa) {
      return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
    }

    return NextResponse.json({ empresa });
  } catch (e: any) {
    console.error("EMPRESA CONFIG GET ERROR", e);
    return NextResponse.json({ error: e?.message ?? "Error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const cookieStore = await cookies();

  const supabaseAuth = createServerClient(
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
          } catch {}
        },
      },
    }
  );

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const body = await req.json().catch(() => ({}));

    const {
      data: { user },
      error: authErr,
    } = await supabaseAuth.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { data: urow } = await supabaseAdmin
      .from("usuarios")
      .select("id, rol, empresa_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (!urow?.empresa_id) {
      return NextResponse.json({ error: "No se pudo resolver empresa" }, { status: 400 });
    }
    if (urow.rol !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    // leer plan para aplicar regla email_gerencia
    const { data: empresaBase } = await supabaseAdmin
      .from("empresas")
      .select("id, plan_tipo")
      .eq("id", urow.empresa_id)
      .single();

    if (!empresaBase?.id) {
      return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
    }

    const patch: any = {};

    // logo_url (opcional)
    if ("logo_url" in body) {
      patch.logo_url = String(body.logo_url ?? "").trim() || null;
    }

    // alertas stock
    if ("email_alertas" in body) {
      const v = String(body.email_alertas ?? "").trim();
      if (v && !isValidEmail(v)) {
        return NextResponse.json({ error: "email_alertas inválido" }, { status: 400 });
      }
      patch.email_alertas = v || null;
    }

    if ("alertas_activas" in body) {
      patch.alertas_activas = Boolean(body.alertas_activas);
    }

    if ("stock_critico_activo" in body) {
      patch.stock_critico_activo = Boolean(body.stock_critico_activo);
    }

    if ("frecuencia_alertas" in body) {
      if (!isValidFrecuencia(body.frecuencia_alertas)) {
        return NextResponse.json({ error: "frecuencia_alertas inválida" }, { status: 400 });
      }
      patch.frecuencia_alertas = body.frecuencia_alertas;
    }

    // email_gerencia: SOLO editable si standard
    if ("email_gerencia" in body) {
      if (empresaBase.plan_tipo === "standard") {
        const v = String(body.email_gerencia ?? "").trim();
        if (v && !isValidEmail(v)) {
          return NextResponse.json({ error: "email_gerencia inválido" }, { status: 400 });
        }
        patch.email_gerencia = v || null;
      }
      // si es advanced: ignoramos cualquier intento de update
    }

    const { data: updated, error: upErr } = await supabaseAdmin
      .from("empresas")
      .update(patch)
      .eq("id", urow.empresa_id)
      .select(
        "id,nombre,rut,plan_tipo,logo_url,email_alertas,alertas_activas,stock_critico_activo,frecuencia_alertas,email_gerencia"
      )
      .single();

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 400 });
    }

    return NextResponse.json({ empresa: updated });
  } catch (e: any) {
    console.error("EMPRESA CONFIG PATCH ERROR", e);
    return NextResponse.json({ error: e?.message ?? "Error" }, { status: 500 });
  }
}

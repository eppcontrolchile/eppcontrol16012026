// app/api/plan-usage/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

type PlanType = "standard" | "advanced";

function normalizePlan(planTipo: string | null | undefined): PlanType {
  if (planTipo === "advanced") return "advanced";
  return "standard";
}

function getPlanLimit(plan: PlanType, companySize: string): number {
  // Soporte legado: companySize puede venir como "25", "50", "100" o "100+"
  if (companySize === "100+") return Infinity;

  const parsed = Number(companySize);
  if ([25, 50, 100].includes(parsed)) return parsed;

  // fallback sensato
  return plan === "advanced" ? 100 : 25;
}

export async function GET() {
  try {
    const cookieStore = await cookies();

    // 1) Cliente SSR (ANON + cookies) para identificar al usuario autenticado
    const supabase = createServerClient(
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
              // En algunos runtimes (edge) set puede fallar; no es crítico para GET
            }
          },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    // 2) Obtener empresa_id del usuario (RLS)
    const { data: usuario, error: usuarioError } = await supabase
      .from("usuarios")
      .select("empresa_id")
      .eq("auth_user_id", user.id)
      .single();

    if (usuarioError || !usuario?.empresa_id) {
      return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
    }

    // 3) Cliente Admin (SERVICE ROLE) para leer plan/limites sin que RLS bloquee
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: empresa, error: empresaError } = await supabaseAdmin
      .from("empresas")
      .select("plan_tipo, limite_trabajadores")
      .eq("id", usuario.empresa_id)
      .single();

    if (empresaError || !empresa) {
      return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
    }

    // 4) Contar trabajadores activos (admin para evitar problemas de RLS en el endpoint)
    const { count, error: countError } = await supabaseAdmin
      .from("trabajadores")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", usuario.empresa_id)
      .eq("activo", true);

    if (countError) {
      console.error("plan-usage countError", countError);
      return NextResponse.json({ error: "Error plan usage" }, { status: 500 });
    }

    // 5) Normalizar plan y límite
    const plan = normalizePlan(empresa.plan_tipo);

    // company_size es legado del UI; lo derivamos del límite
    const companySize = String(empresa.limite_trabajadores ?? (plan === "advanced" ? 100 : 25));
    const limite = Number.isFinite(Number(companySize))
      ? Number(companySize)
      : getPlanLimit(plan, companySize);

    const usados = count ?? 0;

    return NextResponse.json({
      usados,
      limite,
      porcentaje: limite === Infinity ? 0 : Math.round((usados / limite) * 100),
      alcanzado: limite !== Infinity && usados >= limite,
      plan,
      company_size: companySize,
    });
  } catch (err: any) {
    console.error("plan-usage error", err);
    return NextResponse.json(
      { error: err?.message || "Error plan usage" },
      { status: 500 }
    );
  }
}

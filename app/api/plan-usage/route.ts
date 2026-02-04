// app/api/plan-usage/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

type PlanType = "standard" | "advanced";

function getPlanLimit(plan: PlanType, companySize: string): number {
  if (companySize === "100+") return Infinity;

  const parsed = Number(companySize);
  if ([25, 50, 100].includes(parsed)) return parsed;

  return 25;
}

export async function GET() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  try {
    // 1️⃣ Usuario autenticado
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "No autenticado" },
        { status: 401 }
      );
    }

    // 2️⃣ Empresa + plan
    const { data: usuario, error } = await supabase
      .from("usuarios")
      .select(
        `
        empresa_id,
        empresas (
          plan,
          company_size
        )
      `
      )
      .eq("auth_user_id", user.id)
      .single();

    if (error || !usuario?.empresa_id) {
      throw new Error("Empresa no encontrada");
    }

      const empresa = Array.isArray(usuario.empresas)
        ? usuario.empresas[0]
        : null;

      const plan = (empresa?.plan || "standard") as PlanType;
      const companySize = empresa?.company_size || "25";

    // 3️⃣ Contar trabajadores activos reales
    const { count, error: countError } = await supabase
      .from("trabajadores")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", usuario.empresa_id)
      .eq("activo", true);

    if (countError) throw countError;

    const usados = count ?? 0;
    const limite = getPlanLimit(plan, companySize);

    return NextResponse.json({
      usados,
      limite,
      porcentaje:
        limite === Infinity ? 0 : Math.round((usados / limite) * 100),
      alcanzado: limite !== Infinity && usados >= limite,
      plan,
      company_size: companySize,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Error plan usage" },
      { status: 500 }
    );
  }
}

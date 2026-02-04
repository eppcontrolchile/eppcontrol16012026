// app/utils/plan-server.ts
// Fuente de verdad REAL del plan (Supabase-first)

import { createClient } from "@supabase/supabase-js";

export type PlanType = "standard" | "advanced";

export type PlanUsage = {
  usados: number;
  limite: number;
  porcentaje: number;
  alcanzado: boolean;
};

type EmpresaPlanRow = {
  plan: PlanType;
  limite_trabajadores: number | null;
  company_size: string | null;
};

/**
 * Calcula el uso real del plan leyendo Supabase
 * (empresas + trabajadores activos)
 */
export async function getPlanUsageForEmpresa(
  empresaId: string
): Promise<PlanUsage> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1️⃣ Leer plan de la empresa
  const { data: empresa, error: empresaError } = await supabase
    .from("empresas")
    .select("plan, limite_trabajadores, company_size")
    .eq("id", empresaId)
    .single<EmpresaPlanRow>();

  if (empresaError || !empresa) {
    throw new Error("No se pudo obtener el plan de la empresa");
  }

  // 2️⃣ Definir límite efectivo
  let limite = empresa.limite_trabajadores ?? 25;

  if (empresa.company_size === "100+") {
    limite = Infinity;
  }

  // 3️⃣ Contar trabajadores activos reales
  const { count, error: countError } = await supabase
    .from("trabajadores")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", empresaId)
    .eq("activo", true);

  if (countError) {
    throw new Error("No se pudo contar trabajadores activos");
  }

  const usados = count ?? 0;

  const porcentaje =
    limite === Infinity
      ? 0
      : Math.round((usados / limite) * 100);

  return {
    usados,
    limite,
    porcentaje,
    alcanzado:
      limite !== Infinity && usados >= limite,
  };
}
